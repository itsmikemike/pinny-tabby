// Pinny Tabby — settings page. Changes save automatically.
{
  const $ = id => document.getElementById(id);
  const { COLORS, migrateColor, onColor, esc, host, pretty, initial, plural, siteIcon } = PT;
  const MAX_PROFILES = 5; // anyone who already has 6 keeps them; they just can't add more

  const tabsEl = $("profileTabs"), sitesEl = $("sites"), countEl = $("count"), emptyEl = $("empty");
  const addForm = $("addForm"), addInput = $("addInput"), addHint = $("addHint");
  const nameEl = $("profName"), badgeEl = $("profBadge"), swatchesEl = $("swatches");
  const replaceEl = $("replace"), shortcutEl = $("shortcutOn"), toastsEl = $("toasts");
  const HINT = addHint.textContent;

  let state = { profiles: [], activeId: null, replaceExisting: false, shortcutEnabled: true, switchWarned: false, stripToBase: false };
  const stripEl = $("stripOn");
  let editingId = null;

  const icon = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  const UP = "M12 19V5M5 12l7-7 7 7", DOWN = "M12 5v14M19 12l-7 7-7-7", X = "M6 6l12 12M18 6L6 18";
  const GRIP = "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01";
  const editing = () => state.profiles.find(p => p.id === editingId) || state.profiles[0];
  // State is reloaded whenever storage changes, so undo actions look profiles up by id.
  const byId = id => state.profiles.find(p => p.id === id);

  // Only normal web addresses (http or https) are accepted. Typing "mail.google.com"
  // becomes "https://mail.google.com/"; javascript:, file:, chrome:// and the like are refused.
  function normalize(s) {
    s = s.trim();
    if (!s) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s;
    try {
      const u = new URL(s);
      if (u.protocol !== "https:" && u.protocol !== "http:") return null;
      if (!u.hostname || (!u.hostname.includes(".") && u.hostname !== "localhost")) return null;
      return u.href;
    } catch { return null; }
  }

  // ----- Toasts (float at the bottom corner, with an optional action like Undo) -----
  function toast(title, text, { warn = false, action, onAction, ms = 6000 } = {}) {
    const el = document.createElement("div");
    el.className = "toast" + (warn ? " warn" : "");
    el.setAttribute("role", "status");
    el.innerHTML = `<div class="msg"><b>${esc(title)}</b>${esc(text)}</div>` +
      (action ? `<button class="act">${esc(action)}</button>` : "") +
      `<button class="icon-btn" aria-label="Dismiss">${icon(X)}</button>`;
    const close = () => {
      if (el.classList.contains("out")) return;
      el.classList.add("out");
      setTimeout(() => el.remove(), 200);
    };
    el.querySelector(".icon-btn").onclick = close;
    if (action) el.querySelector(".act").onclick = () => { close(); onAction(); };
    toastsEl.append(el);
    while (toastsEl.children.length > 3) toastsEl.firstElementChild.remove();
    setTimeout(close, ms);
  }

  // ----- In-page confirm (browser confirm() dialogs are avoided) -----
  function ask(title, text, yes = "OK", danger = false) {
    return new Promise(resolve => {
      $("confirmTitle").textContent = title;
      $("confirmText").textContent = text;
      $("confirmYes").textContent = yes;
      $("confirmYes").className = "btn " + (danger ? "danger" : "primary");
      const dlg = $("confirm");
      dlg.hidden = false;
      void dlg.offsetWidth; // let the browser draw the closed state first, so it can animate
      dlg.classList.add("open");
      $("confirmNo").focus();
      const done = v => {
        dlg.classList.remove("open");
        setTimeout(() => { dlg.hidden = true; }, 180);
        document.removeEventListener("keydown", onKey);
        resolve(v);
      };
      const onKey = e => { if (e.key === "Escape") done(false); };
      document.addEventListener("keydown", onKey);
      $("confirmYes").onclick = () => done(true);
      $("confirmNo").onclick = () => done(false);
    });
  }

  const persist = () => chrome.storage.sync.set({
    profiles: state.profiles, activeId: state.activeId,
    replaceExisting: replaceEl.checked, shortcutEnabled: shortcutEl.checked, stripToBase: stripEl.checked
  });

  // ----- Base URLs -----
  // "https://mail.google.com/mail/u/0/#inbox" -> "https://mail.google.com". Only web addresses are changed.
  function baseUrl(u) {
    try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.origin : u; }
    catch { return u; }
  }
  // Applies the setting to a list of addresses, dropping duplicates that stripping creates.
  function tidy(urls, force = false) {
    if (!force && !stripEl.checked) return urls;
    const seen = new Set();
    return urls.map(baseUrl).filter(u => !seen.has(u) && seen.add(u));
  }
  // Counts addresses that would really change (a lone trailing "/" doesn't count).
  const strippable = () => state.profiles.reduce((n, p) => n + p.urls.filter(u => baseUrl(u) !== u.replace(/\/$/, "")).length, 0);

  // ----- Render -----
  // Motion helpers: rows glide to their new spot (FLIP), new rows fade in,
  // and the card settles in when you pick another profile.
  let lastRenderedId = null;
  const rowTops = () => new Map([...sitesEl.children].map(li => [li.dataset.url, li.getBoundingClientRect().top]));
  function animateRows(before, sameProfile) {
    if (!sameProfile) return;
    for (const li of sitesEl.children) {
      const old = before.get(li.dataset.url);
      if (old === undefined) { li.classList.add("enter"); continue; }
      const dy = old - li.getBoundingClientRect().top;
      if (!dy) continue;
      li.style.transition = "none";
      li.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        li.style.transition = "transform var(--dur) var(--ease)";
        li.style.transform = "";
      });
    }
  }
  function restart(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  function render() {
    const p = editing();
    if (!p) return;
    editingId = p.id;
    const sameProfile = lastRenderedId === p.id;
    const before = rowTops();
    if (lastRenderedId && !sameProfile) restart(sitesEl.closest(".card"), "swap");
    lastRenderedId = p.id;
    const isActive = p.id === state.activeId;

    tabsEl.innerHTML = state.profiles.map(pr => `
      <button class="tab-btn${pr.id === p.id ? " on" : ""}" data-id="${pr.id}" aria-pressed="${pr.id === p.id}">
        <span class="dot" style="background:${migrateColor(pr.color)}"></span><span class="tname">${esc(pr.name)}</span>${pr.id === state.activeId ? '<span class="pill">Active</span>' : ""}
      </button>`).join("") +
      (state.profiles.length < MAX_PROFILES ? `<button class="tab-btn add-prof" id="newProf">${icon("M12 5v14M5 12h14")}New profile</button>` : "");

    if (document.activeElement !== nameEl) nameEl.value = p.name;
    $("editingLabel").textContent = isActive ? "Editing your active profile" : "Editing profile (not active)";
    badgeEl.innerHTML = esc(initial(p.name)) + PT.pinMark;
    p.color = migrateColor(p.color);
    badgeEl.style.background = p.color;
    badgeEl.style.color = onColor(p.color);
    $("switchBtn").hidden = isActive;
    $("switchBtn").textContent = `Switch to ${p.name}`;
    $("deleteProf").hidden = state.profiles.length < 2;

    swatchesEl.innerHTML = COLORS.map(c => `
      <button class="swatch${c.hex === p.color ? " on" : ""}" role="radio" aria-checked="${c.hex === p.color}"
        aria-label="${c.name}" title="${c.name}" data-color="${c.hex}" style="background:${c.hex}"></button>`).join("");

    countEl.textContent = p.urls.length;
    emptyEl.hidden = p.urls.length > 0;
    $("emptyText").textContent = `No sites in ${p.name} yet. Start with the tabs you have pinned now, or add sites below.`;
    $("import").hidden = p.urls.length === 0;
    sitesEl.innerHTML = p.urls.map((u, i) => `
      <li class="site" data-i="${i}" data-url="${esc(u)}">
        <span class="grip" title="Drag to reorder" aria-hidden="true">${icon(GRIP)}</span>
        ${siteIcon(u)}
        <input value="${esc(pretty(u))}" aria-label="Site ${i + 1}" spellcheck="false">
        <button class="icon-btn" data-act="up" aria-label="Move ${esc(host(u))} up" ${i === 0 ? "disabled" : ""}>${icon(UP)}</button>
        <button class="icon-btn" data-act="down" aria-label="Move ${esc(host(u))} down" ${i === p.urls.length - 1 ? "disabled" : ""}>${icon(DOWN)}</button>
        <button class="icon-btn del" data-act="del" aria-label="Remove ${esc(host(u))}">${icon(X)}</button>
      </li>`).join("");
    animateRows(before, sameProfile);
    renderShortcut();
    renderStrip();
  }

  function renderStrip() {
    const n = strippable();
    $("stripNow").disabled = n === 0;
    $("stripNote").textContent = n
      ? `${plural(n, "address")} across your profiles can be shortened.`
      : "All your sites are already base URLs.";
  }

  // ----- Profiles -----
  tabsEl.addEventListener("click", async e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.id === "newProf") {
      const used = new Set(state.profiles.map(p => p.color));
      const p = {
        id: "p" + Date.now().toString(36),
        name: ["Home", "Weekend", "Projects", "Reading", "Travel"].find(n => !state.profiles.some(x => x.name === n)) || "New profile",
        color: (COLORS.find(c => !used.has(c.hex)) || COLORS[0]).hex,
        urls: []
      };
      state.profiles.push(p); editingId = p.id;
      render(); await persist();
      nameEl.focus(); nameEl.select();
      return;
    }
    editingId = btn.dataset.id; render();
  });

  nameEl.addEventListener("input", () => {
    const p = editing();
    p.name = nameEl.value || "Untitled";
    badgeEl.innerHTML = esc(initial(p.name)) + PT.pinMark;
    const t = tabsEl.querySelector(`[data-id="${p.id}"] .tname`);
    if (t) t.textContent = p.name;
  });
  nameEl.addEventListener("change", async () => { editing().name = nameEl.value.trim() || "Untitled"; render(); await persist(); });
  nameEl.addEventListener("keydown", e => { if (e.key === "Enter") nameEl.blur(); });

  swatchesEl.addEventListener("click", async e => {
    const b = e.target.closest(".swatch");
    if (!b) return;
    editing().color = b.dataset.color; render(); await persist();
  });

  // Switching closes pinned tabs, so warn the first time and always offer Undo.
  $("switchBtn").addEventListener("click", async () => {
    const p = editing();
    if (!state.switchWarned) {
      const ok = await ask(`Switch to ${p.name}?`,
        `Switching closes your current pinned tabs and opens ${p.name}'s sites instead. You can undo right after. This message won't show again.`,
        "Switch");
      if (!ok) return;
      state.switchWarned = true;
      await chrome.storage.sync.set({ switchWarned: true });
    }
    await persist();
    const res = await chrome.runtime.sendMessage({ type: "switch", id: p.id });
    state.activeId = p.id; render();
    toast(`Switched to ${p.name}`, res?.opened ? `Opened ${plural(res.opened, "tab")}.` : "Your pinned tabs now match this profile.", {
      action: "Undo", ms: 10000,
      onAction: async () => {
        const r = await chrome.runtime.sendMessage({ type: "undo-switch" });
        if (r?.ok) toast("Switch undone", `Back to ${r.name}.`);
        else toast("Can't undo", "It's been too long since the switch.", { warn: true });
      }
    });
  });

  $("deleteProf").addEventListener("click", async () => {
    const p = editing();
    if (state.profiles.length < 2) return;
    const ok = await ask(`Delete ${p.name}?`, `This removes the profile and its ${plural(p.urls.length, "site")}. Your open tabs stay open.`, "Delete", true);
    if (!ok) return;
    const index = state.profiles.indexOf(p), wasActive = state.activeId === p.id;
    state.profiles.splice(index, 1);
    if (wasActive) state.activeId = state.profiles[0].id;
    editingId = state.activeId;
    render(); await persist();
    toast(`Deleted ${p.name}`, "", {
      action: "Undo",
      onAction: async () => {
        if (byId(p.id)) return;
        state.profiles.splice(Math.min(index, state.profiles.length), 0, p);
        if (wasActive) state.activeId = p.id;
        editingId = p.id; render(); await persist();
      }
    });
  });

  // ----- Sites -----
  function move(from, to) {
    const urls = editing().urls;
    if (to < 0 || to >= urls.length || from === to) return false;
    urls.splice(to, 0, urls.splice(from, 1)[0]);
    return true;
  }

  sitesEl.addEventListener("click", async e => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const p = editing(), pid = p.id, i = +btn.closest(".site").dataset.i, act = btn.dataset.act;
    if (act === "del") {
      const li = btn.closest(".site");
      li.classList.add("leaving");
      await new Promise(r => setTimeout(r, 170));
      const [removed] = p.urls.splice(i, 1);
      render(); await persist();
      toast(`Removed ${host(removed)}`, "", {
        action: "Undo",
        onAction: async () => {
          const prof = byId(pid);
          if (!prof) return;
          prof.urls.splice(Math.min(i, prof.urls.length), 0, removed);
          editingId = pid; render(); await persist();
        }
      });
      return;
    }
    if (move(i, act === "up" ? i - 1 : i + 1)) {
      render(); await persist();
      sitesEl.querySelector(`[data-i="${act === "up" ? i - 1 : i + 1}"] [data-act="${act}"]`)?.focus();
    }
  });

  sitesEl.addEventListener("change", async e => {
    const row = e.target.closest(".site");
    if (!row || e.target.tagName !== "INPUT") return;
    const urls = editing().urls, i = +row.dataset.i, u = normalize(e.target.value);
    if (!u) { e.target.value = pretty(urls[i]); return toast("Not a web address", "Try something like calendar.google.com.", { warn: true }); }
    urls[i] = stripEl.checked ? baseUrl(u) : u; render(); await persist();
  });

  // Drag to reorder, using the grip handle.
  let dragFrom = null;
  sitesEl.addEventListener("pointerdown", e => {
    const grip = e.target.closest(".grip");
    if (grip) grip.closest(".site").draggable = true;
  });
  sitesEl.addEventListener("dragstart", e => {
    const row = e.target.closest(".site");
    if (!row) return;
    dragFrom = +row.dataset.i;
    row.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(dragFrom));
  });
  const clearDrop = () => sitesEl.querySelectorAll(".drop-before,.drop-after").forEach(r => r.classList.remove("drop-before", "drop-after"));
  const dropTarget = e => {
    const row = e.target.closest(".site");
    if (!row) return null;
    const r = row.getBoundingClientRect();
    return { row, after: e.clientY > r.top + r.height / 2 };
  };
  sitesEl.addEventListener("dragover", e => {
    if (dragFrom === null) return;
    e.preventDefault();
    const t = dropTarget(e);
    clearDrop();
    if (t) t.row.classList.add(t.after ? "drop-after" : "drop-before");
  });
  sitesEl.addEventListener("drop", async e => {
    if (dragFrom === null) return;
    e.preventDefault();
    const t = dropTarget(e);
    if (t) {
      let to = +t.row.dataset.i + (t.after ? 1 : 0);
      if (to > dragFrom) to--;
      if (move(dragFrom, to)) { render(); await persist(); }
    }
  });
  sitesEl.addEventListener("dragend", () => {
    dragFrom = null; clearDrop();
    sitesEl.querySelectorAll(".site").forEach(r => { r.draggable = false; r.classList.remove("dragging"); });
  });

  addForm.addEventListener("submit", async e => {
    e.preventDefault();
    const u = normalize(addInput.value);
    if (!u) {
      addForm.classList.add("error");
      addHint.textContent = "That doesn't look like a web address. Try something like calendar.google.com.";
      return;
    }
    addForm.classList.remove("error"); addHint.textContent = HINT;
    const p = editing();
    const add = stripEl.checked ? baseUrl(u) : u;
    if (p.urls.includes(add)) {
      addInput.value = "";
      return toast("Already in the list", `${pretty(add)} is already in ${p.name}.`);
    }
    p.urls.push(add); addInput.value = "";
    render(); await persist();
  });
  addInput.addEventListener("input", () => { addForm.classList.remove("error"); addHint.textContent = HINT; });

  async function importPinned() {
    const tabs = await chrome.tabs.query({ pinned: true, currentWindow: true });
    const found = tidy(tabs.map(t => t.url).filter(u => u && /^https?:/.test(u)));
    if (!found.length) return toast("No pinned tabs", "Pin a few tabs in this window first, then try again.", { warn: true });
    const p = editing(), pid = p.id, before = p.urls.slice();
    p.urls = found; render(); await persist();
    toast(`Saved to ${p.name}`, `${plural(found.length, "pinned tab")} added.`, {
      action: before.length ? "Undo" : null,
      onAction: async () => {
        const prof = byId(pid);
        if (!prof) return;
        prof.urls = before; editingId = pid; render(); await persist();
      }
    });
  }
  $("import").addEventListener("click", importPinned);
  $("importEmpty").addEventListener("click", importPinned);

  replaceEl.addEventListener("change", persist);

  stripEl.addEventListener("change", async () => {
    await persist(); renderStrip();
    toast(stripEl.checked ? "Base URLs on" : "Base URLs off",
      stripEl.checked ? "New sites will be saved as their main address." : "Sites will be saved exactly as typed.");
  });

  $("stripNow").addEventListener("click", async () => {
    const n = strippable();
    if (!n) return;
    const before = state.profiles.map(p => ({ id: p.id, urls: p.urls.slice() }));
    state.profiles.forEach(p => { p.urls = tidy(p.urls, true); });
    render(); await persist();
    toast("Sites stripped", `Shortened ${plural(n, "address")} to the base URL.`, {
      action: "Undo", ms: 10000,
      onAction: async () => {
        before.forEach(b => { const prof = byId(b.id); if (prof) prof.urls = b.urls; });
        render(); await persist();
      }
    });
  });

  // ----- Keyboard shortcut -----
  // Chrome owns the actual key; extensions can read it but not change it,
  // so "Change or clear" opens Chrome's own shortcuts page.
  let shortcutKey = "Alt+Shift+P";
  async function readShortcut() {
    try {
      const cmds = await chrome.commands.getAll();
      shortcutKey = cmds.find(c => c.name === "next-profile")?.shortcut || "";
    } catch { /* keep default */ }
    renderShortcut();
  }
  function renderShortcut() {
    const on = shortcutEl.checked;
    $("shortcutKeys").textContent = shortcutKey || "no key set";
    $("shortcutDesc").firstChild.textContent = on ? "Press " : "Off. When on, ";
    $("shortcutDesc").lastChild.textContent = on ? " to jump to the next profile." : " jumps to the next profile.";
    document.querySelectorAll(".keys").forEach(k => (k.textContent = shortcutKey));
    $("hintKeys").hidden = !on || !shortcutKey;
    $("hintMenu").textContent = !on || !shortcutKey ? " or its right-click menu" : ", its right-click menu";
    $("shortcutNote").hidden = on && !!shortcutKey;
    $("shortcutNote").textContent = shortcutKey
      ? "Turning this off makes the shortcut do nothing. To free up the key for other apps, clear it in Chrome's shortcut settings."
      : "No key is set in Chrome right now. Use the button to pick one.";
  }
  shortcutEl.addEventListener("change", async () => {
    await persist(); renderShortcut();
    toast(shortcutEl.checked ? "Shortcut on" : "Shortcut off", shortcutEl.checked ? `${shortcutKey} jumps to the next profile.` : "The key does nothing now.");
  });
  $("shortcutPage").addEventListener("click", () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }));
  window.addEventListener("focus", readShortcut); // pick up a key changed in Chrome's page

  // ----- Load, and stay in step with the popup and other devices -----
  try { $("version").textContent = "Version " + chrome.runtime.getManifest().version; } catch { /* preview */ }

  const DEFAULTS = { profiles: [], activeId: null, replaceExisting: false, shortcutEnabled: true, switchWarned: false, stripToBase: false };
  function load(s) {
    s.profiles.forEach(p => { p.color = migrateColor(p.color); });
    state = s;
    if (!state.profiles.some(p => p.id === editingId)) editingId = state.activeId;
    replaceEl.checked = state.replaceExisting;
    shortcutEl.checked = state.shortcutEnabled !== false;
    stripEl.checked = !!state.stripToBase;
    render();
  }
  const fetchState = () => chrome.storage.sync.get(DEFAULTS);
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === "sync" && !["INPUT"].includes(document.activeElement?.tagName) && dragFrom === null) fetchState().then(load);
  });
  fetchState().then(s => {
    if (!s.profiles.length) {
      // The background sets up the first profile; fall back here in case it hasn't yet.
      s.profiles = [{ id: "p1", name: "Work", color: COLORS[0].hex, urls: [] }];
      s.activeId = "p1";
    }
    editingId = s.activeId;
    load(s);
    readShortcut();
  });
}
