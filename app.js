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
  // Same API for local storage and Firebase. Data kept in memory in `S`.
  const LS_KEY = "platelog-v1";
  const S = { meals: [], foods: [], favs: [], goals: { ...DEFAULT_GOALS }, pantry: [] };
  let mode = "local"; // or "cloud"
  let fb = null;      // { db, auth, user, unsubs: [] }
  function readLocal() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } }
  function writeLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ meals: S.meals, foods: S.foods, favs: S.favs, goals: S.goals, pantry: S.pantry })); }
    catch (e) { status("Couldn't save on this device (storage full or blocked).", true); }
  }
  function loadLocalIntoState() {
    const L = readLocal();
    S.meals = L.meals || []; S.foods = L.foods || []; S.favs = L.favs || [];
    S.goals = { ...DEFAULT_GOALS, ...(L.goals || {}) }; S.pantry = L.pantry || [];
    onData();
  }
  const userCol = (name) => fb.db.collection("users").doc(fb.user.uid).collection(name);
  const userDoc = (name) => fb.db.collection("users").doc(fb.user.uid).collection("settings").doc(name);

  const store = {
    async put(coll, item) { // coll: meals | foods | favs
      if (!item.id) item.id = uid();
      if (mode === "cloud") { const { id, ...data } = item; await userCol(coll).doc(id).set(data); return; }
      const arr = S[coll]; const i = arr.findIndex((x) => x.id === item.id);
      if (i >= 0) arr[i] = item; else arr.push(item);
      writeLocal(); onData();
    },
    async del(coll, id) {
      if (mode === "cloud") { await userCol(coll).doc(id).delete(); return; }
      S[coll] = S[coll].filter((x) => x.id !== id); writeLocal(); onData();
    },
    async setGoals(g) {
      if (mode === "cloud") { await userDoc("goals").set(g); return; }
      S.goals = g; writeLocal(); onData();
    },
    async setPantry(items) {
      S.pantry = items;
      if (mode === "cloud") { await userDoc("pantry").set({ items }); return; }
      writeLocal(); onData();
    },
  };

  function onData() {
    customFoods = S.foods.map((f) => ({ ...f, custom: true }));
    buildIndex();
    renderGoals(); renderAll(); renderFavs(); renderPantry(); refreshBreakdown();
  }

  /* ---------- Firebase (optional, for sync between devices) ---------- */
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  async function initFirebase() {
    const cfg = window.PLATE_FIREBASE;
    if (!cfg || !cfg.apiKey) { renderAccount(); status("Saved on this device"); return; }
    try {
      const v = "10.12.2", base = "https://www.gstatic.com/firebasejs/" + v + "/";
      await loadScript(base + "firebase-app-compat.js");
      await Promise.all([loadScript(base + "firebase-auth-compat.js"), loadScript(base + "firebase-firestore-compat.js")]);
      firebase.initializeApp(cfg);
      fb = { db: firebase.firestore(), auth: firebase.auth(), user: null, unsubs: [] };
      try { await fb.db.enablePersistence({ synchronizeTabs: true }); } catch (e) { /* offline cache optional */ }
      fb.auth.getRedirectResult().catch(() => {});
      fb.auth.onAuthStateChanged((user) => {
        fb.unsubs.forEach((u) => u()); fb.unsubs = [];
        fb.user = user;
        if (user) startCloud(); else { mode = "local"; loadLocalIntoState(); status("Saved on this device. Sign in to sync with your other devices."); }
        renderAccount();
      });
    } catch (e) {
      status("Couldn't load sync. Saving on this device for now.", true); renderAccount();
    }
  }
  function startCloud() {
    mode = "cloud";
    status("Syncing…");
    const got = { meals: false, foods: false, favs: false };
    const listen = (name) => fb.unsubs.push(userCol(name).onSnapshot((snap) => {
      S[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      got[name] = true;
      if (!snap.metadata.fromCache) status("Synced to your account · " + S.meals.length + " meals logged");
      onData();
    }, (e) => status("Sync stopped: " + e.message, true)));
    listen("meals"); listen("foods"); listen("favs");
    fb.unsubs.push(userDoc("goals").onSnapshot((d) => { S.goals = { ...DEFAULT_GOALS, ...(d.exists ? d.data() : {}) }; onData(); }, () => {}));
    fb.unsubs.push(userDoc("pantry").onSnapshot((d) => { S.pantry = d.exists ? d.data().items || [] : []; onData(); }, () => {}));
  }
  function renderAccount() {
    const a = $("account"); a.innerHTML = "";
    if (!fb) return;
    if (fb.user) {
      a.appendChild(el("span", "muted", "Signed in as " + (fb.user.email || "you")));
      const out = el("button", "linkbtn", "Sign out"); out.onclick = () => fb.auth.signOut(); a.appendChild(out);
      const L = readLocal();
      const n = (L.meals || []).length + (L.foods || []).length + (L.favs || []).length;
      if (n) {
        const mv = el("button", "btn ghost small", "Move " + (L.meals || []).length + " meals saved on this device into my account");
        mv.onclick = async () => {
          mv.disabled = true; mv.textContent = "Moving…";
          try {
            const batch = fb.db.batch();
            ["meals", "foods", "favs"].forEach((c) => (L[c] || []).forEach((it) => { const { id, ...d } = it; batch.set(userCol(c).doc(id || uid()), d); }));
            if (L.goals) batch.set(userDoc("goals"), L.goals);
            await batch.commit();
            try { localStorage.removeItem(LS_KEY); } catch (e) {}
            renderAccount();
          } catch (e) { mv.disabled = false; mv.textContent = "Move failed, try again"; }
        };
        a.appendChild(mv);
      }
    } else {
      const b = el("button", "btn small", "Sign in with Google to sync");
      b.onclick = async () => {
        const p = new firebase.auth.GoogleAuthProvider();
        try { await fb.auth.signInWithPopup(p); }
        catch (e) {
          if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") fb.auth.signInWithRedirect(p);
          else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") status("Sign in failed: " + e.message, true);
        }
      };
      a.appendChild(b);
    }
  }

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
      b.onclick = () => { type = t; renderChips(); };
      box.appendChild(b);
    });
  }
  function renderFacts() {
    const list = S.meals.filter((m) => m.date === day);
    const t = totals(list), g = S.goals;
    $("factsSub").textContent = nice(day) + " · " + list.length + (list.length === 1 ? " meal" : " meals");
    $("kcalBig").textContent = t.kcal;
    const left = Math.round(g.kcal - t.kcal);
    $("kcalOf").textContent = "of " + g.kcal + " kcal · " + (left >= 0 ? left + " left" : -left + " over");
    $("macroRows").innerHTML = MACROS.map((m) => {
      const goal = g[m.k] || 0, v = t[m.k], p = goal ? Math.round((v / goal) * 100) : 0;
      const over = (m.k === "carbs" || m.k === "fat") && p > 100;
      return '<div class="row"><div class="name">' + m.name + " <span>" + fmt(v) + "g / " + goal + 'g</span></div><div class="pct' + (over ? " over" : "") + '">' + p +
        '%</div><div class="bar"><i style="width:' + Math.min(p, 100) + "%;background:" + m.color + '"></i></div></div>';
    }).join("");
    const e = t.protein * 4 + t.carbs * 4 + t.fat * 9;
    const pc = (x) => Math.round((x / e) * 100);
    $("energySplit").innerHTML = e > 0 ? "<span>Energy split</span>" +
      '<span><i class="sw" style="background:var(--protein)"></i>Protein <b>' + pc(t.protein * 4) + "%</b></span>" +
      '<span><i class="sw" style="background:var(--carbs)"></i>Carbs <b>' + pc(t.carbs * 4) + "%</b></span>" +
      '<span><i class="sw" style="background:var(--fat)"></i>Fat <b>' + pc(t.fat * 9) + "%</b></span>" : "";
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
    $("logTitle").textContent = "Meals · " + nice(day);
    const box = $("mealList"); box.innerHTML = "";
    if (!list.length) {
      box.appendChild(el("div", "empty", "Nothing logged for this day yet. Type your ingredients in the form above and tap Add to log."));
      return;
    }
    TYPES.forEach((t) => {
      const group = list.filter((m) => m.type === t); if (!group.length) return;
      const gt = totals(group);
      const g = el("div", "mealgroup");
      const h = el("h3"); h.append(el("span", null, t), el("span", "num", gt.kcal + " kcal · " + fmt(gt.protein) + "g protein"));
      g.appendChild(h);
      group.forEach((m) => {
        const row = el("div", "entry");
        row.append(el("div", "what", m.name || "Meal"), el("div", "kc", Math.round(num(m.kcal)) + " kcal"), macroLine(m));
        const ops = el("div", "ops");
        const ed = el("button", "linkbtn", "Edit"); ed.onclick = () => startEdit(m);
        const del = el("button", "linkbtn danger", "Delete");
        del.onclick = async () => {
          if (del.dataset.armed !== "1") { del.dataset.armed = "1"; del.textContent = "Tap again to delete"; setTimeout(() => { del.dataset.armed = ""; del.textContent = "Delete"; }, 3000); return; }
          try { await store.del("meals", m.id); } catch (e) { status("Couldn't delete: " + e.message, true); }
        };
        ops.append(ed, del); row.appendChild(ops);
        if (m.ingredients && m.ingredients.replace(/\n/g, ", ") !== m.name) row.appendChild(el("div", "ing", m.ingredients.split("\n").filter(Boolean).join(" · ")));
        g.appendChild(row);
      });
      box.appendChild(g);
    });
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
    $("dayPick").value = day;
    $("nextDay").disabled = day >= todayStr();
    renderFacts(); renderLog(); renderWeek();
  }

  /* ================= logging form ================= */
  function refreshBreakdown() {
    const lines = $("mealText").value.split("\n").map((l) => l.trim()).filter(Boolean);
    parsed = lines.map(parseLine).filter(Boolean).map((r) => {
      if (r.food && gramOverride[r.raw] != null) { r.grams = gramOverride[r.raw]; r.how = "your amount"; }
      return r;
    });
    const box = $("breakdown");
    if (!parsed.length) { box.hidden = true; if (!macroManual) fillMacros({}); return; }
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
    $("formTitle").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function saveMeal() {
    const mac = readMacros();
    const ing = $("mealText").value.trim();
    const name = $("mealName").value.trim() || ing.split("\n").map((s) => s.trim()).filter(Boolean).join(", ").slice(0, 120);
    if (!name && !mac.kcal) { $("formMsg").textContent = "Add some ingredients or numbers first."; return; }
    const overrides = {}; parsed.forEach((r) => { if (r.food && gramOverride[r.raw] != null) overrides[r.raw] = gramOverride[r.raw]; });
    const items = parsed.filter((r) => r.food).map((r) => ({ food: r.food.n, grams: r.grams }));
    const old = editingId ? S.meals.find((m) => m.id === editingId) : null;
    const meal = { id: editingId || undefined, date: old ? old.date : day, type, name, ingredients: ing, items, overrides, ...mac, createdAt: old ? old.createdAt : Date.now() };
    $("saveBtn").disabled = true; $("formMsg").textContent = "Saving…";
    try {
      await store.put("meals", meal);
      if ($("saveFav").checked) {
        const ex = S.favs.find((f) => (f.name || "").toLowerCase() === name.toLowerCase());
        await store.put("favs", { id: ex ? ex.id : undefined, name, ingredients: ing, overrides, ...mac });
      }
      $("formMsg").textContent = (editingId ? "Updated " : "Added to ") + type.toLowerCase() + ".";
      clearForm();
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
    const rows = r.i.map(([n, g]) => { const f = foodByName(n); return f ? macrosFor(f, g) : null; }).filter(Boolean);
    return totals(rows);
  }
  function renderIdeas() {
    const box = $("ideasBox"); box.innerHTML = "";
    if (!S.pantry.length) { box.appendChild(el("div", "empty", "Add a bill photo or a few items and meal ideas appear here.")); return; }
    const base = (n) => n.replace(/, (raw|cooked|dry|whole|semi-skimmed|skimmed|fat free|firm|plain|fresh)$/i, "");
    const have = new Set(S.pantry.map(base)), staples = new Set(window.STAPLES);
    const scored = window.RECIPES.map((r) => {
      const need = r.i.map((x) => x[0]).filter((n) => !staples.has(n));
      const got = need.filter((n) => have.has(base(n)));
      return { r, need, got, missing: need.filter((n) => !have.has(base(n))), score: need.length ? got.length / need.length : 0, mac: recipeMacros(r) };
    }).filter((x) => x.got.length > 0);
    const hp = $("highProtein").checked;
    scored.sort((a, b) => {
      const ma = a.missing.length, mb = b.missing.length;
      if (Math.min(ma, 2) !== Math.min(mb, 2)) return ma - mb;  // 0, 1, then 2+ missing
      if (hp) return b.mac.protein - a.mac.protein;
      return b.score - a.score;
    });
    if (!scored.length) { box.appendChild(el("div", "empty", "No recipe matches these items yet. Add a few more (for example eggs, onion, rice, paneer, chicken).")); return; }
    scored.slice(0, 8).forEach((x) => {
      const d = el("div", "idea");
      const ih = el("div", "ih"); ih.append(el("b", null, x.r.n), el("span", "num", x.mac.kcal + " kcal / serving"));
      const hv = el("div", "have" + (x.missing.length ? "" : " full"), x.missing.length ? "You have " + x.got.length + " of " + x.need.length + " · need " + x.missing.map((n) => n.toLowerCase()).join(", ") : "You have everything");
      const ing = el("div", "ing", x.r.i.map(([n, g]) => n + " " + g + "g").join(" · "));
      const how = el("p", "hint", x.r.m);
      const acts = el("div", "actions");
      const use = el("button", "btn ghost small", "Log this meal");
      use.onclick = () => {
        clearForm();
        const tm = { Breakfast: "Breakfast", Lunch: "Lunch", Dinner: "Dinner", Snack: "Snack" }[x.r.t]; if (tm) { type = tm; renderChips(); }
        $("mealName").value = x.r.n;
        $("mealText").value = x.r.i.map(([n, g]) => { const f = foodByName(n); return g + "g " + ((f && f.a && f.a[0]) || n.toLowerCase()); }).join("\n");
        refreshBreakdown();
        $("formMsg").textContent = "Filled with one serving. Change the grams to what you actually used.";
        $("formTitle").scrollIntoView({ behavior: "smooth", block: "start" });
      };
      acts.appendChild(use);
      d.append(ih, macroLine(x.mac), hv, ing, how, acts);
      box.appendChild(d);
    });
  }

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
  $("prevDay").onclick = () => { day = shift(day, -1); renderAll(); };
  $("nextDay").onclick = () => { if (day < todayStr()) { day = shift(day, 1); renderAll(); } };
  $("todayBtn").onclick = () => { day = todayStr(); renderAll(); };
  $("dayPick").onchange = (e) => { if (e.target.value) { day = e.target.value; renderAll(); } };
  let deb; $("mealText").addEventListener("input", () => { clearTimeout(deb); macroManual = false; deb = setTimeout(refreshBreakdown, 250); });
  ["fKcal", "fProtein", "fCarbs", "fFat", "fFibre"].forEach((id) => $(id).addEventListener("input", () => (macroManual = true)));
  $("saveBtn").onclick = saveMeal;
  $("cancelEdit").onclick = () => { clearForm(); $("formMsg").textContent = ""; };
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
  initFirebase();

  // expose parser for testing
  window.__plate = { parseLine, macrosFor, foodsInText, expandReceipt };
})();
