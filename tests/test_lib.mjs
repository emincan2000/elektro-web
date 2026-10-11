// Unit tests for web/lib.js (node --test tests/test_lib.mjs). No Pyodide needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  splitWords, shellJoin, buildArgv, argvToValues, ansiToHtml, formatSI, splitKey, PLOT_FILE, pyodideBase,
} from "../web/lib.js";

test("splitWords handles quotes and escapes like a shell", () => {
  assert.deepEqual(splitWords("bn bk  rd gd"), ["bn", "bk", "rd", "gd"]);
  assert.deepEqual(splitWords(`a "b c" 'd e' f\\ g`), ["a", "b c", "d e", "f g"]);
  assert.deepEqual(splitWords(`"230∠0 / (10 + zl(100m, 50))" -u A`), ["230∠0 / (10 + zl(100m, 50))", "-u", "A"]);
  assert.deepEqual(splitWords(`""`), [""]);
  assert.deepEqual(splitWords("   "), []);
});

test("shellJoin round-trips through splitWords", () => {
  for (const argv of [["divider", "--vin", "12"], ["calc", "230∠0 / (10 + 5j)"], ["x", "it's"], ["a", ""]]) {
    assert.deepEqual(splitWords(shellJoin(argv)), argv);
  }
});

const divider = {
  path: ["divider"],
  params: [
    { name: "vin", positional: false, opts: ["--vin"], secondary: [], kind: "value", multi: false },
    { name: "series", positional: false, opts: ["--series", "-s"], secondary: [], kind: "text", multi: false },
    { name: "high", positional: false, opts: ["--high"], secondary: ["--low"], kind: "flag", multi: false },
    { name: "verbose", positional: false, opts: ["-v", "--verbose"], secondary: [], kind: "flag", multi: false },
    { name: "plot", positional: false, opts: ["--plot"], secondary: [], kind: "plot", multi: false },
    { name: "bands", positional: true, opts: ["bands"], secondary: [], kind: "text", multi: true },
  ],
};

test("buildArgv: options, flag pairs, plots, positionals", () => {
  assert.deepEqual(
    buildArgv(divider, { vin: "12", series: "E12", high: "off", verbose: true, plot: true, bands: "bn bk" }),
    ["divider", "--vin", "12", "--series", "E12", "--low", "--verbose", "--plot", PLOT_FILE, "bn", "bk"]);
  assert.deepEqual(buildArgv(divider, { vin: "", high: "", verbose: false, plot: false }), ["divider"]);
  assert.deepEqual(buildArgv(divider, { plot: "x.svg" }), ["divider", "--plot", "x.svg"]);
  assert.deepEqual(buildArgv(divider, { plot: "x.png" }), ["divider", "--plot", PLOT_FILE]);
});

test("buildArgv protects negative positionals with --", () => {
  assert.deepEqual(buildArgv(divider, { bands: "-5 3" }), ["divider", "--", "-5", "3"]);
});

test("argvToValues understands short options, --opt=value, negatives and --", () => {
  const { values, unknown, extra } = argvToValues(divider, ["-s", "E24", "--vin=5", "--high", "bn", "-3", "--", "-x"]);
  assert.deepEqual(values, { series: "E24", vin: "5", high: "on", bands: "bn -3 -x" });
  assert.deepEqual(unknown, []);
  assert.deepEqual(extra, []);
  assert.deepEqual(argvToValues(divider, ["--nope", "1"]).unknown, ["--nope"]);
});

test("ansiToHtml: colors, reset, truecolor, reverse", () => {
  assert.equal(ansiToHtml("\x1b[1;32mok\x1b[0m done"), '<span class="a-bold a-fg-green">ok</span> done');
  assert.equal(ansiToHtml("\x1b[38;2;139;69;19mbrown\x1b[0m"), '<span style="color:rgb(139,69,19)">brown</span>');
  assert.equal(ansiToHtml("\x1b[38;5;196mx"), '<span style="color:rgb(255,0,0)">x</span>');
  assert.equal(ansiToHtml("\x1b[97;41mW\x1b[39mR"), '<span class="a-fg-bright-white a-bg-red">W</span><span class="a-bg-red">R</span>');
  assert.equal(ansiToHtml("\x1b[7mrev"), '<span class="a-fg-default-bg a-bg-default-fg">rev</span>');
});

test("ansiToHtml escapes HTML so elektro output can never inject markup", () => {
  const out = ansiToHtml('\x1b[31m<img src=x onerror="alert(1)">&\x1b[0m');
  assert.ok(!out.includes("<img"));
  assert.ok(out.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;"));
});

test("formatSI", () => {
  assert.equal(formatSI(0.002553191489361702, "A"), "2.553 mA");
  assert.equal(formatSI(4700, "Ω"), "4.7 kΩ");
  assert.equal(formatSI(1591.5494309189535, "Hz"), "1.592 kHz");
  assert.equal(formatSI(1e-7, "F"), "100 nF");
  assert.equal(formatSI(0.9996, "V"), "999.6 mV");
  assert.equal(formatSI(0.99996, "V"), "1 V");
  assert.equal(formatSI(0, "V"), "0 V");
  assert.equal(formatSI(-12.5, "dB", false), "-12.5 dB");
  assert.equal(formatSI(5, "%", false), "5 %");
  assert.equal(formatSI(NaN, "V"), "NaN");
});

test("splitKey avoids the traps found in elektro's real keys", () => {
  assert.equal(splitKey("w_h").unit, "Wh");                     // not henry
  assert.equal(splitKey("ohm_per_m").unit, "Ω/m");              // not metres
  assert.equal(splitKey("current_density_a_mm2").unit, "A/mm²");
  assert.equal(splitKey("rth_ja").unit, "K/W");
  assert.equal(splitKey("prx_dbm").unit, "dBm");                 // not dB
  assert.equal(splitKey("area_mm2").unit, "mm²");
  assert.equal(splitKey("value_at_t").unit, "");
  assert.deepEqual(splitKey("current_a"), { label: "current", unit: "A", si: true });
});

test("every numeric key in real elektro output gets a known unit or none (no guesses)", () => {
  let data;
  try { data = JSON.parse(readFileSync(new URL("./out/pyodide.json", import.meta.url))); }
  catch { return; }                       // run_examples.mjs not run yet
  const allowed = new Set(["", "Ω", "A", "W", "m", "Hz", "s", "V", "mm", "F", "°C", "%", "dB", "H",
    "mm²", "dBm", "mAh", "var", "VA", "°", "rpm", "h", "d", "K/W", "mil", "oz", "MVA", "kA",
    "cm²", "N·m", "bit", "B", "bit/s", "Ω/m", "A/mm²", "Wh", "dB/100 m"]);
  const seen = new Set();
  const walk = (x) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) {
      if (typeof v === "number") seen.add(splitKey(k).unit);
      walk(v);
    }
  };
  data.cases.forEach((c) => walk(c.json));
  for (const u of seen) assert.ok(allowed.has(u), `unexpected unit ${u}`);
});

test("pyodideBase only allows the page's own origin", () => {
  const page = "https://user.github.io/elektro-web/worker.js?pyodide=x";
  const cdn = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/";
  assert.equal(pyodideBase(null, page, cdn), cdn);
  assert.equal(pyodideBase("/pyodide/", page, cdn), "https://user.github.io/pyodide/");
  assert.equal(pyodideBase("vendor/pyodide", page, cdn), "https://user.github.io/elektro-web/vendor/pyodide/");
  for (const evil of ["https://evil.example/", "//evil.example/p/", "javascript:alert(1)",
    "data:text/javascript,alert(1)", "http://user.github.io/x/", "https://user.github.io.evil.example/"]) {
    assert.equal(pyodideBase(evil, page, cdn), cdn, evil);
  }
});
