#!/usr/bin/env python3
"""Compare tests/out/pyodide.json (browser runtime) with the native elektro CLI.

Every example is run again with the installed `elektro` (same version as the bundle),
in a directory holding the same fixture files, and both the --json result and the
plain-text table must match exactly.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ELEKTRO = os.environ.get("ELEKTRO", str(Path.home() / ".local/bin/elektro"))


def same(a, b, rel=1e-9, abs_=1e-12):
    """Exact for everything except floats; WASM and glibc libm may differ in the last bits."""
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(same(a[k], b[k]) for k in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    if isinstance(a, float) or isinstance(b, float):
        if not isinstance(a, (int, float)) or not isinstance(b, (int, float)):
            return False
        return abs(a - b) <= max(abs_, rel * max(abs(a), abs(b)))
    return a == b


def native(argv, cwd):
    env = {**os.environ, "ELEKTRO_LANG": "en", "COLUMNS": "80", "TERM": "dumb", "NO_COLOR": "1"}
    j = subprocess.run([ELEKTRO, "--json", *argv], capture_output=True, text=True, cwd=cwd, env=env)
    t = subprocess.run([ELEKTRO, *argv], capture_output=True, text=True, cwd=cwd, env=env)
    made = [f for f in os.listdir(cwd) if f not in FIXTURES]
    for f in made:                       # plots: compare existence only, then clean up
        os.remove(os.path.join(cwd, f))
    # the page drops elektro's "graph saved to <file>" line because it shows the graph
    t.stdout = "\n".join(ln for ln in t.stdout.split("\n") if not any(m in ln for m in made))
    return j, t


data = json.loads((HERE / "out/pyodide.json").read_text())
FIXTURES = set(os.listdir(HERE / "out/fixtures"))
work = tempfile.mkdtemp(prefix="elektro-native-")
for f in FIXTURES:
    shutil.copy(HERE / "out/fixtures" / f, work)

json_diff, text_diff, failures = [], [], []
for case in data["cases"]:
    j, t = native(case["argv"], work)
    if j.returncode != 0 or t.returncode != 0:
        failures.append((case["example"], (j.stderr or t.stderr).strip()[:200]))
        continue
    try:
        nat = json.loads(j.stdout) if j.stdout.strip() else None
    except ValueError:
        nat = None
    if not same(nat, case["json"]):
        json_diff.append(case["example"])
    if t.stdout.rstrip() != case["text"]:
        text_diff.append(case["example"])
shutil.rmtree(work)

# circuit simulator page: the same circuit files solved by `elektro sim`
sim_diff, sim_fail = [], []
sim_path = HERE / "out/sim.json"
sims = json.loads(sim_path.read_text())["cases"] if sim_path.exists() else []
work = tempfile.mkdtemp(prefix="elektro-native-sim-")
FIXTURES = set()
for case in sims:
    name = case["name"]
    with open(os.path.join(work, name + ".json"), "w", encoding="utf-8") as f:
        json.dump(case["circuit"], f, indent=2, ensure_ascii=False)
    FIXTURES = {name + ".json"}
    argv = ["sim", name + ".json", "--plot", name + ".svg"] + (["--csv", name + ".csv"] if case["circuit"]["analysis"] else [])
    j, t = native(argv, work)
    os.remove(os.path.join(work, name + ".json"))
    if j.returncode != 0 or t.returncode != 0:
        sim_fail.append((case["label"], (j.stderr or t.stderr).strip()[:200]))
        continue
    nat = json.loads(j.stdout) if j.stdout.strip() else None
    if not same(nat, case["json"]) or t.stdout.rstrip() != case["text"]:
        sim_diff.append(case["label"])
shutil.rmtree(work)
# example circuits: the page loads exactly what `elektro examples NAME` saves
ex_diff = []
work = tempfile.mkdtemp(prefix="elektro-native-ex-")
for case in sims:
    if case["label"].startswith("example "):
        name = case["label"].split(" ", 1)[1]
        subprocess.run([ELEKTRO, "examples", name, "-o", "c.json"], cwd=work, capture_output=True, check=True)
        if json.loads(Path(work, "c.json").read_text()) != case["circuit"]:
            ex_diff.append(name)
shutil.rmtree(work)
if sims:
    m = len(sims)
    print(f"{m} simulator circuits: JSON + text equal to `elektro sim` {m - len(sim_diff) - len(sim_fail)}/{m}; "
          f"example circuits identical to `elektro examples` {15 - len(ex_diff)}/15")
    for e in sim_diff:
        print("  sim differs:", e)
    for e, err in sim_fail:
        print("  native sim failed:", e, "|", err)
    for e in ex_diff:
        print("  example circuit differs:", e)

n = len(data["cases"])
print(f"{n} examples: JSON equal (floats within 1e-9 relative) {n - len(json_diff) - len(failures)}/{n}, "
      f"text identical {n - len(text_diff) - len(failures)}/{n}, native failures {len(failures)}")
for e in json_diff[:15]:
    print("  JSON differs:", e)
for e in text_diff[:15]:
    print("  text differs:", e)
for e, err in failures:
    print("  native failed:", e, "|", err)
sys.exit(1 if json_diff or text_diff or failures or sim_diff or sim_fail or ex_diff else 0)
