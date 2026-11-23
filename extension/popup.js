// Pinny Tabby — toolbar popup: pick a profile to switch your pinned tabs.
{
  const $ = id => document.getElementById(id);
  const { esc, initial, plural, siteIcon, migrateColor, onColor } = PT;
  const list = $("ppList"), msg = $("ppMsg");
  let state = { profiles: [], activeId: null, switchWarned: false };
  let pendingId = null;

  const active = () => state.profiles.find(p => p.id === state.activeId);

  function render() {
    list.innerHTML = state.profiles.map(p => {
      const on = p.id === state.activeId;
      const shown = p.urls.slice(0, 5);
      const more = p.urls.length - shown.length;
      const favs = p.urls.length
        ? shown.map(u => siteIcon(u)).join("") + (more > 0 ? `<small>+${more}</small>` : "")
        : "<small>No sites yet</small>";
      return `<button class="pop-item${on ? " on" : ""}" role="radio" aria-checked="${on}" data-id="${p.id}"
          aria-label="${esc(p.name)}, ${plural(p.urls.length, "site")}">
        <span class="badge" style="background:${migrateColor(p.color)};color:${onColor(migrateColor(p.color))}">${esc(initial(p.name))}${PT.pinMark}</span>
        <span class="pop-name">${esc(p.name)}<span class="pop-favs">${favs}</span></span>
        <span class="pop-check" aria-hidden="true">${on ? '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>' : ""}</span>
      </button>`;
    }).join("");
    const a = active();
    $("ppOpen").textContent = a ? `Restore ${a.name}'s tabs` : "Restore tabs";
  }

  function say(text) {
    msg.textContent = text;
    clearTimeout(say.t);
    say.t = setTimeout(() => (msg.textContent = ""), 3000);
  }

  async function refreshUndo() {
    const last = await chrome.runtime.sendMessage({ type: "last-switch" });
    const to = last && state.profiles.find(p => p.id === last.toId);
    $("ppUndo").hidden = !to || last.toId !== state.activeId;
    if (to) $("ppUndoText").textContent = `Switched to ${to.name}.`;
  }

  async function doSwitch(id) {
    $("ppConfirm").hidden = true;
    state.activeId = id; render();
    await chrome.runtime.sendMessage({ type: "switch", id });
    await refreshUndo();
  }

  // The first switch explains that pinned tabs get swapped.
  list.addEventListener("click", async e => {
    const b = e.target.closest(".pop-item");
    if (!b || b.dataset.id === state.activeId) return;
    if (!state.switchWarned) {
      pendingId = b.dataset.id;
      const p = state.profiles.find(x => x.id === pendingId);
      $("ppConfirmText").textContent = `Switching closes your current pinned tabs and opens ${p.name}'s. You can undo right after.`;
      $("ppConfirmYes").textContent = `Switch to ${p.name}`;
      $("ppConfirm").hidden = false;
      $("ppConfirmYes").focus();
      return;
    }
    doSwitch(b.dataset.id);
  });
  $("ppConfirmYes").addEventListener("click", async () => {
    state.switchWarned = true;
    await chrome.storage.sync.set({ switchWarned: true });
    doSwitch(pendingId);
  });
  $("ppConfirmNo").addEventListener("click", () => { $("ppConfirm").hidden = true; pendingId = null; });

  $("ppUndoBtn").addEventListener("click", async () => {
    const r = await chrome.runtime.sendMessage({ type: "undo-switch" });
    $("ppUndo").hidden = true;
    say(r?.ok ? `Back to ${r.name}.` : "It's been too long to undo.");
  });

  $("ppOpen").addEventListener("click", async () => {
    const res = await chrome.runtime.sendMessage({ type: "open-now" });
    const n = res?.opened ?? 0;
    say(n ? `Opened ${plural(n, "missing tab")}.` : "All of this profile's tabs are already open.");
  });

  $("ppSettings").addEventListener("click", () => chrome.runtime.openOptionsPage());

  const load = () => chrome.storage.sync.get({ profiles: [], activeId: null, switchWarned: false })
    .then(s => { state = s; render(); refreshUndo(); });
  chrome.storage.onChanged.addListener((_c, area) => { if (area === "sync") load(); });
  load();
}
