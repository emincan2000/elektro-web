// Runs Pyodide and elektro off the main thread, so loading and computing never freeze the page.
import { pyodideBase } from "./lib.js";

const CDN = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/";
// ?pyodide=/path/: self-hosted copy (tests, mirrors) — same origin only, see lib.js
const PYODIDE_URL = pyodideBase(new URL(self.location.href).searchParams.get("pyodide"), self.location.href, CDN);
let py, bridge;

const progress = (step) => postMessage({ progress: step });

async function init(lang) {
  progress("python");
  const { loadPyodide } = await import(PYODIDE_URL + "pyodide.mjs");
  py = await loadPyodide({ indexURL: PYODIDE_URL });
  progress("packages");
  await py.loadPackage("charset-normalizer", { messageCallback: () => {} });
  progress("elektro");
  const manifest = await (await fetch("bundle.json", { cache: "no-cache" })).json();
  const v = `${manifest.elektro}-${manifest.bytes}`;             // cache-bust per bundle build
  const [zip, src] = await Promise.all([
    fetch(`elektro-bundle.zip?v=${v}`).then((r) => { if (!r.ok) throw new Error(`bundle: ${r.status}`); return r.arrayBuffer(); }),
    fetch("bridge.py", { cache: "no-cache" }).then((r) => r.text()),        // small; must match app.js
  ]);
  py.unpackArchive(zip, "zip", { extractDir: "/lib/elektro-web" });
  py.FS.writeFile("/lib/elektro-web/bridge.py", src);
  py.globals.set("_lang", lang || "");
  py.runPython(`import os, sys
sys.path.insert(0, "/lib/elektro-web")
if _lang: os.environ["ELEKTRO_LANG"] = _lang`);
  bridge = py.pyimport("bridge");
  return { catalog: JSON.parse(bridge.catalog()), manifest, pyodide: py.version };
}

const ops = {
  init: (lang) => init(lang),
  run: (argv) => JSON.parse(bridge.run(JSON.stringify(argv))),
  setLang: (lang) => { bridge.set_lang(lang); return JSON.parse(bridge.catalog()); },
  upload: (name, bytes) => bridge.add_input(name, new Uint8Array(bytes)),   // bridge calls .to_py()
  simInfo: () => JSON.parse(bridge.sim_info()),
  simLoad: (source, value, name) => JSON.parse(bridge.sim_load(source, value, name || "circuit")),
  simRun: (payload) => JSON.parse(bridge.sim_run(JSON.stringify(payload))),
};

onmessage = async ({ data: { id, op, args } }) => {
  try {
    postMessage({ id, ok: true, result: await ops[op](...args) });
  } catch (err) {
    postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
