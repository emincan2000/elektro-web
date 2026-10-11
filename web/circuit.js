// elektro's circuit model (elektro/circuit/model.py) for the drag-and-drop editor: grid
// geometry of the parts, wires, refs. The editor writes elektro's own circuit file, so these
// rules must be the same as elektro's; tests/test_circuit.mjs checks them against the Python
// code for every kind and rotation. Solving and net naming stay in elektro.

export const H_SPAN = 3, V_SPAN = 2;

export const KINDS = {
  R: { unit: "Ω", value: "1k", pins: 2 },
  C: { unit: "F", value: "100n", pins: 2 },
  L: { unit: "H", value: "10m", pins: 2 },
  V: { unit: "V", value: "5", pins: 2 },
  I: { unit: "A", value: "1m", pins: 2 },
  GND: { unit: "", value: "", pins: 1 },
  N: { unit: "", value: "OUT", pins: 1 },
  D: { unit: "", value: "1N4148", pins: 2 },
  Q: { unit: "", value: "2N2222", pins: 3 },
  M: { unit: "", value: "2N7000", pins: 3 },
  U: { unit: "", value: "ideal", pins: 3 },
};
export const THREE_PIN = ["Q", "M", "U"];
export const SYMBOLS = ["GND", "N"];
// rotation a part gets when placed (elektro/circuit/editor.py DEFAULT_ROT)
export const DEFAULT_ROT = { R: 0, L: 0, C: 90, V: 90, I: 90, GND: 0, N: 0, D: 90, Q: 0, M: 0, U: 0 };
export const LABEL_RE = /^[A-Za-z_][A-Za-z0-9_]{0,15}$/;

export const emptyCircuit = () => ({ elektro_circuit: 1, components: [], wires: [], probes: [], analysis: "" });

export function rotate(dx, dy, rot) {
  for (let i = 0; i < Math.floor(rot / 90); i++) [dx, dy] = [-dy, dx];
  return [dx + 0, dy + 0];          // +0: no -0 in JSON comparisons
}

const horizontal = (c) => c.rot === 0 || c.rot === 180;
export const isPart = (c) => !SYMBOLS.includes(c.kind);

/** Pin points: V/I first pin is +, diode anode–cathode, BJT C B E, MOSFET D G S, op-amp out + −. */
export function pins(c) {
  const { x, y, rot } = c;
  if (SYMBOLS.includes(c.kind)) return [[x, y]];
  if (c.kind === "U") {
    const flip = rot === 90 || rot === 270 ? -1 : 1;
    const mirror = rot === 180 || rot === 270 ? -1 : 1;
    return [[x + 2 * mirror, y], [x - mirror, y - flip], [x - mirror, y + flip]];
  }
  if (THREE_PIN.includes(c.kind)) {
    return [[0, -1], [-1, 0], [0, 1]].map(([dx, dy]) => { const [a, b] = rotate(dx, dy, rot); return [x + a, y + b]; });
  }
  const a = [x, y], b = horizontal(c) ? [x + H_SPAN, y] : [x, y + V_SPAN];
  return rot === 0 || rot === 90 ? [a, b] : [b, a];
}

/** Every grid point the part covers (for picking it). */
export function cells(c) {
  if (SYMBOLS.includes(c.kind)) return [[c.x, c.y]];
  if (THREE_PIN.includes(c.kind)) {
    const pts = [...pins(c), [c.x, c.y]];
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const out = [];
    for (let px = Math.min(...xs); px <= Math.max(...xs); px++)
      for (let py = Math.min(...ys); py <= Math.max(...ys); py++) out.push([px, py]);
    return out;
  }
  const out = [];
  if (horizontal(c)) for (let i = 0; i <= H_SPAN; i++) out.push([c.x + i, c.y]);
  else for (let i = 0; i <= V_SPAN; i++) out.push([c.x, c.y + i]);
  return out;
}

export function colName(x) {
  let name = "";
  x += 1;
  while (x) {
    const rem = (x - 1) % 26;
    x = Math.floor((x - 1) / 26);
    name = String.fromCharCode(65 + rem) + name;
  }
  return name;
}
export const addr = ([x, y]) => `${colName(x)}${y + 1}`;

export function nextRef(circuit, kind) {
  if (kind === "GND") return "GND";
  const prefix = kind === "N" ? "LBL" : kind;
  const used = new Set(circuit.components.map((c) => c.ref));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export function addComponent(circuit, kind, x, y, rot = DEFAULT_ROT[kind], value = KINDS[kind].value) {
  const comp = { ref: nextRef(circuit, kind), kind, value, x, y, rot };
  circuit.components.push(comp);
  return comp;
}

const sameSeg = (s, t) => s.every((v, i) => v === t[i]);
const hasSeg = (wires, s) => wires.some((w) => sameSeg(w, s) || sameSeg(w, [s[2], s[3], s[0], s[1]]));

/** Wire between two points: horizontal part first, then vertical (an L), like elektro. */
export function addWire(circuit, [x1, y1], [x2, y2]) {
  const parts = [];
  if (x1 !== x2) parts.push([x1, y1, x2, y1]);
  if (y1 !== y2) parts.push([x2, y1, x2, y2]);
  for (const seg of parts) if (!hasSeg(circuit.wires, seg)) circuit.wires.push(seg);
  return parts;
}

export function onSegment([px, py], [x1, y1, x2, y2]) {
  if (x1 === x2 && x2 === px) return Math.min(y1, y2) <= py && py <= Math.max(y1, y2);
  if (y1 === y2 && y2 === py) return Math.min(x1, x2) <= px && px <= Math.max(x1, x2);
  return false;
}

const samePt = (a, b) => a[0] === b[0] && a[1] === b[1];

export function componentAt(circuit, p) {
  for (let i = circuit.components.length - 1; i >= 0; i--)
    if (cells(circuit.components[i]).some((q) => samePt(q, p))) return circuit.components[i];
  return null;
}

export function wireAt(circuit, p) {
  for (let i = circuit.wires.length - 1; i >= 0; i--) if (onSegment(p, circuit.wires[i])) return circuit.wires[i];
  return null;
}

export function deleteAt(circuit, p) {
  const comp = componentAt(circuit, p);
  if (comp) { circuit.components.splice(circuit.components.indexOf(comp), 1); return true; }
  const seg = wireAt(circuit, p);
  if (seg) { circuit.wires.splice(circuit.wires.indexOf(seg), 1); return true; }
  return false;
}

/** Wire ends and pins: points where a wire passing by gets connected (T junction). */
export function terminals(circuit) {
  const out = new Map();
  const add = (p) => out.set(`${p[0]},${p[1]}`, p);
  for (const c of circuit.components) pins(c).forEach(add);
  for (const w of circuit.wires) { add([w[0], w[1]]); add([w[2], w[3]]); }
  return out;
}

/** How many connections meet at each terminal: ≥3 is drawn as a junction dot, 1 on a pin = open. */
export function degrees(circuit) {
  const deg = new Map();
  const bump = (k, n = 1) => deg.set(k, (deg.get(k) || 0) + n);
  const terms = terminals(circuit);
  for (const c of circuit.components) for (const p of pins(c)) bump(`${p[0]},${p[1]}`);
  for (const w of circuit.wires) {
    bump(`${w[0]},${w[1]}`);
    bump(`${w[2]},${w[3]}`);
    for (const [k, p] of terms) {
      if (onSegment(p, w) && !samePt(p, [w[0], w[1]]) && !samePt(p, [w[2], w[3]])) bump(k, 2);
    }
  }
  return deg;
}

/** Change a part (move, rotate); wires that ended on its pins follow it, re-routed as an L
 * from their far end, so the circuit stays connected the same way. */
export function reshapePart(circuit, comp, change) {
  const before = pins(comp);
  // pins touching something without a wire end there (another part's pin, a label, the middle of
  // a wire): keep that contact with a new wire from the old point
  const touching = before.map((p) =>
    circuit.components.some((o) => o !== comp && pins(o).some((q) => samePt(q, p))) ||
    circuit.wires.some((w) => onSegment(p, w) && !samePt(p, [w[0], w[1]]) && !samePt(p, [w[2], w[3]])));
  const follow = [];
  circuit.wires = circuit.wires.filter((w) => {
    const a = [w[0], w[1]], b = [w[2], w[3]];
    const ia = before.findIndex((p) => samePt(p, a)), ib = before.findIndex((p) => samePt(p, b));
    if (ia < 0 && ib < 0) return true;
    follow.push(ia >= 0 && ib >= 0 ? { a: ia, b: ib } : ia >= 0 ? { a: ia, far: b } : { a: ib, far: a });
    return false;
  });
  change(comp);
  const after = pins(comp);
  for (const f of follow) {
    const from = f.far ?? after[f.b];
    if (!samePt(from, after[f.a])) routeWire(circuit, from, after[f.a]);
  }
  before.forEach((p, i) => { if (touching[i] && !samePt(p, after[i])) routeWire(circuit, p, after[i]); });
}

/** Path for an automatic wire that touches nothing on the way: in elektro a terminal lying on a
 * wire connects to it, so an L that runs over another pin would short it. Tries the two L shapes,
 * then the two Z shapes; keeps the one that touches the fewest terminals (normally none). */
export function routeWire(circuit, a, b) {
  const [x1, y1] = a, [x2, y2] = b;
  const mx = Math.round((x1 + x2) / 2), my = Math.round((y1 + y2) / 2);
  const paths = [
    [a, [x2, y1], b], [a, [x1, y2], b],
    [a, [mx, y1], [mx, y2], b], [a, [x1, my], [x2, my], b],
  ];
  const terms = [...terminals(circuit).values()];
  const score = (path) => {
    const segs = [];
    for (let i = 0; i + 1 < path.length; i++) {
      if (!samePt(path[i], path[i + 1])) segs.push([...path[i], ...path[i + 1]]);
    }
    let bad = 0;
    for (const t of terms) {
      if (samePt(t, a) || samePt(t, b)) continue;
      if (segs.some((s) => onSegment(t, s))) bad++;
    }
    // a corner in the middle of an existing wire would join it too
    for (const p of path.slice(1, -1)) if (circuit.wires.some((w) => onSegment(p, w))) bad++;
    return { segs, bad };
  };
  let best = null;
  for (const path of paths) {
    const r = score(path);
    if (!best || r.bad < best.bad) best = r;
    if (r.bad === 0) break;
  }
  for (const seg of best.segs) if (!hasSeg(circuit.wires, seg)) circuit.wires.push(seg);
  return best.segs;
}

export const movePart = (circuit, comp, x, y) => reshapePart(circuit, comp, (c) => { c.x = x; c.y = y; });
export const rotatePart = (circuit, comp) => reshapePart(circuit, comp, (c) => { c.rot = (c.rot + 90) % 360; clampPart(c); });

/** Smallest shift that keeps every point of the part on the grid (x, y ≥ 0, like the TUI cursor). */
export function clampPart(comp) {
  const pts = cells(comp);
  const dx = Math.max(0, -Math.min(...pts.map((p) => p[0])));
  const dy = Math.max(0, -Math.min(...pts.map((p) => p[1])));
  comp.x += dx;
  comp.y += dy;
}

export function bounds(circuit) {
  const pts = [...circuit.components.flatMap(cells), ...circuit.wires.flatMap((w) => [[w[0], w[1]], [w[2], w[3]]])];
  if (!pts.length) return { maxX: 0, maxY: 0, empty: true };
  return { maxX: Math.max(...pts.map((p) => p[0])), maxY: Math.max(...pts.map((p) => p[1])), empty: false };
}

/** Grid offset from a part's anchor to its middle, so a dragged part sits centred on the pointer. */
export function centerOffset(kind, rot) {
  if (SYMBOLS.includes(kind) || THREE_PIN.includes(kind)) return [0, 0];
  const h = rot === 0 || rot === 180;
  return h ? [1, 0] : [0, 1];
}

/** Toggle a probe the way the TUI's probe key does: on a label V(NAME), on a part I(REF), on a node V(ADDR). */
export function probeAt(circuit, p) {
  const comp = componentAt(circuit, p);
  let expr = null;
  if (comp && comp.kind === "N") expr = `V(${comp.value.toUpperCase()})`;
  else if (comp && isPart(comp) && !pins(comp).some((q) => samePt(q, p))) expr = `I(${comp.ref})`;
  else if (terminals(circuit).has(`${p[0]},${p[1]}`) || wireAt(circuit, p)) expr = `V(${addr(p)})`;
  if (!expr) return null;
  const i = circuit.probes.findIndex((e) => e.toUpperCase() === expr.toUpperCase());
  if (i >= 0) circuit.probes.splice(i, 1);
  else circuit.probes.push(expr);
  return expr;
}

/** Short value for the drawing, like elektro's schematic labels (SIN 1kHz, PULSE, NPN*). */
export function shortValue(c) {
  const v = (c.value || "").trim();
  if (c.kind === "V" || c.kind === "I") {
    const sin = /SINE?\s*\(\s*\S+\s+\S+\s+([^\s)]+)/i.exec(v);
    if (sin) return `SIN ${sin[1]}Hz`;
    if (/PULSE\s*\(/i.test(v)) return "PULSE";
    const dc = /^(?:DC\s+)?([^\sA-Za-z]?[\d.]+[a-zA-Zµ]*)\s*$/i.exec(v);
    if (dc) return `${dc[1]}${KINDS[c.kind].unit}`;
    const ac = /AC\s+(\S+)/i.exec(v);
    if (ac && !/^\s*(DC\s+)?[\d.]/i.test(v)) return `AC ${ac[1]}`;
    const lead = /^(?:DC\s+)?([\d.]+[a-zA-Zµ]*)/i.exec(v);
    return lead ? `${lead[1]}${KINDS[c.kind].unit}` : v;
  }
  if (["D", "Q", "M", "U"].includes(c.kind)) {
    const tokens = v.split(/\s+/).filter(Boolean);
    if (tokens.length <= 1) return v;
    const head = tokens[0].includes("=") ? { D: "D", Q: "BJT", M: "MOS", U: "ideal" }[c.kind] : tokens[0];
    const rails = tokens.filter((t) => t.includes("..") || t.startsWith("±") || t.startsWith("+-"));
    return [head + (tokens.some((t) => t.includes("=")) ? "*" : ""), ...rails].join(" ");
  }
  return v;
}
