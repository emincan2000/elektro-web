"""Bridge between the web page and elektro, running inside Pyodide.

catalog()   -> every web-usable elektro command with its parameters (for the forms)
run(argv)   -> runs one command and returns its JSON result, terminal text and errors
set_lang()  -> re-imports elektro in another language (its help texts are bound at import)
sim_*()     -> the circuit simulator: example circuits, loading a .json / SPICE file, drawing
               the schematic with elektro's own renderer and solving it with `elektro sim`

Nothing here re-implements elektro: forms come from its Typer/Click tree and results
come from its own `--json` output.
"""

from __future__ import annotations

import contextlib
import io
import json
import os
import re
import shlex
import sys

# Commands that make no sense in a browser: interactive, stateful, or need the network/disk.
EXCLUDED = {
    "shell", "tui", "set", "unset", "vars", "history", "language", "languages", "lang",
    "helpall", "manpage", "update", "datasheet",
    "sim", "examples",            # these two get their own page (sim_* below)
}

WORK = "/work"           # cwd for commands; uploaded inputs and produced plots live here
INPUTS = WORK + "/in"

_app = None
_lang = None


def _load(lang: str | None) -> None:
    """(Re)import elektro so that its import-time help strings use `lang`."""
    global _app, _lang
    if lang:
        os.environ["ELEKTRO_LANG"] = lang
    # rich reads these when elektro creates its consoles: colored output (ANSI) that the
    # page turns into HTML, at the width of a classic terminal.
    os.environ.update(FORCE_COLOR="1", COLORTERM="truecolor", COLUMNS="80", TERM="xterm-256color")
    for name in [m for m in sys.modules if m == "elektro" or m.startswith("elektro.")]:
        del sys.modules[name]
    sys.argv = ["elektro"]
    from elektro.cli import app            # noqa: E402  (fresh import on purpose)
    from elektro.i18n import get_language  # noqa: E402
    _app = app
    _lang = get_language()


def _root():
    import typer
    return typer.main.get_command(_app)


def set_lang(lang: str) -> str:
    _load(lang)
    return _lang


def _param(p) -> dict:
    from typer.core import TyperArgument
    t = p.type
    tname = getattr(t, "name", "")
    choices = list(getattr(t, "choices", None) or []) or None
    if choices:
        kind = "choice"
    elif tname == "plot_path":
        kind = "plot"           # elektro draws its own SVG; the page shows it inline
    elif type(t).__name__ == "TyperPath" and getattr(t, "exists", False):
        kind = "file"           # uploaded into the in-browser filesystem
    elif getattr(p, "is_flag", False):
        kind = "flag"
    elif tname == "parse_value":
        kind = "value"          # engineering notation: 4k7, 100n, 1meg
    elif tname in ("integer", "int"):
        kind = "int"
    elif tname == "float":
        kind = "float"
    else:
        kind = "text"
    default = p.default
    if callable(default) or not isinstance(default, (str, int, float, bool, type(None), list, tuple)):
        default = None
    multi = p.nargs == -1 or bool(getattr(p, "multiple", False))
    return {
        "name": p.name,
        "positional": isinstance(p, TyperArgument),
        "opts": list(p.opts),           # e.g. ["--vin"] or ["--series", "-s"]
        "secondary": list(getattr(p, "secondary_opts", []) or []),  # e.g. ["--no-x"]
        "kind": kind,
        "required": bool(p.required),
        "default": list(default) if isinstance(default, tuple) else default,
        "multi": multi,
        "choices": choices,
        "help": (getattr(p, "help", "") or "").strip(),
        "metavar": p.metavar,
        "min": getattr(t, "min", None),
        "max": getattr(t, "max", None),
    }


_EXAMPLE = re.compile(r"^\s*elektro\s+(.+?)\s*$")
# Examples carry trailing notes after a wide gap: "cap 22n       → 223", "... --c 10n   (finds R)"
_NOTE = re.compile(r"\s{2,}(?:\(|→|#|←).*$")


def _split_help(text: str) -> tuple[str, list[str]]:
    """Description without the example block, and the example command lines."""
    examples, desc = [], []
    for line in (text or "").splitlines():
        m = _EXAMPLE.match(line)
        if m:
            cmd = _NOTE.sub("", m.group(1)).strip()
            if cmd:
                examples.append(cmd)
        else:
            desc.append(line)
    # drop a trailing "Examples:" style header (any language) left after removing the lines
    while desc and (not desc[-1].strip() or desc[-1].rstrip().endswith(":")):
        desc.pop()
    return "\n".join(desc).strip(), examples


def _attach_group_examples(root, ctx, cmds) -> None:
    """Group help often holds the examples ("resistor bn bk rd gd", "resistor smd 103").

    Give each one to the subcommand it runs: the named one, or the group's default
    command (elektro's DefaultCommandGroup) when no subcommand name is given.
    """
    from typer import _click as click
    by_path = {tuple(c["path"]): c for c in cmds}
    for name in root.list_commands(ctx):
        group = root.get_command(ctx, name)
        if not hasattr(group, "list_commands") or name in EXCLUDED:
            continue
        subs = group.list_commands(click.Context(group, parent=ctx))
        default = getattr(group, "default_command", None)
        for ex in _split_help(group.help or "")[1]:
            words = ex.split()
            if not words or words[0] != name or len(words) < 2:
                continue
            target = words[1] if words[1] in subs else default
            if target is None:
                continue
            cmd = by_path.get((name, target))
            full = ex if words[1] in subs else " ".join([name, target, *words[1:]])
            if cmd is not None and full not in cmd["examples"]:
                cmd["examples"].append(full)


def catalog() -> str:
    from typer import _click as click
    root = _root()
    ctx = click.Context(root)
    groups, cmds = {}, []

    def panel_of(cmd, parent_panel):
        p = getattr(cmd, "rich_help_panel", None)
        return p if isinstance(p, str) else parent_panel

    def walk(cmd, path, panel, group_help):
        if hasattr(cmd, "list_commands"):
            sub = click.Context(cmd, parent=ctx)
            for name in cmd.list_commands(sub):
                child = cmd.get_command(sub, name)
                if child is None or getattr(child, "hidden", False):
                    continue
                if not path and name in EXCLUDED:
                    continue
                gh = (cmd.help or "") if path else ""
                walk(child, path + [name], panel_of(child, panel), gh)
            return
        desc, examples = _split_help(cmd.help or "")
        examples = [e for e in examples if e.split() != path]   # bare "ohm" = interactive prompt
        cmds.append({
            "path": path,
            "panel": panel or "",
            "help": desc,
            "group_help": _split_help(group_help)[0] if group_help else "",
            "examples": examples,
            "params": [_param(p) for p in cmd.params if p.name != "help"],
        })

    walk(root, [], None, "")
    _attach_group_examples(root, ctx, cmds)
    order = []
    for c in cmds:
        if c["panel"] not in order:
            order.append(c["panel"])
    return json.dumps({"lang": _lang, "panels": order, "commands": cmds}, ensure_ascii=False)


def parse_example(line: str) -> str:
    """Split an example command line the way a shell would (for prefilling forms)."""
    try:
        return json.dumps(shlex.split(line))
    except ValueError:
        return json.dumps(line.split())


def _outputs(before: set[str]) -> list[dict]:
    """Files a command wrote into WORK (plots), as page-ready payloads; then delete them."""
    import base64
    found = []
    for name in sorted(os.listdir(WORK)):
        full = os.path.join(WORK, name)
        if name in before or not os.path.isfile(full):
            continue
        data = open(full, "rb").read()
        os.remove(full)
        if name.lower().endswith(".svg"):
            found.append({"name": name, "type": "image/svg+xml", "text": data.decode("utf-8", "replace")})
        else:
            kind = "text/csv" if name.lower().endswith(".csv") else "application/octet-stream"
            found.append({"name": name, "type": kind, "base64": base64.b64encode(data).decode()})
    return found


def add_input(name: str, data) -> str:
    """Store an uploaded file (bytes from JS) and return the path to pass to elektro."""
    os.makedirs(INPUTS, exist_ok=True)
    safe = os.path.basename(name) or "upload"
    path = os.path.join(INPUTS, safe)
    with open(path, "wb") as f:
        f.write(bytes(data.to_py() if hasattr(data, "to_py") else data))
    return path


def _invoke(argv: list[str]) -> tuple[str, str, int]:
    out, err = io.StringIO(), io.StringIO()
    code = 0
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        try:
            # without standalone mode click *returns* the code of typer.Exit (elektro's fail())
            ret = _app(argv, standalone_mode=False)
            if isinstance(ret, int) and not isinstance(ret, bool):
                code = ret
        except SystemExit as e:
            code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
        except Exception as e:  # click usage errors and the like
            exit_code = getattr(e, "exit_code", None)
            show = getattr(e, "format_message", None)
            err.write(show() if callable(show) else f"{type(e).__name__}: {e}")
            code = exit_code if isinstance(exit_code, int) else 1
    return out.getvalue(), err.getvalue(), code


_ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")


def run(argv_json: str) -> str:
    """Run once with --json (structured result) and once without (elektro's own table)."""
    argv = json.loads(argv_json)
    os.makedirs(WORK, exist_ok=True)
    os.chdir(WORK)
    before = set(os.listdir(WORK))
    data_out, data_err, data_code = _invoke(["--json", *argv])
    text_out, text_err, text_code = _invoke(argv)
    files = _outputs(before)
    names = [f["name"] for f in files]

    def drop_saved(text: str) -> str:
        # elektro reports where it saved the graph; on the web the graph is shown instead
        if not names:
            return text
        keep = [ln for ln in text.split("\n") if not any(n in _ANSI.sub("", ln) for n in names)]
        return "\n".join(keep)

    text_out, data_err, text_err = drop_saved(text_out), drop_saved(data_err), drop_saved(text_err)
    result = None
    if data_code == 0 and data_out.strip():
        try:
            result = json.loads(data_out)
        except ValueError:
            result = None       # command has no JSON form; the text view still works
    return json.dumps({
        "ok": data_code == 0 and text_code == 0,
        "json": result,
        "text": _ANSI.sub("", text_out).rstrip(),
        "ansi": text_out.rstrip(),
        "stderr": _ANSI.sub("", data_err or text_err).strip(),
        "files": files,
        "argv": argv,
    }, ensure_ascii=False, default=str)



# ---------------------------------------------------------------- circuit simulator
# A circuit travels between page and Python as elektro's own file format (Circuit.to_dict),
# so what the page edits is exactly what `elektro tui` / `elektro sim` read and write.

SIM_KINDS = ("R", "C", "L", "V", "I", "D", "Q", "M", "U")


def _sim_texts() -> dict:
    """elektro's own strings for the simulator page (they follow the language switch)."""
    from elektro.circuit.devices import models_for
    from elektro.i18n import t
    texts = {"title": t("menu.sim"), "examples": t("menu.examples"), "help": _split_help(t("sim.help"))[0],
             "analysis": t("ckt.analysis"), "probes": t("ckt.probes"), "probe_hint": t("ckt.prompt.probe").split("   (")[0],
             "source_hint": t("ckt.prompt.source", ref="V", unit="V").split(" — ", 1)[-1],
             "kinds": {k: t(f"ckt.kind.{k}") for k in ("GND", "N")}, "hints": {},
             "label_hint": t("ckt.prompt.label")}
    for k in SIM_KINDS:
        texts["kinds"][k] = t(f"ckt.kind.{k}")
        if k in ("D", "Q", "M", "U"):
            hint = t(f"ckt.prompt.model.{k}", ref="", models=" · ".join(models_for(k)))
            texts["hints"][k] = hint.split(": ", 1)[-1]
        elif k in ("V", "I"):
            texts["hints"][k] = texts["source_hint"]
        else:
            from elektro.circuit.model import KINDS
            texts["hints"][k] = t("ckt.prompt.value", ref="", unit=KINDS[k].unit).split(" — ", 1)[-1]
    return texts


def _example_items() -> list:
    """Example circuits with localized titles, grouped by folder (in elektro's menu order)."""
    from elektro.circuit import examples
    if not hasattr(examples, "REGISTRY"):          # elektro < 0.7.1: flat EXAMPLES dict
        from elektro.i18n import t
        return [{"name": k, "category": c, "title": t(f"ex.{k}"), "category_title": t(f"ex.cat.{c}"), "desc": ""}
                for k, (c, _) in examples.EXAMPLES.items()]
    items = []
    for path, keys in examples.tree():             # "opamp/amps" → "Op-amps / Amplifiers"
        parts = path.split("/")
        prefixes = ["/".join(parts[:i + 1]) for i in range(len(parts))]
        category_title = " / ".join(examples.folder_name(p) for p in prefixes if p in examples.FOLDERS)
        items += [{"name": k, "category": path, "title": examples.title(k), "category_title": category_title,
                   "desc": examples.description(k)} for k in keys]
    return items


def sim_info() -> str:
    """Example circuits (with their localized titles) and the page's texts."""
    items = _example_items()
    from elektro.circuit.devices import LIBRARY
    # the editor draws NPN/PNP and N/P-channel symbols from the part's model
    model_types = {name: typ for name, (typ, _) in LIBRARY.items()}
    return json.dumps({"examples": items, "texts": _sim_texts(), "model_types": model_types}, ensure_ascii=False)


def _schematic(circuit, voltages=None) -> str:
    """elektro's schematic renderer (the TUI's circuit view) as ANSI text, cropped to the drawing."""
    from rich.console import Console
    from elektro.circuit import probes as prb
    from elektro.circuit import render as rnd
    from elektro.circuit.model import parse_addr
    pts = [p for c in circuit.components for p in c.cells()] + \
          [p for w in circuit.wires for p in ((w[0], w[1]), (w[2], w[3]))]
    if not pts:
        return ""
    # probe marks, like the editor: ◉ on probed points, underlined parts with a current probe
    points, parts = set(), set()
    for expr in circuit.probes:
        m = prb.PROBE_RE.match(expr)
        if not m:
            continue
        func, a, b = m.group(1).upper(), m.group(2).upper(), m.group(3)
        if func == "V" or b:
            for name in (a, b or ""):
                labels = [c.pins()[0] for c in circuit.components if c.kind == "N" and c.value.upper() == name.upper()]
                pt = parse_addr(name)
                points |= set(labels) if labels else ({pt} if pt is not None else set())
        else:
            parts.add(a.split(".")[0])
    parts = {c.ref for c in circuit.components if c.ref.upper() in parts}
    max_x = max(p[0] for p in pts)
    max_y = max(p[1] for p in pts)
    width = rnd.MARGIN_X + (max_x + 8) * rnd.STEP_X
    height = rnd.MARGIN_Y + (max_y + 2) * rnd.STEP_Y + 1
    view = rnd.View(0, 0, width, height, None, None, [], voltages or {}, points, parts)
    lines = rnd.render(circuit, view)
    # crop: keep the grid one point past the rightmost/lowest drawn character
    used_col, used_row = 0, 0
    for r, line in enumerate(lines[rnd.MARGIN_Y:], start=rnd.MARGIN_Y):
        plain = line.plain.rstrip(" ·")
        if plain[rnd.MARGIN_X:].strip(" ·"):
            used_row = r
            used_col = max(used_col, len(plain))
    cols = min(width, ((used_col - rnd.MARGIN_X) // rnd.STEP_X + 2) * rnd.STEP_X + rnd.MARGIN_X - 2)
    rows = min(height, used_row + 2)
    buf = io.StringIO()
    con = Console(file=buf, force_terminal=True, color_system="truecolor", width=cols + 2, legacy_windows=False)
    for line in lines[:rows]:
        con.print(line[:cols], no_wrap=True, overflow="ignore", crop=False)
    return buf.getvalue().rstrip()


def _circuit_payload(circuit, name: str, notes=()) -> str:
    return json.dumps({"ok": True, "name": name, "circuit": circuit.to_dict(), "notes": list(notes),
                       "schematic": _schematic(circuit), "spice": circuit.to_spice(name)}, ensure_ascii=False)


def _sim_error(e) -> str:
    return json.dumps({"ok": False, "stderr": str(e)}, ensure_ascii=False)


def sim_load(source: str, value: str, name: str = "circuit") -> str:
    """source: "example" (value = example name), "file" (value = path from add_input),
    "spice" (value = netlist text) or "json" (value = circuit file text)."""
    from elektro.circuit import examples
    from elektro.circuit.model import Circuit, CircuitError
    from elektro.circuit.spice import parse_spice
    try:
        if source == "example":
            if value not in examples.names():
                raise CircuitError(value)
            return _circuit_payload(examples.build(value), value)
        if source == "file":
            from pathlib import Path
            circuit = Circuit.load(Path(value))
            return _circuit_payload(circuit, _stem(value), circuit.notes)
        if source == "spice":
            circuit, notes = parse_spice(value)
            # the netlist's title line ("* rc filter") names it; otherwise the given name
            first = value.split("\n", 1)[0].strip()
            first = first.lstrip("*").strip() if first.startswith("*") else ""
            return _circuit_payload(circuit, _stem(first or name), notes)
        if source == "json":
            return _circuit_payload(Circuit.from_dict(json.loads(value)), _stem(name))
    except (CircuitError, ValueError, OSError) as e:
        return _sim_error(e)
    return _sim_error(f"unknown source {source!r}")


def _stem(name: str) -> str:
    stem = os.path.splitext(os.path.basename(name or ""))[0]
    stem = re.sub(r"[^A-Za-z0-9_.-]+", "_", stem).strip("._")
    return stem or "circuit"


def sim_run(payload_json: str) -> str:
    """Save the circuit as NAME.json and run `elektro sim NAME.json --plot NAME.svg --csv NAME.csv`
    (the same command a user would type); add the schematic with the solved node voltages."""
    from elektro.circuit.model import Circuit, CircuitError, valid_value
    from elektro.circuit.solver import dc_operating_point
    p = json.loads(payload_json)
    name = _stem(p.get("name"))
    try:
        circuit = Circuit.from_dict(p["circuit"])
    except (CircuitError, KeyError) as e:
        return _sim_error(e)
    bad = [c.ref for c in circuit.components if not valid_value(c.kind, c.value)]
    if bad:
        from elektro.i18n import t
        return json.dumps({"ok": False, "invalid": bad,
                           "stderr": "\n".join(t("ckt.bad_value", ref=ref) for ref in bad)}, ensure_ascii=False)
    os.makedirs(WORK, exist_ok=True)
    path = os.path.join(WORK, name + ".json")
    circuit.save(path)
    try:
        argv = ["sim", name + ".json", "--plot", name + ".svg"]
        if circuit.analysis.strip():
            argv += ["--csv", name + ".csv"]
        result = json.loads(run(json.dumps(argv)))
    finally:
        os.remove(path)
    voltages = None
    if any(c.kind in ("V", "I") for c in circuit.components):
        try:
            voltages = dc_operating_point(circuit).voltages
        except (CircuitError, ValueError, ZeroDivisionError, OverflowError):
            voltages = None
    result["schematic"] = _schematic(circuit, voltages)
    # for the editor: solved DC voltage of every node, and which grid points form each node
    result["node_voltages"] = voltages
    try:
        result["net_points"] = {name: [list(p) for p in pts] for name, pts in circuit.net_points().items()}
    except Exception:
        result["net_points"] = {}
    result["spice"] = circuit.to_spice(name)
    result["circuit"] = circuit.to_dict()
    result["name"] = name
    return json.dumps(result, ensure_ascii=False, default=str)


_load(os.environ.get("ELEKTRO_LANG"))
