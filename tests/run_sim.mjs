// The circuit simulator page inside Pyodide: every example circuit of `elektro examples`,
// edited circuits, a SPICE netlist, an uploaded file and bad input. Results go to
// tests/out/sim.json; compare_native.py solves the same circuits with the installed CLI.
import { boot } from "./harness.mjs";
import { mkdir, writeFile } from "node:fs/promises";

const t0 = Date.now();
const e = await boot("en");
const untitled = () => e.simLoad("spice", "*\nV1 a 0 1\nR1 a 0 1k\n", "typed.cir");
const bootMs = Date.now() - t0;
const info = e.simInfo();
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
const cases = [];
const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok }); if (!ok) console.log(`FAIL ${name} ${detail}`); };

function solve(label, loaded, edit = (c) => c) {
  const circuit = edit(structuredClone(loaded.circuit));
  const t = Date.now();
  const r = e.simRun({ name: loaded.name, circuit });
  cases.push({ label, name: loaded.name, circuit, ms: Date.now() - t, ok: r.ok, json: r.json, text: r.text,
    stderr: r.stderr, files: (r.files || []).map((f) => ({ name: f.name, type: f.type })), schematic: strip(r.schematic || "") });
  return r;
}

check(`${info.examples.length} example circuits listed with titles`, info.examples.length >= 15 && info.examples.every((x) => x.title && x.category_title));
check("example circuits come with elektro's explanation", info.examples.every((x) => typeof x.desc === "string") &&
  !!info.examples.find((x) => x.name === "rc_lowpass")?.desc);
check("elektro's own texts for the page", info.texts.kinds.R === "resistor" && info.texts.hints.D.includes("1N4148"));

for (const ex of info.examples) {
  const loaded = e.simLoad("example", ex.name);
  check(`load ${ex.name}`, loaded.ok, loaded.stderr);
  const plain = strip(loaded.schematic);
  const refs = loaded.circuit.components.filter((c) => !["GND", "N"].includes(c.kind)).map((c) => c.ref);
  check(`${ex.name}: schematic shows every part`, refs.every((r) => plain.includes(r)), refs.join(","));
  const r = solve(`example ${ex.name}`, loaded);
  check(`${ex.name}: solves`, r.ok, r.stderr);
  const sweep = !!loaded.circuit.analysis;
  check(`${ex.name}: plot ${sweep ? "+ CSV " : ""}returned`,
    !sweep || (r.files.some((f) => f.type === "image/svg+xml") && r.files.some((f) => f.name.endsWith(".csv"))),
    JSON.stringify(r.files.map((f) => f.name)));
}

// edits made on the page: a value, the analysis, an extra probe
const div = e.simLoad("example", "divider");
const r1 = solve("divider R2=1k", div, (c) => { c.components.find((x) => x.ref === "R2").value = "1k"; return c; });
check("edited value changes the result (12 V · 1k/11k = 1.091 V)", /OUT\s+1\.091 V/.test(r1.text), r1.text.split("\n").find((l) => /OUT/.test(l)));
check("schematic shows solved node voltages", strip(r1.schematic).includes("1.091V"));
solve("rc_lowpass as .tran 3m", e.simLoad("example", "rc_lowpass"), (c) => { c.analysis = ".tran 3m"; return c; });
solve("rc_lowpass DC only", e.simLoad("example", "rc_lowpass"), (c) => { c.analysis = ""; return c; });
solve("divider extra probe P(R1)", div, (c) => { c.probes.push("P(R1)"); return c; });

// SPICE netlist typed on the page
const net = e.simLoad("spice", "* rc\nV1 in 0 AC 1\nR1 in out 1k\nC1 out 0 100n\n.ac dec 20 10 100k\n.end\n", "my filter.cir");
check("netlist builds a circuit, named by its title line", net.ok && net.name === "rc" && net.circuit.analysis.startsWith(".ac"), net.stderr);
const rn = solve("spice netlist rc", net);
check("netlist circuit solves (AC sweep)", rn.ok && rn.json?.traces?.length > 0, rn.stderr);

check("netlist without a title keeps the given name", untitled().name === "typed");

// file opened on the page (a circuit saved by `elektro tui`/`elektro examples`)
const saved = JSON.stringify(e.simLoad("example", "zener").circuit, null, 2);
const path = e.addInput("my zener.json", new TextEncoder().encode(saved));
const up = e.simLoad("file", path);
check("uploaded .json opens", up.ok && up.name === "my_zener", up.stderr);
solve("uploaded zener", up);
const cirPath = e.addInput("div.cir", new TextEncoder().encode("* d\nV1 a 0 9\nR1 a b 2k\nR2 b 0 1k\n.op\n"));
const upc = e.simLoad("file", cirPath);
check("uploaded SPICE .cir opens with labels", upc.ok && upc.circuit.components.some((c) => c.kind === "N"), upc.stderr);
solve("uploaded div.cir", upc);

// bad input gives elektro's messages, never an exception
const bad = e.simRun({ name: "x", circuit: { ...div.circuit, components: div.circuit.components.map((c) => c.ref === "R1" ? { ...c, value: "abc" } : c) } });
check("invalid value is reported per part", !bad.ok && bad.invalid?.[0] === "R1" && /R1/.test(bad.stderr), JSON.stringify(bad));
const badNet = e.simLoad("spice", "nothing useful", "x");
check("garbage netlist gives an error", !badNet.ok && badNet.stderr.length > 0);
const badJson = e.simLoad("json", '{"hello": 1}', "x");
check("non-circuit .json gives an error", !badJson.ok && /circuit/.test(badJson.stderr), badJson.stderr);
const badAnalysis = solve("bad analysis", div, (c) => { c.analysis = ".tran banana"; return c; });
check("bad analysis gives elektro's error", !badAnalysis.ok && badAnalysis.stderr.length > 0, JSON.stringify({ ok: badAnalysis.ok, stderr: badAnalysis.stderr, text: badAnalysis.text }));
cases.pop();                                      // native run of a failing command is not compared

// language: titles follow elektro's translation
e.setLang("tr");
const tr = e.simInfo();
check("Turkish example titles", tr.examples.find((x) => x.name === "rc_lowpass").title.includes("alçak"), tr.examples[3].title);
e.setLang("en");

await mkdir(new URL("./out/", import.meta.url), { recursive: true });
await writeFile(new URL("./out/sim.json", import.meta.url), JSON.stringify({ bootMs, cases }, null, 1));
const failed = checks.filter((c) => !c.ok).length;
const slow = Math.max(...cases.map((c) => c.ms));
console.log(`simulator: ${cases.length} circuits solved in Pyodide (slowest ${slow} ms), checks ${checks.length - failed}/${checks.length}`);
process.exit(failed ? 1 : 0);
