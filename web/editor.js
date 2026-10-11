// Drag-and-drop schematic editor for elektro's circuit files (the same .json `elektro tui` edits).
// Geometry comes from circuit.js (checked against elektro's model.py); solving stays in elektro.
//
//   palette → drag onto the grid (or click it, then click the grid) to place a part
//   drag a part to move it (its wires follow) · drag from a pin, a wire or an empty point: wire
//   click: select · double click: edit value · R rotate · Delete · Ctrl+Z / Ctrl+Y · Esc
import * as C from "./circuit.js";
import { formatSI } from "./lib.js";

const U = 20;                       // px per grid step
const PAD_L = 64, PAD_T = 22;       // row numbers + room for labels left of column A / column letters
const NS = "http://www.w3.org/2000/svg";
const PALETTE = ["R", "C", "L", "V", "I", "D", "Q", "M", "U", "GND", "N"];

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const gx = (x) => PAD_L + x * U;
const gy = (y) => PAD_T + y * U;
const key = (p) => `${p[0]},${p[1]}`;
const samePt = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
const snapshot = (c) => JSON.stringify({ components: c.components, wires: c.wires, probes: c.probes, analysis: c.analysis });

function kindClass(kind) {
  if (kind === "V" || kind === "I") return "src";
  if (["D", "Q", "M", "U"].includes(kind)) return "dev";
  if (kind === "N") return "lbl";
  if (kind === "GND") return "gnd";
  return "part";
}

/** Which way a transistor / MOSFET symbol points, from its model (elektro's library types). */
function polarity(c, modelTypes) {
  const first = (c.value || "").trim().split(/\s+/)[0].toUpperCase();
  const typ = modelTypes[first] || first;
  if (c.kind === "Q") return typ === "PNP" ? "p" : "n";
  if (c.kind === "M") return typ === "PMOS" ? "p" : "n";
  return "";
}

// ------------------------------------------------------------------ symbols (SVG markup)
/** A two-pin part drawn from pin 1 to pin 2 (the order carries polarity: V +, diode anode). */
function twoPin(c, [p0, p1]) {
  const [x0, y0] = [gx(p0[0]), gy(p0[1])], [x1, y1] = [gx(p1[0]), gy(p1[1])];
  const len = Math.hypot(x1 - x0, y1 - y0), mid = len / 2;
  const ang = Math.round(Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI);
  const lead = (w) => `<path class="lead" d="M0 0H${mid - w / 2}M${mid + w / 2} 0H${len}"/>`;
  let body = "";
  const v = (c.value || "").toUpperCase();
  switch (c.kind) {
    case "R": body = lead(26) + `<rect x="${mid - 13}" y="-5.5" width="26" height="11" rx="1.5"/>`; break;
    case "C": body = lead(7) + `<path d="M${mid - 3.5} -9V9M${mid + 3.5} -9V9"/>`; break;
    case "L": body = lead(24) + `<path d="M${mid - 12} 0a3 3 0 0 1 6 0a3 3 0 0 1 6 0a3 3 0 0 1 6 0a3 3 0 0 1 6 0"/>`; break;
    case "V": {
      let glyph;
      if (/SIN/.test(v)) glyph = `<path d="M${mid - 6} 0q3 -7 6 0t6 0"/>`;
      else if (/PULSE/.test(v)) glyph = `<path d="M${mid - 6} 3h3v-6h6v6h3"/>`;
      else glyph = "";
      body = lead(22) + `<circle cx="${mid}" cy="0" r="11"/>` + glyph;
      break;
    }
    case "I": body = lead(22) + `<circle cx="${mid}" cy="0" r="11"/><path d="M${mid - 6} 0H${mid + 5}M${mid + 1} -4L${mid + 6} 0L${mid + 1} 4"/>`; break;
    case "D": {
      body = lead(12) + `<path class="fill" d="M${mid - 6} -7L${mid + 6} 0L${mid - 6} 7Z"/>`;
      body += /^BZ|^ZENER/.test(v) ? `<path d="M${mid + 3} -9L${mid + 6} -7V7L${mid + 9} 9"/>` : `<path d="M${mid + 6} -7V7"/>`;
      if (/^LED/.test(v)) body += `<path d="M${mid} -9l5 -6m-3 0h3v3M${mid + 5} -8l5 -6m-3 0h3v3"/>`;
      break;
    }
    default: body = lead(0);
  }
  const g = `<g transform="translate(${x0} ${y0}) rotate(${ang})">${body}</g>`;
  // + / − of a voltage source, upright whatever the rotation
  let signs = "";
  if (c.kind === "V" && !/SIN|PULSE/.test(v)) {
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    const at = (d) => [x0 + ux * (mid + d), y0 + uy * (mid + d)];
    const [px, py] = at(-5.5), [mx, my] = at(5.5);
    signs = `<path class="sign" d="M${px - 3} ${py}h6M${px} ${py - 3}v6M${mx - 3} ${my}h6"/>`;
  }
  return g + signs;
}

// ------------------------------------------------------------------ labels
// Each part's name/value label has a few candidate spots; the planner takes, part by part, the
// spot that covers the least of the drawing (parts, wires, net tags, labels placed so far).
const CH = 6.7;                     // width of one 11 px monospace character
const textW = (s) => String(s).length * CH;

export function partBoxes(c) {
  const X = gx(c.x), Y = gy(c.y);
  if (c.kind === "GND") return [[X - 9, Y - 2, 18, 18]];
  if (c.kind === "N") {
    const w = c.value.length * 7.2 + 14;
    if (c.rot === 180) return [[X - w, Y - 8, w, 16]];
    if (c.rot === 90) return [[X - w / 2, Y, w, 22]];
    if (c.rot === 270) return [[X - w / 2, Y - 22, w, 22]];
    return [[X, Y - 8, w, 16]];
  }
  if (c.kind === "U") {
    const xs = C.cells(c).map((p) => gx(p[0]));
    return [[Math.min(...xs) - 4, Y - U * 1.55, Math.max(...xs) - Math.min(...xs) + 8, U * 3.1]];
  }
  if (C.THREE_PIN.includes(c.kind)) return [[X - U - 2, Y - U - 2, 2 * U + 4, 2 * U + 4]];
  const [p0, p1] = C.pins(c);
  const xa = Math.min(gx(p0[0]), gx(p1[0])), xb = Math.max(gx(p0[0]), gx(p1[0]));
  const ya = Math.min(gy(p0[1]), gy(p1[1])), yb = Math.max(gy(p0[1]), gy(p1[1]));
  return [[xa - 12, ya - 12, xb - xa + 24, yb - ya + 24]];
}

export function labelCandidates(c) {
  const ref = esc(c.ref), val = esc(C.shortValue(c));
  const one = textW(`${c.ref} ${C.shortValue(c)}`), two = Math.max(textW(c.ref), textW(C.shortValue(c)));
  const line = (x, y, anchor) => `<text class="ref" x="${x}" y="${y}" text-anchor="${anchor}">${ref} <tspan class="val">${val}</tspan></text>`;
  const pair = (x, y, anchor) => `<text class="ref" x="${x}" y="${y}" text-anchor="${anchor}">${ref}</text><text class="val" x="${x}" y="${y + 12}" text-anchor="${anchor}">${val}</text>`;
  const at = (x, y, anchor, w, h) => ({ x: anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x, y, w, h });
  const out = [];
  const add = (bias, box, svg) => out.push({ bias, box: [box.x, box.y, box.w, box.h], svg });
  if (c.kind === "U") {
    const xs = C.cells(c).map((p) => gx(p[0]));
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, Y = gy(c.y);
    add(0, at(cx, Y + U * 1.5 + 4, "middle", one, 12), line(cx, Y + U * 1.5 + 13, "middle"));
    add(1, at(cx, Y - U * 1.5 - 14, "middle", one, 12), line(cx, Y - U * 1.5 - 5, "middle"));
    add(2, at(Math.max(...xs) + 6, Y + 8, "start", one, 12), line(Math.max(...xs) + 6, Y + 17, "start"));
    add(2, at(Math.min(...xs) - 6, Y + 8, "end", one, 12), line(Math.min(...xs) - 6, Y + 17, "end"));
    return out;
  }
  if (C.THREE_PIN.includes(c.kind)) {
    const X = gx(c.x), Y = gy(c.y);
    const base = C.rotate(-1, 0, c.rot);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const bias = dx === -base[0] && dy === -base[1] ? 0 : dx === base[0] && dy === base[1] ? 3 : 1;
      if (dx) {
        const x = X + dx * (U + 1), anchor = dx > 0 ? "start" : "end";
        add(bias, at(x, Y - 11, anchor, two, 24), pair(x, Y - 2, anchor));
      } else {
        const y = dy > 0 ? Y + U + 14 : Y - U - 6;
        add(bias, at(X, y - 9, "middle", one, 12), line(X, y, "middle"));
      }
    }
    return out;
  }
  const [p0, p1] = C.pins(c);
  const cx = (gx(p0[0]) + gx(p1[0])) / 2, cy = (gy(p0[1]) + gy(p1[1])) / 2;
  if (p0[1] === p1[1]) {             // horizontal: above, else below
    add(0, at(cx, cy - 20, "middle", one, 12), line(cx, cy - 11, "middle"));
    add(1, at(cx, cy + 10, "middle", one, 12), line(cx, cy + 19, "middle"));
  } else {                           // vertical: right, left, then on one line
    add(0, at(cx + 15, cy - 11, "start", two, 24), pair(cx + 15, cy - 2, "start"));
    add(1, at(cx - 15, cy - 11, "end", two, 24), pair(cx - 15, cy - 2, "end"));
    add(2, at(cx + 15, cy - 5, "start", one, 12), line(cx + 15, cy + 4, "start"));
    add(2, at(cx - 15, cy - 5, "end", one, 12), line(cx - 15, cy + 4, "end"));
  }
  return out;
}

function overlapArea(a, b) {
  const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? w * h : 0;
}

/** ref → chosen label markup, for every part that has a label. */
export function planLabels(circuit) {
  const blocks = [];                 // [box, owner ref]: a part's own body does not block its label
  for (const c of circuit.components) for (const b of partBoxes(c)) blocks.push([b, c.ref]);
  for (const [x1, y1, x2, y2] of circuit.wires) {
    blocks.push([[Math.min(gx(x1), gx(x2)) - 2, Math.min(gy(y1), gy(y2)) - 2, Math.abs(gx(x2) - gx(x1)) + 4, Math.abs(gy(y2) - gy(y1)) + 4], null]);
  }
  blocks.push([[0, 0, 24, 1e5], null], [[0, 0, 1e5, PAD_T - 4], null]);      // the cell address rulers
  // parts with the least choice first (horizontal two-pins), then a few rounds in which every
  // label may move given where all the others ended up
  const order = circuit.components.filter(C.isPart).sort((a, b) => labelCandidates(a).length - labelCandidates(b).length);
  const cands = new Map(order.map((c) => [c.ref, labelCandidates(c)]));
  const chosen = new Map();
  const choose = (c) => {
    let best = null;
    for (const cand of cands.get(c.ref)) {
      let cost = cand.bias * 40;
      for (const [b, owner] of blocks) if (owner !== c.ref) cost += overlapArea(cand.box, b);
      for (const [ref, other] of chosen) if (ref !== c.ref) cost += overlapArea(cand.box, other.box);
      if (!best || cost < best.cost) best = { ...cand, cost };
    }
    chosen.set(c.ref, best);
  };
  for (const c of order) choose(c);
  for (let round = 0; round < 3; round++) for (const c of order) choose(c);
  return new Map([...chosen].map(([ref, cand]) => [ref, cand.svg]));
}

function threePin(c, modelTypes) {
  const X = gx(c.x), Y = gy(c.y);
  let body;
  if (c.kind === "U") {
    const flip = c.rot === 90 || c.rot === 270 ? -1 : 1;
    const mirror = c.rot === 180 || c.rot === 270 ? -1 : 1;
    const sx = (d) => X + d * mirror, sy = (d) => Y + d * flip;
    body = `<path class="lead" d="M${sx(-U)} ${sy(-U)}H${sx(-U * 0.55)}M${sx(-U)} ${sy(U)}H${sx(-U * 0.55)}M${sx(U * 1.55)} ${Y}H${sx(2 * U)}"/>` +
      `<path d="M${sx(-U * 0.55)} ${Y - U * 1.5}L${sx(U * 1.55)} ${Y}L${sx(-U * 0.55)} ${Y + U * 1.5}Z"/>` +
      `<path class="sign" d="M${sx(-U * 0.3) - 3} ${sy(-U)}h6M${sx(-U * 0.3)} ${sy(-U) - 3}v6M${sx(-U * 0.3) - 3} ${sy(U)}h6"/>`;
  } else {
    const pol = polarity(c, modelTypes);
    if (c.kind === "Q") {
      body = `<circle cx="-1" cy="0" r="${U * 0.85}"/><path class="lead" d="M${-U} 0H-6M0 ${-U}V${-U * 0.62}L-6 -5M0 ${U}V${U * 0.62}L-6 5"/><path d="M-6 -9V9"/>` +
        (pol === "n" ? `<path class="fill" d="M0 ${U * 0.62}l-6.2 -1.2l2.6 -4.2Z"/>` : `<path class="fill" d="M-6 5l6.2 1.2l-2.6 4.2Z"/>`);
    } else {
      body = `<path class="lead" d="M${-U} 0H-9M0 ${-U}V-7H-5M0 ${U}V7H-5M-5 0H0V7"/><path d="M-9 -8V8M-5 -9V-4M-5 -2.5V2.5M-5 4V9"/>` +
        (pol === "n" ? `<path class="fill" d="M-5 0l5 -3v6Z"/>` : `<path class="fill" d="M0 0l-5 -3v6Z"/>`);
    }
    body = `<g transform="translate(${X} ${Y}) rotate(${c.rot})">${body}</g>`;
  }
  return body;
}

function symbol(c, modelTypes) {
  const X = gx(c.x), Y = gy(c.y);
  if (c.kind === "GND") return `<path d="M${X} ${Y}V${Y + 7}M${X - 8} ${Y + 7}h16M${X - 5} ${Y + 10.5}h10M${X - 2} ${Y + 14}h4"/>`;
  if (c.kind === "N") {
    const name = esc(c.value);
    const w = c.value.length * 7.2 + 10;
    if (c.rot === 180) return `<path class="tag" d="M${X - 3} ${Y}l-5 -7h-${w}v14h${w}Z"/><text class="lbl-text" x="${X - 8 - w / 2}" y="${Y + 4}" text-anchor="middle">${name}</text>`;
    if (c.rot === 90 || c.rot === 270) {
      const s = c.rot === 90 ? 1 : -1;
      return `<path class="tag" d="M${X} ${Y + 3 * s}l${w / 2} ${5 * s}v${10 * s}h${-w}v${-10 * s}Z"/><text class="lbl-text" x="${X}" y="${Y + (s > 0 ? 16 : -9)}" text-anchor="middle">${name}</text>`;
    }
    return `<path class="tag" d="M${X + 3} ${Y}l5 -7h${w}v14h${-w}Z"/><text class="lbl-text" x="${X + 8 + w / 2}" y="${Y + 4}" text-anchor="middle">${name}</text>`;
  }
  if (C.THREE_PIN.includes(c.kind)) return threePin(c, modelTypes);
  return twoPin(c, C.pins(c));
}

/** Small palette icon: the real symbol, scaled into a 44×30 box. */
function iconSvg(kind, modelTypes) {
  const c = { ref: "", kind, value: C.KINDS[kind].value, x: 1, y: 1, rot: 0 };
  if (kind === "N") c.value = "N";
  const box = {
    R: [gx(1) - 2, gy(1) - 12, 3 * U + 4, 24], C: [gx(1), gy(1) - 12, 3 * U, 24], L: [gx(1), gy(1) - 12, 3 * U, 24],
    V: [gx(1), gy(1) - 14, 3 * U, 28], I: [gx(1), gy(1) - 14, 3 * U, 28], D: [gx(1), gy(1) - 12, 3 * U, 24],
    Q: [gx(0) - 2, gy(0) - 2, 2 * U + 4, 2 * U + 4], M: [gx(0) - 2, gy(0) - 2, 2 * U + 4, 2 * U + 4],
    U: [gx(0) - 2, gy(-0.6), 3 * U + 4, 3.2 * U], GND: [gx(1) - 12, gy(1) - 4, 24, 20], N: [gx(1) - 4, gy(1) - 10, 32, 20],
  }[kind];
  return `<svg class="ed-icon k-${kindClass(kind)}" viewBox="${box.join(" ")}" aria-hidden="true">${symbol(c, modelTypes)}</svg>`;
}

// ------------------------------------------------------------------ editor
export function createEditor({ host, ui, texts, modelTypes, onChange }) {
  let circuit = C.emptyCircuit();
  let undo = [], redo = [];
  let mode = "select";            // select | wire | probe | place
  let placing = null;             // { kind, rot } while placing from the palette
  let selected = null;            // { ref } | { wire: [..] }
  let hover = null;               // grid point under the pointer
  let gesture = null;             // pointer interaction in progress
  let wireFrom = null;            // wire tool: chain start
  let overlay = null;             // { voltages, netPoints } after a simulation
  let stale = false;

  host.classList.add("ed");
  host.innerHTML = "";
  const bar = el("div", "ed-bar");
  const palette = el("div", "ed-palette");
  const tools = el("div", "ed-tools");
  const wrap = el("div", "ed-canvas");
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "ed-svg");
  svg.setAttribute("tabindex", "0");
  svg.setAttribute("role", "application");
  const status = el("div", "ed-status");
  const props = el("div", "ed-props");
  wrap.append(svg);
  bar.append(palette, tools);
  host.append(bar, wrap, status, props);

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
  function button(label, title, onclick, cls = "ed-btn") {
    const b = el("button", cls);
    b.type = "button";
    b.innerHTML = label;
    b.title = title;
    b.setAttribute("aria-label", title);
    b.addEventListener("click", onclick);
    return b;
  }

  const SHORTCUTS = {
    R: "R", C: "C", L: "L", V: "V", I: "I", D: "D", Q: "Q", M: "M", U: "U", GND: "G", N: "N",
  };

  // ---------------------------------------------------------------- toolbar
  function buildBar() {
    palette.replaceChildren(...PALETTE.map((kind) => {
      const sc = SHORTCUTS[kind] ? ` (${SHORTCUTS[kind]})` : "";
      const title = `${texts.kinds[kind] || kind}${sc}`;
      const b = button(`${iconSvg(kind, modelTypes)}<span>${kind === "N" ? ui.label : kind === "GND" ? "GND" : kind}</span>`,
        title, () => {}, "ed-pal");
      b.dataset.kind = kind;
      b.addEventListener("pointerdown", (e) => paletteDown(e, kind));
      return b;
    }));
    tools.replaceChildren(
      modeButton("select", "⬚", ui.edSelect, `${ui.edSelect} (S)`),
      modeButton("wire", "╱", ui.edWire, `${ui.edWire} (W)`),
      modeButton("probe", "◉", ui.edProbe, `${ui.edProbe} (P)`),
      button("⟳", `${ui.edRotate} (R)`, () => rotateSelected(), "ed-btn ed-rot"),
      button("✕", `${ui.edDelete} (Del)`, () => deleteSelected(), "ed-btn ed-del"),
      button("↶", `${ui.edUndo} (Ctrl+Z)`, () => doUndo(), "ed-btn ed-undo"),
      button("↷", `${ui.edRedo} (Ctrl+Y)`, () => doRedo(), "ed-btn ed-redo"),
      button(ui.edNew, ui.edNew, () => clearAll(), "ed-btn ed-new"));
  }
  function modeButton(m, icon, label, title = label) {
    const b = button(`${icon}<span>${label}</span>`, title, () => setMode(m), "ed-btn ed-mode");
    b.dataset.mode = m;
    return b;
  }
  function setMode(m) {
    mode = m;
    placing = m === "place" ? placing : null;
    wireFrom = null;
    tools.querySelectorAll(".ed-mode").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
    palette.querySelectorAll(".ed-pal").forEach((b) => b.setAttribute("aria-pressed", String(m === "place" && placing?.kind === b.dataset.kind)));
    svg.dataset.mode = m;
    draw();
  }

  // ---------------------------------------------------------------- undo
  function begin() {
    undo.push(snapshot(circuit));
    if (undo.length > 200) undo.shift();
    redo = [];
  }
  function restore(snap) {
    Object.assign(circuit, JSON.parse(snap));
  }
  function doUndo() {
    if (!undo.length) return;
    redo.push(snapshot(circuit));
    restore(undo.pop());
    selected = null;
    changed();
  }
  function doRedo() {
    if (!redo.length) return;
    undo.push(snapshot(circuit));
    restore(redo.pop());
    selected = null;
    changed();
  }
  function changed() {
    stale = true;
    overlay = null;
    draw();
    renderProps();
    onChange?.();
  }

  // ---------------------------------------------------------------- geometry helpers
  function toGrid(e, round = true) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const p = pt.matrixTransform(m.inverse());
    const fx = (p.x - PAD_L) / U, fy = (p.y - PAD_T) / U;
    return round ? [Math.max(0, Math.round(fx)), Math.max(0, Math.round(fy))] : [fx, fy];
  }
  const nearPoint = (e, p) => { const f = toGrid(e, false); return f && Math.hypot(f[0] - p[0], f[1] - p[1]) < 0.32; };
  const findRef = (ref) => circuit.components.find((c) => c.ref === ref);
  const isTerminal = (p) => C.terminals(circuit).has(key(p));
  function size() {
    const b = C.bounds(circuit);
    const narrow = wrap.clientWidth > 0 && wrap.clientWidth < 600;      // phones: grid sized to the circuit
    return narrow ? { cols: Math.max(b.maxX + 3, 13), rows: Math.max(b.maxY + 3, 9) }
      : { cols: Math.max(b.maxX + 7, 24), rows: Math.max(b.maxY + 4, 11) };
  }

  // ---------------------------------------------------------------- drawing
  function draw() {
    const { cols, rows } = size();
    const W = PAD_L + cols * U + U / 2, H = PAD_T + rows * U + U / 2;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.style.maxWidth = `${Math.round(W * 1.6)}px`;
    const out = [];
    // grid + cell addresses (the names elektro gives nodes: C3, F7 …)
    let dots = "";
    for (let y = 0; y <= rows; y++) for (let x = 0; x <= cols; x++) dots += `M${gx(x)} ${gy(y)}h0`;
    out.push(`<path class="grid" d="${dots}"/>`);
    let heads = "";
    for (let x = 0; x <= cols; x++) heads += `<text x="${gx(x)}" y="${PAD_T - 9}" text-anchor="middle">${C.colName(x)}</text>`;
    for (let y = 0; y <= rows; y++) heads += `<text x="20" y="${gy(y) + 3.5}" text-anchor="end">${y + 1}</text>`;
    out.push(`<g class="heads">${heads}</g>`);
    // selection highlight
    const sel = selected?.ref && findRef(selected.ref);
    if (sel) {
      const pts = C.cells(sel);
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      out.push(`<rect class="sel" x="${gx(Math.min(...xs)) - 9}" y="${gy(Math.min(...ys)) - 9}" width="${(Math.max(...xs) - Math.min(...xs)) * U + 18}" height="${(Math.max(...ys) - Math.min(...ys)) * U + 18}" rx="6"/>`);
    }
    // wires
    out.push(`<g class="wires">${circuit.wires.map((w) => {
      const on = selected?.wire && w.every((v, i) => v === selected.wire[i]);
      return `<path class="${on ? "wire on" : "wire"}" d="M${gx(w[0])} ${gy(w[1])}L${gx(w[2])} ${gy(w[3])}"/>`;
    }).join("")}</g>`);
    // parts
    const probed = probeTargets();
    const labels = planLabels(circuit);
    for (const c of circuit.components) {
      const cls = `comp k-${kindClass(c.kind)}${probed.parts.has(c.ref.toUpperCase()) ? " probed" : ""}${sel === c ? " selected" : ""}`;
      out.push(`<g class="${cls}" data-ref="${esc(c.ref)}">${symbol(c, modelTypes)}${labels.get(c.ref) || ""}</g>`);
    }
    // junction dots (3+ connections) and open pins
    const deg = C.degrees(circuit);
    const pinKeys = new Set(circuit.components.filter(C.isPart).flatMap((c) => C.pins(c).map(key)));
    let marks = "";
    for (const [k, n] of deg) {
      const [x, y] = k.split(",").map(Number);
      if (n >= 3) marks += `<circle class="dot" cx="${gx(x)}" cy="${gy(y)}" r="3.4"/>`;
      else if (n === 1 && pinKeys.has(k)) marks += `<circle class="open" cx="${gx(x)}" cy="${gy(y)}" r="3"/>`;
    }
    out.push(marks);
    // probes on nodes
    for (const p of probed.points) out.push(`<circle class="probe" cx="${gx(p[0])}" cy="${gy(p[1])}" r="5.5"/>`);
    // previews: part being placed, wire being drawn
    if (gesture?.kind === "wire" && gesture.to) out.push(wirePreview(gesture.from, gesture.to));
    if (mode === "wire" && wireFrom && hover) out.push(wirePreview(wireFrom, hover));
    if (placing && placing.at) {
      const ghost = { ref: "", kind: placing.kind, value: placing.value ?? C.KINDS[placing.kind].value, x: placing.at[0], y: placing.at[1], rot: placing.rot };
      out.push(`<g class="comp ghost k-${kindClass(ghost.kind)}">${symbol(ghost, modelTypes)}</g>`);
    }
    if (hover && !placing) out.push(`<circle class="hover" cx="${gx(hover[0])}" cy="${gy(hover[1])}" r="4.5"/>`);
    svg.innerHTML = out.join("");
    svg.dataset.u = U;                         // grid geometry, for tests driving the pointer
    svg.dataset.padL = PAD_L;
    svg.dataset.padT = PAD_T;
    placeVoltages();
    // labels may stick out above row 1 or right of the grid: grow the view to show them
    try {
      const bb = svg.getBBox();
      const x0 = Math.min(0, bb.x - 4), y0 = Math.min(0, bb.y - 4);
      const x1 = Math.max(W, bb.x + bb.width + 4), y1 = Math.max(H, bb.y + bb.height + 4);
      if (x0 < 0 || y0 < 0 || x1 > W || y1 > H) svg.setAttribute("viewBox", `${x0} ${y0} ${x1 - x0} ${y1 - y0}`);
    } catch { /* not rendered yet */ }
    host.classList.toggle("ed-empty", circuit.components.length === 0 && circuit.wires.length === 0);
    renderStatus();
  }

  /** Solved node voltages (until the circuit changes), each put where it covers no text. */
  function placeVoltages() {
    if (!overlay?.voltages || !overlay.netPoints) return;
    // text counts three times as much as a part's body
    const boxes = [...svg.querySelectorAll(".comp text")].map((t) => { const b = t.getBBox(); return { x: b.x, y: b.y, width: b.width, height: b.height, w: 3 }; });
    for (const c of circuit.components) {
      for (const [x, y, w, h] of partBoxes(c)) boxes.push({ x: x + 5, y: y + 5, width: w - 10, height: h - 10, w: 1 });
    }
    for (const [x1, y1, x2, y2] of circuit.wires) {
      boxes.push({ x: Math.min(gx(x1), gx(x2)) - 1.5, y: Math.min(gy(y1), gy(y2)) - 1.5, width: Math.abs(gx(x2) - gx(x1)) + 3, height: Math.abs(gy(y2) - gy(y1)) + 3, w: 2 });
    }
    const g = document.createElementNS(NS, "g");
    svg.append(g);
    for (const [name, pts] of Object.entries(overlay.netPoints)) {
      if (name === "0" || overlay.voltages[name] === undefined) continue;
      const t = document.createElementNS(NS, "text");
      t.setAttribute("class", "volt");
      t.textContent = fmtV(overlay.voltages[name]);
      g.append(t);
      const sorted = [...pts].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      const offsets = [[5, -6, "start"], [5, 14, "start"], [-5, -6, "end"], [-5, 14, "end"],
        [0, -9, "middle"], [0, 18, "middle"], [8, 4, "start"], [-8, 4, "end"], [5, -17, "start"], [-5, -17, "end"], [5, 25, "start"], [-5, 25, "end"]];
      const spots = offsets.flatMap(([dx, dy, anchor]) => sorted.map((p) => ({ p, dx, dy, anchor })));
      // first spot that covers no text; otherwise the one that covers the least
      let chosen = null, least = Infinity;
      for (const sp of spots) {
        t.setAttribute("x", gx(sp.p[0]) + sp.dx);
        t.setAttribute("y", gy(sp.p[1]) + sp.dy);
        t.setAttribute("text-anchor", sp.anchor);
        const b = t.getBBox();
        const over = boxes.reduce((sum, o) => sum + (o.w ?? 3) * Math.max(0, Math.min(b.x + b.width, o.x + o.width) - Math.max(b.x, o.x)) *
          Math.max(0, Math.min(b.y + b.height, o.y + o.height) - Math.max(b.y, o.y)), 0);
        if (over < least) { least = over; chosen = sp; }
        if (over === 0) break;
      }
      t.setAttribute("x", gx(chosen.p[0]) + chosen.dx);
      t.setAttribute("y", gy(chosen.p[1]) + chosen.dy);
      t.setAttribute("text-anchor", chosen.anchor);
      const placed = t.getBBox();
      boxes.push({ x: placed.x, y: placed.y, width: placed.width, height: placed.height, w: 3 });
    }
  }

  function wirePreview(a, b) {
    const pts = [a];
    if (a[0] !== b[0]) pts.push([b[0], a[1]]);
    if (a[1] !== b[1]) pts.push(b);
    return `<path class="wire preview" d="M${pts.map((p) => `${gx(p[0])} ${gy(p[1])}`).join("L")}"/>`;
  }

  function fmtV(v) {
    // numerical leftovers (1e-15 V on a 5 V circuit) are 0, like elektro's own tables
    const scale = Math.max(0, ...Object.values(overlay?.voltages || {}).map(Math.abs));
    return formatSI(Math.abs(v) < scale * 1e-9 ? 0 : v, "V").replace(" ", "");
  }

  function probeTargets() {
    const points = [], parts = new Set();
    for (const expr of circuit.probes) {
      const m = /^\s*([VIPR])\s*\(\s*([A-Za-z_][A-Za-z0-9_.]*)\s*(?:,\s*([A-Za-z_][A-Za-z0-9_]*)\s*)?\)\s*$/i.exec(expr);
      if (!m) continue;
      const func = m[1].toUpperCase();
      if (func === "V" || m[3]) {
        for (const name of [m[2], m[3]].filter(Boolean)) {
          const labels = circuit.components.filter((c) => c.kind === "N" && c.value.toUpperCase() === name.toUpperCase());
          if (labels.length) labels.forEach((c) => points.push([c.x, c.y]));
          else {
            const a = /^([A-Za-z]{1,3})(\d{1,4})$/.exec(name);
            if (a) {
              let x = 0;
              for (const ch of a[1].toUpperCase()) x = x * 26 + ch.charCodeAt(0) - 64;
              points.push([x - 1, Number(a[2]) - 1]);
            }
          }
        }
      } else parts.add(m[2].split(".")[0].toUpperCase());
    }
    return { points, parts };
  }

  function renderStatus() {
    const bits = [];
    if (hover) {
      bits.push(C.addr(hover));
      const comp = C.componentAt(circuit, hover);
      if (comp) bits.push(comp.kind === "N" ? comp.value : comp.ref);
      if (overlay?.netPoints) {
        for (const [name, pts] of Object.entries(overlay.netPoints)) {
          if (pts.some((p) => samePt(p, hover))) {
            bits.push(name === "0" ? "GND" : name);
            if (overlay.voltages?.[name] !== undefined) bits.push(fmtV(overlay.voltages[name]));
          }
        }
      }
    }
    const hint = placing ? ui.edHintPlace : mode === "wire" ? ui.edHintWire : mode === "probe" ? ui.edHintProbe : ui.edHint;
    status.replaceChildren(el("span", "ed-where", bits.join(" · ")), el("span", "ed-hint", hint));
  }

  // ---------------------------------------------------------------- properties of the selection
  function renderProps() {
    props.replaceChildren();
    const c = selected?.ref && findRef(selected.ref);
    if (selected?.wire) {
      const w = selected.wire;
      props.append(el("span", "ed-sel-title", `${ui.edWireSel} ${C.addr([w[0], w[1]])}–${C.addr([w[2], w[3]])}`),
        button(`✕ ${ui.edDelete}`, ui.edDelete, () => deleteSelected(), "small-btn"));
      return;
    }
    if (!c) return;
    props.append(el("span", "ed-sel-title", c.kind === "GND" ? "GND" : c.kind === "N" ? `${texts.kinds.N}` : `${c.ref} · ${texts.kinds[c.kind] || c.kind}`));
    if (c.kind !== "GND") {
      const input = el("input", "ed-value");
      input.type = "text";
      input.value = c.value;
      input.spellcheck = false;
      input.autocomplete = "off";
      input.id = "ed-value";
      input.setAttribute("aria-label", `${c.ref} ${ui.value}`);
      input.placeholder = c.kind === "N" ? "OUT" : texts.hints[c.kind] || "";
      let started = false;
      input.addEventListener("input", () => {
        if (!started) { begin(); started = true; }
        c.value = c.kind === "N" ? input.value.trim() : input.value;
        input.classList.toggle("bad", c.kind === "N" && !C.LABEL_RE.test(c.value));
        stale = true;
        overlay = null;
        draw();
        onChange?.();
      });
      input.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); svg.focus(); } });
      props.append(input);
      props.append(el("span", "ed-hint", c.kind === "N" ? texts.label_hint : texts.hints[c.kind] || ""));
    }
    props.append(button(`⟳ ${ui.edRotate}`, `${ui.edRotate} (R)`, () => rotateSelected(), "small-btn"),
      button(`✕ ${ui.edDelete}`, `${ui.edDelete} (Del)`, () => deleteSelected(), "small-btn"));
  }

  function select(sel) {
    selected = sel;
    draw();
    renderProps();
  }

  // ---------------------------------------------------------------- edits
  function rotateSelected() {
    if (placing) {
      placing.rot = (placing.rot + 90) % 360;
      if (hover) placing.at = anchorFor(placing.kind, placing.rot, hover);
      draw();
      return;
    }
    const c = selected?.ref && findRef(selected.ref);
    if (!c || c.kind === "GND") return;
    begin();
    C.rotatePart(circuit, c);
    changed();
  }
  function deleteSelected() {
    if (selected?.ref) {
      const c = findRef(selected.ref);
      if (!c) return;
      begin();
      circuit.components.splice(circuit.components.indexOf(c), 1);
    } else if (selected?.wire) {
      const i = circuit.wires.findIndex((w) => w.every((v, k) => v === selected.wire[k]));
      if (i < 0) return;
      begin();
      circuit.wires.splice(i, 1);
    } else return;
    selected = null;
    changed();
  }
  function clearAll() {
    if (!circuit.components.length && !circuit.wires.length) return;
    begin();
    circuit.components = [];
    circuit.wires = [];
    circuit.probes = [];
    selected = null;
    changed();
    onChange?.("new");
  }
  function uniqueLabel() {
    const used = new Set(circuit.components.filter((c) => c.kind === "N").map((c) => c.value.toUpperCase()));
    if (!used.has("OUT")) return "OUT";
    let n = 1;
    while (used.has(`N${n}`)) n++;
    return `N${n}`;
  }
  function place(kind, at, rot) {
    begin();
    const value = kind === "N" ? uniqueLabel() : C.KINDS[kind].value;
    const c = C.addComponent(circuit, kind, at[0], at[1], rot, value);
    C.clampPart(c);
    selected = { ref: c.ref };
    changed();
    return c;
  }

  function startPlacing(kind) {
    const rot = C.DEFAULT_ROT[kind] ?? 0;
    placing = {
      kind,
      rot,
      at: hover ? anchorFor(kind, rot, hover) : null,
    };
    wireFrom = null;
    selected = null;
    setMode("place");
    svg.focus({ preventScroll: true });
    draw();
    renderProps();
  }

  // ---------------------------------------------------------------- palette: drag or click
  function paletteDown(e, kind) {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = [e.clientX, e.clientY];
    let dragging = false;
    const rot = C.DEFAULT_ROT[kind];
    const move = (ev) => {
      if (!dragging && Math.hypot(ev.clientX - start[0], ev.clientY - start[1]) > 5) {
        dragging = true;
        placing = { kind, rot };
        host.classList.add("ed-dragging");
      }
      if (dragging) {
        placing.at = overSvg(ev) ? anchorFor(kind, placing.rot, toGrid(ev)) : null;
        draw();
      }
    };
    const up = (ev) => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      host.classList.remove("ed-dragging");
      if (!dragging) {               // a click: place it with the next click on the grid
        startPlacing(kind);
        return;
      }
      const at = overSvg(ev) ? anchorFor(kind, placing.rot, toGrid(ev)) : null;
      const r = placing.rot;
      placing = null;
      if (at) place(kind, at, r);
      else draw();
      setMode("select");
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  }
  const overSvg = (e) => { const r = svg.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
  function anchorFor(kind, rot, g) {
    const [ox, oy] = C.centerOffset(kind, rot);
    const c = { kind, x: g[0] - ox, y: g[1] - oy, rot };
    C.clampPart(c);
    return [c.x, c.y];
  }

  // ---------------------------------------------------------------- canvas pointer
  svg.addEventListener("pointerdown", (e) => {
    if (e.button === 2) return;
    if (e.button !== 0) return;
    const p = toGrid(e);
    if (!p) return;
    svg.focus({ preventScroll: true });
    if (mode === "place" && placing) {
      const at = anchorFor(placing.kind, placing.rot, p);
      const kind = placing.kind, rot = placing.rot;
      placing = null;
      place(kind, at, rot);
      setMode("select");
      return;
    }
    if (mode === "probe") {
      begin();
      if (C.probeAt(circuit, p)) changed();
      else undo.pop();
      return;
    }
    if (mode === "wire") {
      if (!wireFrom) { wireFrom = p; draw(); return; }
      if (samePt(wireFrom, p)) { wireFrom = null; draw(); return; }
      begin();
      C.addWire(circuit, wireFrom, p);
      wireFrom = p;                 // keep going from here, like the TUI
      changed();
      return;
    }
    // select mode: what is under the pointer?
    const comp = C.componentAt(circuit, p);
    const atPin = isTerminal(p) && nearPoint(e, p) && !(comp && C.SYMBOLS.includes(comp.kind));
    const wire = C.wireAt(circuit, p);
    let target;
    if (atPin) target = { type: "point" };
    else if (comp) target = { type: "comp", ref: comp.ref };
    else if (wire) target = { type: "wire", wire: [...wire] };
    else target = { type: "point" };
    gesture = { start: p, target, moved: false, snap: snapshot(circuit), pointer: e.pointerId };
    if (target.type === "comp") { gesture.orig = [comp.x, comp.y]; selected = { ref: comp.ref }; renderProps(); draw(); }
    svg.setPointerCapture(e.pointerId);
  });

  svg.addEventListener("pointermove", (e) => {
    const p = toGrid(e);
    if (!p) return;
    const moved = !samePt(p, hover);
    hover = p;
    if (placing && mode === "place") { placing.at = anchorFor(placing.kind, placing.rot, p); draw(); return; }
    if (!gesture) { if (moved) draw(); return; }
    if (!gesture.moved && samePt(p, gesture.start)) return;
    gesture.moved = true;
    if (gesture.target.type === "comp") {
      restore(gesture.snap);
      const c = findRef(gesture.target.ref);
      const nx = gesture.orig[0] + p[0] - gesture.start[0], ny = gesture.orig[1] + p[1] - gesture.start[1];
      const test = { ...c, x: nx, y: ny };
      C.clampPart(test);
      C.movePart(circuit, c, test.x, test.y);
      draw();
    } else {
      gesture.kind = "wire";
      gesture.from = gesture.start;
      gesture.to = p;
      draw();
    }
  });

  svg.addEventListener("pointerup", (e) => {
    if (!gesture) return;
    const g = gesture;
    gesture = null;
    const p = toGrid(e) || g.start;
    if (!g.moved) {
      if (g.target.type === "comp") select({ ref: g.target.ref });
      else if (g.target.type === "wire") select({ wire: g.target.wire });
      else select(null);
      return;
    }
    if (g.target.type === "comp") {
      const now = snapshot(circuit);
      if (now !== g.snap) {
        undo.push(g.snap);
        redo = [];
        changed();
      } else draw();
      return;
    }
    if (g.kind === "wire" && !samePt(g.start, p)) {
      begin();
      C.addWire(circuit, g.start, p);
      changed();
    } else draw();
  });

  svg.addEventListener("pointerleave", () => { if (!gesture) { hover = null; if (placing && mode === "place") placing.at = null; draw(); } });
  svg.addEventListener("dblclick", (e) => {
    const p = toGrid(e);
    const comp = p && C.componentAt(circuit, p);
    if (comp && comp.kind !== "GND") {
      select({ ref: comp.ref });
      const input = props.querySelector(".ed-value");
      input?.focus();
      input?.select();
    }
  });
  svg.addEventListener("contextmenu", (e) => {
    if (mode === "wire" || placing) { e.preventDefault(); wireFrom = null; placing = null; setMode("select"); }
  });

  wrap.addEventListener("pointerenter", () => {
    svg.focus({ preventScroll: true });
  });

  svg.addEventListener("wheel", (e) => {
    if (placing) {
      e.preventDefault();
      rotateSelected();
    }
  }, { passive: false });

  function isEditorActive() {
    if (!host.isConnected || host.hidden) return false;
    if (host.closest("[hidden]")) return false;
    if (host.offsetParent === null && window.getComputedStyle(host).display === "none") return false;
    return true;
  }

  function moveByKeys(dx, dy) {
    if (placing) {
      const cur = placing.at || hover || [4, 4];
      const next = [Math.max(0, cur[0] + dx), Math.max(0, cur[1] + dy)];
      hover = next;
      placing.at = anchorFor(placing.kind, placing.rot, next);
      draw();
      return;
    }
    const c = selected?.ref && findRef(selected.ref);
    if (c) {
      begin();
      const nx = c.x + dx, ny = c.y + dy;
      const test = { ...c, x: nx, y: ny };
      C.clampPart(test);
      C.movePart(circuit, c, test.x, test.y);
      changed();
      return;
    }
    if (mode === "wire" && wireFrom) {
      if (!hover) hover = [wireFrom[0], wireFrom[1]];
      hover = [Math.max(0, hover[0] + dx), Math.max(0, hover[1] + dy)];
      draw();
      return;
    }
    if (!hover) hover = [4, 4];
    else hover = [Math.max(0, hover[0] + dx), Math.max(0, hover[1] + dy)];
    draw();
  }

  function onKeyDown(e) {
    if (!isEditorActive()) return;

    const target = e.target;
    const tag = target?.tagName;
    if (target?.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      return;
    }

    const k = e.key;
    const code = e.code;
    const key = k ? k.toLowerCase() : "";

    // Ctrl/Cmd shortcuts
    if ((e.ctrlKey || e.metaKey) && (key === "z" || code === "KeyZ")) {
      e.preventDefault();
      e.shiftKey ? doRedo() : doUndo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (key === "y" || code === "KeyY")) {
      e.preventDefault();
      doRedo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (key === "r" || code === "KeyR")) {
      e.preventDefault();
      rotateSelected();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (tag === "BUTTON" && (k === "Enter" || k === " ")) return;

    // Component shortcuts
    if (key === "c" || code === "KeyC") {
      e.preventDefault();
      startPlacing("C");
      return;
    }
    if (key === "v" || code === "KeyV") {
      e.preventDefault();
      startPlacing("V");
      return;
    }
    if (key === "r" || code === "KeyR") {
      e.preventDefault();
      if (placing || selected?.ref) {
        rotateSelected();
      } else {
        startPlacing("R");
      }
      return;
    }
    if (key === "l" || code === "KeyL") {
      e.preventDefault();
      startPlacing("L");
      return;
    }
    if (key === "i" || key === "ı" || code === "KeyI") {
      e.preventDefault();
      startPlacing("I");
      return;
    }
    if (key === "d" || code === "KeyD") {
      e.preventDefault();
      startPlacing("D");
      return;
    }
    if (key === "q" || code === "KeyQ") {
      e.preventDefault();
      startPlacing("Q");
      return;
    }
    if (key === "m" || key === "f" || code === "KeyM" || code === "KeyF") {
      e.preventDefault();
      startPlacing("M");
      return;
    }
    if (key === "u" || code === "KeyU") {
      e.preventDefault();
      startPlacing("U");
      return;
    }
    if (key === "g" || code === "KeyG") {
      e.preventDefault();
      startPlacing("GND");
      return;
    }
    if (key === "n" || code === "KeyN") {
      e.preventDefault();
      startPlacing("N");
      return;
    }

    // Modes and tools
    if (key === "w" || code === "KeyW") {
      e.preventDefault();
      setMode(mode === "wire" ? "select" : "wire");
      return;
    }
    if (key === "p" || code === "KeyP") {
      e.preventDefault();
      setMode(mode === "probe" ? "select" : "probe");
      return;
    }
    if (key === "s" || code === "KeyS") {
      e.preventDefault();
      wireFrom = null;
      placing = null;
      setMode("select");
      return;
    }

    // Space: rotate placing or selected
    if (k === " " || code === "Space") {
      if (placing || selected?.ref) {
        e.preventDefault();
        rotateSelected();
        return;
      }
    }

    // Delete / Backspace / X
    if (k === "Delete" || k === "Backspace" || key === "x" || code === "KeyX") {
      e.preventDefault();
      deleteSelected();
      return;
    }

    // Escape
    if (k === "Escape") {
      e.preventDefault();
      wireFrom = null;
      placing = null;
      selected = null;
      setMode("select");
      renderProps();
      return;
    }

    // Edit value
    if (key === "e" || code === "KeyE") {
      if (selected?.ref) {
        const input = props.querySelector(".ed-value");
        if (input) {
          e.preventDefault();
          input.focus();
          input.select();
          return;
        }
      }
    }

    // Enter
    if (k === "Enter") {
      if (mode === "place" && placing && placing.at) {
        e.preventDefault();
        const at = placing.at, kind = placing.kind, rot = placing.rot;
        placing = null;
        place(kind, at, rot);
        setMode("select");
        return;
      }
      if (mode === "wire" && hover) {
        e.preventDefault();
        if (!wireFrom) { wireFrom = hover; draw(); return; }
        if (samePt(wireFrom, hover)) { wireFrom = null; draw(); return; }
        begin();
        C.addWire(circuit, wireFrom, hover);
        wireFrom = hover;
        changed();
        return;
      }
      if (selected?.ref) {
        const input = props.querySelector(".ed-value");
        if (input) {
          e.preventDefault();
          input.focus();
          input.select();
          return;
        }
      }
    }

    // Arrow navigation
    if (k === "ArrowUp" || k === "ArrowDown" || k === "ArrowLeft" || k === "ArrowRight") {
      e.preventDefault();
      const step = e.shiftKey ? 4 : 1;
      const dx = k === "ArrowLeft" ? -step : k === "ArrowRight" ? step : 0;
      const dy = k === "ArrowUp" ? -step : k === "ArrowDown" ? step : 0;
      moveByKeys(dx, dy);
      return;
    }
  }

  host._edAbort?.abort();
  const edAbort = new AbortController();
  host._edAbort = edAbort;
  window.addEventListener("keydown", onKeyDown, { signal: edAbort.signal });

  buildBar();
  setMode("select");
  // the grid size depends on the width (phones get a tighter grid)
  if (typeof ResizeObserver === "function") {
    let lastNarrow = null;
    new ResizeObserver(() => {
      const narrow = wrap.clientWidth < 600;
      if (narrow !== lastNarrow) { lastNarrow = narrow; draw(); }
    }).observe(wrap);
  }

  return {
    /** Edit this circuit object in place (the page keeps the same reference). */
    load(c) {
      circuit = c;
      undo = [];
      redo = [];
      selected = null;
      overlay = null;
      stale = false;
      draw();
      renderProps();
    },
    redraw() { draw(); renderProps(); },
    /** Solved DC node voltages to show on the drawing (cleared by the next edit). */
    setOverlay(voltages, netPoints) {
      overlay = voltages ? { voltages, netPoints } : null;
      stale = false;
      draw();
    },
    get stale() { return stale; },
    /** For tests and the page: grid point → screen coordinates. */
    screenPoint([x, y]) {
      const m = svg.getScreenCTM();
      const pt = svg.createSVGPoint();
      pt.x = gx(x);
      pt.y = gy(y);
      const s = pt.matrixTransform(m);
      return [s.x, s.y];
    },
    rebuild(nextTexts, nextUi) { texts = nextTexts; ui = nextUi; buildBar(); setMode(mode); renderProps(); },
    destroy() { host._edAbort?.abort(); },
  };
}
