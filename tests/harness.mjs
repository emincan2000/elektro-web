// Boots elektro in Pyodide exactly like web/app.js does (bundle zip + bridge.py),
// so the tests exercise the same code path as the browser.
import { loadPyodide } from "pyodide";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web");

export async function boot(lang = "en") {
  const py = await loadPyodide();
  await py.loadPackage("charset-normalizer", { messageCallback: () => {} });
  const zip = new Uint8Array(await readFile(path.join(WEB, "elektro-bundle.zip")));  // browser: ArrayBuffer from fetch
  py.unpackArchive(zip, "zip", { extractDir: "/lib/elektro-web" });
  py.runPython(`import sys; sys.path.insert(0, "/lib/elektro-web")`);
  py.FS.writeFile("/lib/elektro-web/bridge.py", await readFile(path.join(WEB, "bridge.py")));
  py.runPython(`import os; os.environ["ELEKTRO_LANG"] = ${JSON.stringify(lang)}`);
  const bridge = py.pyimport("bridge");
  return {
    py,
    catalog: () => JSON.parse(bridge.catalog()),
    run: (argv) => JSON.parse(bridge.run(JSON.stringify(argv))),
    parseExample: (line) => JSON.parse(bridge.parse_example(line)),
    setLang: (l) => bridge.set_lang(l),
  };
}
