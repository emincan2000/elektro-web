// elektro web — page logic. Forms come from elektro's own command tree (bridge.catalog),
// results from its own --json / terminal output (bridge.run); nothing is re-implemented here.
import {
  argvToValues, buildArgv, shellJoin, splitWords, ansiToHtml, formatSI, splitKey, humanize,
} from "./lib.js";
import { createEditor } from "./editor.js";
import { emptyCircuit } from "./circuit.js";

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
    edSelect: "Seç / taşı",
    edWire: "Kablo",
    edProbe: "Probe",
    edRotate: "Döndür",
    edDelete: "Sil",
    edUndo: "Geri al",
    edRedo: "Yinele",
    edNew: "Yeni devre",
    label: "Etiket",
    edHint: "Kısayollar: C kapasitör · V kaynak · R direnç/döndür · W kablo · L bobin · D diyot · G toprak · Del sil · Çift tık: değer",
    edHintPlace: "Yerleştirmek için ızgaraya tıkla · R veya tekerlek döndürür · Esc vazgeçer",
    edHintWire: "Tıkla: kablo başlat / köşe ekle · aynı noktaya tıkla ya da Esc: bitir",
    edHintProbe: "Düğüme tıkla: gerilim V(…) · elemana tıkla: akım I(…) · tekrar tıklamak kaldırır",
    edWireSel: "Kablo",
    editorTab: "Editör",
    textTab: "elektro görünümü",
    stale: "Devre değişti — güncel sonuç için yeniden simüle et.",
    tuiNote: "Kendi devreni çiz: elemanları paletten ızgaraya sürükle. elektro tui'de kaydettiğin .json ya da bir SPICE netlist de açılabilir.",
    simTitle: "Devre simülasyonu",
    simDesc: "DC, geçici (.tran), AC (.ac) ve DC tarama analizi",
    simLead: "elektro'nun devre çözücüsü: devreni sürükle-bırak ile çiz, hazır bir örnekten başla ya da kendi devre dosyanı (elektro tui'den .json, SPICE netlist) aç. Değerleri, analizi ve probe'ları değiştirip yeniden çöz.",
    openFile: "Dosya aç (.json, .cir…)",
    schematic: "Şema",
    parts: "Elemanlar",
    ref: "Ad",
    kind: "Tür",
    value: "Değer",
    simulate: "Simüle et",
    simulating: "Simüle ediliyor…",
    analysisHint: "boş ya da .op: yalnızca DC çalışma noktası · .tran 5m · .ac dec 50 10 1meg · .dc V1 0 5 0.1",
    netlist: "SPICE netlist",
    netlistHint: "İlk satır başlıktır (SPICE kuralı). Netlist'teki elemanlar ızgaraya otomatik dizilir ve uçlar düğüm etiketleriyle bağlanır.",
    applyNetlist: "Netlist'ten devre kur",
    saveCircuit: "Devre dosyası (.json)",
    saveNetlist: "Netlist (.cir)",
    noParts: "Devrede eleman yok.",
    expandAll: "Tümünü Aç", collapseAll: "Tümünü Kapat", allFolders: "Kategori Klasörleri", featuredTools: "Öne Çıkan Araçlar", explore: "Klasörü Aç",
    cliTitle: "💻 Terminalde de kullan", cliLead: "Aynı komutlar terminalde de çalışır; üstüne TUI, devre editörü, datasheet indirici ve geçmiş gelir.", cliRepo: "GitHub'da elektro →",
    foot: ["elektro CLI", "© Ahmet Enes Kaymak (GPLv3)", "web arayüzünün kaynak kodu", "hesaplar elektro'nun kendi koduyla, Pyodide üzerinde"],
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
    edSelect: "Select / move",
    edWire: "Wire",
    edProbe: "Probe",
    edRotate: "Rotate",
    edDelete: "Delete",
    edUndo: "Undo",
    edRedo: "Redo",
    edNew: "New circuit",
    label: "Label",
    edHint: "Shortcuts: C capacitor · V source · R resistor/rotate · W wire · L inductor · D diode · G ground · Del delete · Double-click: value",
    edHintPlace: "Click on the grid to place · R or wheel rotates · Esc cancels",
    edHintWire: "Click: start a wire / add a corner · click the same point or Esc: finish",
    edHintProbe: "Click a node: voltage V(…) · click a part: current I(…) · click again to remove",
    edWireSel: "Wire",
    editorTab: "Editor",
    textTab: "elektro view",
    stale: "The circuit changed — simulate again for up-to-date results.",
    tuiNote: "Draw your own circuit: drag parts from the palette onto the grid. A .json saved in elektro tui or a SPICE netlist opens too.",
    simTitle: "Circuit simulator",
    simDesc: "DC, transient (.tran), AC (.ac) and DC sweep analysis",
    simLead: "elektro's circuit solver: draw your circuit with drag and drop, start from a ready-made example or open your own circuit file (a .json from elektro tui, a SPICE netlist). Change values, the analysis and probes, then solve again.",
    openFile: "Open file (.json, .cir…)",
    schematic: "Schematic",
    parts: "Components",
    ref: "Name",
    kind: "Type",
    value: "Value",
    simulate: "Simulate",
    simulating: "Simulating…",
    analysisHint: "empty or .op: DC operating point only · .tran 5m · .ac dec 50 10 1meg · .dc V1 0 5 0.1",
    netlist: "SPICE netlist",
    netlistHint: "The first line is the title (SPICE rule). Parts of a netlist are placed on the grid automatically and connected by net labels.",
    applyNetlist: "Build circuit from netlist",
    saveCircuit: "Circuit file (.json)",
    saveNetlist: "Netlist (.cir)",
    noParts: "The circuit has no components.",
    expandAll: "Expand All", collapseAll: "Collapse All", allFolders: "Command Folders", featuredTools: "Featured Tools", explore: "Open Folder",
    cliTitle: "💻 Use it in your terminal", cliLead: "The same commands run in your terminal too, plus the TUI, circuit editor, datasheet downloader and history.", cliRepo: "elektro on GitHub →",
    foot: ["elektro CLI", "© Ahmet Enes Kaymak (GPLv3)", "web UI source", "calculations by elektro's own code, on Pyodide"],
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
    edSelect: "Auswählen / verschieben",
    edWire: "Leitung",
    edProbe: "Messpunkt",
    edRotate: "Drehen",
    edDelete: "Löschen",
    edUndo: "Rückgängig",
    edRedo: "Wiederholen",
    edNew: "Neue Schaltung",
    label: "Label",
    edHint: "Tasten: C Kondensator · V Quelle · R Widerstand/drehen · W Leitung · L Spule · D Diode · G Masse · Entf löschen · Doppelklick: Wert",
    edHintPlace: "Zum Platzieren ins Raster klicken · R oder Mausrad dreht · Esc bricht ab",
    edHintWire: "Klick: Leitung beginnen / Ecke setzen · gleicher Punkt oder Esc: beenden",
    edHintProbe: "Knoten anklicken: Spannung V(…) · Bauteil anklicken: Strom I(…) · erneut klicken entfernt",
    edWireSel: "Leitung",
    editorTab: "Editor",
    textTab: "elektro-Ansicht",
    stale: "Die Schaltung wurde geändert — für aktuelle Ergebnisse erneut simulieren.",
    tuiNote: "Eigene Schaltung zeichnen: Bauteile aus der Palette ins Raster ziehen. Eine in elektro tui gespeicherte .json oder eine SPICE-Netzliste lässt sich ebenfalls öffnen.",
    simTitle: "Schaltungssimulation",
    simDesc: "DC-, Transienten- (.tran), AC- (.ac) und DC-Sweep-Analyse",
    simLead: "Der Schaltungslöser von elektro: Zeichne deine Schaltung per Drag-and-drop, starte mit einem fertigen Beispiel oder öffne eine eigene Schaltungsdatei (.json aus elektro tui, SPICE-Netzliste). Werte, Analyse und Messpunkte ändern und neu lösen.",
    openFile: "Datei öffnen (.json, .cir…)",
    schematic: "Schaltplan",
    parts: "Bauteile",
    ref: "Name",
    kind: "Typ",
    value: "Wert",
    simulate: "Simulieren",
    simulating: "Simuliere…",
    analysisHint: "leer oder .op: nur DC-Arbeitspunkt · .tran 5m · .ac dec 50 10 1meg · .dc V1 0 5 0.1",
    netlist: "SPICE-Netzliste",
    netlistHint: "Die erste Zeile ist der Titel (SPICE-Regel). Bauteile einer Netzliste werden automatisch im Raster platziert und über Netzlabels verbunden.",
    applyNetlist: "Schaltung aus Netzliste erstellen",
    saveCircuit: "Schaltungsdatei (.json)",
    saveNetlist: "Netzliste (.cir)",
    noParts: "Die Schaltung hat keine Bauteile.",
    expandAll: "Alle öffnen", collapseAll: "Alle schließen", allFolders: "Kategorie-Ordner", featuredTools: "Beliebte Werkzeuge", explore: "Ordner öffnen",
    cliTitle: "💻 Auch im Terminal", cliLead: "Dieselben Befehle laufen auch im Terminal – dazu TUI, Schaltungseditor, Datenblatt-Downloader und Verlauf.", cliRepo: "elektro auf GitHub →",
    foot: ["elektro CLI", "© Ahmet Enes Kaymak (GPLv3)", "Quellcode der Weboberfläche", "Berechnungen mit elektros eigenem Code, auf Pyodide"],
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
    edSelect: "Выбор / перемещение",
    edWire: "Провод",
    edProbe: "Пробник",
    edRotate: "Повернуть",
    edDelete: "Удалить",
    edUndo: "Отменить",
    edRedo: "Повторить",
    edNew: "Новая схема",
    label: "Метка",
    edHint: "Клавиши: C конденсатор · V источник · R резистор/поворот · W провод · L катушка · D диод · G земля · Del удалить · Двойной щелчок: значение",
    edHintPlace: "Щёлкните по сетке, чтобы разместить · R или колесо поворачивает · Esc отмена",
    edHintWire: "Щелчок: начать провод / добавить угол · та же точка или Esc: закончить",
    edHintProbe: "Щелчок по узлу: напряжение V(…) · по элементу: ток I(…) · повторный щелчок удаляет",
    edWireSel: "Провод",
    editorTab: "Редактор",
    textTab: "вид elektro",
    stale: "Схема изменилась — запустите моделирование снова для актуальных результатов.",
    tuiNote: "Нарисуйте свою схему: перетащите элементы из палитры на сетку. Также можно открыть .json из elektro tui или SPICE-нетлист.",
    simTitle: "Моделирование схем",
    simDesc: "Анализ DC, переходный (.tran), AC (.ac) и DC-развёртка",
    simLead: "Решатель схем elektro: нарисуйте схему перетаскиванием, начните с готового примера или откройте свой файл схемы (.json из elektro tui, SPICE-нетлист). Меняйте значения, анализ и пробники и решайте заново.",
    openFile: "Открыть файл (.json, .cir…)",
    schematic: "Схема",
    parts: "Компоненты",
    ref: "Имя",
    kind: "Тип",
    value: "Значение",
    simulate: "Моделировать",
    simulating: "Моделирование…",
    analysisHint: "пусто или .op: только рабочая точка DC · .tran 5m · .ac dec 50 10 1meg · .dc V1 0 5 0.1",
    netlist: "SPICE-нетлист",
    netlistHint: "Первая строка — заголовок (правило SPICE). Элементы нетлиста автоматически размещаются на сетке и соединяются метками цепей.",
    applyNetlist: "Собрать схему из нетлиста",
    saveCircuit: "Файл схемы (.json)",
    saveNetlist: "Нетлист (.cir)",
    noParts: "В схеме нет компонентов.",
    expandAll: "Развернуть все", collapseAll: "Свернуть все", allFolders: "Папки категорий", featuredTools: "Популярные инструменты", explore: "Открыть папку",
    cliTitle: "💻 Также в терминале", cliLead: "Те же команды работают и в терминале — плюс TUI, редактор схем, загрузчик даташитов и история.", cliRepo: "elektro на GitHub →",
    foot: ["elektro CLI", "© Ahmet Enes Kaymak (GPLv3)", "исходный код веб-интерфейса", "расчёты — собственный код elektro на Pyodide"],
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
let page = "home";           // "home" | "cmd" | "sim"
let simInfo = null;          // example circuits + elektro's own texts for the simulator page
let sim = null;              // loaded circuit: { name, circuit, schematic, spice, notes, example, pristine }
let simResult = null;
let editor = null;           // drag-and-drop schematic editor (editor.js) on the simulator page
let simView = "editor";      // "editor" | "text" (elektro's own terminal drawing)

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
    el("a", { href: CLI_REPO, text: name, rel: "noopener" }), ` ${author}`,
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

function panelIcon(panel) {
  const p = (panel || "").toLowerCase();
  if (p.includes("basic") || p.includes("temel") || p.includes("grund") || p.includes("основ")) return "⚡";
  if (p.includes("passiv") || p.includes("пассив")) return "🎛️";
  if (p.includes("power") || p.includes("güç") || p.includes("strom") || p.includes("pitani") || p.includes("питани") || p.includes("wiring") || p.includes("kablo")) return "🔌";
  if (p.includes("install") || p.includes("tesisat") || p.includes("machin") || p.includes("makine") || p.includes("maschin") || p.includes("машин")) return "⚙️";
  if (p.includes("signal") || p.includes("sinyal") || p.includes("rf") || p.includes("funk") || p.includes("сигнал")) return "📡";
  if (p.includes("embed") || p.includes("gömülü") || p.includes("встраив")) return "💻";
  if (p.includes("tool") || p.includes("araç") || p.includes("werkzeug") || p.includes("инструмент")) return "🛠️";
  return "📁";
}

function renderNav() {
  const q = $("#search").value.trim().toLowerCase();
  const nav = $("#nav");
  nav.replaceChildren();

  const tb = el("div", { class: "nav-toolbar" },
    el("button", {
      type: "button", class: "nav-tool-btn",
      text: T().expandAll || "Tümünü Aç",
      onclick: () => {
        nav.querySelectorAll("details.nav-folder").forEach((d) => { d.open = true; });
      }
    }),
    el("button", {
      type: "button", class: "nav-tool-btn",
      text: T().collapseAll || "Tümünü Kapat",
      onclick: () => {
        nav.querySelectorAll("details.nav-folder").forEach((d) => { d.open = false; });
      }
    })
  );
  nav.append(tb);

  let shown = 0;
  if (simInfo) {
    const words = ["sim", "examples", T().simTitle, T().simDesc, simInfo.texts.title, ...simInfo.examples.map((e) => e.title)].join(" ").toLowerCase();
    if (!q || words.includes(q)) {
      shown++;
      nav.append(el("details", { class: "nav-group nav-folder nav-folder-sim", open: true },
        el("summary", { class: "nav-folder-head" },
          el("span", { class: "nav-folder-icon", ariaHidden: "true", text: "🔬" }),
          el("h2", { class: "nav-folder-title", text: T().simTitle }),
          el("span", { class: "nav-folder-badge", text: "sim" }),
          el("span", { class: "nav-folder-chevron", ariaHidden: "true", text: "▾" })),
        el("div", { class: "nav-folder-items" },
          el("button", {
            class: "nav-item nav-sim", type: "button", "aria-current": page === "sim" ? "page" : null,
            onclick: () => { openSim(); toggleMenu(false); },
          },
          el("div", { class: "nav-item-body" },
            el("span", { class: "cmd", text: "sim" }),
            el("span", { class: "desc", text: T().simDesc })),
          el("span", { class: "nav-tag", text: "Interactive" })))));
    }
  }

  for (const panel of catalog.panels) {
    const allPanelItems = catalog.commands.filter((c) => c.panel === panel);
    const items = allPanelItems.filter((c) =>
      !q || cmdName(c).includes(q) || c.help.toLowerCase().includes(q) || c.group_help.toLowerCase().includes(q));
    if (!items.length) continue;
    shown += items.length;

    const hasActive = current && items.some((c) => cmdName(current) === cmdName(c));
    const isFolderOpen = Boolean(q || hasActive || true);

    nav.append(el("details", {
      class: `nav-group nav-folder${hasActive ? " has-active" : ""}`,
      open: isFolderOpen,
      "data-panel": panel || "elektro"
    },
      el("summary", { class: "nav-folder-head" },
        el("span", { class: "nav-folder-icon", ariaHidden: "true", text: panelIcon(panel) }),
        el("h2", { class: "nav-folder-title", text: panel || "elektro" }),
        el("span", { class: "nav-folder-badge", text: String(items.length) }),
        el("span", { class: "nav-folder-chevron", ariaHidden: "true", text: "▾" })),
      el("div", { class: "nav-folder-items" },
        items.map((c) => {
          const isActive = current && cmdName(current) === cmdName(c);
          return el("button", {
            class: `nav-item${isActive ? " active" : ""}`, type: "button",
            "aria-current": isActive ? "page" : null,
            onclick: () => { selectCommand(c); toggleMenu(false); },
          },
          el("div", { class: "nav-item-body" },
            el("span", { class: "cmd", text: cmdName(c) }),
            el("span", { class: "desc", text: firstLine(c.help) })));
        }))));
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
  if (page === "sim") { history.replaceState(null, "", simHash()); return; }
  if (!current) { history.replaceState(null, "", location.pathname + location.search); return; }
  const argv = buildArgv(current, values).slice(current.path.length);
  const q = argv.length ? "?" + new URLSearchParams({ a: shellJoin(argv) }) : "";
  history.replaceState(null, "", `#${encodeURIComponent(cmdName(current))}${q}`);
}
function readHash() {
  const h = location.hash.slice(1);
  if (!h) return null;
  const [name, query] = h.split("?");
  if (name === "sim") return { sim: new URLSearchParams(query || "") };
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
  if (target.sim) return openSimFromParams(target.sim);
  selectCommand(target.cmd, target.args ? argvToValues(target.cmd, target.args).values : null, !!target.args);
});

// ----------------------------------------------------------------- home
const CLI_REPO = "https://github.com/0anes0/elektro";
const CLI_INSTALL = "pipx install elektro-cli";

function homeCli(t) {
  const btn = el("button", { class: "small-btn", type: "button", text: t.copy });
  btn.addEventListener("click", () => copy(CLI_INSTALL, btn));
  return el("div", { class: "card home-cli" },
    el("div", { class: "home-cli-text" },
      el("h2", { text: t.cliTitle }),
      el("p", { text: t.cliLead })),
    el("div", { class: "home-cli-actions" },
      el("div", { class: "cli" },
        el("span", { class: "prompt", text: "$" }),
        el("code", { text: CLI_INSTALL }),
        btn),
      el("a", { class: "home-cli-link", href: CLI_REPO, target: "_blank", rel: "noopener", text: t.cliRepo })));
}

function goHome() {
  page = "home";
  current = null;
  writeHash();
  renderNav();
  const view = $("#view");
  const t = T();
  const featured = FEATURED.map(findCmd).filter(Boolean);

  // Group commands by panel for Category Folder cards
  const panelCards = catalog.panels.map((p) => {
    const cmds = catalog.commands.filter((c) => c.panel === p);
    return el("div", { class: "card home-folder-card" },
      el("div", { class: "home-folder-head" },
        el("span", { class: "home-folder-icon", ariaHidden: "true", text: panelIcon(p) }),
        el("div", { class: "home-folder-info" },
          el("h3", { class: "home-folder-title", text: p }),
          el("span", { class: "home-folder-meta", text: `${cmds.length} ${t.commands}` })),
        el("button", {
          class: "small-btn home-folder-open",
          type: "button",
          text: t.explore || "Klasörü Aç",
          onclick: () => {
            const folder = $(`details.nav-folder[data-panel="${CSS.escape(p)}"]`);
            if (folder) {
              folder.open = true;
              folder.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            if (cmds[0]) selectCommand(cmds[0]);
          }
        })),
      el("div", { class: "home-folder-chips" },
        cmds.slice(0, 4).map((c) => el("button", {
          class: "chip", type: "button", text: cmdName(c), onclick: () => selectCommand(c)
        }))));
  });

  setKids(view, el("div", { class: "home" },
    el("div", { class: "home-hero" },
      el("div", { class: "hero-badge" },
        el("span", { class: "bolt", text: "⚡" }),
        el("span", { text: "WebAssembly + Pyodide Powered · Local & Private" })),
      el("h1", { text: t.homeTitle }),
      el("p", { class: "lead", text: t.homeLead }),
      el("div", { class: "badges" },
        el("span", { class: "badge", text: `${catalog.commands.length} ${t.commands}` }),
        manifest ? el("span", { class: "badge", text: `elektro v${manifest.elektro}` }) : false,
        el("span", { class: "badge", text: "Pyodide · WebAssembly" }),
        el("span", { class: "badge", text: `${catalog.panels.length} Kategori Klasörü` }),
        el("span", { class: "badge", text: `${simInfo?.examples.length ?? "15+"} Örnek Devre` }))),

    // The same toolkit as a terminal program: install command + link to its repository
    homeCli(t),

    // Circuit Simulator Hero Spotlight
    el("div", { class: "card home-sim-spotlight", onclick: () => openSim() },
      el("div", { class: "sim-spotlight-left" },
        el("span", { class: "spotlight-pill", text: "Interactive Tool" }),
        el("h2", { text: `🔬 ${t.simTitle}` }),
        el("p", { text: t.simLead || t.simDesc }),
        el("div", { class: "spotlight-tags" },
          el("span", { class: "badge", text: "DC Operating Point" }),
          el("span", { class: "badge", text: "Transient (.tran)" }),
          el("span", { class: "badge", text: "AC Frequency (.ac)" }),
          el("span", { class: "badge", text: "SPICE Netlist" }),
          el("span", { class: "badge", text: "Şema Çizici" }))),
      el("button", { class: "run-btn spotlight-btn", type: "button", text: t.simulate || "Simülatörü Aç" })),

    // Category Folders Section
    el("div", { class: "home-section" },
      el("div", { class: "section-head" },
        el("h2", { text: `📁 ${t.allFolders || "Kategori Klasörleri"}` }),
        el("p", { class: "section-desc", text: "Tüm mühendislik araçları çalışma alanlarına göre klasörlendi." })),
      el("div", { class: "home-folders-grid" }, panelCards)),

    // Featured Tools Section (Keeps .home-grid, .home-card, .home-sim for backward compatibility & e2e)
    el("div", { class: "home-section" },
      el("div", { class: "section-head" },
        el("h2", { text: `⚡ ${t.featuredTools || "Öne Çıkan Araçlar"}` }),
        el("p", { class: "section-desc", text: t.start })),
      el("div", { class: "home-grid" },
        el("button", {
          class: "card home-card home-sim", type: "button", onclick: () => openSim(),
        }, el("div", { class: "cmd", text: `sim · ${t.simTitle}` }), el("div", { class: "desc", text: t.simDesc })),
        featured.map((c) => el("button", {
          class: "card home-card", type: "button", onclick: () => selectCommand(c),
        }, el("div", { class: "cmd", text: cmdName(c) }), el("div", { class: "desc", text: firstLine(c.help) })))))));

  $("#main").focus({ preventScroll: true });
}

// ----------------------------------------------------------------- command view
function defaultValues(cmd) {
  const v = {};
  for (const p of cmd.params) if (p.kind === "plot") v[p.name] = true;    // graphs are the web's bonus
  return v;
}

function selectCommand(cmd, initial = null, autorun = false) {
  page = "cmd";
  current = cmd;
  values = initial ?? defaultValues(cmd);
  lastResult = null;
  renderNav();
  const folder = $(`details.nav-folder[data-panel="${CSS.escape(cmd.panel || "elektro")}"]`);
  if (folder) folder.open = true;
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
    el("div", { class: "crumb" },
      el("span", { class: "crumb-icon", ariaHidden: "true", text: panelIcon(c.panel) }),
      ` ${c.panel} `,
      el("span", { class: "crumb-sep", text: "›" }),
      ` `,
      el("span", { class: "crumb-current", text: cmdName(c) })),
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
  if (!(e.ctrlKey || e.metaKey) || e.key !== "Enter") return;
  if (page === "sim") { e.preventDefault(); simRun(); }
  else if (current) { e.preventDefault(); run(); }
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

function renderResult(r, { values: withValues = true } = {}) {
  const t = T();
  objectUrls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  const box = $("#result");
  if (!box) return;
  const msgs = [];
  if (r.stderr) msgs.push(el("div", { class: `msg ${r.ok ? "warn" : "err"}`, text: `${r.ok ? t.warning : t.error}: ${r.stderr.replace(/^(Error|Hata|Fehler|Ошибка|Warning|Uyarı|Warnung|Предупреждение):\s*/i, "")}` }));
  if (!r.ok && !r.text) { box.replaceChildren(el("div", { class: "result" }, msgs)); return; }

  const plots = (r.files || []).map((f) => {
    const blob = f.text != null ? new Blob([f.text], { type: f.type })
      : new Blob([Uint8Array.from(atob(f.base64), (ch) => ch.charCodeAt(0))], { type: f.type });
    const url = URL.createObjectURL(blob);
    objectUrls.push(url);
    if (f.type !== "image/svg+xml") return el("a", { class: "small-btn", href: url, download: f.name, text: `${t.download} ${f.name}` });
    return el("figure", { class: "plot" },
      el("img", { src: url, alt: f.name }),   // <img> never runs SVG scripts
      el("div", { class: "plot-bar" }, el("a", { class: "small-btn", href: url, download: f.name, text: `${t.download} ${f.name}` })));
  });
  const figures = plots.filter((n) => n.tagName === "FIGURE");
  const fileLinks = plots.filter((n) => n.tagName === "A");

  const panels = {
    out: () => el("div", {}, el("pre", { class: "term" }),
      figures.length > 0 && el("div", { class: "plots" }, figures),
      fileLinks.length > 0 && el("div", { class: "file-links" }, fileLinks)),
    values: () => valuesView(r.json),
    json: () => el("div", {},
      el("div", { class: "panel-bar" }, el("button", { class: "small-btn", type: "button", text: t.copy,
        onclick: (e) => copy(JSON.stringify(r.json, null, 2), e.target) })),
      el("pre", { class: "json", text: JSON.stringify(r.json, null, 2) })),
  };
  const tabs = [["out", t.output]];
  if (r.json !== null && r.json !== undefined) {
    if (withValues) tabs.push(["values", t.values]);
    tabs.push(["json", t.json]);
  }
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

// ----------------------------------------------------------------- circuit simulator
// The page edits elektro's own circuit file (the .json `elektro tui` saves) and solves it with
// `elektro sim`; the schematic is drawn by elektro's own renderer (bridge.sim_*).
const SIM_DEFAULT = "rc_lowpass";
const ANALYSIS_PRESETS = [".op", ".tran 5m", ".tran 1u 10m", ".ac dec 50 10 1meg", ".dc V1 0 10 0.1"];

const b64url = (text) => btoa(String.fromCharCode(...new TextEncoder().encode(text)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s) => new TextDecoder().decode(Uint8Array.from(
  atob(s.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0)));
const circuitText = (c) => JSON.stringify(c, null, 2) + "\n";     // the layout elektro writes

function simHash() {
  if (!sim) return "#sim";
  const now = JSON.stringify(sim.circuit);
  if (sim.example && now === sim.pristine) return `#sim?ex=${encodeURIComponent(sim.example)}`;
  return `#sim?${new URLSearchParams({ n: sim.name, c: b64url(now) })}`;
}

async function openSimFromParams(params) {
  const c = params.get("c");
  if (c) {
    let text = null;
    try { text = unb64url(c); } catch { /* broken link: fall back to the default example */ }
    if (text) return openSim({ source: "json", value: text, name: params.get("n") || "circuit" }, true);
  }
  return openSim({ source: "example", value: params.get("ex") || SIM_DEFAULT }, true);
}

/** Show the simulator; `load` picks a circuit (default: the current one or the RC low-pass). */
async function openSim(load = null, autorun = false) {
  page = "sim";
  current = null;
  renderNav();
  $("#main").focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
  if (load || !sim) {
    if (!(await simLoad(load || { source: "example", value: SIM_DEFAULT }))) return;
    if (autorun || !load) return simRun();
  }
  renderSim();
  if (simResult) renderSimResult();
}

/** Load a circuit through elektro (example / uploaded file / netlist / .json); false on error. */
async function simLoad({ source, value, name }) {
  let r;
  try {
    r = source === "new"
      ? { ok: true, name: "circuit", circuit: emptyCircuit(), schematic: "", spice: "", notes: [] }
      : await call("simLoad", source, value, name);
  } catch (err) {
    r = { ok: false, stderr: String(err.message || err) };
  }
  if (!r.ok) {
    if (!sim) await simLoad({ source: "example", value: SIM_DEFAULT });
    renderSim();
    renderResult({ ok: false, stderr: r.stderr, text: "", ansi: "", json: null, files: [] });
    return false;
  }
  sim = { name: r.name, circuit: r.circuit, schematic: r.schematic, spice: r.spice, notes: r.notes,
    example: source === "example" ? value : null, pristine: JSON.stringify(r.circuit) };
  simResult = null;
  renderSim();
  writeHash();
  return true;
}

function simChanged() {
  writeHash();
  updateSimCli();
}

/** elektro's short explanation of the loaded example circuit ("" for own circuits / older elektro). */
const exampleDesc = () => (sim.example && simInfo.examples.find((e) => e.name === sim.example)?.desc) || "";

function renderSim() {
  const t = T(), x = simInfo.texts;
  const help = x.help.split("\n\n");
  const groups = [];
  for (const ex of simInfo.examples) {
    let g = groups.find((k) => k.title === ex.category_title);
    if (!g) groups.push(g = { title: ex.category_title, items: [] });
    g.items.push(ex);
  }
  const view = $("#view");
  setKids(view,
    el("div", { class: "crumb", text: "elektro sim · elektro examples" }),
    el("h1", { class: "cmd-title", text: t.simTitle }),
    el("p", { class: "lead", text: t.simLead }),
    el("p", { class: "help-text", text: help.slice(1).join("\n\n") }),
    el("div", { class: "sim-examples" },
      el("div", { class: "label", text: `${x.examples} (${simInfo.examples.length})` }),
      // one folder per category, like `elektro examples`; the current example's folder starts open
      groups.map((g) => el("details", { class: "ex-group", open: g.items.some((ex) => ex.name === sim.example) },
        el("summary", {},
          el("span", { class: "ex-group-title", text: g.title }),
          el("span", { class: "ex-group-count", text: String(g.items.length) })),
        el("div", { class: "chips" }, g.items.map((ex) => el("button", {
          class: "chip", type: "button", "data-example": ex.name, text: ex.title, title: ex.desc || ex.name,
          "aria-pressed": String(sim.example === ex.name),
          onclick: () => simLoad({ source: "example", value: ex.name }).then((ok) => ok && simRun()),
        })))))),
    el("div", { class: "sim-tools" },
      el("label", { class: "small-btn file-btn" }, t.openFile, el("input", {
        id: "sim-file", type: "file", accept: ".json,.cir,.sp,.spi,.spice,.net,.ckt", class: "visually-hidden",
        onchange: async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          const path = await call("upload", f.name, await f.arrayBuffer());
          if (await simLoad({ source: "file", value: path })) simRun();
        },
      })),
      el("button", { class: "small-btn", type: "button", id: "sim-new", text: `+ ${t.edNew}`,
        onclick: () => simLoad({ source: "new" }).then(() => { simView = "editor"; showSimView(); }) }),
      el("span", { class: "hint", text: t.tuiNote })),
    sim.notes.length > 0 && el("div", { class: "msg warn", text: sim.notes.join("\n") }),
    el("form", { class: "card sim-card", id: "sim-form", onsubmit: (e) => { e.preventDefault(); simRun(); } },
      el("div", { class: "sim-head" },
        el("h2", { text: t.schematic }),
        el("code", { class: "sim-name", text: `${sim.name}.json` }),
        el("div", { class: "seg", role: "tablist" },
          [["editor", t.editorTab], ["text", t.textTab]].map(([k, label]) => el("button", {
            type: "button", role: "tab", class: "seg-btn", "data-view": k, text: label, "aria-selected": String(simView === k),
            onclick: () => { simView = k; showSimView(); },
          })))),
      exampleDesc() && el("p", { class: "sim-desc", text: exampleDesc() }),
      el("div", { id: "sim-editor" }),
      el("pre", { class: "term schematic", id: "sim-schematic" }),
      el("h2", { text: t.parts }),
      el("div", { id: "sim-parts" }),
      el("div", { class: "fields sim-fields" },
        el("div", { class: "field" },
          el("label", { for: "sim-analysis" }, x.analysis, el("span", { class: "opt", text: "-a" })),
          el("input", {
            id: "sim-analysis", type: "text", value: sim.circuit.analysis || "", list: "sim-presets",
            spellcheck: "false", autocomplete: "off", placeholder: ".op",
            oninput: (e) => { sim.circuit.analysis = e.target.value.trim(); simChanged(); },
          }),
          el("datalist", { id: "sim-presets" }, ANALYSIS_PRESETS.map((a) => el("option", { value: a }))),
          el("div", { class: "hint", text: t.analysisHint })),
        el("div", { class: "field" },
          el("label", { for: "sim-probes" }, x.probes, el("span", { class: "opt", text: "-p" })),
          el("input", {
            id: "sim-probes", type: "text", value: sim.circuit.probes.join(" "), spellcheck: "false", autocomplete: "off",
            oninput: (e) => { sim.circuit.probes = e.target.value.split(/\s+/).filter(Boolean); editor?.redraw(); simChanged(); },
          }),
          el("div", { class: "hint", text: `${x.probe_hint.replace(/^[^:]*:\s*/, "")} (${t.words})` }))),
      el("div", { class: "cli" },
        el("span", { class: "prompt", text: "$" }),
        el("code", { id: "cli-text" }),
        el("button", { class: "small-btn", type: "button", text: t.copy, onclick: (e) => copy($("#cli-text").textContent, e.target) })),
      el("div", { class: "actions" },
        el("button", { class: "run-btn", type: "submit", id: "run-btn", text: t.simulate }),
        el("span", { class: "kbd-hint", text: t.ctrlEnter }),
        el("button", { class: "small-btn", type: "button", id: "sim-save", text: `↓ ${t.saveCircuit}`, title: t.download,
          onclick: () => saveText(`${sim.name}.json`, circuitText(sim.circuit), "application/json") }),
        el("button", { class: "small-btn", type: "button", text: `↓ ${t.saveNetlist}`, title: t.download,
          onclick: () => saveText(`${sim.name}.cir`, sim.spice, "text/plain") }),
        sim.example && JSON.stringify(sim.circuit) !== sim.pristine && el("button", {
          class: "ghost-btn", type: "button", text: t.reset,
          onclick: () => simLoad({ source: "example", value: sim.example }).then((ok) => ok && simRun()),
        }))),
    el("details", { class: "card netlist" },
      el("summary", { text: t.netlist }),
      el("p", { class: "hint", text: t.netlistHint }),
      el("textarea", { id: "sim-netlist", rows: "10", spellcheck: "false", autocomplete: "off" }),
      el("div", { class: "actions" },
        el("button", { class: "small-btn", type: "button", id: "sim-netlist-apply", text: t.applyNetlist,
          onclick: () => simLoad({ source: "spice", value: $("#sim-netlist").value, name: sim.name }).then((ok) => ok && simRun()) }))),
    el("div", { id: "result" }));
  $("#sim-schematic").innerHTML = ansiToHtml(sim.schematic);
  $("#sim-netlist").value = sim.spice;
  editor = createEditor({
    host: $("#sim-editor"), ui: t, texts: x, modelTypes: simInfo.model_types,
    onChange: (what) => {
      if (what === "new") {
        sim.name = "circuit";
        sim.example = null;
        $(".sim-name").textContent = "circuit.json";
        $(".sim-desc")?.remove();
        document.querySelectorAll(".chip[data-example]").forEach((b) => b.setAttribute("aria-pressed", "false"));
      }
      renderParts();
      const probes = $("#sim-probes");
      if (probes && document.activeElement !== probes) probes.value = sim.circuit.probes.join(" ");
      markStale();
      simChanged();
    },
  });
  editor.load(sim.circuit);
  if (simResult?.node_voltages) editor.setOverlay(simResult.node_voltages, simResult.net_points);
  renderParts();
  showSimView();
  updateSimCli();
}

function showSimView() {
  document.querySelectorAll(".seg-btn").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === simView)));
  $("#sim-editor").hidden = simView !== "editor";
  $("#sim-schematic").hidden = simView !== "text";
}

/** Value table of the parts (kept in step with the drawing). */
function renderParts() {
  const t = T(), x = simInfo.texts;
  const host = $("#sim-parts");
  if (!host) return;
  const parts = sim.circuit.components.map((c, i) => ({ c, i })).filter(({ c }) => c.kind in x.hints);
  const row = ({ c, i }) => el("tr", { "data-ref": c.ref },
    el("th", { scope: "row", text: c.ref }),
    el("td", { class: "kind", text: x.kinds[c.kind] }),
    el("td", {}, el("input", {
      type: "text", value: c.value, spellcheck: "false", autocomplete: "off", "aria-label": `${c.ref} ${t.value}`,
      title: x.hints[c.kind], placeholder: x.hints[c.kind],
      oninput: (e) => {
        sim.circuit.components[i].value = e.target.value;
        e.target.closest("tr").classList.remove("invalid");
        editor?.redraw();
        markStale();
        simChanged();
      },
    })));
  setKids(host, parts.length
    ? el("div", { class: "values-wrap" }, el("table", { class: "values parts" },
      el("thead", {}, el("tr", {}, el("th", { text: t.ref }), el("th", { text: t.kind }), el("th", { text: t.value }))),
      el("tbody", {}, parts.map(row))))
    : el("p", { class: "no-params", text: t.noParts }));
}

/** Results shown below belong to the circuit before the last edit. */
function markStale() {
  const res = $("#result .result");
  if (!res || res.classList.contains("stale")) return;
  res.classList.add("stale");
  res.prepend(el("div", { class: "msg warn stale-note", text: T().stale }));
}

function updateSimCli() {
  const code = $("#cli-text");
  if (!code || !sim) return;
  const argv = ["elektro", "sim", `${sim.name}.json`, "--plot", `${sim.name}.svg`];
  if ((sim.circuit.analysis || "").trim()) argv.push("--csv", `${sim.name}.csv`);
  code.textContent = shellJoin(argv);
}

function saveText(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function simRun() {
  if (busy || !sim || page !== "sim") return;
  busy = true;
  const btn = $("#run-btn");
  btn.disabled = true;
  btn.textContent = T().simulating;
  document.querySelectorAll(".parts tr.invalid").forEach((tr) => tr.classList.remove("invalid"));
  try {
    simResult = await call("simRun", { name: sim.name, circuit: sim.circuit });
  } catch (err) {
    simResult = { ok: false, stderr: String(err.message || err), text: "", ansi: "", json: null, files: [] };
  } finally {
    busy = false;
    btn.disabled = false;
    btn.textContent = T().simulate;
  }
  if (simResult.schematic !== undefined) {
    sim.schematic = simResult.schematic;
    sim.spice = simResult.spice;
    $("#sim-schematic").innerHTML = ansiToHtml(sim.schematic);
    $("#sim-netlist").value = sim.spice;
  }
  editor?.setOverlay(simResult.node_voltages || null, simResult.net_points || null);
  renderSimResult();
}

function renderSimResult() {
  const r = simResult;
  for (const ref of r.invalid || []) document.querySelector(`.parts tr[data-ref="${CSS.escape(ref)}"]`)?.classList.add("invalid");
  renderResult({ text: "", ansi: "", json: null, files: [], ...r }, { values: !Array.isArray(r.json?.x) });
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
    simInfo = await call("simInfo");
  } finally {
    $("#lang").disabled = false;
  }
  if (page === "sim") { renderNav(); renderSim(); if (simResult) simRun(); return; }
  const keep = current && findCmd(cmdName(current));
  if (keep) { current = keep; renderNav(); renderCommand(); if (lastResult) run(); }
  else goHome();
});

// ----------------------------------------------------------------- boot
applyChrome();
renderLoading();
showProgress("python");
call("init", lang).then(async (res) => {
  catalog = res.catalog;
  manifest = res.manifest;
  simInfo = await call("simInfo");
  applyChrome();
  $("#loading").hidden = true;
  $("#view").hidden = false;
  renderNav();
  const fromUrl = readHash();
  if (fromUrl?.sim) {
    openSimFromParams(fromUrl.sim);
  } else if (fromUrl) {
    const init = fromUrl.args ? argvToValues(fromUrl.cmd, fromUrl.args).values : null;
    selectCommand(fromUrl.cmd, init, !!fromUrl.args);
  } else {
    goHome();
  }
}).catch((err) => loadFailed(err.message));
