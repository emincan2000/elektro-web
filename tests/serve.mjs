// Minimal static server for web/ (and /pyodide/ from node_modules, so tests need no CDN).
// Usage: node tests/serve.mjs [port]   → http://127.0.0.1:8765/?pyodide=/pyodide/
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOTS = [
  ["/pyodide/", path.join(here, "node_modules", "pyodide")],
  ["/", path.join(here, "..", "web")],
];
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".py": "text/x-python; charset=utf-8",
  ".svg": "image/svg+xml", ".wasm": "application/wasm", ".zip": "application/zip",
  ".whl": "application/zip", ".map": "application/json",
};

export function serve(port = 8765) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const [prefix, dir] = ROOTS.find(([p]) => url.pathname.startsWith(p));
    let rel = decodeURIComponent(url.pathname.slice(prefix.length)) || "index.html";
    const file = path.join(dir, path.normalize("/" + rel));
    if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
    try {
      if ((await stat(file)).isDirectory()) { res.writeHead(404).end(); return; }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] || 8765);
  await serve(port);
  console.log(`http://127.0.0.1:${port}/?pyodide=/pyodide/`);
}
