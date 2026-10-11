// Runs every example from every command's help text inside Pyodide and writes
// the results to tests/out/pyodide.json (compare_native.py checks them against the CLI).
import { boot } from "./harness.mjs";
import { fixtures } from "./fixtures.mjs";
import { argvToValues, buildArgv } from "../web/lib.js";
import { mkdir, writeFile } from "node:fs/promises";

const t0 = Date.now();
const e = await boot("en");
const bootMs = Date.now() - t0;
const cat = e.catalog();
e.py.FS.mkdirTree("/work");
for (const [name, text] of Object.entries(fixtures())) e.py.FS.writeFile("/work/" + name, text);
const cases = [];
for (const c of cat.commands) {
  for (const ex of c.examples) {
    const argv = e.parseExample(ex);
    const t = Date.now();
    const r = e.run(argv);
    // form round trip: example -> form values -> argv must give the same result
    const parsed = argvToValues(c, argv.slice(c.path.length));
    const rebuilt = buildArgv(c, parsed.values);
    const r2 = JSON.stringify(rebuilt) === JSON.stringify(argv) ? r : e.run(rebuilt);
    const roundtrip = parsed.unknown.length === 0 && parsed.extra.length === 0 &&
      JSON.stringify(r2.json) === JSON.stringify(r.json) && r2.text === r.text;
    cases.push({ roundtrip, rebuilt, unknown: parsed.unknown, extra: parsed.extra, command: c.path.join(" "), example: ex, ms: Date.now() - t, ...r,
                 files: r.files.map((f) => ({ name: f.name, type: f.type, size: (f.text || f.base64 || "").length })) });
  }
}
await mkdir(new URL("./out/fixtures/", import.meta.url), { recursive: true });
await writeFile(new URL("./out/catalog.json", import.meta.url), JSON.stringify(cat, null, 1));
for (const [name, text] of Object.entries(fixtures()))
  await writeFile(new URL("./out/fixtures/" + name, import.meta.url), text);
await writeFile(new URL("./out/pyodide.json", import.meta.url),
  JSON.stringify({ bootMs, commands: cat.commands.length, panels: cat.panels, cases }, null, 1));
const failed = cases.filter((c) => !c.ok);
console.log(`boot ${bootMs} ms, ${cat.commands.length} commands, ${cases.length} examples, ` +
  `${failed.length} failed, ${cases.filter((c) => c.json !== null).length} with JSON`);
const noEx = cat.commands.filter((c) => c.examples.length === 0).map((c) => c.path.join(" "));
console.log(`commands without examples (${noEx.length}): ${noEx.join(", ")}`);
const rt = cases.filter((c) => !c.roundtrip);
console.log(`form round trip: ${cases.length - rt.length}/${cases.length} identical`);
for (const c of rt) console.log(`  RT ${c.example}\n     -> ${c.rebuilt.join(" ")} unknown=${c.unknown} extra=${c.extra}`);
for (const f of failed) console.log(`FAIL ${f.example}\n     ${f.stderr.split("\n")[0]}`);
