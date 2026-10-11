// End-to-end test in real (headless) Firefox: node --experimental-websocket tests/e2e.mjs
// Screenshots go to tests/out/shots/ for a human look.
import { serve } from "./serve.mjs";
import { launchFirefox } from "./bidi.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const server = await serve(0);                 // any free port: `make serve` may be running
const PORT = server.address().port;
const BASE = `http://127.0.0.1:${PORT}/?pyodide=/pyodide/`;
const SHOTS = new URL("./out/shots/", import.meta.url);
mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

const page = await launchFirefox();
const shot = async (name, full = false) => writeFileSync(new URL(`${name}.png`, SHOTS), await page.screenshot(full));

// helpers evaluated in the page
const clickNav = (name) => page.eval(`(() => {
  const b = [...document.querySelectorAll(".nav-item")].find((x) => x.querySelector(".cmd").textContent === ${JSON.stringify(name)});
  if (!b) return false; b.click(); return true; })()`);
const clickExample = (i = 0) => page.eval(`(() => { const c = document.querySelectorAll(".chip")[${i}]; if (!c) return null; c.click(); return c.textContent; })()`);
const waitResult = () => page.waitFor(`!!document.querySelector("#result .result") && !document.querySelector("#run-btn").disabled`, 30000);
const termText = () => page.eval(`document.querySelector("#result .term")?.textContent ?? ""`);
const errText = () => page.eval(`document.querySelector("#result .msg.err")?.textContent ?? ""`);

try {
  const t0 = Date.now();
  await page.goto(BASE);
  await page.eval(`localStorage.setItem("elektro-web-lang", "en") || true`);
  await page.goto(BASE);
  await page.waitFor(`!document.querySelector("#view").hidden`, 120000);
  const loadMs = Date.now() - t0;
  check("page boots elektro in the browser", true, `${loadMs} ms`);
  await shot("01-home");

  const links = await page.eval(`[...document.querySelectorAll("#foot a")].map((a) => a.href)`);
  check("footer credits elektro's repo and links this source", links.includes("https://github.com/0anes0/elektro") &&
    links.includes("https://github.com/emincan2000/elektro-web"), links.join(" "));
  const count = await page.eval(`document.querySelectorAll(".nav-item").length`);
  check("sidebar lists all web commands", count === 63, `${count} commands`);

  check("open divider from sidebar", await clickNav("divider"));
  const ex = await clickExample(1);
  await waitResult();
  const out = await termText();
  check("example chip fills the form and runs", out.includes("3.3") || out.includes("R1"), ex);
  const cli = await page.eval(`document.querySelector("#cli-text").textContent`);
  check("command line preview matches example", cli === `elektro ${ex}`, cli);
  await shot("02-divider", true);

  await page.eval(`document.querySelector('.tab[data-key="values"]').click() || true`);
  const vals = await page.eval(`document.querySelectorAll(".values td.num").length`);
  check("values tab renders a table", vals > 3, `${vals} cells`);
  await shot("03-divider-values");

  check("open filter rc", await clickNav("filter rc"));
  await clickExample(0);
  await waitResult();
  await page.waitFor(`(() => { const i = document.querySelector(".plot img"); return i && i.complete && i.naturalWidth > 0; })()`, 15000);
  check("elektro's SVG plot is shown inline", true);
  const warnBox = await page.eval(`!!document.querySelector("#result .msg.warn")`);
  check("no 'graph saved to file' noise", !warnBox, warnBox ? "warning box shown" : "");
  await shot("04-filter-rc-plot", true);

  check("open resistor decode", await clickNav("resistor decode"));
  await clickExample(0);
  await waitResult();
  const colored = await page.eval(`document.querySelectorAll("#result .term span[style], #result .term span[class*='a-bg']").length`);
  check("terminal colors survive (resistor bands)", colored > 0, `${colored} colored spans`);
  const stray = await page.eval(`[...document.querySelector("#view").childNodes].some((n) => n.nodeType === 3 && /false|undefined/.test(n.textContent))`);
  check("no stray 'false'/'undefined' text in the page", !stray);
  await shot("05-resistor", true);

  // file upload: fft reads a CSV the user picks (here created in the page, like a real pick)
  check("open fft", await clickNav("fft"));
  const csv = (await import("./fixtures.mjs")).fixtures()["scope.csv"];
  await page.eval(`(async () => {
    const input = document.querySelector("#f-file");
    const dt = new DataTransfer();
    dt.items.add(new File([${JSON.stringify(csv)}], "scope.csv", { type: "text/csv" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change"));
    return true; })()`);
  await page.waitFor(`document.querySelector("#cli-text").textContent.includes("scope.csv")`, 10000);
  await page.eval(`document.querySelector("#run-btn").click() || true`);
  await waitResult();
  const fft = await termText();
  const fftPlot = await page.eval(`!!document.querySelector(".plot img")`);
  // fixture: 1 V at 50 Hz + 0.3 V at 120 Hz → elektro interpolates 49.95 Hz / 119.9 Hz
  check("uploaded CSV is analysed by fft (50 Hz + 120 Hz found)", /49\.9\d* Hz\s+1 V/.test(fft) && /119\.9 Hz\s+300 mV/.test(fft),
    fft.split("\n").find((l) => /Fundamental|Temel/.test(l))?.replace(/[│]/g, "").trim());
  check("fft spectrum plot shown", fftPlot);
  await shot("06b-fft-upload", true);

  // required-field validation
  await clickNav("divider");
  await page.eval(`document.querySelector("#run-btn").click() || true`);
  const invalid = await page.eval(`document.querySelectorAll(".field.invalid").length`);
  check("missing required field is flagged, nothing runs", invalid === 1, `${invalid} invalid`);

  // an elektro error is shown as text, never as HTML
  await page.eval(`(() => { const i = document.querySelector("#f-vin"); i.value = '<img src=x onerror="window.__pwned=1">'; i.dispatchEvent(new Event("input")); document.querySelector("#run-btn").click(); return true; })()`);
  await waitResult();
  const err = await errText();
  const injected = await page.eval(`!!document.querySelector("#result img[src='x']") || !!window.__pwned`);
  check("bad input gives elektro's error message", err.length > 0, err.slice(0, 80));
  check("error text cannot inject HTML", !injected);
  await shot("06-error");

  // deep link (shareable URL) runs automatically
  await page.goto(`http://127.0.0.1:${PORT}/?pyodide=/pyodide/#ohm?a=${encodeURIComponent("-v 12 -r 4k7")}`);
  await page.waitFor(`!document.querySelector("#view").hidden`, 120000);
  await waitResult();
  const ohm = await termText();
  check("shareable URL opens command and runs it", ohm.includes("2.553") || ohm.includes("2.55"), ohm.split("\n").find((l) => /mA/.test(l))?.trim());

  // language switch re-imports elektro in Turkish
  await page.eval(`(() => { const s = document.querySelector("#lang"); s.value = "tr"; s.dispatchEvent(new Event("change")); return true; })()`);
  await page.waitFor(`!document.querySelector("#lang").disabled && document.documentElement.lang === "tr"`, 30000);
  await waitResult();
  const tr = await termText();
  const runLabel = await page.eval(`document.querySelector("#run-btn").textContent`);
  check("language switch: UI and elektro output in Turkish", runLabel === "Hesapla" && /Gerilim|Akım|Direnç/.test(tr), runLabel);
  await shot("07-ohm-tr", true);

  // dark theme + mobile layout
  await page.eval(`document.querySelector("#theme-btn").click() || true`);
  await shot("08-dark", true);
  await page.viewport(390, 844);
  await page.eval(`document.querySelector("#menu-btn").click() || true`);
  const open = await page.eval(`document.querySelector("#sidebar").classList.contains("open")`);
  check("mobile: menu button opens the command drawer", open);
  await new Promise((r) => setTimeout(r, 400));          // drawer slide-in animation
  await shot("09-mobile-menu");
  await page.eval(`document.querySelector("#menu-btn").click() || true`);
  await new Promise((r) => setTimeout(r, 400));
  await shot("10-mobile");
  const overflow = await page.eval(`document.documentElement.scrollWidth > window.innerWidth + 1`);
  await page.viewport(1280, 900);
  await page.eval(`(() => { window.scrollTo(0, document.body.scrollHeight); return true; })()`);
  const footerOverlap = await page.eval(`(() => { const f = document.querySelector("#foot").getBoundingClientRect(); const r = document.querySelector("#result .result")?.getBoundingClientRect(); return !!r && f.top < r.bottom - 1; })()`);
  check("footer stays below the content", !footerOverlap);
  check("mobile: no horizontal page scroll", !overflow);
} catch (err) {
  check("unexpected error", false, err.message);
  try { await shot("99-failure"); } catch { /* ignore */ }
} finally {
  await page.close();
  server.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
