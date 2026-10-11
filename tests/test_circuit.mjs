// The editor's grid rules (web/circuit.js) against elektro's own model.py, inside Pyodide:
// pins and cells of every kind in every rotation, L-shaped wires, refs, picking, deleting.
// If elektro changes a rule, this fails before the editor draws a circuit elektro reads differently.
import { boot } from "./harness.mjs";
import * as C from "../web/circuit.js";

const e = await boot("en");
const py = (code) => JSON.parse(e.py.runPython(code));
let failed = 0, total = 0;
const check = (name, ok, detail = "") => { total++; if (!ok) { failed++; console.log(`FAIL ${name} ${detail}`); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 1) geometry of every kind × rotation at a few positions
const kinds = Object.keys(C.KINDS);
const placements = [];
for (const kind of kinds) for (const rot of [0, 90, 180, 270]) for (const [x, y] of [[3, 2], [7, 5], [12, 1]]) placements.push({ ref: "X", kind, value: "", x, y, rot });
const pyGeo = py(`
import json
from elektro.circuit.model import Component
items = json.loads(${JSON.stringify(JSON.stringify(placements))})
json.dumps([[Component(**c).pins(), Component(**c).cells()] for c in items])`);
placements.forEach((c, i) => {
  const [p, cl] = pyGeo[i];
  check(`pins ${c.kind} rot ${c.rot} @${c.x},${c.y}`, same(C.pins(c), p), `${JSON.stringify(C.pins(c))} vs ${JSON.stringify(p)}`);
  check(`cells ${c.kind} rot ${c.rot}`, same(C.cells(c), cl), `${JSON.stringify(C.cells(c))} vs ${JSON.stringify(cl)}`);
});

// 2) a random editing session replayed in both: add parts and wires, delete at points
let seed = 7;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const ops = [];
for (let i = 0; i < 400; i++) {
  const r = rnd(10);
  if (r < 4) ops.push(["add", kinds[rnd(kinds.length)], rnd(20), rnd(12), [0, 90, 180, 270][rnd(4)]]);
  else if (r < 8) ops.push(["wire", [rnd(20), rnd(12)], [rnd(20), rnd(12)]]);
  else ops.push(["delete", [rnd(20), rnd(12)]]);
}
const js = C.emptyCircuit();
const trace = [];
for (const op of ops) {
  if (op[0] === "add") C.addComponent(js, op[1], op[2], op[3], op[4]);
  else if (op[0] === "wire") C.addWire(js, op[1], op[2]);
  else trace.push(C.deleteAt(js, op[1]));
}
const pyRun = py(`
import json
from elektro.circuit.model import Circuit
c = Circuit()
trace = []
for op in json.loads(${JSON.stringify(JSON.stringify(ops))}):
    if op[0] == "add":
        c.add(op[1], op[2], op[3], rot=op[4])
    elif op[0] == "wire":
        c.add_wire(tuple(op[1]), tuple(op[2]))
    else:
        trace.append(c.delete_at(tuple(op[1])))
d = c.to_dict()
json.dumps({"circuit": d, "trace": trace,
            "at": [[(x, y), (c.component_at((x, y)).ref if c.component_at((x, y)) else None)] for x in range(20) for y in range(12)]})`);
check("400-step session: same components, refs and wires as elektro", same(js.components, pyRun.circuit.components) && same(js.wires, pyRun.circuit.wires),
  `${js.components.length}/${pyRun.circuit.components.length} parts, ${js.wires.length}/${pyRun.circuit.wires.length} wires`);
check("deleting at points removes the same things", same(trace, pyRun.trace));
const at = pyRun.at.every(([[x, y], ref]) => (C.componentAt(js, [x, y])?.ref ?? null) === ref);
check("picking a part at every grid point matches", at);

// 3) the circuit the editor builds is one elektro reads back unchanged
const back = py(`
import json
from elektro.circuit.model import Circuit
json.dumps(Circuit.from_dict(json.loads(${JSON.stringify(JSON.stringify(js))})).to_dict())`);
check("elektro loads the editor's file unchanged", same(back.components, js.components) && same(back.wires, js.wires));

// 4) moving a part keeps its wires attached (editor-only behaviour)
const m = C.emptyCircuit();
const r1 = C.addComponent(m, "R", 2, 2, 0);
const c1 = C.addComponent(m, "C", 8, 2, 90);
C.addWire(m, [5, 2], [8, 2]);
C.addWire(m, [2, 2], [2, 6]);
C.movePart(m, r1, 3, 4);
const ends = new Set(m.wires.flatMap((w) => [`${w[0]},${w[1]}`, `${w[2]},${w[3]}`]));
check("moved part: wires still end on its pins", C.pins(r1).every(([x, y]) => ends.has(`${x},${y}`)), JSON.stringify(m.wires));
check("moved part: wires stay horizontal/vertical", m.wires.every((w) => w[0] === w[2] || w[1] === w[3]));
check("moved part: other end untouched", ends.has("8,2") && ends.has("2,6"));
const nets = py(`
import json
from elektro.circuit.model import Circuit
c = Circuit.from_dict(json.loads(${JSON.stringify(JSON.stringify(m))}))
n = c.nets()
json.dumps([n[tuple(p)] for p in [(3, 4), (2, 6), (6, 4), (8, 2)]])`);
check("moved part: elektro sees the same connections", nets[0] === nets[1] && nets[2] === nets[3], JSON.stringify(nets));
// parts touching pin-to-pin (no wire between them) stay connected when one moves or rotates
const t = C.emptyCircuit();
C.addComponent(t, "V", 2, 2, 90, "12");
const tr1 = C.addComponent(t, "R", 2, 2, 0, "1k");
const tr2 = C.addComponent(t, "R", 5, 2, 90, "1k");
C.addComponent(t, "GND", 2, 4);
C.addWire(t, [2, 4], [5, 4]);
C.addComponent(t, "N", 5, 2, 0, "OUT");
const solve = (c) => py(`
import json
from elektro.circuit.model import Circuit
from elektro.circuit.solver import dc_operating_point
c = Circuit.from_dict(json.loads(${JSON.stringify(JSON.stringify(c))}))
json.dumps(round(dc_operating_point(c).voltages["OUT"], 6))`);
const v0 = solve(t);
C.movePart(t, tr2, 9, 5);
const v1 = solve(t);
C.rotatePart(t, tr2);
const v2 = solve(t);
C.movePart(t, tr1, 3, 8);
const v3 = solve(t);
check("touching parts keep their contacts when moved/rotated (elektro solves the same)", v0 === 6 && v1 === 6 && v2 === 6 && v3 === 6, JSON.stringify([v0, v1, v2, v3]));
check("…and every wire stays horizontal/vertical", t.wires.every((w) => w[0] === w[2] || w[1] === w[3]));

C.probeAt(m, [4, 4]);
C.probeAt(m, [8, 2]);
check("probe tool: I(part) on a body, V(addr) on a node", same(m.probes, ["I(R1)", "V(I3)"]), JSON.stringify(m.probes));
C.probeAt(m, [4, 4]);
check("probe tool toggles", same(m.probes, ["V(I3)"]));
const pyProbe = py(`
import json
from elektro.circuit.model import Circuit
c = Circuit.from_dict(json.loads(${JSON.stringify(JSON.stringify(m))}))
json.dumps(c.net_at((8, 2)))`);
check("probe address is on elektro's node", pyProbe !== null);
check("colName/addr like elektro", C.addr([0, 0]) === "A1" && C.addr([25, 9]) === "Z10" && C.addr([26, 0]) === "AA1" && C.addr([701, 0]) === "ZZ1");

console.log(`circuit model vs elektro: ${total - failed}/${total} checks`);
process.exit(failed ? 1 : 0);
