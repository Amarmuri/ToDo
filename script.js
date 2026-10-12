
// ---------------------------------------------------------------------
// 1. VERBINDUNG ZU SUPABASE
// ---------------------------------------------------------------------
// Diese zwei Werte findest du in Supabase unter "Project Settings → API".
// Der Schlüssel darf öffentlich sein: Die Datenbank erlaubt jedem
// Benutzer trotzdem nur, seine EIGENEN Todos zu sehen.
const SUPABASE_URL = "https://bjzhmjvwcamdwfsxlpga.supabase.co";
const SUPABASE_KEY = "sb_publishable_KbAcwH7AcNmbqqTaBTXCoA_kAaj3uI7";

// "db" ist unsere Verbindung zur Datenbank. Über "db" machen wir alles.
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


// ---------------------------------------------------------------------
// 2. VARIABLEN – was sich die App merkt
// ---------------------------------------------------------------------
let todos = [];              // Liste aller Todos aus der Datenbank
let aktuellerFilter = "all"; // welcher Filter-Knopf gerade aktiv ist
let suchText = "";           // was im Suchfeld steht
let sortierung = "smart";    // was im Sortier-Menü ausgewählt ist
let loginModus = "login";    // "login" oder "signup" (registrieren)


// ---------------------------------------------------------------------
// 3. KLEINE HILFSFUNKTIONEN
// ---------------------------------------------------------------------

// Wandelt ein Datum in einen Text wie "2026-10-12" um.
// So können wir Tage ganz einfach vergleichen.
function datumAlsText(datum) {
  const jahr = datum.getFullYear();
  const monat = String(datum.getMonth() + 1).padStart(2, "0"); // Monate zählen ab 0!
  const tag = String(datum.getDate()).padStart(2, "0");
  return jahr + "-" + monat + "-" + tag;
}

// Gibt das heutige Datum als Text zurück, z. B. "2026-10-12"
function heute() {
  return datumAlsText(new Date());
}

// Gibt das Datum von vor "anzahl" Tagen zurück
function vorTagen(anzahl) {
  const datum = new Date();
  datum.setDate(datum.getDate() - anzahl);
  return datum;
}

// Macht aus "2026-10-12" einen schönen Text wie "12. Okt."
function schoenesDatum(text) {
  const datum = new Date(text);
  return datum.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

// Schützt vor gefährlichem Text: Wenn jemand z. B. "<script>" als Todo
// eingibt, wird es nur als Text angezeigt und nicht als Code ausgeführt.
function sicher(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// Zeigt unten kurz eine Nachricht an
function zeigeNachricht(text) {
  const toast = document.getElementById("toast");
  toast.textContent = text;
  toast.classList.add("show");
  setTimeout(function () {
    toast.classList.remove("show");
  }, 2500);
}

// Ist ein Todo überfällig? (nicht erledigt + Datum liegt in der Vergangenheit)
function istUeberfaellig(todo) {
  return todo.completed === false && todo.due_date !== null && todo.due_date < heute();
}

// Ist ein Todo heute fällig?
function istHeuteFaellig(todo) {
  return todo.completed === false && todo.due_date === heute();
}


// ---------------------------------------------------------------------
// 4. LOGIN / REGISTRIEREN / ABMELDEN
// ---------------------------------------------------------------------

// Die zwei Reiter "Anmelden" und "Registrieren"
const reiter = document.querySelectorAll(".tab");
for (const knopf of reiter) {
  knopf.addEventListener("click", function () {
    loginModus = knopf.dataset.mode; // "login" oder "signup"

    // Alle Reiter inaktiv machen, dann den geklickten aktiv
    for (const r of reiter) {
      r.classList.remove("active");
    }
    knopf.classList.add("active");

    // Text auf dem Knopf anpassen + Nutzername-Feld nur beim Registrieren zeigen
    if (loginModus === "login") {
      document.getElementById("auth-submit").textContent = "Anmelden";
      document.getElementById("username-feld").classList.add("hidden");
    } else {
      document.getElementById("auth-submit").textContent = "Konto erstellen";
      document.getElementById("username-feld").classList.remove("hidden");
    }
    document.getElementById("auth-msg").textContent = "";
  });
}

// Wenn das Login-Formular abgeschickt wird
document.getElementById("auth-form").addEventListener("submit", async function (event) {
  event.preventDefault(); // verhindert, dass die Seite neu lädt

  const email = document.getElementById("auth-email").value;
  const passwort = document.getElementById("auth-password").value;
  const meldung = document.getElementById("auth-msg");
  meldung.className = "auth-msg error";
  meldung.textContent = "";

  if (loginModus === "login") {
    // ---- Anmelden ----
    const antwort = await db.auth.signInWithPassword({ email: email, password: passwort });

    if (antwort.error) {
      meldung.textContent = "Anmelden fehlgeschlagen: " + antwort.error.message;
      return;
    }
    zeigeApp();
  } else {
    // ---- Registrieren ----
    const nutzername = document.getElementById("auth-username").value.trim();
    if (nutzername === "") {
      meldung.textContent = "Bitte gib einen Nutzernamen ein.";
      return;
    }

    const antwort = await db.auth.signUp({
      email: email,
      password: passwort,
      options: {
        emailRedirectTo: window.location.origin, // Link in der E-Mail führt hierher zurück
        data: { username: nutzername },          // Nutzername wird beim Benutzer gespeichert
      },
    });

    if (antwort.error) {
      meldung.textContent = "Registrieren fehlgeschlagen: " + antwort.error.message;
      return;
    }
    meldung.className = "auth-msg ok";
    meldung.textContent = "Fast geschafft! Bestätige den Link in deiner E-Mail und melde dich dann an.";
  }
});

// Abmelden-Knopf
document.getElementById("logout-btn").addEventListener("click", async function () {
  await db.auth.signOut();
  zeigeLogin();
});

// Zeigt die Login-Seite und versteckt die App
function zeigeLogin() {
  document.getElementById("app-view").classList.add("hidden");
  document.getElementById("auth-view").classList.remove("hidden");
}

// Zeigt die App und versteckt die Login-Seite
async function zeigeApp() {
  document.getElementById("auth-view").classList.add("hidden");
  document.getElementById("app-view").classList.remove("hidden");

  // Begrüßung oben: "Hallo, Max"
  // Der Nutzername steht in den Benutzer-Daten ("user_metadata").
  const antwort = await db.auth.getUser();
  let nutzername = antwort.data.user.user_metadata.username;

  // Ältere Konten haben noch keinen Nutzernamen → einmal nachfragen und speichern
  if (!nutzername) {
    nutzername = prompt("Wie sollen wir dich nennen? Gib einen Nutzernamen ein:");
    if (nutzername && nutzername.trim() !== "") {
      nutzername = nutzername.trim();
      await db.auth.updateUser({ data: { username: nutzername } });
    } else {
      nutzername = "du"; // falls Abbrechen gedrückt wurde → "Hallo, du"
    }
  }
  document.getElementById("greeting-text").textContent = "Hallo, " + nutzername;
  document.getElementById("today-text").textContent = new Date().toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  await ladeTodos();
}


// ---------------------------------------------------------------------
// 5. TODOS LADEN, HINZUFÜGEN, ÄNDERN, LÖSCHEN
// ---------------------------------------------------------------------
// Einfaches Prinzip: Nach JEDER Änderung laden wir alle Todos neu
// aus der Datenbank und zeichnen die Seite neu.

// Alle Todos aus der Datenbank holen
async function ladeTodos() {
  const antwort = await db.from("todos").select("*").order("created_at", { ascending: false });

  if (antwort.error) {
    zeigeNachricht("Fehler beim Laden: " + antwort.error.message);
    return;
  }

  todos = antwort.data;
  zeichneAlles();
}

// Neues Todo: wenn das Formular abgeschickt wird
document.getElementById("todo-form").addEventListener("submit", async function (event) {
  event.preventDefault();

  const titel = document.getElementById("todo-title").value.trim();
  let kategorie = document.getElementById("todo-category").value.trim();
  const prioritaet = document.querySelector('input[name="prio"]:checked').value;
  let datum = document.getElementById("todo-due").value;

  if (titel === "") return; // leere Todos ignorieren
  if (kategorie === "") kategorie = "Allgemein";
  if (datum === "") datum = null; // kein Datum gewählt

  const antwort = await db.from("todos").insert({
    title: titel,
    category: kategorie,
    priority: Number(prioritaet),
    due_date: datum,
  });

  if (antwort.error) {
    zeigeNachricht("Fehler beim Speichern: " + antwort.error.message);
    return;
  }

  document.getElementById("todo-title").value = ""; // Eingabefeld leeren
  zeigeNachricht("Todo hinzugefügt ✓");
  await ladeTodos();
});

// Todo abhaken oder wieder öffnen
async function umschalten(id) {
  const todo = todos.find(function (t) { return t.id === id; });

  let erledigtAm = null;
  if (todo.completed === false) {
    erledigtAm = new Date().toISOString(); // Zeitpunkt merken, für die Statistik
  }

  await db.from("todos").update({ completed: !todo.completed, completed_at: erledigtAm }).eq("id", id);
  await ladeTodos();
}

// Titel eines Todos ändern
async function bearbeiten(id) {
  const todo = todos.find(function (t) { return t.id === id; });
  const neuerTitel = prompt("Neuer Titel:", todo.title);

  // Abbrechen gedrückt oder leer → nichts tun
  if (neuerTitel === null || neuerTitel.trim() === "") return;

  await db.from("todos").update({ title: neuerTitel.trim() }).eq("id", id);
  await ladeTodos();
}

// Priorität durchschalten: 1 → 2 → 3 → 1 ...
async function prioritaetWechseln(id) {
  const todo = todos.find(function (t) { return t.id === id; });

  let neuePrio = todo.priority + 1;
  if (neuePrio > 3) neuePrio = 1;

  await db.from("todos").update({ priority: neuePrio }).eq("id", id);
  await ladeTodos();
}

// Ein Todo löschen
async function loeschen(id) {
  await db.from("todos").delete().eq("id", id);
  await ladeTodos();
}

// Alle erledigten Todos löschen
document.getElementById("clear-done").addEventListener("click", async function () {
  if (!confirm("Alle erledigten Todos wirklich löschen?")) return;

  await db.from("todos").delete().eq("completed", true);
  await ladeTodos();
});


// ---------------------------------------------------------------------
// 6. DIE LISTE ANZEIGEN
// ---------------------------------------------------------------------

// Filter-Knöpfe (Alle, Offen, Heute, ...)
const filterKnoepfe = document.querySelectorAll("#filters .chip");
for (const knopf of filterKnoepfe) {
  knopf.addEventListener("click", function () {
    aktuellerFilter = knopf.dataset.filter;
    for (const k of filterKnoepfe) {
      k.classList.remove("active");
    }
    knopf.classList.add("active");
    zeichneListe();
  });
}

// Suchfeld: bei jeder Eingabe neu filtern
document.getElementById("search").addEventListener("input", function (event) {
  suchText = event.target.value.toLowerCase();
  zeichneListe();
});

// Sortier-Menü
document.getElementById("sort").addEventListener("change", function (event) {
  sortierung = event.target.value;
  zeichneListe();
});

// Prüft, ob ein Todo zum aktuellen Filter passt
function passtZumFilter(todo) {
  if (aktuellerFilter === "open") return todo.completed === false;
  if (aktuellerFilter === "done") return todo.completed === true;
  if (aktuellerFilter === "today") return istHeuteFaellig(todo);
  if (aktuellerFilter === "overdue") return istUeberfaellig(todo);
  return true; // "all" → alles anzeigen
}

// Sortiert die Liste. Eine Sortier-Funktion bekommt zwei Todos (a und b)
// und gibt zurück: negative Zahl = a zuerst, positive Zahl = b zuerst.
function sortiere(liste) {
  liste.sort(function (a, b) {
    if (sortierung === "prio") {
      return b.priority - a.priority; // hohe Priorität zuerst
    }
    if (sortierung === "new") {
      return new Date(b.created_at) - new Date(a.created_at); // neueste zuerst
    }
    if (sortierung === "due") {
      const datumA = a.due_date || "9999-12-31"; // ohne Datum → ganz nach hinten
      const datumB = b.due_date || "9999-12-31";
      return datumA.localeCompare(datumB);
    }

    // "smart": offene vor erledigten, dann nach Datum, dann nach Priorität
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }
    const datumA = a.due_date || "9999-12-31";
    const datumB = b.due_date || "9999-12-31";
    if (datumA !== datumB) {
      return datumA.localeCompare(datumB);
    }
    return b.priority - a.priority;
  });
}

// Baut das HTML für EIN Todo zusammen
function todoAlsHtml(todo) {
  const prioNamen = { 1: "Niedrig", 2: "Mittel", 3: "Hoch" };

  // Kleines Datums-Schild (nur bei offenen Todos mit Datum)
  let datumSchild = "";
  if (todo.completed === false && todo.due_date !== null) {
    if (istUeberfaellig(todo)) {
      datumSchild = '<span class="tag due overdue">überfällig · ' + schoenesDatum(todo.due_date) + "</span>";
    } else if (istHeuteFaellig(todo)) {
      datumSchild = '<span class="tag due today">heute</span>';
    } else {
      datumSchild = '<span class="tag due">' + schoenesDatum(todo.due_date) + "</span>";
    }
  }

  // Erledigt-Schild
  let erledigtSchild = "";
  if (todo.completed === true && todo.completed_at !== null) {
    erledigtSchild = '<span class="tag done-at">✓ ' + schoenesDatum(todo.completed_at) + "</span>";
  }

  let klasse = "todo";
  if (todo.completed) klasse = "todo done";

  // Template-String mit `Backticks`: ${...} setzt Werte direkt ein
  return `
    <li class="${klasse}" data-prio="${todo.priority}">
      <button class="check" onclick="umschalten('${todo.id}')">
        <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="todo-body">
        <div class="todo-title">${sicher(todo.title)}</div>
        <div class="todo-meta">
          <span class="tag">${sicher(todo.category)}</span>
          <span class="tag">${prioNamen[todo.priority]}</span>
          ${datumSchild}
          ${erledigtSchild}
        </div>
      </div>
      <div class="todo-actions">
        <button class="act" title="Bearbeiten" onclick="bearbeiten('${todo.id}')">✎</button>
        <button class="act" title="Priorität ändern" onclick="prioritaetWechseln('${todo.id}')">⇅</button>
        <button class="act del" title="Löschen" onclick="loeschen('${todo.id}')">✕</button>
      </div>
    </li>
  `;
}

// Zeichnet die ganze Liste neu
function zeichneListe() {
  // 1. Passende Todos heraussuchen
  const sichtbar = [];
  for (const todo of todos) {
    const passtSuche = todo.title.toLowerCase().includes(suchText);
    if (passtZumFilter(todo) && passtSuche) {
      sichtbar.push(todo);
    }
  }

  // 2. Sortieren
  sortiere(sichtbar);

  // 3. HTML zusammenbauen und einfügen
  let html = "";
  for (const todo of sichtbar) {
    html += todoAlsHtml(todo);
  }
  document.getElementById("todo-list").innerHTML = html;

  // 4. "Leer"-Hinweis zeigen, wenn nichts da ist
  if (sichtbar.length === 0) {
    document.getElementById("empty").classList.remove("hidden");
  } else {
    document.getElementById("empty").classList.add("hidden");
  }

  document.getElementById("list-count").textContent = sichtbar.length + " Aufgaben";
}

// Füllt die Vorschläge im Kategorie-Feld (ohne doppelte Einträge)
function zeichneKategorieVorschlaege() {
  const kategorien = [];
  for (const todo of todos) {
    if (!kategorien.includes(todo.category)) {
      kategorien.push(todo.category);
    }
  }

  let html = "";
  for (const kategorie of kategorien) {
    html += '<option value="' + sicher(kategorie) + '">';
  }
  document.getElementById("category-options").innerHTML = html;
}


// ---------------------------------------------------------------------
// 7. STATISTIKEN
// ---------------------------------------------------------------------

// Zählt, wie viele Todos an einem bestimmten Tag erledigt wurden
function erledigtAmTag(tagText) {
  let anzahl = 0;
  for (const todo of todos) {
    if (todo.completed_at !== null && datumAlsText(new Date(todo.completed_at)) === tagText) {
      anzahl++;
    }
  }
  return anzahl;
}

// Zählt, wie viele Todos an einem bestimmten Tag erstellt wurden
function erstelltAmTag(tagText) {
  let anzahl = 0;
  for (const todo of todos) {
    if (datumAlsText(new Date(todo.created_at)) === tagText) {
      anzahl++;
    }
  }
  return anzahl;
}

function zeichneStatistiken() {
  // ---- Zahlen zählen ----
  let erledigt = 0;
  let ueberfaellig = 0;
  let heuteFaellig = 0;

  for (const todo of todos) {
    if (todo.completed) erledigt++;
    if (istUeberfaellig(todo)) ueberfaellig++;
    if (istHeuteFaellig(todo)) heuteFaellig++;
  }
  const offen = todos.length - erledigt;

  // ---- Prozent erledigt + Ring ----
  let prozent = 0;
  if (todos.length > 0) {
    prozent = Math.round((erledigt / todos.length) * 100);
  }
  document.getElementById("stat-rate").textContent = prozent + "%";

  // Der Ring ist ein Kreis mit Umfang 314. Je mehr erledigt, desto mehr wird sichtbar.
  const umfang = 314.16;
  document.getElementById("ring-fg").style.strokeDashoffset = umfang - (umfang * prozent) / 100;

  document.getElementById("stat-open").textContent = offen;
  document.getElementById("stat-today-due").textContent = heuteFaellig + " heute fällig";
  document.getElementById("stat-overdue").textContent = ueberfaellig;

  // ---- Durchschnittliche Zeit bis "erledigt" ----
  let summeStunden = 0;
  let anzahl = 0;
  for (const todo of todos) {
    if (todo.completed && todo.completed_at !== null) {
      const millisekunden = new Date(todo.completed_at) - new Date(todo.created_at);
      summeStunden += millisekunden / 1000 / 60 / 60; // in Stunden umrechnen
      anzahl++;
    }
  }
  if (anzahl > 0) {
    const schnitt = summeStunden / anzahl;
    document.getElementById("stat-avg").textContent = "Ø Erledigungszeit: " + schnitt.toFixed(1) + " Std";
  } else {
    document.getElementById("stat-avg").textContent = "Ø Erledigungszeit: –";
  }

  // ---- Streak: wie viele Tage hintereinander wurde etwas erledigt? ----
  // Wir gehen von heute rückwärts, bis ein Tag ohne Erledigung kommt.
  // (Wenn heute noch nichts erledigt ist, fangen wir bei gestern an.)
  let streak = 0;
  let tag = 0;
  if (erledigtAmTag(heute()) === 0) tag = 1;
  while (erledigtAmTag(datumAlsText(vorTagen(tag))) > 0) {
    streak++;
    tag++;
  }
  document.getElementById("stat-streak").textContent = streak;

  zeichneWochenDiagramm();
  zeichneHeatmap();
  zeichneKategorien();
}

// Balkendiagramm: letzte 7 Tage (grau = neu, rot = erledigt)
function zeichneWochenDiagramm() {
  // Erst den höchsten Wert finden, damit der größte Balken 100% hoch ist
  let maximum = 1;
  for (let i = 0; i < 7; i++) {
    const tagText = datumAlsText(vorTagen(i));
    maximum = Math.max(maximum, erstelltAmTag(tagText), erledigtAmTag(tagText));
  }

  let html = "";
  for (let i = 6; i >= 0; i--) { // von vor 6 Tagen bis heute
    const datum = vorTagen(i);
    const tagText = datumAlsText(datum);
    const hoeheNeu = (erstelltAmTag(tagText) / maximum) * 100;
    const hoeheErledigt = (erledigtAmTag(tagText) / maximum) * 100;
    const wochentag = datum.toLocaleDateString("de-DE", { weekday: "short" }).slice(0, 2);

    let klasse = "bar-col";
    if (i === 0) klasse = "bar-col today";

    html += `
      <div class="${klasse}">
        <div class="bar-pair">
          <div class="bar created" style="height:${hoeheNeu}%"></div>
          <div class="bar done" style="height:${hoeheErledigt}%"></div>
        </div>
        <span class="bar-day">${wochentag}</span>
      </div>
    `;
  }
  document.getElementById("week-bars").innerHTML = html;
}

// Heatmap: ein Kästchen pro Tag für die letzten 26 Wochen
function zeichneHeatmap() {
  const wochen = 26;

  // Wir starten an einem Montag, damit jede Spalte eine Woche ist (Mo–So)
  const wochentagHeute = (new Date().getDay() + 6) % 7; // Montag = 0, Sonntag = 6
  const tageZurueck = wochentagHeute + (wochen - 1) * 7;

  let html = "";
  let gesamt = 0;

  for (let i = tageZurueck; i > tageZurueck - wochen * 7; i--) {
    const tagText = datumAlsText(vorTagen(i));
    const anzahl = erledigtAmTag(tagText);
    gesamt += anzahl;

    // Je mehr erledigt, desto kräftiger die Farbe (Stufe 0 bis 4)
    let stufe = 0;
    if (anzahl >= 1) stufe = 1;
    if (anzahl >= 2) stufe = 2;
    if (anzahl >= 4) stufe = 3;
    if (anzahl >= 6) stufe = 4;

    let klasse = "heat-cell";
    if (i < 0) klasse += " future";     // Tage in der Zukunft
    if (i === 0) klasse += " is-today"; // heute bekommt einen Rahmen

    html += `<div class="${klasse}" data-l="${stufe}" title="${tagText}: ${anzahl} erledigt"></div>`;
  }

  const heatmap = document.getElementById("heatmap");
  heatmap.style.gridTemplateColumns = "repeat(" + wochen + ", 1fr)";
  heatmap.innerHTML = html;
  document.getElementById("heat-total").textContent = gesamt + " erledigt";
}

// Fortschritt pro Kategorie
function zeichneKategorien() {
  // Ein Objekt wie: { "Arbeit": { gesamt: 5, erledigt: 2 }, "Sport": {...} }
  const kategorien = {};

  for (const todo of todos) {
    if (kategorien[todo.category] === undefined) {
      kategorien[todo.category] = { gesamt: 0, erledigt: 0 };
    }
    kategorien[todo.category].gesamt++;
    if (todo.completed) kategorien[todo.category].erledigt++;
  }

  let html = "";
  for (const name in kategorien) {
    const werte = kategorien[name];
    const prozent = (werte.erledigt / werte.gesamt) * 100;

    html += `
      <div class="cat-row">
        <div class="cat-top">
          <span class="cat-name">${sicher(name)}</span>
          <span class="cat-num">${werte.erledigt}/${werte.gesamt}</span>
        </div>
        <div class="cat-track"><div class="cat-fill" style="width:${prozent}%"></div></div>
      </div>
    `;
  }

  if (html === "") {
    html = '<p class="cat-empty">Noch keine Kategorien – füge dein erstes Todo hinzu.</p>';
  }
  document.getElementById("cat-list").innerHTML = html;
}

// Alles neu zeichnen (Liste + Statistiken)
function zeichneAlles() {
  zeichneListe();
  zeichneKategorieVorschlaege();
  zeichneStatistiken();
}


// ---------------------------------------------------------------------
// 8. HELL-/DUNKELMODUS
// ---------------------------------------------------------------------
document.getElementById("theme-toggle").addEventListener("click", function () {
  const html = document.documentElement; // das <html>-Element

  if (html.dataset.theme === "dark") {
    html.dataset.theme = "light";
  } else {
    html.dataset.theme = "dark";
  }
  localStorage.setItem("theme", html.dataset.theme); // Wahl merken
});

// Beim Start: gespeicherte Wahl wiederherstellen
document.documentElement.dataset.theme = localStorage.getItem("theme") || "light";


// ---------------------------------------------------------------------
// 9. START DER APP
// ---------------------------------------------------------------------
// Prüfen, ob der Benutzer schon eingeloggt ist (Supabase merkt sich das).
async function start() {
  const antwort = await db.auth.getSession();

  if (antwort.data.session) {
    await zeigeApp();
  } else {
    zeigeLogin();
  }

  // Lade-Kreis ausblenden
  document.getElementById("loader").classList.add("gone");
}

start();
