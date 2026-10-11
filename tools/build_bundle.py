#!/usr/bin/env python3
"""Pack elektro and the pure-Python packages it imports into web/elektro-bundle.zip.

Usage: tools/build_bundle.py [--python PATH]   (an interpreter that has elektro installed;
                                                default: the one from elektro's install.sh)

The package list is not hard-coded: the given interpreter imports elektro.cli and we
take every third-party top-level module it pulled in. charset_normalizer ships compiled
code, so it is left out and loaded from Pyodide's own repository instead.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "elektro-bundle.zip"
MANIFEST = ROOT / "web" / "bundle.json"
DEFAULT_PY = Path.home() / ".local/share/elektro/venv/bin/python"
FROM_PYODIDE = {"charset_normalizer"}      # compiled; Pyodide provides it

PROBE = r"""
import importlib.metadata as md, json, sys
from elektro.cli import app
import elektro
mods = sorted({m.split(".")[0] for m in sys.modules} - set(sys.stdlib_module_names)
              - {"sitecustomize", "cython_runtime"})
paths = {}
for m in mods:
    mod = sys.modules.get(m)
    f = getattr(mod, "__file__", None)
    if f:
        paths[m] = f
dists = {}
for mod_name, dist_names in md.packages_distributions().items():
    d = md.distribution(dist_names[0])
    dists[mod_name] = f'{d.metadata["Name"]}=={d.version}'
print(json.dumps({"elektro": elektro.__version__, "python": sys.version.split()[0],
                  "modules": paths, "dists": dists}))
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--python", default=str(DEFAULT_PY))
    args = ap.parse_args()

    env = {**os.environ, "ELEKTRO_LANG": "en"}
    probe = json.loads(subprocess.check_output([args.python, "-c", PROBE], env=env, text=True))
    files: list[tuple[Path, str]] = []
    packages = []
    for name, f in sorted(probe["modules"].items()):
        if name.startswith("_") or name in FROM_PYODIDE:
            continue
        src = Path(f)
        if src.name == "__init__.py":          # package directory
            base = src.parent
            for p in sorted(base.rglob("*")):
                if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc":
                    if p.suffix in (".so", ".pyd"):
                        sys.exit(f"{name} contains compiled code ({p.name}); cannot run in Pyodide")
                    files.append((p, str(p.relative_to(base.parent))))
        else:                                   # single-module distribution
            files.append((src, src.name))
        packages.append(probe["dists"].get(name, name))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for src, arc in files:
            info = zipfile.ZipInfo(arc, date_time=(2020, 1, 1, 0, 0, 0))   # reproducible
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, src.read_bytes())
    MANIFEST.write_text(json.dumps({
        "elektro": probe["elektro"],
        "built_with_python": probe["python"],
        "packages": sorted(set(packages)),
        "from_pyodide": sorted(FROM_PYODIDE),
        "files": len(files),
        "bytes": OUT.stat().st_size,
    }, indent=2) + "\n")
    print(f"{OUT.relative_to(ROOT)}: {len(files)} files, {OUT.stat().st_size / 1e6:.1f} MB, "
          f"elektro {probe['elektro']}")
    print("packages:", ", ".join(sorted(set(packages))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
