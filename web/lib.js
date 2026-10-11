// Pure helpers shared by the page, the worker and the Node tests (no DOM access here).

/**
 * Where to load Pyodide from. `asked` comes from the page URL (?pyodide=/path/) so a
 * self-hosted copy can be used, but only from the page's own origin: a crafted link
 * must never make the page run scripts from another site.
 */
export function pyodideBase(asked, pageUrl, cdn) {
  if (!asked) return cdn;
  let url;
  try { url = new URL(asked, pageUrl); } catch { return cdn; }
  if (url.origin !== new URL(pageUrl).origin || !/^https?:$/.test(url.protocol)) return cdn;
  url.search = ""; url.hash = "";
  return url.href.endsWith("/") ? url.href : url.href + "/";
}

// ---------------------------------------------------------------- shell words
/** Split a string like a POSIX shell would (quotes and backslashes), for list inputs. */
export function splitWords(text) {
  const out = [];
  let cur = "", inWord = false, quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === "\\" && quote === '"' && i + 1 < text.length) cur += text[++i];
      else cur += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch; inWord = true;
    } else if (ch === "\\" && i + 1 < text.length) {
      cur += text[++i]; inWord = true;
    } else if (/\s/.test(ch)) {
      if (inWord) { out.push(cur); cur = ""; inWord = false; }
    } else {
      cur += ch; inWord = true;
    }
  }
  if (inWord) out.push(cur);
  return out;
}

/** Quote argv for display as a copy-pasteable command line. */
export function shellJoin(argv) {
  return argv.map((a) => (a === "" ? "''" : /^[\w@%+=:,./-]+$/u.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`)).join(" ");
}

// ------------------------------------------------------------- form <-> argv
export const PLOT_FILE = "plot.svg";

const longOpt = (p) => p.opts.find((o) => o.startsWith("--")) || p.opts[0];

/**
 * Build elektro argv from form values.
 * values[name]: string for text-like kinds, boolean for flags, boolean or "*.svg" for plots,
 * "on"/"off"/"" for flag pairs (--high/--low), uploaded path for files.
 */
export function buildArgv(cmd, values) {
  const argv = [...cmd.path];
  const positional = [];
  for (const p of cmd.params) {
    const v = values[p.name];
    if (p.positional) {
      if (v === undefined || v === null || v === "") continue;
      positional.push(...(p.multi ? splitWords(String(v)) : [String(v)]));
      continue;
    }
    if (p.kind === "plot") {
      // a file name (from an example) is kept if it is SVG — the only format without matplotlib
      if (v) argv.push(longOpt(p), typeof v === "string" && /\.svg$/i.test(v) ? v : PLOT_FILE);
    } else if (p.kind === "flag") {
      if (p.secondary.length) {
        if (v === "on" || v === true) argv.push(p.opts[0]);
        else if (v === "off") argv.push(p.secondary[0]);
      } else if (v) {
        argv.push(longOpt(p));
      }
    } else if (v !== undefined && v !== null && v !== "") {
      if (p.multi) for (const w of splitWords(String(v))) argv.push(longOpt(p), w);
      else argv.push(longOpt(p), String(v));
    }
  }
  // "--" keeps values like "-5" from being read as options
  if (positional.some((w) => w.startsWith("-"))) argv.push("--");
  return argv.concat(positional);
}

/** Inverse of buildArgv: map an example's argv (without the command path) onto form values. */
export function argvToValues(cmd, args) {
  const values = {}, pos = [], unknown = [];
  const byOpt = new Map();
  for (const p of cmd.params) {
    for (const o of p.opts) byOpt.set(o, { p, neg: false });
    for (const o of p.secondary) byOpt.set(o, { p, neg: true });
  }
  let onlyPositional = false;
  for (let i = 0; i < args.length; i++) {
    let a = args[i];
    if (!onlyPositional && a === "--") { onlyPositional = true; continue; }
    let inline = null;
    if (!onlyPositional && a.startsWith("--") && a.includes("=")) {
      inline = a.slice(a.indexOf("=") + 1);
      a = a.slice(0, a.indexOf("="));
    }
    const hit = onlyPositional ? null : byOpt.get(a);
    if (!hit) {
      if (!onlyPositional && a.startsWith("-") && a.length > 1 && !/^-[\d.]/.test(a)) unknown.push(a);
      else pos.push(a);
      continue;
    }
    const { p, neg } = hit;
    if (p.kind === "flag") {
      values[p.name] = p.secondary.length ? (neg ? "off" : "on") : true;
    } else if (p.kind === "plot") {
      const file = inline !== null ? inline : args[++i];
      values[p.name] = file && /\.svg$/i.test(file) ? file : true;
    } else {
      const v = inline !== null ? inline : args[++i];
      if (v === undefined) break;
      values[p.name] = p.multi && values[p.name] ? `${values[p.name]} ${v}` : v;
    }
  }
  const posParams = cmd.params.filter((p) => p.positional);
  let k = 0;
  for (const p of posParams) {
    if (k >= pos.length) break;
    if (p.multi) {
      const rest = posParams.slice(posParams.indexOf(p) + 1).length;
      const take = pos.slice(k, pos.length - rest);
      values[p.name] = shellJoin(take);
      k += take.length;
    } else {
      values[p.name] = pos[k++];
    }
  }
  return { values, unknown, extra: pos.slice(k) };
}

// ------------------------------------------------------------------ ANSI -> HTML
const BASIC = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];

function xterm256(n) {
  if (n < 16) return null;                      // handled as classes
  if (n >= 232) { const g = 8 + (n - 232) * 10; return `rgb(${g},${g},${g})`; }
  const c = n - 16, f = (x) => (x ? 55 + x * 40 : 0);
  return `rgb(${f(Math.floor(c / 36))},${f(Math.floor(c / 6) % 6)},${f(c % 6)})`;
}

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/**
 * Convert rich's ANSI (SGR) output to HTML spans. The 16 basic colors become
 * classes (a-fg-red, a-bg-bright-blue …) so the page theme can tune them;
 * 256-color and truecolor values become inline styles.
 */
export function ansiToHtml(text) {
  let st = {};
  let html = "";
  const re = /\x1b\[([0-9;]*)m/g;
  let last = 0, m;
  const open = () => {
    const cls = [], css = [];
    if (st.bold) cls.push("a-bold");
    if (st.dim) cls.push("a-dim");
    if (st.italic) cls.push("a-italic");
    if (st.underline) cls.push("a-underline");
    let fg = st.fg, bg = st.bg;
    if (st.reverse) [fg, bg] = [bg || { cls: "default-bg" }, fg || { cls: "default-fg" }];
    if (fg) fg.cls ? cls.push(`a-fg-${fg.cls}`) : css.push(`color:${fg.css}`);
    if (bg) bg.cls ? cls.push(`a-bg-${bg.cls}`) : css.push(`background:${bg.css}`);
    if (!cls.length && !css.length) return null;
    return `<span${cls.length ? ` class="${cls.join(" ")}"` : ""}${css.length ? ` style="${css.join(";")}"` : ""}>`;
  };
  const color = (codes, i) => {          // 38;5;n or 38;2;r;g;b → [color, consumed]
    if (codes[i + 1] === 5) {
      const n = codes[i + 2];
      const css = xterm256(n);
      return [css ? { css } : { cls: (n >= 8 ? "bright-" : "") + BASIC[n % 8] }, 2];
    }
    if (codes[i + 1] === 2) return [{ css: `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})` }, 4];
    return [null, 0];
  };
  const flush = (chunk) => {
    if (!chunk) return;
    const tag = open();
    html += tag ? `${tag}${escapeHtml(chunk)}</span>` : escapeHtml(chunk);
  };
  while ((m = re.exec(text))) {
    flush(text.slice(last, m.index));
    last = re.lastIndex;
    const codes = m[1] === "" ? [0] : m[1].split(";").map(Number);
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      if (c === 0) st = {};
      else if (c === 1) st.bold = true;
      else if (c === 2) st.dim = true;
      else if (c === 3) st.italic = true;
      else if (c === 4) st.underline = true;
      else if (c === 7) st.reverse = true;
      else if (c === 22) st.bold = st.dim = false;
      else if (c === 23) st.italic = false;
      else if (c === 24) st.underline = false;
      else if (c === 27) st.reverse = false;
      else if (c >= 30 && c <= 37) st.fg = { cls: BASIC[c - 30] };
      else if (c >= 90 && c <= 97) st.fg = { cls: "bright-" + BASIC[c - 90] };
      else if (c >= 40 && c <= 47) st.bg = { cls: BASIC[c - 40] };
      else if (c >= 100 && c <= 107) st.bg = { cls: "bright-" + BASIC[c - 100] };
      else if (c === 39) delete st.fg;
      else if (c === 49) delete st.bg;
      else if (c === 38 || c === 48) {
        const [col, used] = color(codes, i);
        if (col) st[c === 38 ? "fg" : "bg"] = col;
        i += used;
      }
    }
  }
  flush(text.slice(last));
  return html;
}

// ------------------------------------------------------- structured result view
// elektro's JSON keys end in a unit: current_a, fc_hz, r_ohm, gain_db, tolerance_pct …
// Built from the keys elektro 0.7 actually emits (tests/test_lib.mjs checks the tricky ones).
const EXACT = {                               // where the suffix rule would lie
  ohm_per_m: ["Ω/m", true], current_density_a_mm2: ["A/mm²", false], w_h: ["Wh", true],
  db_per_100m: ["dB/100 m", false],
};
const UNITS = [                               // [suffix, unit, use SI prefixes]
  ["_mm2", "mm²", false], ["_cm2", "cm²", false], ["_ohm", "Ω", true], ["_dbm", "dBm", false],
  ["_mah", "mAh", false], ["_mva", "MVA", false], ["_ka", "kA", false], ["_rpm", "rpm", false],
  ["_hours", "h", false], ["_days", "d", false], ["_bps", "bit/s", true], ["_bits", "bit", false],
  ["_bytes", "B", false], ["_mil", "mil", false], ["_oz", "oz", false], ["_nm", "N·m", false],
  ["_pct", "%", false], ["_deg", "°", false], ["_var", "var", true], ["_va", "VA", true],
  ["_db", "dB", false], ["_hz", "Hz", true], ["_mm", "mm", false], ["_v", "V", true],
  ["_a", "A", true], ["_w", "W", true], ["_f", "F", true], ["_h", "H", true], ["_s", "s", true],
  ["_m", "m", true], ["_c", "°C", false],
].sort((a, b) => b[0].length - a[0].length);

export function splitKey(key) {
  const k = key.toLowerCase();
  if (EXACT[k]) return { label: key, unit: EXACT[k][0], si: EXACT[k][1], whole: true };
  if (/(^|_)rth(_|$)/.test(k)) return { label: key, unit: "K/W", si: false, whole: true };
  for (const [suf, unit, si] of UNITS) {
    if (k.endsWith(suf) && k.length > suf.length) return { label: key.slice(0, -suf.length), unit, si };
  }
  return { label: key, unit: "", si: false };
}

const PREFIX = [[1e12, "T"], [1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"],
  [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"], [1e-15, "f"]];

/** 0.002553 A -> "2.553 mA"; 4700 Ω -> "4.7 kΩ" (4 significant digits, trailing zeros cut). */
export function formatSI(value, unit = "", si = true) {
  if (typeof value !== "number" || !Number.isFinite(value)) return String(value);
  const trim = (x) => {
    const s = Number(x.toPrecision(4)).toString();
    return s.includes("e") ? x.toExponential(3) : s;
  };
  if (!si || value === 0) return unit ? `${trim(value)} ${unit}` : trim(value);
  const abs = Math.abs(value);
  // 999.96 mV rounds to "1000 mV" at 4 digits, so it is shown as 1 V instead
  const [f, p] = PREFIX.find(([f]) => abs >= f * 0.99995) || PREFIX[PREFIX.length - 1];
  return `${trim(value / f)} ${p}${unit}`;
}

export function humanize(label) {
  const s = label.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
