// elektro web — page logic. Forms come from elektro's own command tree (bridge.catalog),
// results from its own --json / terminal output (bridge.run); nothing is re-implemented here.
import {
  argvToValues, buildArgv, shellJoin, splitWords, ansiToHtml, formatSI, splitKey, humanize,
} from "./lib.js";

// ----------------------------------------------------------------- UI strings
const UI = {
  tr: {
    loading: ["Python (Pyodide) yükleniyor", "Paketler hazırlanıyor", "elektro yükleniyor"],
    loadingNote: "İlk açılış birkaç saniye sürer; sonra tarayıcı önbelleğinden gelir. Her şey bilgisayarında çalışır.",
    loadFailed: "Yüklenemedi", search: "Komut ara…  ( / )", noMatch: "Eşleşen komut yok",
    examples: "Örnekler:", run: "Hesapla", running: "Hesaplanıyor…", ctrlEnter: "Ctrl + Enter",
    copy: "Kopyala", copied: "Kopyalandı", reset: "Temizle", required: "zorunlu", default: "varsayılan",
    words: "boşlukla ayırın", plot: "Grafik çiz", file: "Dosya seç", output: "Çıktı", values: "Değerler",
    json: "JSON", download: "İndir", noParams: "Bu komutun parametresi yok.", fillRequired: "Zorunlu alanları doldurun.",
    error: "Hata", warning: "Uyarı", homeTitle: "Elektrik-elektronik hesapları, tarayıcıda",
    homeLead: "elektro komut satırı aracının web arayüzü. Hesaplar elektro'nun kendi Python koduyla, Pyodide sayesinde tamamen senin tarayıcında yapılır; hiçbir veri bir sunucuya gitmez.",
    commands: "komut", start: "Başlamak için soldan bir komut seç ya da birini dene:",
    on: "açık", off: "kapalı", unchanged: "—", menu: "Menü", theme: "Tema", rawValue: "ham değer",
    foot: ["elektro", "© Ahmet Enes Kaymak (GPLv3)", "web arayüzünün kaynak kodu", "hesaplar elektro'nun kendi koduyla, Pyodide üzerinde"],
  },
  en: {
    loading: ["Loading Python (Pyodide)", "Preparing packages", "Loading elektro"],
    loadingNote: "The first visit takes a few seconds; after that it comes from the browser cache. Everything runs on your computer.",
    loadFailed: "Could not load", search: "Search commands…  ( / )", noMatch: "No matching command",
    examples: "Examples:", run: "Calculate", running: "Calculating…", ctrlEnter: "Ctrl + Enter",
    copy: "Copy", copied: "Copied", reset: "Clear", required: "required", default: "default",
    words: "separate with spaces", plot: "Draw graph", file: "Choose file", output: "Output", values: "Values",
    json: "JSON", download: "Download", noParams: "This command has no parameters.", fillRequired: "Fill in the required fields.",
    error: "Error", warning: "Warning", homeTitle: "Electrical & electronics calculations in the browser",
    homeLead: "A web interface for the elektro command line toolkit. Calculations run elektro's own Python code entirely in your browser via Pyodide; nothing is sent to a server.",
    commands: "commands", start: "Pick a command on the left, or try one of these:",
    on: "on", off: "off", unchanged: "—", menu: "Menu", theme: "Theme", rawValue: "raw value",
    foot: ["elektro", "© Ahmet Enes Kaymak (GPLv3)", "web UI source", "calculations by elektro's own code, on Pyodide"],
  },
  de: {
    loading: ["Python (Pyodide) wird geladen", "Pakete werden vorbereitet", "elektro wird geladen"],
    loadingNote: "Der erste Aufruf dauert ein paar Sekunden, danach kommt alles aus dem Browser-Cache. Alles läuft auf deinem Rechner.",
    loadFailed: "Laden fehlgeschlagen", search: "Befehle suchen…  ( / )", noMatch: "Kein passender Befehl",
    examples: "Beispiele:", run: "Berechnen", running: "Berechne…", ctrlEnter: "Strg + Enter",
    copy: "Kopieren", copied: "Kopiert", reset: "Leeren", required: "Pflicht", default: "Standard",
    words: "durch Leerzeichen getrennt", plot: "Diagramm zeichnen", file: "Datei wählen", output: "Ausgabe", values: "Werte",
    json: "JSON", download: "Herunterladen", noParams: "Dieser Befehl hat keine Parameter.", fillRequired: "Bitte Pflichtfelder ausfüllen.",
    error: "Fehler", warning: "Warnung", homeTitle: "Elektrotechnik-Berechnungen im Browser",
    homeLead: "Eine Weboberfläche für das Kommandozeilenwerkzeug elektro. Gerechnet wird mit elektros eigenem Python-Code, vollständig im Browser über Pyodide; nichts wird an einen Server gesendet.",
    commands: "Befehle", start: "Wähle links einen Befehl oder probiere einen davon:",
    on: "an", off: "aus", unchanged: "—", menu: "Menü", theme: "Design", rawValue: "Rohwert",
    foot: ["elektro", "© Ahmet Enes Kaymak (GPLv3)", "Quellcode der Weboberfläche", "Berechnungen mit elektros eigenem Code, auf Pyodide"],
  },
  ru: {
    loading: ["Загрузка Python (Pyodide)", "Подготовка пакетов", "Загрузка elektro"],
    loadingNote: "Первый запуск занимает несколько секунд, дальше всё берётся из кэша браузера. Всё работает на вашем компьютере.",
    loadFailed: "Не удалось загрузить", search: "Поиск команд…  ( / )", noMatch: "Нет подходящих команд",
    examples: "Примеры:", run: "Рассчитать", running: "Расчёт…", ctrlEnter: "Ctrl + Enter",
    copy: "Копировать", copied: "Скопировано", reset: "Очистить", required: "обязательно", default: "по умолчанию",
    words: "через пробел", plot: "Построить график", file: "Выбрать файл", output: "Вывод", values: "Значения",
    json: "JSON", download: "Скачать", noParams: "У этой команды нет параметров.", fillRequired: "Заполните обязательные поля.",
    error: "Ошибка", warning: "Предупреждение", homeTitle: "Расчёты по электротехнике в браузере",
    homeLead: "Веб-интерфейс для консольного инструмента elektro. Расчёты выполняет собственный Python-код elektro прямо в браузере через Pyodide; ничего не отправляется на сервер.",
    commands: "команд", start: "Выберите команду слева или попробуйте одну из этих:",
    on: "вкл", off: "выкл", unchanged: "—", menu: "Меню", theme: "Тема", rawValue: "исходное значение",
    foot: ["elektro", "© Ahmet Enes Kaymak (GPLv3)", "исходный код веб-интерфейса", "расчёты — собственный код elektro на Pyodide"],
  },
};

const FEATURED = ["ohm", "resistor decode", "divider", "led", "filter rc", "555 astable", "opamp noninv", "wire"];

// ----------------------------------------------------------------- state
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) n.append(kid);
  return n;
};

/** replaceChildren() would print `false` as text; drop falsy kids like el() does. */
const setKids = (node, ...kids) => node.replaceChildren(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false && k !== ""));

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

let lang = pickLang();
let catalog = null;
let manifest = null;
let current = null;          // selected command
let values = {};             // form values of the current command
let lastResult = null;
let busy = false;
const objectUrls = [];

function pickLang() {
  const saved = store.get("elektro-web-lang");
  if (saved && UI[saved]) return saved;
  const nav = (navigator.language || "en").slice(0, 2).toLowerCase();
  return UI[nav] ? nav : "en";
}
const T = () => UI[lang];

// ----------------------------------------------------------------- worker RPC
const workerUrl = new URL("./worker.js", import.meta.url);
const pyodideParam = new URLSearchParams(location.search).get("pyodide");   // worker enforces same-origin
if (pyodideParam) workerUrl.searchParams.set("pyodide", pyodideParam);
const worker = new Worker(workerUrl, { type: "module" });
const pending = new Map();
let nextId = 0;
worker.onmessage = ({ data }) => {
  if (data.progress) return showProgress(data.progress);
  const p = pending.get(data.id);
  if (!p) return;
  pending.delete(data.id);
  data.ok ? p.resolve(data.result) : p.reject(new Error(data.error));
};
worker.onerror = (e) => loadFailed(e.message || "worker error");
const call = (op, ...args) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, { resolve, reject });
  worker.postMessage({ id, op, args });
});

// ----------------------------------------------------------------- loading
const STEPS = ["python", "packages", "elektro"];
function showProgress(step) {
  const i = STEPS.indexOf(step);
  [...$("#steps").children].forEach((li, k) => { li.className = k < i ? "done" : k === i ? "active" : "todo"; });
}
function renderLoading() {
  $("#steps").replaceChildren(...T().loading.map((s) => el("li", { class: "todo", text: s })));
  $("#loading-note").textContent = T().loadingNote;
}
function loadFailed(msg) {
  const box = $("#loading");
  box.classList.add("failed");
  $("#loading-note").replaceChildren(el("div", { class: "msg err", text: `${T().loadFailed}: ${msg}` }));
}

// ----------------------------------------------------------------- chrome
function applyChrome() {
  document.documentElement.lang = lang;
  $("#lang").value = lang;
  $("#search").placeholder = T().search;
  $("#menu-btn").setAttribute("aria-label", T().menu);
  $("#theme-btn").setAttribute("aria-label", T().theme);
  const [name, author, source, how] = T().foot;
  setKids($("#foot"),
    el("a", { href: "https://github.com/0anes0/elektro", text: name, rel: "noopener" }), ` ${author}`,
    manifest ? ` · v${manifest.elektro}` : "", " · ", how, " · ",
    el("a", { href: "https://github.com/emincan2000/elektro-web", text: source, rel: "noopener" }));
}

function setTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
setTheme(store.get("elektro-web-theme"));
$("#theme-btn").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  const next = dark ? "light" : "dark";
  setTheme(next);
  store.set("elektro-web-theme", next);
});

$("#menu-btn").addEventListener("click", () => toggleMenu());
function toggleMenu(force) {
  const open = force ?? !$("#sidebar").classList.contains("open");
  $("#sidebar").classList.toggle("open", open);
  $("#menu-btn").setAttribute("aria-expanded", String(open));
}

// ----------------------------------------------------------------- navigation
const cmdName = (c) => c.path.join(" ");
const firstLine = (s) => (s || "").split("\n")[0].trim();
const findCmd = (name) => catalog.commands.find((c) => cmdName(c) === name);

function renderNav() {
  const q = $("#search").value.trim().toLowerCase();
  const nav = $("#nav");
  nav.replaceChildren();
  let shown = 0;
  for (const panel of catalog.panels) {
    const items = catalog.commands.filter((c) => c.panel === panel).filter((c) =>
      !q || cmdName(c).includes(q) || c.help.toLowerCase().includes(q) || c.group_help.toLowerCase().includes(q));
    if (!items.length) continue;
    shown += items.length;
    nav.append(el("div", { class: "nav-group" },
      el("h2", { text: panel || "elektro" }),
      items.map((c) => el("button", {
        class: "nav-item", type: "button",
        "aria-current": current && cmdName(current) === cmdName(c) ? "page" : null,
        onclick: () => { selectCommand(c); toggleMenu(false); },
      }, el("span", { class: "cmd", text: cmdName(c) }), el("span", { class: "desc", text: firstLine(c.help) })))));
  }
  if (!shown) nav.append(el("p", { class: "nav-empty", text: T().noMatch }));
}

$("#search").addEventListener("input", renderNav);
$("#search").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const btn = $("#nav .nav-item");
    if (btn) btn.click();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) {
    e.preventDefault();
    toggleMenu(true);
    $("#search").focus();
  }
});
$("#home-link").addEventListener("click", (e) => { e.preventDefault(); goHome(); });

// ----------------------------------------------------------------- URL state
function writeHash() {
  if (!current) { history.replaceState(null, "", location.pathname + location.search); return; }
  const argv = buildArgv(current, values).slice(current.path.length);
  const q = argv.length ? "?" + new URLSearchParams({ a: shellJoin(argv) }) : "";
  history.replaceState(null, "", `#${encodeURIComponent(cmdName(current))}${q}`);
}
function readHash() {
  const h = location.hash.slice(1);
  if (!h) return null;
  const [name, query] = h.split("?");
  const cmd = findCmd(decodeURIComponent(name));
  if (!cmd) return null;
  const args = new URLSearchParams(query || "").get("a");
  return { cmd, args: args ? splitWords(args) : null };
}

// links pasted into the address bar, and back/forward (replaceState never fires this)
addEventListener("hashchange", () => {
  if (!catalog) return;
  const target = readHash();
  if (!target) return goHome();
  selectCommand(target.cmd, target.args ? argvToValues(target.cmd, target.args).values : null, !!target.args);
});

// ----------------------------------------------------------------- home
function goHome() {
  current = null;
  writeHash();
  renderNav();
  const view = $("#view");
  const featured = FEATURED.map(findCmd).filter(Boolean);
  setKids(view, el("div", { class: "home" },
    el("h1", { text: T().homeTitle }),
    el("p", { class: "lead", text: T().homeLead }),
    el("div", { class: "badges" },
      el("span", { class: "badge", text: `${catalog.commands.length} ${T().commands}` }),
      manifest && el("span", { class: "badge", text: `elektro ${manifest.elektro}` }),
      el("span", { class: "badge", text: "Pyodide · WebAssembly" })),
    el("p", { text: T().start, style: "margin-top:22px" }),
    el("div", { class: "home-grid" }, featured.map((c) => el("button", {
      class: "card home-card", type: "button", onclick: () => selectCommand(c),
    }, el("div", { class: "cmd", text: cmdName(c) }), el("div", { class: "desc", text: firstLine(c.help) }))))));
  $("#main").focus({ preventScroll: true });
}

// ----------------------------------------------------------------- command view
function defaultValues(cmd) {
  const v = {};
  for (const p of cmd.params) if (p.kind === "plot") v[p.name] = true;    // graphs are the web's bonus
  return v;
}

function selectCommand(cmd, initial = null, autorun = false) {
  current = cmd;
  values = initial ?? defaultValues(cmd);
  lastResult = null;
  renderNav();
  renderCommand();
  writeHash();
  $("#main").focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
  if (autorun) run();
}

function fieldInput(p) {
  const id = `f-${p.name}`;
  const v = values[p.name];
  const set = (val) => { values[p.name] = val; updateCli(); writeHash(); };
  const t = T();
  switch (p.kind) {
    case "choice":
      return el("select", { id, onchange: (e) => set(e.target.value) },
        el("option", { value: "", text: p.default != null ? `${t.default}: ${p.default}` : t.unchanged }),
        p.choices.map((c) => el("option", { value: c, text: c, selected: v === c })));
    case "flag":
      if (p.secondary.length) {
        return el("select", { id, onchange: (e) => set(e.target.value) },
          el("option", { value: "", text: t.unchanged }),
          el("option", { value: "on", text: p.opts[0], selected: v === "on" }),
          el("option", { value: "off", text: p.secondary[0], selected: v === "off" }));
      }
      return el("input", { id, type: "checkbox", checked: !!v, onchange: (e) => set(e.target.checked) });
    case "plot":
      return el("input", { id, type: "checkbox", checked: !!v, onchange: (e) => set(e.target.checked) });
    case "file":
      return el("input", {
        id, type: "file", accept: ".csv,.txt,.dat,.tsv", onchange: async (e) => {
          const f = e.target.files[0];
          if (!f) return set("");
          set(await call("upload", f.name, await f.arrayBuffer()));
        },
      });
    case "int":
    case "float":
      return el("input", {
        id, type: "number", step: p.kind === "int" ? "1" : "any", min: p.min ?? null, max: p.max ?? null,
        value: v ?? "", placeholder: p.default != null ? `${t.default}: ${p.default}` : null,
        oninput: (e) => set(e.target.value),
      });
    default:
      return el("input", {
        id, type: "text", value: v ?? "", spellcheck: "false", autocomplete: "off",
        placeholder: p.default != null ? `${t.default}: ${p.default}` : (p.kind === "value" ? "4k7, 100n, 2.2u…" : null),
        oninput: (e) => set(e.target.value),
      });
  }
}

function renderField(p) {
  const t = T();
  const optLabel = p.positional ? null : [...p.opts, ...p.secondary].join(" / ");
  const hint = [p.help, p.multi ? `(${t.words})` : "", p.min != null || p.max != null ? `[${p.min ?? "…"} – ${p.max ?? "…"}]` : ""]
    .filter(Boolean).join(" ");
  const title = p.kind === "plot" ? t.plot : humanize(p.name);
  if (p.kind === "plot" || (p.kind === "flag" && !p.secondary.length)) {
    return el("div", { class: "field check", "data-param": p.name },
      fieldInput(p),
      el("div", {},
        el("label", { for: `f-${p.name}` }, title, optLabel && el("span", { class: "opt", text: optLabel })),
        hint && p.kind !== "plot" && el("div", { class: "hint", text: hint })));
  }
  return el("div", { class: `field${p.multi || p.kind === "file" ? " wide" : ""}`, "data-param": p.name },
    el("label", { for: `f-${p.name}` },
      title, p.required && el("span", { class: "req", title: t.required, text: "*" }),
      optLabel && el("span", { class: "opt", text: optLabel })),
    fieldInput(p),
    hint && el("div", { class: "hint", text: hint }));
}

function renderCommand() {
  const c = current, t = T();
  const desc = c.help.split("\n");
  const view = $("#view");
  setKids(view,
    el("div", { class: "crumb", text: c.panel }),
    el("h1", { class: "cmd-title", text: cmdName(c) }),
    el("p", { class: "lead", text: desc[0] }),
    desc.length > 1 && el("p", { class: "help-text", text: desc.slice(1).join("\n").trim() }),
    c.group_help && el("p", { class: "group-help", text: c.group_help }),
    c.examples.length > 0 && el("div", { class: "examples" },
      el("span", { class: "label", text: t.examples }),
      c.examples.map((ex) => el("button", {
        class: "chip", type: "button", text: ex, onclick: () => useExample(ex),
      }))),
    el("form", { class: "card", id: "cmd-form", onsubmit: (e) => { e.preventDefault(); run(); } },
      c.params.length
        ? el("div", { class: "fields" }, c.params.map(renderField))
        : el("p", { class: "no-params", text: t.noParams }),
      el("div", { class: "cli" },
        el("span", { class: "prompt", text: "$" }),
        el("code", { id: "cli-text" }),
        el("button", { class: "small-btn", type: "button", text: t.copy, onclick: (e) => copy($("#cli-text").textContent, e.target) })),
      el("div", { class: "actions" },
        el("button", { class: "run-btn", type: "submit", id: "run-btn", text: t.run }),
        el("span", { class: "kbd-hint", text: t.ctrlEnter }),
        el("button", { class: "ghost-btn", type: "button", text: t.reset, onclick: () => selectCommand(c) }))),
    el("div", { id: "result" }));
  updateCli();
  if (lastResult) renderResult(lastResult);
}

function updateCli() {
  const code = $("#cli-text");
  if (code) code.textContent = shellJoin(["elektro", ...buildArgv(current, values)]);
}

function useExample(line) {
  const words = splitWords(line);
  const { values: v } = argvToValues(current, words.slice(current.path.length));
  for (const p of current.params) if (p.kind === "plot" && v[p.name] === undefined) v[p.name] = true;
  values = v;
  lastResult = null;
  renderCommand();
  writeHash();
  run();
}

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && current) { e.preventDefault(); run(); }
});

// ----------------------------------------------------------------- run + results
async function run() {
  if (busy || !current) return;
  const missing = current.params.filter((p) => p.required && (values[p.name] === undefined || values[p.name] === ""));
  document.querySelectorAll(".field.invalid").forEach((f) => f.classList.remove("invalid"));
  if (missing.length) {
    for (const p of missing) document.querySelector(`[data-param="${p.name}"]`)?.classList.add("invalid");
    renderResult({ ok: false, stderr: T().fillRequired, text: "", ansi: "", json: null, files: [] });
    document.querySelector(`#f-${missing[0].name}`)?.focus();
    return;
  }
  busy = true;
  const btn = $("#run-btn");
  btn.disabled = true;
  btn.textContent = T().running;
  try {
    lastResult = await call("run", buildArgv(current, values));
  } catch (err) {
    lastResult = { ok: false, stderr: String(err.message || err), text: "", ansi: "", json: null, files: [] };
  } finally {
    busy = false;
    btn.disabled = false;
    btn.textContent = T().run;
  }
  renderResult(lastResult);
}

function renderResult(r) {
  const t = T();
  objectUrls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  const box = $("#result");
  if (!box) return;
  const msgs = [];
  if (r.stderr) msgs.push(el("div", { class: `msg ${r.ok ? "warn" : "err"}`, text: `${r.ok ? t.warning : t.error}: ${r.stderr.replace(/^(Error|Hata|Fehler|Ошибка):\s*/i, "")}` }));
  if (!r.ok && !r.text) { box.replaceChildren(el("div", { class: "result" }, msgs)); return; }

  const plots = (r.files || []).map((f) => {
    const blob = f.text != null ? new Blob([f.text], { type: f.type })
      : new Blob([Uint8Array.from(atob(f.base64), (ch) => ch.charCodeAt(0))], { type: f.type });
    const url = URL.createObjectURL(blob);
    objectUrls.push(url);
    return el("figure", { class: "plot" },
      f.type === "image/svg+xml" && el("img", { src: url, alt: f.name }),   // <img> never runs SVG scripts
      el("div", { class: "plot-bar" }, el("a", { class: "small-btn", href: url, download: f.name, text: `${t.download} ${f.name}` })));
  });

  const panels = {
    out: () => el("div", {}, el("pre", { class: "term" }), plots.length > 0 && el("div", { class: "plots" }, plots)),
    values: () => valuesView(r.json),
    json: () => el("div", {},
      el("div", { class: "panel-bar" }, el("button", { class: "small-btn", type: "button", text: t.copy,
        onclick: (e) => copy(JSON.stringify(r.json, null, 2), e.target) })),
      el("pre", { class: "json", text: JSON.stringify(r.json, null, 2) })),
  };
  const tabs = [["out", t.output]];
  if (r.json !== null && r.json !== undefined) tabs.push(["values", t.values], ["json", t.json]);
  const panel = el("div", { class: "tab-panel", role: "tabpanel" });
  const show = (key) => {
    panel.replaceChildren(panels[key]());
    if (key === "out") panel.querySelector(".term").innerHTML = ansiToHtml(r.ansi || r.text || "");
    tabBar.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.key === key)));
  };
  const tabBar = el("div", { class: "tabs", role: "tablist" }, tabs.map(([key, label]) =>
    el("button", { class: "tab", type: "button", role: "tab", "data-key": key, text: label, onclick: () => show(key) })));
  box.replaceChildren(el("div", { class: "result" }, msgs, el("div", { class: "card" }, tabBar, panel)));
  show("out");
}

function valuesView(data) {
  const t = T();
  const fmt = (k, v) => {
    if (typeof v !== "number") return Array.isArray(v) ? v.join(", ") : String(v);
    const { unit, si } = splitKey(k);
    return formatSI(v, unit, si);
  };
  const label = (k) => { const s = splitKey(k); return humanize(s.whole ? k : s.label); };
  const isScalar = (v) => v === null || typeof v !== "object" || (Array.isArray(v) && v.every((x) => x === null || typeof x !== "object"));

  const table = (rows, title) => el("div", {},
    title && el("div", { class: "values-title", text: title }),
    el("div", { class: "values-wrap" }, el("table", { class: "values" },
      el("tbody", {}, rows.map(([k, v]) => el("tr", {},
        el("th", { scope: "row", text: label(k) }),
        el("td", { class: "num", text: v === null ? "—" : fmt(k, v) }),
        el("td", { class: "raw", title: t.rawValue, text: typeof v === "number" ? String(v) : "" })))))));

  const listTable = (arr, title) => {
    const cols = [...new Set(arr.flatMap((o) => Object.keys(o)))].filter((k) => arr.some((o) => isScalar(o[k])));
    return el("div", {},
      title && el("div", { class: "values-title", text: title }),
      el("div", { class: "values-wrap" }, el("table", { class: "values" },
        el("thead", {}, el("tr", {}, cols.map((k) => el("th", { text: label(k) })))),
        el("tbody", {}, arr.map((o) => el("tr", {}, cols.map((k) =>
          el("td", { class: "num", text: o[k] === null || o[k] === undefined ? "—" : fmt(k, o[k]) }))))))));
  };

  const walk = (obj, title) => {
    if (Array.isArray(obj)) {
      if (obj.length && obj.every((x) => x && typeof x === "object" && !Array.isArray(x))) return [listTable(obj, title)];
      return [table([[title || "value", obj]], null)];
    }
    if (obj && typeof obj === "object") {
      const scalars = Object.entries(obj).filter(([, v]) => isScalar(v));
      const nested = Object.entries(obj).filter(([, v]) => !isScalar(v));
      return [scalars.length ? table(scalars, title) : null, ...nested.flatMap(([k, v]) => walk(v, humanize(k)))];
    }
    return [table([[title || "value", obj]], null)];
  };
  return el("div", {}, walk(data, null));
}

async function copy(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const old = button.textContent;
    button.textContent = T().copied;
    setTimeout(() => { button.textContent = old; }, 1200);
  } catch { /* clipboard blocked: nothing to do */ }
}

// ----------------------------------------------------------------- language
$("#lang").addEventListener("change", async (e) => {
  const next = e.target.value;
  if (!catalog) { lang = next; store.set("elektro-web-lang", lang); applyChrome(); renderLoading(); return; }
  lang = next;
  store.set("elektro-web-lang", lang);
  applyChrome();
  $("#lang").disabled = true;
  try {
    catalog = await call("setLang", lang);
  } finally {
    $("#lang").disabled = false;
  }
  const keep = current && findCmd(cmdName(current));
  if (keep) { current = keep; renderNav(); renderCommand(); if (lastResult) run(); }
  else goHome();
});

// ----------------------------------------------------------------- boot
applyChrome();
renderLoading();
showProgress("python");
call("init", lang).then((res) => {
  catalog = res.catalog;
  manifest = res.manifest;
  applyChrome();
  $("#loading").hidden = true;
  $("#view").hidden = false;
  renderNav();
  const fromUrl = readHash();
  if (fromUrl) {
    const init = fromUrl.args ? argvToValues(fromUrl.cmd, fromUrl.args).values : null;
    selectCommand(fromUrl.cmd, init, !!fromUrl.args);
  } else {
    goHome();
  }
}).catch((err) => loadFailed(err.message));
