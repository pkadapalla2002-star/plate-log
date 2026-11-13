(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const TYPES = ["Breakfast", "Lunch", "Snack", "Dinner"];
  const MACROS = [
    { k: "protein", name: "Protein", color: "var(--protein)" },
    { k: "carbs", name: "Carbohydrate", color: "var(--carbs)" },
    { k: "fat", name: "Fat", color: "var(--fat)" },
    { k: "fibre", name: "Fibre", color: "var(--fibre)" },
  ];
  const DEFAULT_GOALS = { kcal: 2000, protein: 90, carbs: 230, fat: 65, fibre: 30 };

  /* ================= helpers ================= */
  const num = (v) => { const n = parseFloat(v); return isFinite(n) && n >= 0 ? n : 0; };
  const r1 = (n) => Math.round(n * 10) / 10;
  const fmt = (n) => (Math.round(n) === n ? String(n) : n.toFixed(1));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  function todayStr(d = new Date()) {
    const z = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
  }
  function shift(ds, n) { const d = new Date(ds + "T12:00:00"); d.setDate(d.getDate() + n); return todayStr(d); }
  function nice(ds) {
    const d = new Date(ds + "T12:00:00"), t = todayStr();
    const label = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    if (ds === t) return "Today · " + label;
    if (ds === shift(t, -1)) return "Yesterday · " + label;
    return label;
  }
  function guessType() { const h = new Date().getHours(); return h < 11 ? "Breakfast" : h < 15 ? "Lunch" : h < 18 ? "Snack" : "Dinner"; }
  function totals(list) {
    const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };
    list.forEach((m) => { for (const k in t) t[k] += num(m[k]); });
    t.kcal = Math.round(t.kcal);
    for (const k of ["protein", "carbs", "fat", "fibre"]) t[k] = r1(t[k]);
    return t;
  }
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function status(msg, warn) { const s = $("status"); s.textContent = msg; s.classList.toggle("warn", !!warn); }

  /* ================= food matching ================= */
  let customFoods = [];   // user-added foods, same shape as FOODS plus id
  let aliasIndex = [];    // [{re, len, food}]
  function allFoods() { return window.FOODS.concat(customFoods); }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function buildIndex() {
    aliasIndex = [];
    allFoods().forEach((food) => {
      const names = new Set([food.n.toLowerCase()].concat(food.a || []));
      names.forEach((a) => {
        a = String(a).toLowerCase().trim(); if (!a) return;
        aliasIndex.push({ re: new RegExp("(^|[^a-z0-9])" + esc(a) + "(e?s)?(?![a-z0-9])", "i"), len: a.length + (food.custom ? 0.5 : 0), food });
      });
    });
    aliasIndex.sort((x, y) => y.len - x.len);
    const dl = $("foodList"); dl.innerHTML = "";
    allFoods().forEach((f) => { const o = document.createElement("option"); o.value = f.n; dl.appendChild(o); });
  }
  function findFood(text) {
    for (const ent of aliasIndex) {
      const m = ent.re.exec(text);
      if (m) return { food: ent.food, start: m.index + m[1].length, end: m.index + m[0].length };
    }
    return null;
  }
  function foodByName(n) { return allFoods().find((f) => f.n === n); }

  const WORDNUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    half: 0.5, quarter: 0.25, couple: 2, few: 3, dozen: 12 };
  const FRAC = { "½": "1/2", "¼": "1/4", "¾": "3/4", "⅓": "1/3", "⅔": "2/3" };
  function unitKey(tok) {
    const U = window.UNITS;
    if (tok in U) return tok;
    if (tok.endsWith("es") && tok.slice(0, -2) in U) return tok.slice(0, -2);
    if (tok.endsWith("s") && tok.slice(0, -1) in U) return tok.slice(0, -1);
    const map = { teaspoons: "tsp", tablespoons: "tbsp", tbs: "tbsp", tbl: "tbsp", tsps: "tsp", tbsps: "tbsp", litres: "l", liters: "l", grams: "g", kgs: "kg" };
    return map[tok] || null;
  }
  // Returns {raw, food, grams, how} or {raw, food: null}
  function parseLine(raw) {
    let s = raw.toLowerCase();
    for (const k in FRAC) s = s.split(k).join(" " + FRAC[k]);
    s = s.replace(/(\d)\s*[-–]\s*(\d)/g, "$1 to $2").replace(/[(),;:*•\-–]+/g, " ").replace(/(\d)([a-z])/g, "$1 $2").replace(/\s+/g, " ").trim();
    if (!s) return null;
    const hit = findFood(s);
    if (!hit) return { raw, food: null };
    const food = hit.food;
    const rest = (s.slice(0, hit.start) + " " + s.slice(hit.end)).replace(/\b(of|x|about|approx|around|roughly)\b/g, " ").trim();
    const toks = rest.split(/\s+/).filter(Boolean);
    let qty = null, unit = null;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      let q = null;
      if (/^\d+(\.\d+)?$/.test(t)) {
        q = parseFloat(t);
        if (toks[i + 1] && /^\d+\/\d+$/.test(toks[i + 1])) { const [a, b] = toks[i + 1].split("/"); q += a / b; i++; }
        else if (toks[i + 1] === "to" && /^\d+(\.\d+)?$/.test(toks[i + 2] || "")) { q = (q + parseFloat(toks[i + 2])) / 2; i += 2; }
      } else if (/^\d+\/\d+$/.test(t)) { const [a, b] = t.split("/"); q = a / b; }
      else if (/^\d+(\.\d+)?\-\d+(\.\d+)?$/.test(t)) { const [a, b] = t.split("-"); q = (parseFloat(a) + parseFloat(b)) / 2; }
      else if (t in WORDNUM) q = WORDNUM[t];
      if (q != null && qty == null) {
        qty = q;
        if (t === "half" && toks[i + 1] === "a") i++;
        const u = toks[i + 1] && unitKey(toks[i + 1]);
        if (u) { unit = u; i++; }
        continue;
      }
      if (!unit) { const u = unitKey(t); if (u) unit = u; }
    }
    const fu = food.u || {};
    const U = window.UNITS;
    let grams, how;
    const q = qty == null ? 1 : qty;
    if (unit && ["g", "gm", "gms", "gram", "grams", "gr", "kg", "kilo", "ml", "l", "litre", "liter"].includes(unit)) {
      grams = q * U[unit]; how = "";
    } else if (unit && fu[unit]) {
      grams = q * fu[unit]; how = fmt(r1(q)) + " " + unit + " ≈ " + fmt(r1(grams)) + " g";
    } else if (unit && U[unit] == null) { // piece
      grams = q * (food.each || 100); how = fmt(r1(q)) + " × " + (food.each || 100) + " g";
    } else if (unit) {
      grams = q * U[unit]; how = fmt(r1(q)) + " " + unit + " ≈ " + Math.round(grams) + " g";
    } else if (qty != null) {
      if (food.each) { grams = q * food.each; how = fmt(r1(q)) + " × " + food.each + " g"; }
      else { grams = q * 100; how = "assumed " + fmt(r1(q)) + " × 100 g"; }
    } else {
      grams = food.each || (fu.handful || 100); how = "no amount, assumed " + Math.round(grams) + " g";
    }
    return { raw, food, grams: Math.round(grams * 10) / 10, how };
  }
  function macrosFor(food, grams) {
    const x = grams / 100;
    return { kcal: food.k * x, protein: food.p * x, carbs: food.c * x, fat: food.f * x, fibre: (food.fb || 0) * x };
  }

  /* ================= storage ================= */
  // Everything lives in this browser first (works offline), then syncs to a
  // private GitHub repository as one JSON file when the device is connected.
  const LS_KEY = "platelog-v1", SYNC_KEY = "platelog-sync";
  const S = { meals: [], foods: [], favs: [], goals: { ...DEFAULT_GOALS }, pantry: [], tomb: {}, goalsU: 0, pantryU: 0 };
  const COLLS = ["meals", "foods", "favs"];
  function readLocal() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } }
  function snapshot() { return { meals: S.meals, foods: S.foods, favs: S.favs, goals: S.goals, pantry: S.pantry, tomb: S.tomb, goalsU: S.goalsU, pantryU: S.pantryU }; }
  function writeLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(snapshot())); }
    catch (e) { status("Couldn't save on this device (storage full or blocked).", true); }
  }
  function applyData(L) {
    S.meals = L.meals || []; S.foods = L.foods || []; S.favs = L.favs || [];
    S.goals = { ...DEFAULT_GOALS, ...(L.goals || {}) }; S.pantry = L.pantry || [];
    S.tomb = L.tomb || {}; S.goalsU = L.goalsU || 0; S.pantryU = L.pantryU || 0;
  }
  function loadLocalIntoState() { applyData(readLocal()); onData(); }
  const stamp = (it) => it.u || it.createdAt || 0;
  // Merge two copies: newest edit of each item wins, deletions are remembered.
  function merge(a, b) {
    const out = { tomb: { ...(a.tomb || {}) } };
    for (const [id, t] of Object.entries(b.tomb || {})) out.tomb[id] = Math.max(out.tomb[id] || 0, t);
    COLLS.forEach((c) => {
      const m = new Map();
      [].concat(a[c] || [], b[c] || []).forEach((it) => { const ex = m.get(it.id); if (!ex || stamp(it) > stamp(ex)) m.set(it.id, it); });
      out[c] = Array.from(m.values()).filter((it) => !(out.tomb[it.id] >= stamp(it)));
    });
    const ga = a.goalsU || 0, gb = b.goalsU || 0;
    out.goals = gb > ga ? b.goals : a.goals; out.goalsU = Math.max(ga, gb);
    const pa = a.pantryU || 0, pb = b.pantryU || 0;
    out.pantry = pb > pa ? b.pantry : a.pantry; out.pantryU = Math.max(pa, pb);
    const cutoff = Date.now() - 90 * 864e5; // forget deletions older than 90 days
    for (const id in out.tomb) if (out.tomb[id] < cutoff) delete out.tomb[id];
    return out;
  }
  function canon(o) {
    const m = merge(o, {}), out = { goals: m.goals, goalsU: m.goalsU, pantry: m.pantry, pantryU: m.pantryU, tomb: Object.keys(m.tomb).sort().map((k) => [k, m.tomb[k]]) };
    COLLS.forEach((c) => (out[c] = m[c].slice().sort((x, y) => (x.id < y.id ? -1 : 1))));
    return JSON.stringify(out);
  }
  function changed() { writeLocal(); onData(); sync.schedule(); }

  const store = {
    async put(coll, item) {
      if (!item.id) item.id = uid();
      item.u = Date.now();
      const arr = S[coll]; const i = arr.findIndex((x) => x.id === item.id);
      if (i >= 0) arr[i] = item; else arr.push(item);
      changed();
    },
    async del(coll, id) { S[coll] = S[coll].filter((x) => x.id !== id); S.tomb[id] = Date.now(); changed(); },
    async setGoals(g) { S.goals = g; S.goalsU = Date.now(); changed(); },
    async setPantry(items) { S.pantry = items; S.pantryU = Date.now(); changed(); },
  };

  function onData() {
    customFoods = S.foods.map((f) => ({ ...f, custom: true }));
    buildIndex();
    renderGoals(); renderAll(); renderFavs(); renderPantry(); refreshBreakdown();
  }

  function loadScript(src) {
    return new Promise((res, rej) => { const el = document.createElement("script"); el.src = src; el.onload = res; el.onerror = () => rej(new Error("couldn't load " + src)); document.head.appendChild(el); });
  }

  /* ---------- GitHub sync ---------- */
  const DEFAULT_REPO = window.PLATE_SYNC_REPO || "";
  function readSync() { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch (e) { return {}; } }
  function writeSync(o) { try { localStorage.setItem(SYNC_KEY, JSON.stringify(o)); } catch (e) {} }
  const b64enc = (str) => { const bytes = new TextEncoder().encode(str); let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); };
  const b64dec = (b64) => { const bin = atob(b64.replace(/\s/g, "")); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new TextDecoder().decode(bytes); };
  function ago(t) { const s = Math.round((Date.now() - t) / 1000); if (s < 45) return "just now"; const m = Math.round(s / 60); if (m < 60) return m + " min ago"; const h = Math.round(m / 60); return h < 24 ? h + " h ago" : new Date(t).toLocaleDateString(); }

  const sync = {
    cfg: readSync(), busy: false, again: false, timer: null, last: 0, sha: null,
    on() { return !!(this.cfg.token && this.cfg.repo); },
    url() { return "https://api.github.com/repos/" + this.cfg.repo + "/contents/data.json"; },
    headers() { return { Authorization: "Bearer " + this.cfg.token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }; },
    schedule() { if (!this.on()) return; clearTimeout(this.timer); this.timer = setTimeout(() => this.run(), 1200); },
    async pull() {
      const r = await fetch(this.url() + "?t=" + Date.now(), { headers: this.headers(), cache: "no-store" });
      if (r.status === 404) return { data: null, sha: null };
      if (r.status === 401) throw new Error("the access key was rejected (it may have expired)");
      if (r.status === 403) throw new Error("the access key can't open " + this.cfg.repo + " (check it has Contents: Read and write)");
      if (!r.ok) throw new Error("GitHub said " + r.status);
      const j = await r.json();
      return { data: JSON.parse(b64dec(j.content || "") || "{}"), sha: j.sha };
    },
    async run() {
      if (!this.on()) return;
      if (this.busy) { this.again = true; return; }
      this.busy = true; renderSync("Syncing…");
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          const { data, sha } = await this.pull();
          const before = JSON.stringify(snapshot());
          const merged = data ? merge(snapshot(), data) : snapshot();
          applyData(merged);
          const now = JSON.stringify(snapshot());
          if (now !== before) { writeLocal(); onData(); }
          if (data && canon(data) === canon(merged)) { this.sha = sha; break; } // server already up to date
          const body = { message: "Update meals " + new Date().toISOString(), content: b64enc(JSON.stringify({ ...snapshot(), savedAt: Date.now() }, null, 1)) };
          if (sha) body.sha = sha;
          const r = await fetch(this.url(), { method: "PUT", headers: { ...this.headers(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
          if (r.ok) { this.sha = (await r.json()).content.sha; break; }
          if (r.status === 409 || r.status === 422) continue; // someone else saved first; merge again
          if (r.status === 403 || r.status === 404) throw new Error("the access key can't write to " + this.cfg.repo + " (it needs Contents: Read and write)");
          throw new Error("GitHub said " + r.status);
        }
        this.last = Date.now(); this.cfg.last = this.last; writeSync(this.cfg);
        renderSync();
      } catch (e) {
        renderSync(navigator.onLine === false ? "Offline. Saved on this device, will sync when you're back online." : "Sync failed: " + e.message, true);
      } finally {
        this.busy = false;
        if (this.again) { this.again = false; this.schedule(); }
      }
    },
  };
  function renderSync(msg, warn) {
    const on = sync.on();
    const line = msg || (on ? "Synced " + ago(sync.last || sync.cfg.last || Date.now()) + " · " + S.meals.length + " meals" : "Saved on this device only. Turn on sync in Progress to see meals on your other devices.");
    status(line, warn);
    const st = $("syncState");
    if (st) { st.textContent = on ? "On · " + sync.cfg.repo : "Off"; st.className = "have" + (on ? " full" : ""); }
    $("syncSetup").hidden = on; $("syncOn").hidden = !on;
  }
  $("syncConnect").onclick = async () => {
    const token = $("syncToken").value.trim();
    const repo = ($("syncRepo").value.trim() || DEFAULT_REPO).replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
    if (!token) { $("syncMsg").textContent = "Paste your access key first."; return; }
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { $("syncMsg").textContent = "The repository should look like name/plate-log-data."; return; }
    $("syncConnect").disabled = true; $("syncMsg").textContent = "Connecting…";
    const prev = sync.cfg;
    sync.cfg = { token, repo, last: 0 };
    try {
      await sync.pull();
      writeSync(sync.cfg); $("syncToken").value = ""; $("syncMsg").textContent = "";
      await sync.run(); toast("Sync is on");
    } catch (e) { sync.cfg = prev; $("syncMsg").textContent = "Couldn't connect: " + e.message; }
    finally { $("syncConnect").disabled = false; renderSync(); }
  };
  $("syncNow").onclick = () => sync.run();
  $("syncOff").onclick = () => {
    if ($("syncOff").dataset.armed !== "1") { $("syncOff").dataset.armed = "1"; $("syncOff").textContent = "Tap again to turn off"; setTimeout(() => { $("syncOff").dataset.armed = ""; $("syncOff").textContent = "Turn off on this device"; }, 3000); return; }
    sync.cfg = {}; writeSync({}); renderSync(); toast("Sync turned off on this device");
  };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sync.run(); });
  window.addEventListener("online", () => sync.run());
  setInterval(() => { if (document.visibilityState === "visible") sync.run(); }, 60000);
  function initSync() { $("syncRepo").value = sync.cfg.repo || DEFAULT_REPO; renderSync(); sync.run(); }

  /* ================= state ================= */
  let day = todayStr();
  let type = guessType();
  let editingId = null;
  let metric = "protein";
  let parsed = [];          // current breakdown rows
  let gramOverride = {};    // raw line -> grams
  let macroManual = false;  // user typed in macro boxes

  /* ================= render: day ================= */
  function renderChips() {
    const box = $("typeChips"); box.innerHTML = "";
    TYPES.forEach((t) => {
      const b = el("button", "chip", t); b.setAttribute("aria-pressed", t === type);
      b.onclick = () => { type = t; renderChips(); updateAddFor(); };
      box.appendChild(b);
    });
  }
  function renderFacts() {
    const list = S.meals.filter((m) => m.date === day);
    const t = totals(list), g = S.goals;
    const pct = g.kcal ? t.kcal / g.kcal : 0, left = Math.round(g.kcal - t.kcal);
    const R = 56, C = 2 * Math.PI * R, over = pct > 1;
    $("ring").innerHTML = '<svg viewBox="0 0 132 132" aria-hidden="true"><circle cx="66" cy="66" r="' + R + '" fill="none" style="stroke:var(--track)" stroke-width="12"/>' +
      '<circle class="val" cx="66" cy="66" r="' + R + '" fill="none" style="stroke:' + (over ? "var(--over)" : "var(--accent)") + '" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + C +
      '" stroke-dashoffset="' + (C * (1 - Math.min(pct, 1))) + '"/></svg><div class="center"><div class="big">' + Math.abs(left) + '</div><div class="small">' +
      (left >= 0 ? "kcal left" : "kcal over") + "</div></div>";
    $("ring").setAttribute("aria-label", t.kcal + " of " + g.kcal + " kcal eaten");
    $("macroRows").innerHTML = MACROS.filter((m) => m.k !== "fibre").map((m) => {
      const goal = g[m.k] || 0, v = t[m.k], p = goal ? Math.round((v / goal) * 100) : 0;
      return '<div class="mb"><div class="top"><b>' + m.name.replace("Carbohydrate", "Carbs") + "</b><span><em>" + fmt(v) + "</em> / " + goal + 'g</span></div><div class="bar"><i style="width:' +
        Math.min(p, 100) + "%;background:" + m.color + '"></i></div></div>';
    }).join("");
    const e = t.protein * 4 + t.carbs * 4 + t.fat * 9;
    const pc = (x) => Math.round((x / e) * 100);
    $("energySplit").innerHTML = "<span>Eaten <b>" + t.kcal + "</b> of " + g.kcal + " kcal</span><span>Fibre <b>" + fmt(t.fibre) + "</b> / " + g.fibre + "g</span>" +
      (e > 0 ? '<span><i class="sw" style="background:var(--protein)"></i>' + pc(t.protein * 4) + '% <i class="sw" style="background:var(--carbs);margin-left:6px"></i>' + pc(t.carbs * 4) +
        '% <i class="sw" style="background:var(--fat);margin-left:6px"></i>' + pc(t.fat * 9) + "% of energy</span>" : "");
  }
  function macroLine(o) {
    const d = el("div", "mac");
    [["P", o.protein, "var(--protein)"], ["C", o.carbs, "var(--carbs)"], ["F", o.fat, "var(--fat)"], ["Fibre", o.fibre, null]].forEach(([l, v, c]) => {
      const s = el("span", null, l + " " + fmt(r1(num(v))) + "g"); if (c) s.style.color = c; d.appendChild(s);
    });
    return d;
  }
  function renderLog() {
    const list = S.meals.filter((m) => m.date === day).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const box = $("mealList"); box.innerHTML = "";
    TYPES.forEach((t) => {
      const group = list.filter((m) => m.type === t);
      const gt = totals(group);
      const card = el("div", "card meal");
      const head = el("div", "mhead");
      const title = el("div", "mtitle"); title.append(el("h2", null, t));
      if (group.length) title.appendChild(el("span", null, gt.kcal + " kcal · " + fmt(gt.protein) + "g protein"));
      const add = el("button", "addbtn", "+ Add"); add.setAttribute("aria-label", "Add to " + t);
      add.onclick = () => { clearForm(); type = t; renderChips(); show("add"); setTimeout(() => $("mealText").focus(), 50); };
      head.append(title, add); card.appendChild(head);
      if (!group.length) card.appendChild(el("div", "mempty", t === "Snack" ? "No snacks logged" : "Nothing logged yet"));
      group.forEach((m) => {
        const row = el("div", "entry");
        row.append(el("div", "what", m.name || "Meal"), el("div", "kc", Math.round(num(m.kcal)) + " kcal"), macroLine(m));
        const ops = el("div", "ops");
        const ed = el("button", "linkbtn", "Edit"); ed.onclick = () => startEdit(m);
        const del = el("button", "linkbtn danger", "Delete");
        del.onclick = async () => {
          if (del.dataset.armed !== "1") { del.dataset.armed = "1"; del.textContent = "Tap to confirm"; setTimeout(() => { del.dataset.armed = ""; del.textContent = "Delete"; }, 3000); return; }
          try { await store.del("meals", m.id); toast("Deleted"); } catch (e) { status("Couldn't delete: " + e.message, true); }
        };
        ops.append(ed, del); row.appendChild(ops);
        if (m.ingredients && m.ingredients.replace(/\n/g, ", ") !== m.name) row.appendChild(el("div", "ing", m.ingredients.split("\n").filter(Boolean).join(" · ")));
        else if (m.outItems) row.appendChild(el("div", "ing", "Ate out · " + m.outItems.split("\n").filter(Boolean).join(" · ")));
        card.appendChild(row);
      });
      box.appendChild(card);
    });
  }

  /* ================= views, week strip, toast ================= */
  const VIEWS = ["today", "add", "groceries", "progress"];
  function show(v) {
    if (!VIEWS.includes(v)) v = "today";
    document.querySelectorAll(".view").forEach((s) => (s.hidden = s.dataset.view !== v));
    document.querySelectorAll(".tab").forEach((b) => (b.dataset.go === v ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    if (location.hash !== "#" + v) history.replaceState(null, "", "#" + v);
    window.scrollTo(0, 0);
    if (v === "add") updateAddFor();
  }
  document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => { if (b.dataset.go === "add" && !editingId) { type = type || guessType(); renderChips(); } show(b.dataset.go); }));
  window.addEventListener("hashchange", () => { if (!location.hash.startsWith("#setup=")) show(location.hash.slice(1)); });
  let toastT;
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2200); }
  function updateAddFor() { $("addFor").textContent = type + " · " + nice(day); }
  function weekStart(ds) { const d = new Date(ds + "T12:00:00"); const wd = (d.getDay() + 6) % 7; return shift(ds, -wd); }
  function renderStrip() {
    const box = $("weekStrip"); box.innerHTML = "";
    const start = weekStart(day), t = todayStr();
    for (let i = 0; i < 7; i++) {
      const d = shift(start, i), dd = new Date(d + "T12:00:00");
      const kc = totals(S.meals.filter((m) => m.date === d)).kcal;
      const b = el("button", "wd" + (d === day ? " sel" : "") + (d === t ? " today" : ""));
      b.disabled = d > t;
      b.setAttribute("aria-label", dd.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) + ", " + kc + " kcal");
      b.append(el("span", "l", dd.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3)), el("span", "d", String(dd.getDate())));
      const dot = el("span", "dot"); const fill = el("i"); fill.style.width = Math.min(100, S.goals.kcal ? (kc / S.goals.kcal) * 100 : 0) + "%"; dot.appendChild(fill); b.appendChild(dot);
      b.onclick = () => { day = d; renderAll(); };
      box.appendChild(b);
    }
    const label = new Date(day + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
    $("dateText").textContent = day === t ? "Today" : day === shift(t, -1) ? "Yesterday" : label;
  }

  /* ================= render: week chart ================= */
  function renderMetricChips() {
    const box = $("metricChips"); box.innerHTML = "";
    [["kcal", "Calories"], ["protein", "Protein"], ["carbs", "Carbs"], ["fat", "Fat"]].forEach(([k, l]) => {
      const b = el("button", "chip", l); b.setAttribute("aria-pressed", k === metric);
      b.onclick = () => { metric = k; renderMetricChips(); renderWeek(); };
      box.appendChild(b);
    });
  }
  function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(x))), f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
  function renderWeek() {
    const days = []; for (let i = 6; i >= 0; i--) days.push(shift(day, -i));
    const vals = days.map((d) => totals(S.meals.filter((m) => m.date === d))[metric]);
    const goal = S.goals[metric] || 0;
    const W = 600, H = 220, L = 44, R = 10, T = 18, B = 34;
    const rawMax = Math.max(goal, ...vals, 1), step = niceStep(rawMax / 4), max = Math.ceil(rawMax / step) * step;
    const y = (v) => T + (H - T - B) * (1 - v / max), bw = (W - L - R) / 7;
    const col = metric === "kcal" ? "var(--accent)" : "var(--" + metric + ")";
    const unit = metric === "kcal" ? " kcal" : "g";
    let s = "";
    for (let v = 0; v <= max + 1e-9; v += step) {
      s += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + Math.round(v) + "</text>";
    }
    days.forEach((d, i) => {
      const v = vals[i], x = L + i * bw + bw * 0.18, w = bw * 0.64, top = y(v), sel = d === day;
      s += '<rect x="' + x + '" y="' + top + '" width="' + w + '" height="' + Math.max(H - B - top, 0) + '" rx="3" style="fill:' + col + '" opacity="' + (sel ? 1 : 0.55) + '"/>';
      if (v > 0) s += '<text x="' + (x + w / 2) + '" y="' + (top - 4) + '" text-anchor="middle" style="fill:var(--ink)">' + Math.round(v) + "</text>";
      const dd = new Date(d + "T12:00:00");
      s += '<text x="' + (x + w / 2) + '" y="' + (H - B + 16) + '" text-anchor="middle"' + (sel ? ' style="fill:var(--ink);font-weight:600"' : "") + ">" + dd.toLocaleDateString(undefined, { weekday: "short" }) + "</text>";
      s += '<text x="' + (x + w / 2) + '" y="' + (H - B + 29) + '" text-anchor="middle">' + dd.getDate() + "</text>";
    });
    if (goal) s += '<line class="goal" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(goal) + '" y2="' + y(goal) + '"/><text x="' + (W - R) + '" y="' + (y(goal) - 4) + '" text-anchor="end" style="fill:var(--ink)">goal ' + goal + unit + "</text>";
    $("weekChart").innerHTML = s;
    const logged = vals.filter((v, i) => S.meals.some((m) => m.date === days[i]));
    const avg = logged.length ? logged.reduce((a, b) => a + b, 0) / logged.length : 0;
    $("weekAvg").innerHTML = logged.length
      ? "Average over " + logged.length + " logged day" + (logged.length > 1 ? "s" : "") + ": <b>" + Math.round(avg) + unit + "</b>" + (goal ? " (goal <b>" + goal + unit + "</b>)" : "")
      : '<span class="muted">No meals logged this week yet.</span>';
  }
  function renderAll() {
    $("dayPick").value = day; $("dayPick").max = todayStr();
    $("nextDay").disabled = weekStart(day) >= weekStart(todayStr());
    renderStrip(); renderFacts(); renderLog(); renderWeek();
    if (!$("addFor").closest(".view").hidden) updateAddFor();
  }

  /* ================= logging form ================= */
  function refreshBreakdown() {
    const lines = $("mealText").value.split("\n").map((l) => l.trim()).filter(Boolean);
    parsed = lines.map(parseLine).filter(Boolean).map((r) => {
      if (r.food && gramOverride[r.raw] != null) { r.grams = gramOverride[r.raw]; r.how = "your amount"; }
      return r;
    });
    const box = $("breakdown");
    if (!parsed.length) { box.hidden = true; $("liveTotal").hidden = true; if (!macroManual) fillMacros({}); return; }
    box.hidden = false;
    const rows = parsed.map((r) => (r.food ? { ...r, ...macrosFor(r.food, r.grams) } : r));
    const t = totals(rows.filter((r) => r.food));
    const tbl = el("table", "bd");
    tbl.innerHTML = "<thead><tr><th>Ingredient</th><th>Grams</th><th>kcal</th><th>Protein</th><th>Carbs</th><th>Fat</th><th>Fibre</th></tr></thead>";
    const tb = el("tbody");
    rows.forEach((r) => {
      const tr = el("tr");
      const td0 = el("td");
      if (r.food) {
        td0.append(el("span", null, r.food.n), el("span", "src", "“" + r.raw + "”" + (r.how ? " · " + r.how : "")));
        tr.appendChild(td0);
        const tdg = el("td"); const inp = el("input", "g"); inp.type = "number"; inp.inputMode = "decimal"; inp.min = "0"; inp.value = r.grams;
        inp.setAttribute("aria-label", "Grams of " + r.food.n);
        inp.onchange = () => { gramOverride[r.raw] = num(inp.value); macroManual = false; refreshBreakdown(); };
        tdg.appendChild(inp); tr.appendChild(tdg);
        [Math.round(r.kcal), fmt(r1(r.protein)), fmt(r1(r.carbs)), fmt(r1(r.fat)), fmt(r1(r.fibre))].forEach((v) => tr.appendChild(el("td", null, String(v))));
      } else {
        tr.className = "miss";
        td0.append(el("span", null, "“" + r.raw + "”"), el("span", "src", "Not in the food list"));
        tr.appendChild(td0);
        const td = el("td"); td.colSpan = 6;
        const add = el("button", "linkbtn", "Add this food"); add.onclick = () => openCustom(r.raw);
        td.appendChild(add); tr.appendChild(td);
      }
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    const tf = el("tfoot"); const tr = el("tr");
    tr.append(el("td", null, "Total"), el("td", null, ""), el("td", null, String(t.kcal)), el("td", null, fmt(t.protein)), el("td", null, fmt(t.carbs)), el("td", null, fmt(t.fat)), el("td", null, fmt(t.fibre)));
    tf.appendChild(tr); tbl.appendChild(tf);
    box.innerHTML = ""; box.appendChild(tbl);
    if (!macroManual) fillMacros(t);
    $("liveTotal").hidden = false; $("liveKcal").textContent = t.kcal;
    const lm = $("liveMac"); lm.innerHTML = ""; lm.append(...macroLine(t).childNodes);
  }
  function fillMacros(o) {
    $("fKcal").value = o.kcal ?? ""; $("fProtein").value = o.protein ?? ""; $("fCarbs").value = o.carbs ?? "";
    $("fFat").value = o.fat ?? ""; $("fFibre").value = o.fibre ?? "";
  }
  function readMacros() {
    const p = num($("fProtein").value), c = num($("fCarbs").value), f = num($("fFat").value);
    const k = $("fKcal").value === "" ? Math.round(p * 4 + c * 4 + f * 9) : Math.round(num($("fKcal").value));
    return { kcal: k, protein: r1(p), carbs: r1(c), fat: r1(f), fibre: r1(num($("fFibre").value)) };
  }
  function clearForm() {
    $("mealName").value = ""; $("mealText").value = ""; gramOverride = {}; macroManual = false; $("saveFav").checked = false;
    mealExtra = {}; outImage = null; $("outPreview").hidden = true; $("outResult").innerHTML = ""; $("outMsg").textContent = "";
    $("outPlace").value = ""; $("outNote").value = ""; $("outDropText").textContent = "Take or choose a photo of your meal"; $("outPhoto").value = "";
    editingId = null; $("formTitle").textContent = "Log a meal"; $("saveBtn").textContent = "Add to log"; $("cancelEdit").hidden = true;
    closeCustom(); refreshBreakdown(); fillMacros({});
  }
  function loadIntoForm(m) {
    $("mealName").value = m.name || ""; $("mealText").value = m.ingredients || "";
    gramOverride = { ...(m.overrides || {}) };
    macroManual = !m.ingredients;
    refreshBreakdown();
    if (!m.ingredients) fillMacros(m);
  }
  function startEdit(m) {
    editingId = m.id; type = m.type || type; renderChips(); loadIntoForm(m);
    $("formTitle").textContent = "Edit meal"; $("saveBtn").textContent = "Save changes"; $("cancelEdit").hidden = false;
    show("add");
  }
  async function saveMeal() {
    const mac = readMacros();
    const ing = $("mealText").value.trim();
    const name = $("mealName").value.trim() || ing.split("\n").map((s) => s.trim()).filter(Boolean).join(", ").slice(0, 120);
    if (!name && !mac.kcal) { $("formMsg").textContent = "Add some ingredients or numbers first."; return; }
    const overrides = {}; parsed.forEach((r) => { if (r.food && gramOverride[r.raw] != null) overrides[r.raw] = gramOverride[r.raw]; });
    const items = parsed.filter((r) => r.food).map((r) => ({ food: r.food.n, grams: r.grams }));
    const old = editingId ? S.meals.find((m) => m.id === editingId) : null;
    const meal = { ...(old && old.source ? { source: old.source, place: old.place, sourceUrl: old.sourceUrl, outItems: old.outItems } : {}), id: editingId || undefined, date: old ? old.date : day, type, name, ingredients: ing, items, overrides, ...mac, ...mealExtra, createdAt: old ? old.createdAt : Date.now() };
    $("saveBtn").disabled = true; $("formMsg").textContent = "Saving…";
    try {
      await store.put("meals", meal);
      if ($("saveFav").checked) {
        const ex = S.favs.find((f) => (f.name || "").toLowerCase() === name.toLowerCase());
        await store.put("favs", { id: ex ? ex.id : undefined, name, ingredients: ing, overrides, ...mac });
      }
      const was = editingId;
      clearForm(); $("formMsg").textContent = "";
      toast((was ? "Updated " : "Added to ") + type.toLowerCase());
      show("today");
    } catch (e) { $("formMsg").textContent = "Couldn't save: " + e.message; }
    finally { $("saveBtn").disabled = false; }
  }
  function renderFavs() {
    const sel = $("savedPick");
    if (!S.favs.length) { sel.hidden = true; return; }
    sel.hidden = false; sel.innerHTML = "";
    sel.appendChild(new Option("Fill from a favourite meal…", ""));
    S.favs.slice().sort((a, b) => (a.name || "").localeCompare(b.name || "")).forEach((f) => sel.appendChild(new Option(f.name + " · " + Math.round(num(f.kcal)) + " kcal, " + fmt(r1(num(f.protein))) + "g protein", f.id)));
  }

  /* ---------- custom foods ---------- */
  function openCustom(raw) {
    const name = raw.replace(/^[\d\s.\/½¼¾]+(g|gm|grams?|kg|ml|tsp|tbsp|cups?|slices?|pieces?)?\s+(of\s+)?/i, "").trim();
    $("cName").value = name.charAt(0).toUpperCase() + name.slice(1);
    ["cKcal", "cP", "cC", "cF", "cFb", "cEach"].forEach((id) => ($(id).value = ""));
    $("cMsg").textContent = ""; $("customForm").hidden = false; $("cKcal").focus();
  }
  function closeCustom() { $("customForm").hidden = true; }
  $("cCancel").onclick = closeCustom;
  $("cSave").onclick = async () => {
    const n = $("cName").value.trim();
    if (!n || $("cKcal").value === "") { $("cMsg").textContent = "Add a name and kcal per 100 g."; return; }
    const food = { n, a: [n.toLowerCase()], k: num($("cKcal").value), p: num($("cP").value), c: num($("cC").value), f: num($("cF").value), fb: num($("cFb").value) };
    if (num($("cEach").value)) food.each = num($("cEach").value);
    const ex = S.foods.find((f) => f.n.toLowerCase() === n.toLowerCase());
    if (ex) food.id = ex.id;
    try { await store.put("foods", food); closeCustom(); $("formMsg").textContent = n + " saved to your foods."; }
    catch (e) { $("cMsg").textContent = "Couldn't save: " + e.message; }
  };

  /* ================= groceries ================= */
  function renderPantry() {
    const box = $("pantryTags"); box.innerHTML = "";
    S.pantry.forEach((n) => {
      const t = el("span", "tag", n);
      const x = el("button", null, "×"); x.setAttribute("aria-label", "Remove " + n);
      x.onclick = () => store.setPantry(S.pantry.filter((p) => p !== n));
      t.appendChild(x); box.appendChild(t);
    });
    $("clearPantry").hidden = !S.pantry.length;
    renderIdeas();
  }
  function addPantry(names) {
    const set = new Set(S.pantry);
    names.forEach((n) => set.add(n));
    return store.setPantry(Array.from(set));
  }
  function foodsInText(text) {
    const found = new Set();
    text.toLowerCase().split(/\n+/).forEach((line) => {
      let s = line.replace(/[^a-z0-9%&\s\-]/g, " ").replace(/\s+/g, " ").trim();
      for (let guard = 0; guard < 4 && s; guard++) {
        const hit = findFood(s); if (!hit) break;
        found.add(hit.food.n);
        s = (s.slice(0, hit.start) + " " + s.slice(hit.end)).trim();
      }
    });
    return Array.from(found);
  }
  // Receipt shorthand seen on UK and Indian bills.
  function expandReceipt(text) {
    const map = [[/\bchkn\b|\bchick\b/g, "chicken"], [/\bbrst\b/g, "breast"], [/\bfr rng\b|\bfree rng\b/g, "free range"], [/\bmush\b|\bmshrm\w*/g, "mushrooms"],
      [/\bspnch\b|\bspin\b/g, "spinach"], [/\btom\b|\btoms\b/g, "tomatoes"], [/\bpot\b|\bpots\b/g, "potatoes"], [/\bonin\b|\bonions?\b/g, "onion"],
      [/\byog\b|\byoghrt\b|\byogt\b/g, "yoghurt"], [/\bgrk\b/g, "greek"], [/\bss milk\b|\bsemi skim\w*/g, "semi skimmed milk"], [/\bbrd\b/g, "bread"],
      [/\bwmeal\b|\bwholeml\b/g, "wholemeal"], [/\bbnna\b|\bbnnas\b|\bbananas?\b/g, "banana"], [/\bpnr\b/g, "paneer"], [/\bchk ?peas\b/g, "chickpeas"]];
    let t = text.toLowerCase();
    map.forEach(([re, rep]) => (t = t.replace(re, rep)));
    return t;
  }
  async function readBill(file) {
    const msg = $("ocrMsg"), prog = $("ocrProg"), bar = prog.querySelector("i");
    msg.classList.remove("warn"); msg.textContent = "Loading the text reader (first time takes a few seconds)…";
    prog.hidden = false; bar.style.width = "5%";
    try {
      if (!window.Tesseract) await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js");
      const res = await Tesseract.recognize(file, "eng", {
        logger: (m) => { if (m.status === "recognizing text") { bar.style.width = Math.round(10 + m.progress * 90) + "%"; msg.textContent = "Reading the bill… " + Math.round(m.progress * 100) + "%"; } },
      });
      const items = foodsInText(expandReceipt(res.data.text || ""));
      prog.hidden = true;
      if (!items.length) { msg.textContent = "Couldn't spot food items on that photo. Try a flatter, brighter photo, or add items below."; msg.classList.add("warn"); return; }
      await addPantry(items);
      msg.textContent = "Found " + items.length + " item" + (items.length > 1 ? "s" : "") + ". Remove anything wrong and add anything it missed.";
    } catch (e) {
      prog.hidden = true; msg.classList.add("warn");
      msg.textContent = "Couldn't read the photo (" + (e.message || "error") + "). You can type the items instead.";
    } finally { $("billFile").value = ""; }
  }
  function recipeMacros(r) {
    const rows = r.i.concat(r.side ? [r.side] : []).map(([n, g]) => { const f = foodByName(n); return f ? macrosFor(f, g) : null; }).filter(Boolean);
    return totals(rows);
  }
  // Portions per serving for building plates from whatever is in the groceries.
  const PLATE = {
    protein: { "Egg": 150, "Egg white": 132, "Paneer": 100, "Tofu, firm": 150, "Chicken breast, raw": 150, "Chicken breast, cooked": 120, "Chicken thigh, raw": 150,
      "Salmon": 120, "Tuna, tinned in water": 112, "Prawns": 120, "White fish (cod, basa)": 150, "Soya chunks, dry": 50, "Chickpeas, cooked": 150,
      "Kidney beans, cooked": 150, "Black beans, cooked": 150, "Lentils / dal, dry": 60, "Lentils / dal, cooked": 200, "Mutton (goat)": 150, "Beef mince (10% fat)": 125,
      "Lamb": 125, "Greek yoghurt": 200, "Greek yoghurt, fat free": 200, "Cottage cheese": 200 },
    carb: { "Rice, cooked": 180, "Rice, raw": 60, "Brown rice, cooked": 180, "Roti / chapati": 80, "Bread, wholemeal": 72, "Bread, white": 72, "Wrap / tortilla": 62,
      "Pasta, dry": 80, "Pasta, cooked": 200, "Quinoa, cooked": 180, "Potato": 200, "Sweet potato": 200, "Noodles, cooked": 200, "Oats": 50, "Naan": 90, "Paratha": 80 },
    veg: { "Spinach": 60, "Mushroom": 80, "Onion": 50, "Tomato": 80, "Bell pepper / capsicum": 80, "Broccoli": 80, "Carrot": 60, "Peas": 60, "Green beans": 80,
      "Cauliflower": 100, "Courgette": 100, "Aubergine (brinjal)": 100, "Okra (bhindi)": 100, "Cabbage": 80, "Sweetcorn": 60, "Cucumber": 80, "Lettuce / salad leaves": 40 },
    fruit: { "Banana": 118, "Apple": 180, "Strawberries": 100, "Blueberries": 80, "Mango": 150, "Grapes": 100, "Orange": 130 },
  };
  const SWEET_PROTEIN = new Set(["Greek yoghurt", "Greek yoghurt, fat free", "Cottage cheese"]);
  function buildPlates(pantry) {
    const pick = (cat) => pantry.filter((n) => PLATE[cat][n]);
    const prot = pick("protein").sort((a, b) => (foodByName(b).p * PLATE.protein[b]) - (foodByName(a).p * PLATE.protein[a]));
    const carbs = pick("carb"), veg = pick("veg"), fruit = pick("fruit");
    const plates = [];
    prot.forEach((p, i) => {
      const lc = (n) => n.split(/[,/(]/)[0].trim().toLowerCase();
      if (SWEET_PROTEIN.has(p)) {
        const f = fruit[i % Math.max(fruit.length, 1)];
        const parts = [[p, PLATE.protein[p]]]; if (f) parts.push([f, PLATE.fruit[f]]);
        const oat = carbs.includes("Oats") ? [["Oats", 30]] : [];
        plates.push({ n: lc(p).replace(/^./, (c) => c.toUpperCase()) + (f ? " with " + lc(f) : "") + (oat.length ? " and oats" : "") + " bowl", t: "Breakfast",
          m: "Spoon into a bowl and top with the rest.", i: parts.concat(oat), plate: true });
        return;
      }
      const c = carbs.filter((x) => x !== "Oats")[i % Math.max(carbs.filter((x) => x !== "Oats").length, 1)];
      const vs = veg.length ? [veg[i % veg.length], veg[(i + 1) % veg.length]].filter((v, k, a) => a.indexOf(v) === k) : [];
      const ing = [[p, PLATE.protein[p]]].concat(vs.map((v) => [v, PLATE.veg[v]]));
      if (c) ing.push([c, PLATE.carb[c]]);
      ing.push(["Cooking oil", 8]);
      const name = lc(p).replace(/^./, (x) => x.toUpperCase()) + (vs.length ? ", " + vs.map(lc).join(" and ") : "") + (c ? " with " + lc(c) : "");
      const cook = /egg/i.test(p) ? "Scramble or make an omelette with the vegetables" : /dal|lentil|bean|chickpea|soya/i.test(p) ? "Cook into a simple curry with the vegetables and spices" : "Pan fry with the vegetables and your usual spices";
      plates.push({ n: name, t: /egg/i.test(p) ? "Breakfast" : "Dinner", m: cook + (c ? ", serve with " + lc(c) + "." : "."), i: ing, plate: true });
    });
    return plates.slice(0, 4);
  }
  const lcName = (n) => n.split(/[,/(]/)[0].trim().toLowerCase();
  const baseName = (n) => n.replace(/, (raw|cooked|dry|whole|semi-skimmed|skimmed|fat free|firm|plain|fresh)$/i, "");
  function ideaCard(x) {
    const d = el("div", "idea");
    const ih = el("div", "ih");
    ih.append(el("b", null, x.r.n), el("span", "num", x.mac.kcal + " kcal · " + fmt(x.mac.protein) + "g protein"));
    const badges = el("div", "tags");
    const hv = el("span", "have" + (x.missing.length ? "" : " full"), x.missing.length ? "Also needs " + x.missing.map(lcName).join(", ") : "You have everything");
    badges.appendChild(hv);
    if (x.r.side) badges.appendChild(el("span", "have", "with " + lcName(x.r.side[0])));
    const det = el("details");
    const sm = el("summary", "hint", "Ingredients and method"); sm.style.cursor = "pointer";
    const ing = el("div", "ing", x.r.i.concat(x.r.side ? [x.r.side] : []).map(([n, g]) => lcName(n) + " " + g + "g").join(" · "));
    ing.style.marginTop = "6px";
    det.append(sm, ing, el("p", "hint", x.r.m));
    const acts = el("div", "actions");
    const use = el("button", "btn ghost small", "Log this meal");
    use.onclick = () => {
      clearForm(); setMode("cooked");
      if (TYPES.includes(x.r.t)) { type = x.r.t; renderChips(); }
      $("mealName").value = x.r.n + (x.r.side ? " with " + lcName(x.r.side[0]) : "");
      $("mealText").value = x.r.i.concat(x.r.side ? [x.r.side] : []).map(([n, g]) => { const f = foodByName(n); return g + "g " + ((f && f.a && f.a[0]) || n.toLowerCase()); }).join("\n");
      refreshBreakdown();
      $("formMsg").textContent = "Filled with one serving. Change the grams to what you actually used.";
      show("add");
    };
    acts.appendChild(use);
    d.append(ih, badges, det, acts);
    return d;
  }
  function renderIdeas() {
    const box = $("ideasBox"); box.innerHTML = "";
    if (!S.pantry.length) { box.appendChild(el("div", "empty", "Add a bill photo or a few items (rajma, chana, karela, bhindi, paneer…) and dishes appear here.")); return; }
    const have = new Set(S.pantry.map(baseName)), staples = new Set(window.STAPLES);
    const hp = $("highProtein").checked;
    const groups = new Map(); // pantry item -> dishes
    window.RECIPES.forEach((r) => {
      const owner = S.pantry.find((p) => r.main.some((m) => baseName(m) === baseName(p)));
      if (!owner) return;
      const missing = r.i.map((x) => x[0]).filter((n, k, a) => a.indexOf(n) === k && !staples.has(n) && !have.has(baseName(n)));
      const item = { r, missing, mac: recipeMacros(r) };
      if (!groups.has(owner)) groups.set(owner, []);
      groups.get(owner).push(item);
    });
    const total = Array.from(groups.values()).reduce((a, g) => a + g.length, 0);
    box.appendChild(el("div", "eyebrow", total ? total + " dishes from your groceries" : "No dishes found yet"));
    let opened = 0;
    S.pantry.forEach((p) => {
      const list = groups.get(p); if (!list) return;
      list.sort((a, b) => (a.missing.length - b.missing.length) || ((a.r.cuisine === "Indian" ? 0 : 1) - (b.r.cuisine === "Indian" ? 0 : 1)) || (hp ? b.mac.protein - a.mac.protein : 0));
      const det = el("details", "card");
      if (opened < 3) det.open = true; opened++;
      const sum = el("summary"); sum.style.cssText = "cursor:pointer;display:flex;justify-content:space-between;align-items:baseline;gap:8px";
      const ready = list.filter((x) => !x.missing.length).length;
      sum.append(el("h2", null, "With " + lcName(p)), el("span", "hint", list.length + " dish" + (list.length > 1 ? "es" : "") + (ready ? " · " + ready + " ready" : "")));
      det.appendChild(sum);
      const inner = el("div"); inner.style.cssText = "display:flex;flex-direction:column;gap:10px;margin-top:4px";
      list.forEach((x) => inner.appendChild(ideaCard(x)));
      det.appendChild(inner);
      box.appendChild(det);
    });
    const unused = S.pantry.filter((p) => !groups.has(p) && !staples.has(p));
    if (!total) {
      const plates = buildPlates(S.pantry).map((r) => ({ r: { ...r, side: null }, missing: [], mac: recipeMacros(r) }));
      if (plates.length) plates.forEach((x) => box.appendChild(ideaCard(x)));
      else box.appendChild(el("div", "empty", "No dish uses these items yet. Try adding a main ingredient such as rajma, chana, dal, paneer, eggs, chicken, bhindi or karela."));
    } else if (unused.length) {
      box.appendChild(el("p", "hint", "Used in other dishes or as basics: " + unused.map(lcName).join(", ") + "."));
    }
  }

  /* ================= ate out: photo estimate + dish list ================= */
  const AI_KEY = "platelog-ai";
  const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.3.0/+esm";
  const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
  const GROQ_DEFAULT_MODEL = "qwen/qwen3.8-27b";
  function readAi() {
    let a = {};
    try { a = JSON.parse(localStorage.getItem(AI_KEY)) || {}; } catch (e) {}
    if (a.key && !a.claudeKey) { a.claudeKey = a.key; a.claudeModel = a.model; a.provider = a.provider || "claude"; delete a.key; delete a.model; }
    a.provider = a.provider || "groq";
    return a;
  }
  function writeAi() { try { localStorage.setItem(AI_KEY, JSON.stringify(ai)); } catch (e) {} }
  let ai = readAi();
  let mode = "cooked", outImage = null, outSize = 1, mealExtra = {};
  const aiKeyFor = (p) => (p === "claude" ? ai.claudeKey : ai.groqKey);
  function setMode(m) {
    mode = m;
    document.querySelectorAll("#modeSeg .chip").forEach((b) => b.setAttribute("aria-pressed", b.dataset.mode === m));
    $("outCard").hidden = m !== "out"; $("cookedCard").hidden = m !== "cooked";
    if (m === "out") renderOutList();
  }
  document.querySelectorAll("#modeSeg .chip").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  function renderAiForm(p) {
    const claude = p === "claude";
    $("aiHowGroq").hidden = claude; $("aiHowClaude").hidden = !claude;
    $("aiKeyLabel").textContent = claude ? "Claude API key" : "Groq API key";
    $("aiModelRow").hidden = !claude; $("aiAdvanced").hidden = claude;
    $("aiKeySaved").hidden = !aiKeyFor(p);
    $("aiOff").hidden = !aiKeyFor(p);
  }
  function renderAi() {
    const on = !!aiKeyFor(ai.provider);
    $("aiState").textContent = on ? "On · " + (ai.provider === "claude" ? "Claude" : "Groq (free)") : "Off";
    $("aiState").className = "have" + (on ? " full" : "");
    $("aiProvider").value = ai.provider;
    $("aiModel").value = ai.claudeModel || "claude-opus-5-5";
    $("aiGroqModel").value = ai.groqModel || GROQ_DEFAULT_MODEL;
    renderAiForm(ai.provider);
    $("outNoKey").hidden = on; $("outEstimate").hidden = !on;
  }
  $("aiProvider").onchange = () => renderAiForm($("aiProvider").value);
  $("aiSave").onclick = () => {
    const p = $("aiProvider").value, k = $("aiKey").value.trim();
    if (k) {
      if (p === "groq" && !/^gsk_/.test(k)) { $("aiMsg").textContent = "That doesn't look like a Groq key. It starts with gsk_."; return; }
      if (p === "claude" && !/^sk-ant-/.test(k)) { $("aiMsg").textContent = "That doesn't look like a Claude key. It starts with sk-ant-."; return; }
      if (p === "groq") ai.groqKey = k; else ai.claudeKey = k;
    } else if (!aiKeyFor(p)) { $("aiMsg").textContent = "Paste your key first."; return; }
    ai.provider = p; ai.claudeModel = $("aiModel").value;
    const gm = $("aiGroqModel").value.trim(); ai.groqModel = gm && gm !== GROQ_DEFAULT_MODEL ? gm : undefined;
    writeAi(); $("aiKey").value = ""; $("aiMsg").textContent = ""; renderAi(); toast("Photo estimates on");
  };
  $("aiOff").onclick = () => {
    if ($("aiOff").dataset.armed !== "1") { $("aiOff").dataset.armed = "1"; $("aiOff").textContent = "Tap again to remove"; setTimeout(() => { $("aiOff").dataset.armed = ""; $("aiOff").textContent = "Remove this key from this device"; }, 3000); return; }
    if ($("aiProvider").value === "claude") delete ai.claudeKey; else delete ai.groqKey;
    writeAi(); renderAi(); toast("Key removed");
  };

  // Shrink the photo before sending: smaller upload, fewer tokens, same accuracy.
  function loadPhoto(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const max = 1280, sc = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        const dataUrl = c.toDataURL("image/jpeg", 0.85);
        resolve({ dataUrl, b64: dataUrl.split(",")[1] });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file couldn't be opened as a photo.")); };
      img.src = url;
    });
  }
  $("outPhoto").onchange = async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try {
      outImage = await loadPhoto(f);
      $("outPreview").src = outImage.dataUrl; $("outPreview").hidden = false; $("outDropText").textContent = "Change photo";
      $("outMsg").textContent = ""; $("outResult").innerHTML = "";
    } catch (err) { $("outMsg").textContent = err.message; }
  };

  function extractJson(text) {
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    if (s < 0 || e <= s) return null;
    try { return JSON.parse(text.slice(s, e + 1)); } catch (err) { return null; }
  }
  async function estimateOut() {
    const place = $("outPlace").value.trim(), note = $("outNote").value.trim();
    if (!outImage && !note) { $("outMsg").textContent = "Add a photo, or describe what you ate in the box above."; return; }
    const btn = $("outEstimate"), prog = $("outProg"), bar = prog.querySelector("i");
    btn.disabled = true; btn.textContent = place && ai.provider === "claude" ? "Checking the menu and estimating…" : "Estimating…";
    $("outMsg").classList.remove("warn"); $("outMsg").textContent = ""; $("outResult").innerHTML = "";
    prog.hidden = false; bar.style.width = "15%";
    const tick = setInterval(() => { const w = parseFloat(bar.style.width); if (w < 90) bar.style.width = w + 4 + "%"; }, 800);
    try {
      const useGroq = ai.provider !== "claude";
      const prompt =
        "Estimate the nutrition of a meal someone ate out.\n" +
        "Where they ate: " + (place || "not given") + "\n" +
        "Their notes: " + (note || "none") + "\n" +
        "They live in London, UK, so assume UK restaurants and portions unless the place says otherwise.\n\n" +
        "How to work it out:\n" +
        "1. " + (outImage ? "Identify each item in the photo and estimate its portion from visual cues (plate size, cutlery, typical restaurant portions)." : "Work from their description.") + "\n" +
        "2. " + (place ? (useGroq ? "If you know this place's published nutrition for the dish (many UK chains publish it), use it, adjusted for what was actually eaten; set source to \"menu\" only if you are confident of those figures." : "If the place publishes nutrition (most UK chains do), search for the dish's published calories and use them, adjusted for what was actually eaten. Prefer the restaurant's own site.") : "No place was given, so use typical restaurant values.") + "\n" +
        "3. Otherwise use typical restaurant values. Restaurant food usually has more oil, butter and cream than home cooking.\n" +
        "4. Apply their notes (for example 'ate half' halves everything).\n\n" +
        "Reply with only this JSON object and nothing else:\n" +
        '{"dish": string, "items": [{"item": string, "portion": string, "kcal": number, "protein": number, "carbs": number, "fat": number, "fibre": number}], ' +
        '"total": {"kcal": number, "protein": number, "carbs": number, "fat": number, "fibre": number}, ' +
        '"source": "menu" or "estimate", "source_name": string or null, "source_url": string or null, "confidence": "high" or "medium" or "low", "note": "one short sentence on what you assumed"}\n' +
        "Grams for macros. Single numbers, no ranges.";
      let out;
      if (useGroq) {
        const content = [{ type: "text", text: prompt }];
        if (outImage) content.push({ type: "image_url", image_url: { url: outImage.dataUrl } });
        const r = await fetch(GROQ_URL, {
          method: "POST",
          headers: { Authorization: "Bearer " + ai.groqKey, "Content-Type": "application/json" },
          body: JSON.stringify({ model: ai.groqModel || GROQ_DEFAULT_MODEL, messages: [{ role: "user", content }], response_format: { type: "json_object" }, temperature: 0.3, max_completion_tokens: 3000 }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          const m = (j.error && j.error.message) || "Groq said " + r.status;
          const code = j.error && j.error.code;
          if (r.status === 401) throw Object.assign(new Error("key"), { status: 401 });
          if (r.status === 429) throw Object.assign(new Error(m), { status: 429 });
          if (code === "model_decommissioned" || code === "model_not_found" || /model.*(not exist|decommission|not found|does not support)/i.test(m))
            throw new Error("Groq has changed its photo model. Open Progress → Photo estimates → Advanced and enter a current vision model from console.groq.com/docs/vision.");
          throw Object.assign(new Error(m), { status: r.status });
        }
        const text = ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "").replace(/<think>[\s\S]*?<\/think>/g, "");
        out = extractJson(text);
      } else {
      const { default: Anthropic } = await import(SDK_URL);
      const client = new Anthropic({ apiKey: ai.claudeKey, dangerouslyAllowBrowser: true });
      const content = [];
      if (outImage) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: outImage.b64 } });
      content.push({ type: "text", text: prompt });
      const messages = [{ role: "user", content }];
      const params = {
        model: ai.claudeModel || "claude-opus-5-5",
        max_tokens: 16000,
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        messages,
      };
      if (place) params.tools = [{ type: "web_search_20260209", name: "web_search", max_uses: 3, user_location: { type: "approximate", city: "London", country: "GB", timezone: "Europe/London" } }];
      let res;
      for (let i = 0; i < 4; i++) {
        res = await client.beta.messages.create(params);
        if (res.stop_reason !== "pause_turn") break;
        messages.push({ role: "assistant", content: res.content }); // let the search loop carry on
      }
      if (res.stop_reason === "refusal") throw new Error("Claude declined to estimate this one. Try the dish list instead.");
      const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
      out = extractJson(text);
      }
      if (!out || !out.total) throw new Error("The estimate came back in a form the site couldn't read. Try again.");
      renderEstimate(out, place);
    } catch (e) {
      let msg = e && e.message ? e.message : "Something went wrong.";
      const st = e && e.status;
      if (st === 401) msg = "Your " + (ai.provider === "claude" ? "Claude" : "Groq") + " key was rejected. Check it under Progress → Photo estimates.";
      else if (st === 429) msg = ai.provider === "claude" ? "Too many requests right now. Wait a minute and try again." : "You have hit Groq's free limit for now. Wait a minute (or until tomorrow if you have done a lot today) and try again.";
      else if (st === 400 && /credit|balance|billing/i.test(msg)) msg = "Your Anthropic account has no credit left. Add credit at console.anthropic.com → Billing.";
      else if (st >= 500) msg = (ai.provider === "claude" ? "Claude" : "Groq") + " is busy right now. Try again in a minute.";
      else if (/Failed to fetch|NetworkError|Load failed|import/i.test(msg)) msg = "Couldn't reach " + (ai.provider === "claude" ? "Claude" : "Groq") + ". Check your internet connection.";
      $("outMsg").classList.add("warn"); $("outMsg").textContent = msg;
    } finally {
      clearInterval(tick); prog.hidden = true; btn.disabled = false; btn.textContent = "Estimate calories";
    }
  }
  $("outEstimate").onclick = estimateOut;

  function renderEstimate(out, place) {
    const box = $("outResult"); box.innerHTML = "";
    const t = { kcal: Math.round(num(out.total.kcal)), protein: r1(num(out.total.protein)), carbs: r1(num(out.total.carbs)), fat: r1(num(out.total.fat)), fibre: r1(num(out.total.fibre)) };
    const card = el("div", "idea");
    const ih = el("div", "ih"); ih.append(el("b", null, String(out.dish || "Your meal").slice(0, 100)), el("span", "num", t.kcal + " kcal"));
    const tags = el("div", "tags");
    const src = out.source === "menu" ? "From " + String(out.source_name || "the restaurant's nutrition info").slice(0, 60) : "Estimated from the photo";
    tags.append(el("span", "have" + (out.source === "menu" ? " full" : ""), src), el("span", "have", (out.confidence || "medium") + " confidence"));
    card.append(ih, macroLine(t), tags);
    if (Array.isArray(out.items) && out.items.length) {
      const tbl = el("table", "bd");
      tbl.innerHTML = "<thead><tr><th>Item</th><th>kcal</th><th>Protein</th><th>Carbs</th><th>Fat</th></tr></thead>";
      const tb = el("tbody");
      out.items.slice(0, 12).forEach((it) => {
        const tr = el("tr"); const td = el("td");
        td.append(el("span", null, String(it.item || "").slice(0, 80)), el("span", "src", String(it.portion || "").slice(0, 60)));
        tr.append(td, el("td", null, String(Math.round(num(it.kcal)))), el("td", null, fmt(r1(num(it.protein)))), el("td", null, fmt(r1(num(it.carbs)))), el("td", null, fmt(r1(num(it.fat)))));
        tb.appendChild(tr);
      });
      tbl.appendChild(tb);
      const wrap = el("div", "scroll"); wrap.appendChild(tbl); card.appendChild(wrap);
    }
    if (out.note) card.appendChild(el("p", "hint", String(out.note).slice(0, 300)));
    if (out.source_url && /^https?:\/\//.test(out.source_url)) {
      const a = el("a", "hint", "Source: " + String(out.source_url).replace(/^https?:\/\//, "").slice(0, 60)); a.href = out.source_url; a.target = "_blank"; a.rel = "noopener";
      card.appendChild(a);
    }
    const acts = el("div", "actions");
    const use = el("button", "btn", "Use this estimate");
    use.onclick = () => useOut({ name: String(out.dish || "Meal out").slice(0, 100), ...t, place, sourceUrl: out.source_url || null,
      items: (out.items || []).slice(0, 12).map((it) => String(it.item || "") + (it.portion ? " (" + it.portion + ")" : "")).join("\n") });
    acts.appendChild(use); card.appendChild(acts);
    box.appendChild(card);
  }
  function useOut(o) {
    $("mealName").value = o.name + (o.place ? " · " + o.place : "");
    $("mealText").value = ""; gramOverride = {}; refreshBreakdown();
    macroManual = true; fillMacros(o);
    document.querySelector("#saveBtn").closest(".card").querySelector("details").open = true;
    mealExtra = { source: "out", place: o.place || null, sourceUrl: o.sourceUrl || null, outItems: o.items || "" };
    $("formMsg").textContent = "Check the numbers, then tap Add to log.";
    $("saveBtn").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  document.querySelectorAll("#outSize .chip").forEach((b) => (b.onclick = () => {
    outSize = parseFloat(b.dataset.size);
    document.querySelectorAll("#outSize .chip").forEach((x) => x.setAttribute("aria-pressed", x === b));
    renderOutList();
  }));
  $("outSearch").addEventListener("input", () => renderOutList());
  function renderOutList() {
    const q = $("outSearch").value.trim().toLowerCase();
    const box = $("outList"); box.innerHTML = "";
    const words = q.split(/\s+/).filter(Boolean);
    const rows = window.EATOUT.filter(([n, g]) => words.every((w) => (n + " " + g).toLowerCase().includes(w))).slice(0, 40);
    if (!rows.length) { box.appendChild(el("div", "mempty", "No dish matches. Try a simpler word, or use a photo.")); return; }
    rows.forEach(([n, g, k, p, c, f, fb]) => {
      const m = outSize, v = { kcal: Math.round(k * m), protein: r1(p * m), carbs: r1(c * m), fat: r1(f * m), fibre: r1(fb * m) };
      const b = el("button", "outrow");
      const left = el("div"); left.append(el("b", null, n), el("small", null, " · " + g));
      b.append(left, el("span", "num", v.kcal + " kcal · " + fmt(v.protein) + "g P"));
      b.onclick = () => useOut({ name: n + (m !== 1 ? (m < 1 ? " (small)" : " (large)") : ""), ...v, place: $("outPlace").value.trim() });
      box.appendChild(b);
    });
  }
  renderAi();

  /* ---------- set up another device (QR / link) ---------- */
  const b64url = (str) => b64enc(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unb64url = (s) => b64dec(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  function setupPayload() {
    const p = { v: 1 };
    if (sync.cfg.token && sync.cfg.repo) { p.repo = sync.cfg.repo; p.token = sync.cfg.token; }
    if (ai.groqKey) p.groq = ai.groqKey;
    if (ai.claudeKey) p.claude = ai.claudeKey;
    if (ai.groqModel) p.gm = ai.groqModel;
    if (ai.claudeModel) p.cm = ai.claudeModel;
    p.pv = ai.provider;
    return p;
  }
  $("linkShow").onclick = async () => {
    const p = setupPayload();
    if (!p.token && !p.groq && !p.claude) { $("linkMsg").textContent = "Turn on sync or photo estimates on this device first. Then the code can copy them to your other device."; return; }
    const url = location.origin + location.pathname + "#setup=" + b64url(JSON.stringify(p));
    $("linkText").value = url;
    try {
      if (!window.qrcode) await loadScript("https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js");
      const qr = qrcode(0, "M"); qr.addData(url); qr.make();
      $("linkQr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      const svg = $("linkQr").querySelector("svg"); if (svg) { svg.style.width = "240px"; svg.style.height = "240px"; }
    } catch (e) { $("linkQr").innerHTML = ""; $("linkMsg").textContent = "Couldn't draw the code. Use Copy link instead."; }
    const parts = [p.token ? "sync" : null, p.groq || p.claude ? "photo estimates" : null].filter(Boolean).join(" and ");
    $("linkMsg").textContent = "This code sets up " + parts + ".";
    $("linkBox").hidden = false; $("linkShow").hidden = true;
  };
  $("linkHide").onclick = () => { $("linkBox").hidden = true; $("linkShow").hidden = false; $("linkQr").innerHTML = ""; $("linkText").value = ""; $("linkMsg").textContent = ""; };
  $("linkCopy").onclick = async () => {
    const t = $("linkText").value;
    try { await navigator.clipboard.writeText(t); toast("Link copied"); }
    catch (e) { const i = $("linkText"); i.hidden = false; i.select(); $("linkMsg").textContent = "Select the link above and copy it."; }
  };
  function consumeSetupLink() {
    if (!location.hash.startsWith("#setup=")) return false;
    let p = null;
    try { p = JSON.parse(unb64url(location.hash.slice(7))); } catch (e) {}
    history.replaceState(null, "", location.pathname + "#today");
    if (!p || p.v !== 1) { toast("That setup link didn't work. Show a new code and try again."); return true; }
    if (p.token && p.repo) { sync.cfg = { token: p.token, repo: p.repo, last: 0 }; writeSync(sync.cfg); }
    if (p.groq) ai.groqKey = p.groq;
    if (p.claude) ai.claudeKey = p.claude;
    if (p.gm) ai.groqModel = p.gm;
    if (p.cm) ai.claudeModel = p.cm;
    if (p.pv) ai.provider = p.pv;
    writeAi(); renderAi();
    $("syncRepo").value = sync.cfg.repo || DEFAULT_REPO; renderSync();
    toast("This device is set up" + (p.token ? ". Loading your meals…" : ""));
    return true;
  }
  window.addEventListener("hashchange", () => { if (consumeSetupLink()) { show("today"); sync.run(); } });

  /* ================= goals, export ================= */
  function renderGoals() { const g = S.goals; $("gKcal").value = g.kcal; $("gProtein").value = g.protein; $("gCarbs").value = g.carbs; $("gFat").value = g.fat; $("gFibre").value = g.fibre; }
  $("saveGoals").onclick = async () => {
    const g = { kcal: num($("gKcal").value), protein: num($("gProtein").value), carbs: num($("gCarbs").value), fat: num($("gFat").value), fibre: num($("gFibre").value) };
    try { await store.setGoals(g); $("goalsMsg").textContent = "Goals saved."; } catch (e) { $("goalsMsg").textContent = "Couldn't save: " + e.message; }
  };
  $("exportCsv").onclick = () => {
    const q = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const rows = [["date", "meal", "name", "ingredients", "kcal", "protein_g", "carbs_g", "fat_g", "fibre_g"]];
    S.meals.slice().sort((a, b) => (a.date + (a.createdAt || 0)).localeCompare(b.date + (b.createdAt || 0)))
      .forEach((m) => rows.push([m.date, m.type, m.name, (m.ingredients || "").replace(/\n/g, "; "), m.kcal, m.protein, m.carbs, m.fat, m.fibre]));
    const blob = new Blob([rows.map((r) => r.map(q).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "plate-log-" + todayStr() + ".csv";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  /* ================= wiring ================= */
  $("prevDay").onclick = () => { day = shift(day, -7); renderAll(); };
  $("nextDay").onclick = () => { const n = shift(day, 7), t = todayStr(); day = n > t ? t : n; renderAll(); };
  $("dayPick").onchange = (e) => { if (e.target.value) { day = e.target.value; renderAll(); } };
  let deb; $("mealText").addEventListener("input", () => { clearTimeout(deb); macroManual = false; deb = setTimeout(refreshBreakdown, 250); });
  ["fKcal", "fProtein", "fCarbs", "fFat", "fFibre"].forEach((id) => $(id).addEventListener("input", () => (macroManual = true)));
  $("saveBtn").onclick = saveMeal;
  $("cancelEdit").onclick = () => { clearForm(); $("formMsg").textContent = ""; show("today"); };
  $("savedPick").onchange = (e) => { const f = S.favs.find((x) => x.id === e.target.value); if (f) loadIntoForm(f); e.target.value = ""; };
  $("billFile").onchange = (e) => { const f = e.target.files && e.target.files[0]; if (f) readBill(f); };
  $("pantryAdd").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return; e.preventDefault();
    const v = e.target.value.trim(); if (!v) return;
    const items = foodByName(v) ? [v] : foodsInText(v.replace(/,/g, "\n"));
    if (items.length) { addPantry(items); e.target.value = ""; $("ocrMsg").textContent = ""; }
    else $("ocrMsg").textContent = "“" + v + "” isn't in the food list yet. Add it from the logging form to use it.";
  });
  $("pantryAdd").addEventListener("change", (e) => { const v = e.target.value.trim(); if (foodByName(v)) { addPantry([v]); e.target.value = ""; } });
  $("clearPantry").onclick = () => store.setPantry([]);
  $("highProtein").onchange = renderIdeas;

  buildIndex(); renderChips(); renderMetricChips();
  loadLocalIntoState();
  consumeSetupLink();
  show(location.hash.slice(1) || "today");
  initSync();

  // expose parser for testing
  window.__plate = { parseLine, macrosFor, foodsInText, expandReceipt };
})();
