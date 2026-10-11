# ⚡ elektro web

**Live: https://emincan2000.github.io/elektro-web/**

A browser interface for [**elektro**](https://github.com/0anes0/elektro), the terminal
toolkit for electrical & electronics engineering by
[Ahmet Enes Kaymak](https://github.com/0anes0). All calculations, texts and graphs come from
elektro; this repository only adds the web front end.

The page runs **elektro's own Python code** in the browser with
[Pyodide](https://pyodide.org) (Python on WebAssembly). Nothing is installed, nothing is
sent to a server, and no calculation is re-implemented in JavaScript.

> Türkçe açıklama aşağıda — [Türkçe](#türkçe).

## What you get

* **All 63 web-usable elektro commands.** Ohm's law, resistor colour codes, dividers, LEDs,
  555, op-amps, filters, regulators, wiring, RF, signal analysis, embedded, logic and more.
* **Forms generated from elektro's command tree.** When elektro gains a command or an
  option, the site picks it up when the bundle is rebuilt; nobody edits HTML.
* **One-click examples.** Every example from elektro's help text becomes a button that
  fills the form and runs it.
* **elektro's own output, in colour.** The same table you see in the terminal (resistor
  bands included). There is also a value table (SI units) and the raw `--json`.
* **Graphs.** Filters, charge curves, waveforms and FFT spectra are drawn by elektro's
  built-in SVG plotter and shown inline.
* **File input** for `fft`: pick a CSV/TXT file; it never leaves your computer.
* **Shareable links.** The URL holds the command and its arguments
  (e.g. `#divider?a=--vin 12 --vout 3.3`). The page shows the matching CLI command too.
* English, Turkish, German and Russian (elektro's own translations), light/dark theme,
  works on phones.

Not available in the browser: `shell`, `tui`, `sim`/`examples` (circuit simulator),
`datasheet` (needs network access to other sites), and the history/variables/settings
commands.

## How it works

```
web/index.html + app.js ── UI (forms, results)
        │ postMessage
web/worker.js ──────────── Pyodide in a Web Worker (page never freezes)
        │
web/bridge.py ──────────── reads elektro's Typer/Click tree → form definitions
                           runs a command twice: --json (data) and plain (terminal table)
web/elektro-bundle.zip ─── elektro + the pure-Python packages it imports (2.6 MB)
```

`tools/build_bundle.py` builds the zip from an installed elektro. It lists the packages to
include by importing `elektro.cli` and taking what was actually loaded. Packages that are
not needed in the browser, like `textual`, stay out.

## Build & run

```sh
python3 tools/build_bundle.py          # uses elektro's install.sh venv by default
make deps                              # Pyodide for the tests (npm)
make serve                             # → http://127.0.0.1:8765/?pyodide=/pyodide/
```

Hosting: any static host serving `web/` works. This repository publishes it to GitHub Pages
through `.github/workflows/pages.yml` on every push to `main`. Pyodide is loaded from
jsDelivr, pinned to 0.28.3.

To follow a new elektro release: update elektro locally (`install.sh`), then run
`python3 tools/build_bundle.py` and `make test`, and commit `web/elektro-bundle.zip` and
`web/bundle.json`.

## Tests

```sh
make test
```

| Test | What it proves |
|---|---|
| `test-lib` | form ↔ command-line conversion, ANSI → HTML (incl. no HTML injection), SI units, same-origin rule for `?pyodide=` |
| `test-pyodide` | every example in elektro's help (151) runs inside Pyodide; each one also survives a round trip through the form (example → form → command line) unchanged |
| `test-native` | the same 151 examples give the **same results as the installed CLI**: identical terminal text; identical JSON (floats within 1e-9, the WASM vs glibc `libm` difference) |
| `test-live` | the same browser test against the deployed GitHub Pages site |
| `test-e2e` | real headless Firefox: boot, sidebar, examples, plots, colours, file upload + FFT, validation, error display, shareable links, language switch, dark theme, mobile layout |

## Credits

* **elektro**: [Ahmet Enes Kaymak](https://github.com/0anes0) — https://github.com/0anes0/elektro.
  Every command, formula, translation and plot on the site is his work.
* **Web interface**: [EminY](https://github.com/emincan2000), with Ahmet Enes Kaymak as co-author.
* [Pyodide](https://pyodide.org) runs Python in the browser.

## License

GPL-3.0-or-later, the same as elektro, whose code this site bundles. See [LICENSE](LICENSE).

---

## Türkçe

Canlı: **https://emincan2000.github.io/elektro-web/**

[Ahmet Enes Kaymak](https://github.com/0anes0)'ın yazdığı [**elektro**](https://github.com/0anes0/elektro)
için tarayıcı arayüzü. Tüm hesaplar, metinler ve grafikler elektro'ya aittir; bu depo
yalnızca web arayüzünü ekler. Hesaplar elektro'nun
**kendi Python kodu** ile, Pyodide (WebAssembly üzerinde Python) sayesinde tamamen
tarayıcıda yapılır. Kurulum gerekmez, hiçbir veri sunucuya gitmez.

* **Komutlar:** Tarayıcıda çalışabilen 63 elektro komutu, formları elektro'nun komut
  ağacından otomatik üretilir.
* **Örnekler:** Yardım metnindeki örnekler tek tıkla çalışır.
* **Çıktı:** elektro'nun renkli terminal çıktısı, değer tablosu ve JSON.
* **Grafik ve dosya:** elektro'nun kendi çizdiği grafikler sayfada görünür. FFT için
  dosya yüklenebilir.
* **Paylaşım ve görünüm:** Paylaşılabilir bağlantılar, 4 dil, açık/koyu tema, mobil
  uyumlu tasarım.
* **Doğruluk:** 151 örneğin tamamı kurulu elektro ile aynı sonucu verir (`make test`).
