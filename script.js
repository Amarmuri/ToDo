import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Publishable key – darf im Frontend stehen, Daten sind per Row-Level-Security geschützt.
const SUPABASE_URL = "https://bjzhmjvwcamdwfsxlpga.supabase.co";
const SUPABASE_KEY = "sb_publishable_KbAcwH7AcNmbqqTaBTXCoA_kAaj3uI7";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ===================== State =====================
const state = {
  user: null,
  todos: [],
  filter: "all",
  category: null,
  search: "",
  sort: "smart",
  authMode: "login",
};

const $ = (sel) => document.querySelector(sel);
const DAY = 86400000;

// ===================== Helpers =====================
const isoDay = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
const todayIso = () => isoDay(new Date());
const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtShort = (s) => parseDay(s).toLocaleDateString("de-DE", { day: "2-digit", month: "short" });

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
}

let toastTimer;
function toast(msg, isError = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("error", isError);
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

function dueStatus(todo) {
  if (!todo.due_date || todo.completed) return null;
  const t = todayIso();
  if (todo.due_date < t) return "overdue";
  if (todo.due_date === t) return "today";
  return "future";
}

// ===================== Theme =====================
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem("fokus-theme", theme); } catch {}
}
(() => {
  let saved = null;
  try { saved = localStorage.getItem("fokus-theme"); } catch {}
  applyTheme(saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
})();
$("#theme-toggle").addEventListener("click", () =>
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark")
);

// ===================== Auth =====================
document.querySelectorAll(".tab").forEach((tab) =>
  tab.addEventListener("click", () => {
    state.authMode = tab.dataset.mode;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    $("#auth-submit").textContent = state.authMode === "login" ? "Anmelden" : "Konto erstellen";
    $("#auth-password").autocomplete = state.authMode === "login" ? "current-password" : "new-password";
    setAuthMsg("");
  })
);

function setAuthMsg(msg, type = "error") {
  const m = $("#auth-msg");
  m.textContent = msg;
  m.className = `auth-msg ${type}`;
}

const AUTH_ERRORS = {
  "Invalid login credentials": "E-Mail oder Passwort ist falsch.",
  "Email not confirmed": "Bitte bestätige zuerst deine E-Mail-Adresse.",
  "User already registered": "Diese E-Mail ist bereits registriert.",
};

$("#auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#auth-email").value.trim();
  const password = $("#auth-password").value;
  const btn = $("#auth-submit");
  btn.disabled = true;
  setAuthMsg("");

  const { data, error } =
    state.authMode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });

  btn.disabled = false;
  if (error) return setAuthMsg(AUTH_ERRORS[error.message] || error.message);
  if (state.authMode === "signup" && !data.session) {
    setAuthMsg("Fast geschafft! Bestätige den Link in deiner E-Mail und melde dich dann an.", "ok");
  }
});

$("#logout-btn").addEventListener("click", () => supabase.auth.signOut());

let authReady = false;
supabase.auth.onAuthStateChange((_event, session) => {
  const newUser = session?.user ?? null;
  if (authReady && newUser?.id === state.user?.id) return;
  authReady = true;
  state.user = newUser;
  // Supabase-Aufrufe nicht direkt im Callback ausführen (vermeidet Deadlocks)
  setTimeout(() => (state.user ? enterApp() : showAuth()), 0);
});

function showAuth() {
  state.todos = [];
  $("#app-view").classList.add("hidden");
  $("#auth-view").classList.remove("hidden");
  $("#auth-form").reset();
  $("#loader").classList.add("gone");
}

async function enterApp() {
  $("#auth-view").classList.add("hidden");
  $("#app-view").classList.remove("hidden");
  setGreeting();
  await loadTodos();
  $("#loader").classList.add("gone");
}

function setGreeting() {
  const h = new Date().getHours();
  const hi = h < 5 ? "Gute Nacht" : h < 11 ? "Guten Morgen" : h < 17 ? "Hallo" : h < 22 ? "Guten Abend" : "Gute Nacht";
  const name = state.user.email.split("@")[0];
  $("#greeting-text").textContent = `${hi}, ${name}`;
  $("#today-text").textContent = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
}

// ===================== Data =====================
async function loadTodos() {
  const { data, error } = await supabase.from("todos").select("*").order("created_at", { ascending: false });
  if (error) return toast("Laden fehlgeschlagen: " + error.message, true);
  state.todos = data;
  render();
}

async function addTodo(todo) {
  const { data, error } = await supabase.from("todos").insert(todo).select().single();
  if (error) return toast("Speichern fehlgeschlagen: " + error.message, true);
  state.todos.unshift(data);
  render();
}

async function updateTodo(id, patch) {
  const idx = state.todos.findIndex((t) => t.id === id);
  const prev = { ...state.todos[idx] };
  state.todos[idx] = { ...prev, ...patch }; // optimistisch
  render();
  const { error } = await supabase.from("todos").update(patch).eq("id", id);
  if (error) {
    state.todos[idx] = prev;
    render();
    toast("Änderung fehlgeschlagen: " + error.message, true);
  }
}

async function deleteTodos(ids) {
  const prev = state.todos;
  state.todos = state.todos.filter((t) => !ids.includes(t.id));
  render();
  const { error } = await supabase.from("todos").delete().in("id", ids);
  if (error) {
    state.todos = prev;
    render();
    toast("Löschen fehlgeschlagen: " + error.message, true);
  }
}

// ===================== Form =====================
$("#todo-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("#todo-title").value.trim();
  if (!title) return;
  const category = $("#todo-category").value.trim() || "Allgemein";
  const priority = Number(document.querySelector('input[name="prio"]:checked').value);
  const due_date = $("#todo-due").value || null;
  $("#todo-title").value = "";
  $("#todo-title").focus();
  await addTodo({ title, category, priority, due_date });
});

document.querySelectorAll("#filters .chip").forEach((chip) =>
  chip.addEventListener("click", () => {
    state.filter = chip.dataset.filter;
    render();
  })
);
$("#search").addEventListener("input", (e) => { state.search = e.target.value.toLowerCase(); render(); });
$("#sort").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
$("#clear-done").addEventListener("click", () => {
  const ids = state.todos.filter((t) => t.completed).map((t) => t.id);
  if (!ids.length) return toast("Keine erledigten Aufgaben vorhanden.");
  if (confirm(`${ids.length} erledigte Aufgabe(n) endgültig löschen?`)) deleteTodos(ids);
});

// ===================== Render: List =====================
const FILTERS = {
  all: () => true,
  open: (t) => !t.completed,
  done: (t) => t.completed,
  today: (t) => !t.completed && t.due_date === todayIso(),
  overdue: (t) => dueStatus(t) === "overdue",
};

const SORTS = {
  smart: (a, b) =>
    a.completed - b.completed ||
    (a.due_date || "9999") .localeCompare(b.due_date || "9999") ||
    b.priority - a.priority ||
    b.created_at.localeCompare(a.created_at),
  due: (a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"),
  prio: (a, b) => b.priority - a.priority || a.completed - b.completed,
  new: (a, b) => b.created_at.localeCompare(a.created_at),
};

const CHECK_SVG = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PRIO_LABEL = { 1: "Niedrig", 2: "Mittel", 3: "Hoch" };

function renderList() {
  // Filter-Chips mit Zählern
  document.querySelectorAll("#filters .chip").forEach((chip) => {
    const f = chip.dataset.filter;
    chip.classList.toggle("active", f === state.filter);
    const n = state.todos.filter(FILTERS[f]).length;
    const label = chip.textContent.replace(/\s*\d+$/, "");
    chip.replaceChildren(label, el("span", { class: "count" }, String(n)));
  });

  let items = state.todos.filter(FILTERS[state.filter]);
  if (state.category) items = items.filter((t) => t.category === state.category);
  if (state.search) items = items.filter((t) => (t.title + " " + t.category).toLowerCase().includes(state.search));
  items.sort(SORTS[state.sort]);

  const list = $("#todo-list");
  list.replaceChildren(...items.map(renderItem));
  $("#empty").classList.toggle("hidden", items.length > 0);

  const catInfo = state.category ? ` in „${state.category}“` : "";
  $("#list-count").replaceChildren(
    `${items.length} Aufgabe${items.length === 1 ? "" : "n"}${catInfo}`,
    ...(state.category
      ? [el("button", { class: "btn ghost small", style: "margin-left:8px", onclick: () => { state.category = null; render(); } }, "× Kategorie-Filter")]
      : [])
  );

  // Kategorien-Vorschläge
  const cats = [...new Set(state.todos.map((t) => t.category))].sort();
  $("#category-options").replaceChildren(...cats.map((c) => el("option", { value: c })));
}

function renderItem(t) {
  const status = dueStatus(t);
  const check = el("button", { class: "check", "aria-label": t.completed ? "Als offen markieren" : "Als erledigt markieren" });
  check.innerHTML = CHECK_SVG;
  check.addEventListener("click", () =>
    updateTodo(t.id, { completed: !t.completed, completed_at: t.completed ? null : new Date().toISOString() })
  );

  const title = el("div", { class: "todo-title", title: "Doppelklick zum Bearbeiten" }, t.title);
  title.addEventListener("dblclick", () => startEdit(title, t));

  const meta = el("div", { class: "todo-meta" },
    el("span", { class: "tag" }, t.category),
    el("span", { class: "tag" }, PRIO_LABEL[t.priority]),
    t.due_date && !t.completed
      ? el("span", { class: `tag due ${status}` },
          status === "overdue" ? `überfällig · ${fmtShort(t.due_date)}` : status === "today" ? "heute" : fmtShort(t.due_date))
      : null,
    t.completed && t.completed_at
      ? el("span", { class: "tag done-at" }, "✓ " + new Date(t.completed_at).toLocaleDateString("de-DE", { day: "2-digit", month: "short" }))
      : null
  );

  const actions = el("div", { class: "todo-actions" },
    el("button", { class: "act", title: "Bearbeiten", "aria-label": "Bearbeiten", onclick: () => startEdit(title, t) }, "✎"),
    el("button", { class: "act", title: "Priorität ändern", "aria-label": "Priorität ändern",
      onclick: () => updateTodo(t.id, { priority: (t.priority % 3) + 1 }) }, "⇅"),
    el("button", { class: "act del", title: "Löschen", "aria-label": "Löschen", onclick: () => deleteTodos([t.id]) }, "✕")
  );

  return el("li", { class: `todo${t.completed ? " done" : ""}`, dataset: { prio: t.priority } },
    check, el("div", { class: "todo-body" }, title, meta), actions);
}

function startEdit(node, t) {
  node.contentEditable = "true";
  node.focus();
  document.getSelection().selectAllChildren(node);
  const finish = (save) => {
    node.contentEditable = "false";
    node.removeEventListener("keydown", onKey);
    const val = node.textContent.trim();
    if (save && val && val !== t.title) updateTodo(t.id, { title: val.slice(0, 300) });
    else node.textContent = t.title;
  };
  const onKey = (e) => {
    if (e.key === "Enter") { e.preventDefault(); node.blur(); }
    if (e.key === "Escape") { node.textContent = t.title; node.blur(); }
  };
  node.addEventListener("keydown", onKey);
  node.addEventListener("blur", () => finish(true), { once: true });
}

// ===================== Render: Stats =====================
function completionsByDay() {
  const map = new Map();
  for (const t of state.todos) {
    if (!t.completed || !t.completed_at) continue;
    const k = isoDay(t.completed_at);
    map.set(k, (map.get(k) || 0) + 1);
  }
  return map;
}

function renderStats() {
  const todos = state.todos;
  const total = todos.length;
  const done = todos.filter((t) => t.completed).length;
  const open = total - done;
  const rate = total ? Math.round((done / total) * 100) : 0;
  const overdue = todos.filter((t) => dueStatus(t) === "overdue").length;
  const todayDue = todos.filter(FILTERS.today).length;

  $("#stat-rate").textContent = rate + "%";
  $("#ring-fg").style.strokeDashoffset = String(314.16 * (1 - rate / 100));
  $("#stat-open").textContent = open;
  $("#stat-today-due").textContent = `${todayDue} heute fällig`;
  $("#stat-overdue").textContent = overdue;

  // Ø Erledigungszeit
  const durations = todos
    .filter((t) => t.completed && t.completed_at)
    .map((t) => new Date(t.completed_at) - new Date(t.created_at));
  if (durations.length) {
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const hours = avg / 3600000;
    $("#stat-avg").textContent = "Ø Erledigungszeit: " + (hours < 1 ? `${Math.max(1, Math.round(hours * 60))} Min` : hours < 48 ? `${hours.toFixed(1)} Std` : `${(hours / 24).toFixed(1)} Tage`);
  } else {
    $("#stat-avg").textContent = "Ø Erledigungszeit: –";
  }

  // Streak (heute oder gestern muss aktiv sein)
  const byDay = completionsByDay();
  let streak = 0;
  let cursor = new Date();
  if (!byDay.has(isoDay(cursor))) cursor = new Date(cursor.getTime() - DAY);
  while (byDay.has(isoDay(cursor))) { streak++; cursor = new Date(cursor.getTime() - DAY); }
  const days = [...byDay.keys()].sort();
  let best = 0, run = 0, prev = null;
  for (const d of days) {
    run = prev && Math.round((parseDay(d) - parseDay(prev)) / DAY) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  $("#stat-streak").textContent = streak;
  $("#stat-best").textContent = `Rekord: ${best} Tag${best === 1 ? "" : "e"}`;

  renderWeek(byDay);
  renderHeatmap(byDay);
  renderCategories();
}

function renderWeek(byDay) {
  const created = new Map();
  for (const t of state.todos) {
    const k = isoDay(t.created_at);
    created.set(k, (created.get(k) || 0) + 1);
  }
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY);
    const k = isoDay(d);
    days.push({ k, d, c: created.get(k) || 0, f: byDay.get(k) || 0 });
  }
  const max = Math.max(1, ...days.map((x) => Math.max(x.c, x.f)));
  const today = todayIso();
  $("#week-bars").replaceChildren(...days.map((x) =>
    el("div", { class: `bar-col${x.k === today ? " today" : ""}` },
      el("div", { class: "bar-pair" },
        el("div", { class: "bar created", style: `height:${(x.c / max) * 100}%`, title: `${x.c} neu` }),
        el("div", { class: "bar done", style: `height:${(x.f / max) * 100}%`, title: `${x.f} erledigt` })
      ),
      el("span", { class: "bar-day" }, x.d.toLocaleDateString("de-DE", { weekday: "short" }).slice(0, 2))
    )
  ));
}

function renderHeatmap(byDay) {
  const WEEKS = 26;
  const now = new Date();
  const weekday = (now.getDay() + 6) % 7; // Mo = 0
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - weekday - (WEEKS - 1) * 7);
  const today = todayIso();
  const cells = [];
  let total = 0;
  for (let i = 0; i < WEEKS * 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const k = isoDay(d);
    const n = byDay.get(k) || 0;
    total += n;
    const level = n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 5 ? 3 : 4;
    const future = k > today;
    cells.push(el("div", {
      class: `heat-cell${future ? " future" : ""}${k === today ? " is-today" : ""}`,
      dataset: { l: level },
      title: future ? "" : `${d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "short" })}: ${n} erledigt`,
    }));
  }
  $("#heatmap").style.gridTemplateColumns = `repeat(${WEEKS}, 1fr)`;
  $("#heatmap").replaceChildren(...cells);
  $("#heat-total").textContent = `${total} erledigt`;
}

function renderCategories() {
  const map = new Map();
  for (const t of state.todos) {
    const c = map.get(t.category) || { total: 0, done: 0 };
    c.total++;
    if (t.completed) c.done++;
    map.set(t.category, c);
  }
  const rows = [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  if (!rows.length) {
    return $("#cat-list").replaceChildren(el("p", { class: "cat-empty" }, "Noch keine Kategorien – füge deine erste Aufgabe hinzu."));
  }
  $("#cat-list").replaceChildren(...rows.map(([name, c]) =>
    el("div", { class: "cat-row", title: "Klicken zum Filtern", onclick: () => { state.category = state.category === name ? null : name; render(); } },
      el("div", { class: "cat-top" },
        el("span", { class: "cat-name" }, (state.category === name ? "● " : "") + name),
        el("span", { class: "cat-num" }, `${c.done}/${c.total}`)
      ),
      el("div", { class: "cat-track" }, el("div", { class: "cat-fill", style: `width:${(c.done / c.total) * 100}%` }))
    )
  ));
}

function render() {
  renderList();
  renderStats();
}
