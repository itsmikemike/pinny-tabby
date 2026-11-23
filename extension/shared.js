// Pinny Tabby — helpers shared by the settings page and the popup.
window.PT = (() => {
  // Profile colors (Seafoam palette).
  const COLORS = [
    { hex: "#0B7F70", name: "Seafoam" }, { hex: "#F08A5D", name: "Coral" }, { hex: "#F2B63D", name: "Sun" },
    { hex: "#8B7CF6", name: "Lilac" }, { hex: "#3A9BDC", name: "Sky" }, { hex: "#14302E", name: "Ink" }
  ];
  // Colors from earlier versions, mapped to the Seafoam set.
  const OLD_COLORS = {
    "#0d9488": "#0B7F70", "#2e3a5f": "#14302E", "#e5484d": "#F08A5D",
    "#d97706": "#F2B63D", "#7c3aed": "#8B7CF6", "#2563eb": "#3A9BDC"
  };
  // Older colors map to the Seafoam set; anything that isn't a plain hex color
  // (so can't be used to inject styles) falls back to Seafoam.
  const migrateColor = c => {
    const v = OLD_COLORS[String(c).toLowerCase()] || String(c);
    return /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : COLORS[0].hex;
  };

  // White or ink text, whichever reads better on a color.
  function lum(hex) {
    const n = parseInt(String(hex).replace("#", "").slice(0, 6), 16);
    const ch = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const onColor = hex => contrast(hex, "#FFFFFF") >= contrast(hex, "#14302E") ? "#FFFFFF" : "#14302E";
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
  const pretty = u => u.replace(/^https:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  const initial = s => (String(s).trim()[0] || "?").toUpperCase();
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : /(s|sh|ch|x)$/.test(word) ? "es" : "s"}`;

  // A steady color per site, for the letter shown when there's no favicon.
  const SITE_TINTS = ["#0B7F70", "#F08A5D", "#F2B63D", "#8B7CF6", "#3A9BDC", "#14302E", "#E06C9F", "#56706B"];
  const siteColor = u => SITE_TINTS[[...host(u)].reduce((a, c) => a + c.charCodeAt(0), 0) % SITE_TINTS.length];

  // Chrome's favicon cache (needs the "favicon" permission). Returns null outside the extension.
  function faviconUrl(u, size = 32) {
    try {
      if (!chrome.runtime?.getURL || location.protocol !== "chrome-extension:") return null;
      const url = new URL(chrome.runtime.getURL("/_favicon/"));
      url.searchParams.set("pageUrl", u);
      url.searchParams.set("size", String(size));
      return url.href;
    } catch { return null; }
  }

  const letterHtml = (u, cls) =>
    `<span class="${cls} letter" style="background:${siteColor(u)};color:${onColor(siteColor(u))}">${esc(initial(host(u)))}</span>`;

  // Site icon: the real favicon, falling back to a colored letter if it can't load.
  function siteIcon(u, cls = "favi") {
    const src = faviconUrl(u);
    return src
      ? `<img class="${cls}" src="${esc(src)}" alt="" data-fallback="${esc(u)}" data-cls="${cls}">`
      : letterHtml(u, cls);
  }
  document.addEventListener("error", e => {
    const img = e.target;
    if (img.tagName === "IMG" && img.dataset.fallback) img.outerHTML = letterHtml(img.dataset.fallback, img.dataset.cls);
  }, true);

  // Small pushpin in a white circle, worn at the lower right of profile badges.
  const pinMark = '<span class="pin-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg></span>';

  return { pinMark, COLORS, migrateColor, onColor, esc, host, pretty, initial, plural, siteColor, siteIcon };
})();
