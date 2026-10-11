// Tiny WebDriver BiDi client for headless Firefox (no dependencies).
// Node 20 needs --experimental-websocket; Node 22+ has WebSocket built in.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export async function launchFirefox({ bin = process.env.FIREFOX || "firefox-esr", port = 9300 + Math.floor(Math.random() * 600) } = {}) {
  const profile = mkdtempSync(path.join(tmpdir(), "elektro-web-ff-"));
  const proc = spawn(bin, ["--headless", "--no-remote", "--profile", profile,
    `--remote-debugging-port=${port}`, "--window-size=1280,900", "about:blank"],
  { stdio: ["ignore", "ignore", "pipe"] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("firefox did not start")), 30000);
    proc.stderr.on("data", (d) => { if (String(d).includes("WebDriver BiDi listening")) { clearTimeout(timer); resolve(); } });
    proc.on("exit", (c) => reject(new Error(`firefox exited ${c}`)));
  });
  const ws = new WebSocket(`ws://127.0.0.1:${port}/session`);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) {
      const { resolve, reject } = waiting.get(msg.id);
      waiting.delete(msg.id);
      msg.type === "error" ? reject(new Error(`${msg.error}: ${msg.message}`)) : resolve(msg.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    waiting.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send("session.new", { capabilities: {} });
  const tree = await send("browsingContext.getTree", {});
  const context = tree.contexts[0].context;

  const page = {
    send,
    goto: (url) => send("browsingContext.navigate", { context, url, wait: "complete" }),
    /** Evaluate an expression (may return a promise) and get its JSON-able value back. */
    async eval(expression) {
      const r = await send("script.evaluate", {
        expression: `(async () => JSON.stringify(await (${expression})))()`,
        target: { context }, awaitPromise: true, resultOwnership: "none",
      });
      if (r.type === "exception") throw new Error(r.exceptionDetails.text);
      return r.result.value === undefined ? undefined : JSON.parse(r.result.value);
    },
    async waitFor(expression, timeout = 60000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        if (await page.eval(expression)) return true;
        await new Promise((r) => setTimeout(r, 200));
      }
      throw new Error(`timeout waiting for: ${expression}`);
    },
    viewport: (width, height) => send("browsingContext.setViewport", { context, viewport: { width, height } }),
    /** Real pointer input (mouse or touch): steps like { type: "pointerMove", x, y } in CSS px. */
    pointer: (steps, pointerType = "mouse") => send("input.performActions", {
      context, actions: [{ type: "pointer", id: `ptr-${pointerType}`, parameters: { pointerType }, actions: steps }],
    }),
    /** Real key presses; WebDriver codes for special keys (e.g. "\uE017" Delete, "\uE009" Control). */
    keys: (list) => send("input.performActions", {
      context, actions: [{ type: "key", id: "kbd", actions: list.flatMap((k) => Array.isArray(k)
        ? [...k.map((v) => ({ type: "keyDown", value: v })), ...[...k].reverse().map((v) => ({ type: "keyUp", value: v }))]
        : [{ type: "keyDown", value: k }, { type: "keyUp", value: k }]) }],
    }),
    async screenshot(full = false) {
      const r = await send("browsingContext.captureScreenshot", { context, origin: full ? "document" : "viewport" });
      return Buffer.from(r.data, "base64");
    },
    async close() {
      try { await send("session.end", {}); } catch { /* already gone */ }
      ws.close();
      proc.kill();
      await new Promise((r) => setTimeout(r, 300));
      rmSync(profile, { recursive: true, force: true });
    },
  };
  return page;
}
