// Pinny Tabby — opens a saved set of pinned tabs when Chrome launches,
// with named profiles you can switch between.

const COLORS = ["#0B7F70", "#F08A5D", "#F2B63D", "#8B7CF6", "#3A9BDC", "#14302E"];
// Colors from earlier versions, mapped to the Seafoam palette.
const OLD_COLORS = { "#0d9488": "#0B7F70", "#2e3a5f": "#14302E", "#e5484d": "#F08A5D", "#d97706": "#F2B63D", "#7c3aed": "#8B7CF6", "#2563eb": "#3A9BDC" };

// ---------- Settings ----------

async function getState() {
  const s = await chrome.storage.sync.get({ profiles: [], activeId: null, replaceExisting: false, urls: null });
  if (!s.profiles.length) {
    // First run, or upgrading from version 1.0 (single list stored as "urls").
    s.profiles = [{ id: "p1", name: "Work", color: COLORS[0], urls: s.urls || [] }];
    s.activeId = "p1";
    await chrome.storage.sync.set({ profiles: s.profiles, activeId: s.activeId });
    if (s.urls) await chrome.storage.sync.remove("urls");
  }
  // Map older colors to the Seafoam set, and replace anything that isn't a plain hex color.
  const fixColor = c => {
    const v = OLD_COLORS[String(c).toLowerCase()] || String(c);
    return /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : COLORS[0];
  };
  if (s.profiles.some(p => fixColor(p.color) !== p.color)) {
    s.profiles.forEach(p => { p.color = fixColor(p.color); });
    await chrome.storage.sync.set({ profiles: s.profiles });
  }
  if (!s.profiles.some(p => p.id === s.activeId)) s.activeId = s.profiles[0].id;
  delete s.urls;
  return s;
}

const activeProfile = s => s.profiles.find(p => p.id === s.activeId) || s.profiles[0];

// Only normal web addresses are ever opened, even if storage holds something else.
function isWebUrl(url) {
  try { return ["http:", "https:"].includes(new URL(url).protocol); }
  catch { return false; }
}

// Compare sites by hostname (ignoring "www.") so a tab that redirected to a
// different path still counts as the same site.
function siteKey(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return url; }
}
const tabSite = t => siteKey(t.pendingUrl || t.url || "");

// ---------- Opening tabs ----------

async function getTargetWindow() {
  const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
  if (windows.length) return windows.find(w => w.focused) || windows[0];
  return chrome.windows.create({});
}

// Make the window's pinned tabs match a profile.
// replace = true closes pinned tabs that aren't in the profile.
async function applyProfile(profile, replace) {
  const win = await getTargetWindow();
  let pinned = await chrome.tabs.query({ windowId: win.id, pinned: true });

  if (replace) {
    const wanted = new Set(profile.urls.filter(isWebUrl).map(siteKey));
    const extra = pinned.filter(t => !wanted.has(tabSite(t)));
    if (extra.length) await chrome.tabs.remove(extra.map(t => t.id));
    pinned = pinned.filter(t => wanted.has(tabSite(t)));
  }

  const bySite = new Map();
  for (const t of pinned) if (!bySite.has(tabSite(t))) bySite.set(tabSite(t), t);

  let opened = 0;
  for (const [index, url] of profile.urls.filter(isWebUrl).entries()) {
    const key = siteKey(url);
    const existing = bySite.get(key);
    if (existing) {
      await chrome.tabs.move(existing.id, { index }).catch(() => {});
      bySite.delete(key);
    } else {
      await chrome.tabs.create({ windowId: win.id, url, pinned: true, active: false, index });
      opened++;
    }
  }
  return opened;
}

// Remember what was pinned before a switch, so it can be undone.
const session = chrome.storage.session || chrome.storage.local;

async function switchTo(id) {
  const s = await getState();
  const profile = s.profiles.find(p => p.id === id);
  if (!profile || id === s.activeId) return 0;
  const win = await getTargetWindow();
  const before = await chrome.tabs.query({ windowId: win.id, pinned: true });
  await session.set({ lastSwitch: {
    prevId: s.activeId, toId: id, at: Date.now(),
    prevUrls: before.map(t => t.pendingUrl || t.url).filter(u => /^https?:/.test(u || ""))
  } });
  await chrome.storage.sync.set({ activeId: id });
  return applyProfile(profile, true); // switching always swaps the pinned set
}

const UNDO_WINDOW = 5 * 60 * 1000; // undo is offered for 5 minutes

async function getLastSwitch() {
  const { lastSwitch } = await session.get("lastSwitch");
  return lastSwitch && Date.now() - lastSwitch.at < UNDO_WINDOW ? lastSwitch : null;
}

async function undoSwitch() {
  const last = await getLastSwitch();
  if (!last) return null;
  await session.remove("lastSwitch");
  await chrome.storage.sync.set({ activeId: last.prevId });
  await applyProfile({ urls: last.prevUrls }, true); // bring back exactly what was pinned
  const s = await getState();
  return s.profiles.find(p => p.id === last.prevId)?.name || "your previous tabs";
}

// ---------- Toolbar icon, right-click menu ----------

// White or ink letters, whichever reads better on the profile color.
function letterColor(hex) {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  const lum = [n >> 16 & 255, n >> 8 & 255, n & 255]
    .map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const vsWhite = 1.05 / (lum + 0.05), vsInk = (lum + 0.05) / (0.0249 + 0.05);
  return vsWhite >= vsInk ? "#FFFFFF" : "#14302E";
}

// Draws the toolbar icon: a big pushpin on the active profile's color, so it reads
// as Pinny Tabby at a glance, with a small white tag in the corner holding the
// profile's first letter.
function drawIcon(color, letter, size) {
  const c = new OffscreenCanvas(size, size);
  const g = c.getContext("2d");
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(0, 0, size, size, size * 0.3);
  g.fill();
  // The pushpin, in white or ink, whichever reads better on the profile color.
  try {
    const k = (size * 0.74) / 24;
    g.save();
    g.translate(size * 0.44, size * 0.44);
    g.rotate(Math.PI / 6);
    g.scale(k, k);
    g.translate(-12, -12);
    g.strokeStyle = letterColor(color);
    g.lineWidth = size <= 16 ? 3.2 : 2.6;
    g.lineCap = "round";
    g.lineJoin = "round";
    for (const d of PIN_PATHS) g.stroke(new Path2D(d));
    g.restore();
  } catch { /* Path2D unavailable: the tag still identifies the profile */ }
  // The letter tag at the lower right.
  const r = size * 0.24, cx = size - r - size * 0.04, cy = cx; // inside the rounded corner
  g.fillStyle = "#FFFFFF";
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#14302E";
  g.font = `700 ${Math.round(r * 1.45)}px "Segoe UI", system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(letter, cx, cy + r * 0.06);
  return g.getImageData(0, 0, size, size);
}

const PIN_PATHS = [
  "M12 17v5",
  "M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"
];

async function refreshUINow() {
  const s = await getState();
  const p = activeProfile(s);
  const letter = (p.name.trim()[0] || "P").toUpperCase();
  try {
    await chrome.action.setIcon({ imageData: { 16: drawIcon(p.color, letter, 16), 32: drawIcon(p.color, letter, 32) } });
  } catch { /* keep default icon */ }
  await chrome.action.setTitle({ title: `Pinny Tabby — ${p.name}` });

  // Right-click menu on the toolbar icon: one radio item per profile (Chrome allows 6).
  await chrome.contextMenus.removeAll();
  for (const prof of s.profiles.slice(0, chrome.contextMenus.ACTION_MENU_TOP_LEVEL_LIMIT || 6)) {
    chrome.contextMenus.create({
      id: "profile:" + prof.id, title: prof.name, type: "radio",
      checked: prof.id === s.activeId, contexts: ["action"]
    }, () => void chrome.runtime.lastError); // read the error so Chrome doesn't log it
  }
}

// Several changes can arrive at once (a switch saves more than one setting).
// Running refreshes one at a time stops two of them from rebuilding the
// right-click menu together, which caused "duplicate id profile:p1" errors.
let uiQueue = Promise.resolve();
function refreshUI() {
  uiQueue = uiQueue.then(refreshUINow).catch(() => {});
  return uiQueue;
}

chrome.contextMenus.onClicked.addListener(info => {
  if (String(info.menuItemId).startsWith("profile:")) switchTo(info.menuItemId.slice(8));
});

// Keyboard shortcut (Alt+Shift+P by default) cycles to the next profile,
// unless it's turned off in settings.
chrome.commands.onCommand.addListener(async cmd => {
  if (cmd !== "next-profile") return;
  const { shortcutEnabled } = await chrome.storage.sync.get({ shortcutEnabled: true });
  if (!shortcutEnabled) return;
  const s = await getState();
  const i = s.profiles.findIndex(p => p.id === s.activeId);
  switchTo(s.profiles[(i + 1) % s.profiles.length].id);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && (changes.profiles || changes.activeId)) refreshUI();
});

// ---------- Lifecycle ----------

chrome.runtime.onStartup.addListener(async () => {
  const s = await getState();
  await applyProfile(activeProfile(s), s.replaceExisting);
  refreshUI();
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await refreshUI();
  if (reason === "install") chrome.runtime.openOptionsPage();
});

// Messages from the popup and settings page.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "switch") {
    switchTo(msg.id).then(opened => sendResponse({ ok: true, opened }));
    return true;
  }
  if (msg?.type === "undo-switch") {
    undoSwitch().then(name => sendResponse({ ok: !!name, name }));
    return true;
  }
  if (msg?.type === "last-switch") {
    getLastSwitch().then(last => sendResponse(last));
    return true;
  }
  if (msg?.type === "open-now") {
    getState().then(s => applyProfile(activeProfile(s), false)).then(opened => sendResponse({ ok: true, opened }));
    return true;
  }
});
