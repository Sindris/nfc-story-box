// Vordísarvarpið – the card page for Home Assistant (served by the vordisarvarpid integration).
// One page for the box's NFC cards: what each card plays (searching Music Assistant), which NFC card
// it is, and a printable label with its cover art (print or PDF).
//
// Card config:
//   type: custom:vordisarvarpid-kortamidar-card
//   entry_id: <config entry>                                (only with more than one box)
//   brand: Vordísarvarpið                                   (optional small text on labels)
//   style: big | classic                                    (default style, user can change it)
//   return_text: Ef þú finnur mig: skilaðu mér til Vordísar ♥  (bottom line on the back labels)

const CAT = {
  music: { bg: "#E8407F", chip: "Tónlist" },
  story: { bg: "#2EC4B6", chip: "Saga" },
};

// Label styles. Sizes in mm. bleed = extra print outside the cut line.
const STYLES = {
  big:     { name: "Stór mynd",  w: 85.6, h: 54, r: 3.2, bleed: 1, gx: 6, gy: 3 },
  classic: { name: "Klassískt",  w: 84,   h: 52, r: 3,   bleed: 0, gx: 8, gy: 4.5 },
  blur:    { name: "Heil mynd",  w: 85.6, h: 54, r: 3.2, bleed: 1, gx: 6, gy: 3 },
  pop:     { name: "Litríkt",    w: 85.6, h: 54, r: 3.2, bleed: 1, gx: 6, gy: 3 },
  clean:   { name: "Einfalt",    w: 84,   h: 52, r: 3,   bleed: 0, gx: 8, gy: 4.5 },
};
const FULL_BLEED = ["big", "blur", "pop"];   // styles printed past the cut line

// Paper: cut yourself (dashed lines), or pre-cut sticker sheets.
// HERMA 5028: 83.8 x 50.8 mm, 2 x 5 per A4, rounded corners. Positions from HERMA's Word
// template (margins 18.64 / 21.5 mm, 5.08 mm between columns, rows touching); fine-tune per
// printer with the test page.
const SHEETS = {
  cut:       { name: "Klippa sjálf" },
  herma5028: { name: "HERMA 5028", w: 83.8, h: 50.8, r: 3, cal: { left: 18.64, top: 21.5, gap: 5.08, vgap: 0 } },
};

function geom(opts) {
  const s = STYLES[opts.style] || STYLES.big, sh = SHEETS[opts.sheet];
  if (!sh || !sh.w) {
    return { ...s, bx: s.bleed, by: s.bleed, cut: true,
      x0: (210 - (2 * s.w + s.gx)) / 2, y0: (297 - (5 * s.h + 4 * s.gy)) / 2 };
  }
  const c = { ...sh.cal, ...((opts.cal || {})[opts.sheet] || {}) };
  const gap = Math.max(0, +c.gap || 0);
  // print a little past the edge only where there is a gap to print into (between columns)
  const bx = FULL_BLEED.includes(opts.style) ? Math.min(1, gap / 2, +c.left || 0) : 0;
  const vgap = Math.max(0, +c.vgap || 0);
  const by = FULL_BLEED.includes(opts.style) ? Math.min(1, vgap / 2) : 0;
  return { name: s.name, w: sh.w, h: sh.h, r: sh.r, gx: gap, gy: vgap, bx, by, cut: false, x0: +c.left || 0, y0: +c.top || 0 };
}

const ICONS = {  // 24 x 24 paths
  music: "M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z",
  story: "M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z",
  series: "M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z",
};

const JSPDF_URL = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Baloo+2:wght@800&family=Inter:wght@600&display=swap";
const PRINT_PX = 300 / 25.4;   // 300 dpi
const PREVIEW_PX = 140 / 25.4;
const OPTS_KEY = "vordis-kortamidar-opts";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const kindOf = (card) => (["audiobook", "podcast"].includes(card.media_type) ? "story" : "music");

// ---------- loading ----------

function loadJsPdf() {
  if (window.jspdf) return Promise.resolve(window.jspdf);
  return new Promise((res, rej) => {
    const sc = document.createElement("script");
    sc.src = window.__VORDIS_JSPDF_URL || JSPDF_URL;
    sc.onload = () => (window.jspdf ? res(window.jspdf) : rej(new Error("jsPDF hlóðst ekki")));
    sc.onerror = () => rej(new Error("náði ekki í jsPDF (þarf netsamband)"));
    document.head.appendChild(sc);
  });
}

let fontsReady = null;
function ensureFonts() {
  if (fontsReady) return fontsReady;
  if (!document.querySelector(`link[href="${FONT_CSS}"]`)) {
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = FONT_CSS; document.head.appendChild(l);
  }
  fontsReady = Promise.race([
    Promise.all([document.fonts.load('800 40px "Baloo 2"', "Þð"), document.fonts.load('600 20px "Inter"', "Þð")]).catch(() => 0),
    new Promise((r) => setTimeout(r, 4000)),
  ]);
  return fontsReady;
}

// Image that can be drawn on a canvas and still exported (needs CORS; Music Assistant allows it).
const imageCache = new Map();
function loadImage(src) {
  if (!src) return Promise.resolve(null);
  if (imageCache.has(src)) return imageCache.get(src);
  const p = (async () => {
    let url = src;
    if (!src.startsWith("data:")) {
      try {
        const r = IMG_FETCH && src.startsWith("/api/") ? await IMG_FETCH(src) : await fetch(src, { mode: "cors" });
        if (!r.ok) return null;
        url = URL.createObjectURL(await r.blob());
      } catch (e) { return null; }
    }
    return new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = url;
    });
  })();
  imageCache.set(src, p);
  return p;
}

// Main colour of a cover: the most common saturated hue, darkened so white text stays readable.
function coverColor(img) {
  if (!img) return null;
  const c = document.createElement("canvas"); c.width = c.height = 40;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0, 40, 40);
  let data;
  try { data = x.getImageData(0, 0, 40, 40).data; } catch (e) { return null; }
  const bins = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (d < 0.12 || l < 0.12 || l > 0.92) continue;
    const s = d / (1 - Math.abs(2 * l - 1));
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    const bin = bins[Math.floor(h / 30)], w = s * s;
    bin.w += w; bin.r += data[i] * w; bin.g += data[i + 1] * w; bin.b += data[i + 2] * w;
  }
  const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
  if (best.w < 8) return null;
  let r = best.r / best.w / 255, g = best.g / best.w / 255, b = best.b / best.w / 255;
  // to HSL, clamp lightness/saturation, back to RGB
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let l = (mx + mn) / 2, s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = d === 0 ? 0 : mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  l = Math.min(Math.max(l, 0.22), 0.32); s = Math.max(s, 0.55);  // dark enough to stand out from the cover
  const C = (1 - Math.abs(2 * l - 1)) * s, X = C * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - C / 2;
  [r, g, b] = h < 60 ? [C, X, 0] : h < 120 ? [X, C, 0] : h < 180 ? [0, C, X] : h < 240 ? [0, X, C] : h < 300 ? [X, 0, C] : [C, 0, X];
  return `rgb(${Math.round((r + m) * 255)},${Math.round((g + m) * 255)},${Math.round((b + m) * 255)})`;
}

// ---------- drawing ----------

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean); const lines = []; let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Largest font size (mm) where every word fits and the title needs at most maxLines lines.
function fitTitle(ctx, text, maxW, mm, start, min, maxLines) {
  let fs = start, lines = [];
  for (; fs >= min; fs -= 0.2) {
    ctx.font = `800 ${fs * mm}px "Baloo 2", sans-serif`;
    const longest = Math.max(0, ...String(text).split(/\s+/).map((w) => ctx.measureText(w).width));
    lines = wrap(ctx, text, maxW);
    if (longest <= maxW && lines.length <= maxLines) return { fs, lines };
  }
  ctx.font = `800 ${min * mm}px "Baloo 2", sans-serif`;
  lines = wrap(ctx, text, maxW);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] += "…"; }
  return { fs: min, lines };
}

function drawIcon(ctx, name, cx, cy, size, color) {
  ctx.save(); ctx.translate(cx - size / 2, cy - size / 2); ctx.scale(size / 24, size / 24);
  ctx.fillStyle = color; ctx.fill(new Path2D(ICONS[name])); ctx.restore();
}

function drawCover(ctx, img, x, y, w, h) {
  const r = Math.max(w / img.width, h / img.height), iw = img.width * r, ih = img.height * r;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

// A small book: white edge, soft shadow, cover cropped to fill (or a blank page with the series icon).
function drawBook(ctx, img, cx, cy, size, angle, mm, tint) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle * Math.PI / 180);
  ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 1.6 * mm; ctx.shadowOffsetY = 0.5 * mm;
  const e = 0.6 * mm;
  ctx.fillStyle = "#fff"; rr(ctx, -size / 2 - e, -size / 2 - e, size + 2 * e, size + 2 * e, 1 * mm); ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.save(); rr(ctx, -size / 2, -size / 2, size, size, 0.6 * mm); ctx.clip();
  if (img) drawCover(ctx, img, -size / 2, -size / 2, size, size);
  else { ctx.fillStyle = tint; ctx.fillRect(-size / 2, -size / 2, size, size); drawIcon(ctx, "series", 0, 0, size * 0.45, "rgba(255,255,255,.85)"); }
  ctx.restore(); ctx.restore();
}

const NAVY = "#17284A";
// Bright, child-friendly colours; the cover's main hue picks the nearest one (instead of a dark, muddy tone).
const KID = ["#FF5A5F", "#FF8C1A", "#FFC233", "#43C463", "#22B8A8", "#3A86FF", "#8B5CF6", "#FF4FA3"];
const KID_HUES = [358, 28, 44, 135, 174, 217, 258, 330];
function rgbHue(rgb) {
  const m = String(rgb || "").match(/\d+/g);
  if (!m) return null;
  const [r, g, b] = m.map((n) => n / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return null;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
function vivid(item, opts) {
  const h = opts.color === "cover" ? rgbHue(item.color) : null;
  if (h == null) return CAT[item.kind].bg;
  let best = 0, bd = 999;
  KID_HUES.forEach((kh, k) => { const dd = Math.min(Math.abs(kh - h), 360 - Math.abs(kh - h)); if (dd < bd) { bd = dd; best = k; } });
  return KID[best];
}

// Soft blurred copy of the cover (shrink, then stretch: works in every browser, unlike ctx.filter).
function drawBlurred(ctx, img, x, y, w, h) {
  const t = document.createElement("canvas"); t.width = 16; t.height = Math.max(4, Math.round(16 * h / w));
  const tx = t.getContext("2d");
  const r = Math.max(t.width / img.width, t.height / img.height);
  tx.drawImage(img, (t.width - img.width * r) / 2, (t.height - img.height * r) / 2, img.width * r, img.height * r);
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(t, x, y, w, h); ctx.restore();
}

// Square picture: the whole cover (no cropping to the label's shape), or a fan of books for a series.
function drawArt(ctx, item, img, extras, x, y, S, mm, tint, opt = {}) {
  if (item.series) {
    const b = S * 0.6;
    drawBook(ctx, extras[1] || null, x + S * 0.33, y + S * 0.42, b, -9, mm, tint);
    drawBook(ctx, extras[0] || null, x + S * 0.67, y + S * 0.4, b, 8, mm, tint);
    drawBook(ctx, img, x + S * 0.5, y + S * 0.55, S * 0.72, opt.angle || 0, mm, tint);
    return;
  }
  ctx.save();
  if (opt.angle) { ctx.translate(x + S / 2, y + S / 2); ctx.rotate(opt.angle * Math.PI / 180); ctx.translate(-(x + S / 2), -(y + S / 2)); }
  const e = (opt.border || 0) * mm, r = (opt.r || 2) * mm;
  ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 2 * mm; ctx.shadowOffsetY = 0.6 * mm;
  ctx.fillStyle = e ? "#fff" : tint; rr(ctx, x - e, y - e, S + 2 * e, S + 2 * e, r + e); ctx.fill();
  ctx.shadowColor = "transparent";
  rr(ctx, x, y, S, S, r); ctx.clip();
  if (img) drawCover(ctx, img, x, y, S, S);
  else { ctx.fillStyle = tint; ctx.fillRect(x, y, S, S); drawIcon(ctx, item.kind, x + S / 2, y + S / 2, S * 0.45, "rgba(255,255,255,.85)"); }
  ctx.restore();
}

// Round badge with the type icon (♪ music, book story, books series)
function drawBadge(ctx, item, cx, cy, r, bg, fg) {
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,.3)"; ctx.shadowBlur = r * 0.35; ctx.shadowOffsetY = r * 0.08;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = bg; ctx.fill(); ctx.restore();
  drawIcon(ctx, item.series ? "series" : item.kind, cx, cy, r * 1.2, fg);
}

// Picture size that still leaves room for the title's longest word at a readable size.
function artSize(ctx, title, avail, mm, maxS, minS, minFont = 3.8) {
  ctx.font = `800 ${minFont * mm}px "Baloo 2", sans-serif`;
  const longest = Math.max(0, ...String(title).split(/\s+/).map((w) => ctx.measureText(w).width));
  return Math.max(minS, Math.min(maxS, avail - longest));
}

const countText = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "bók" : "bækur"}`;

// Returns a canvas of the label incl. bleed. opts: {style, color: 'cover'|'type', brand, brandText}
// extras = more cover images for a series (drawn behind the main cover in the classic style).
function drawCard(item, img, opts, px, withBleed = true, extras = []) {
  const st = geom(opts), mm = px;
  const blx = withBleed ? st.bx * mm : 0, bly = withBleed ? st.by * mm : 0, W = st.w * mm, H = st.h * mm;
  const c = document.createElement("canvas"); c.width = Math.round(W + 2 * blx); c.height = Math.round(H + 2 * bly);
  const ctx = c.getContext("2d");
  const cat = CAT[item.kind];
  const main = opts.color === "cover" && item.color ? item.color : cat.bg;
  const icon = item.series ? "series" : item.kind;
  ctx.translate(blx, bly);

  if (opts.style === "blur") {
    // "Heil mynd": the whole cover, on a soft blurred copy of itself; title beside it
    ctx.fillStyle = main; ctx.fillRect(-blx, -bly, W + 2 * blx, H + 2 * bly);
    if (img) { drawBlurred(ctx, img, -blx - 4 * mm, -bly - 4 * mm, W + 2 * blx + 8 * mm, H + 2 * bly + 8 * mm); }
    ctx.fillStyle = "rgba(10,15,30,.30)"; ctx.fillRect(-blx, -bly, W + 2 * blx, H + 2 * bly);
    const ax = 4 * mm, S = artSize(ctx, item.title, W - ax - 7.5 * mm, mm, H - 8 * mm, H * 0.6), ay = (H - S) / 2;
    drawArt(ctx, item, img, extras, ax, ay, S, mm, main, { r: 2.2 });
    const x0 = ax + S + 4 * mm, cw = W - x0 - 3.5 * mm;
    drawBadge(ctx, item, W - 3.5 * mm - 4.2 * mm, 3.8 * mm + 4.2 * mm, 4.2 * mm, cat.bg, "#fff");
    const { fs, lines } = fitTitle(ctx, item.title, cw, mm, 5.2, 3.4, 4);
    const lh = fs * 1.05 * mm;
    let bottom = H - 4.2 * mm;
    ctx.font = `600 ${2.5 * mm}px Inter, sans-serif`; ctx.fillStyle = "rgba(255,255,255,.88)";
    ctx.fillText(item.series && item.count > 1 ? `${cat.chip} · ${countText(item.count)}` : cat.chip, x0, bottom);
    bottom -= 4.2 * mm;
    ctx.font = `800 ${fs * mm}px "Baloo 2", sans-serif`;
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 1.2 * mm; ctx.fillStyle = "#fff";
    let y = bottom - (lines.length - 1) * lh;
    for (const l of lines) { ctx.fillText(l, x0, y); y += lh; }
    ctx.restore();
    if (opts.brand) { ctx.font = `600 ${2 * mm}px Inter, sans-serif`; ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fillText(opts.brandText, x0, 6.5 * mm); }
    return c;
  }

  if (opts.style === "pop") {
    // "Litríkt": bright colour, playful dots, the picture as a tilted photo, title on a white plate
    const bg = vivid(item, opts);
    ctx.fillStyle = bg; ctx.fillRect(-blx, -bly, W + 2 * blx, H + 2 * bly);
    let seed = [...String(item.title)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let k = 0; k < 16; k++) {
      const x = rnd() * W, y = rnd() * H, r = (0.8 + rnd() * 2.6) * mm;
      if (k % 4 === 0) drawIcon(ctx, item.kind, x, y, r * 2.6, "rgba(255,255,255,.18)");
      else { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,.16)"; ctx.fill(); }
    }
    const ax = 5.5 * mm, S = artSize(ctx, item.title, W - ax - 13.9 * mm, mm, H - 12 * mm, H * 0.58), ay = (H - S) / 2;
    drawArt(ctx, item, img, extras, ax, ay, S, mm, bg, { border: 1.4, angle: -4, r: 1.6 });
    drawBadge(ctx, item, ax + 0.5 * mm, ay + 0.5 * mm, 4.4 * mm, "#fff", cat.bg);
    const x0 = ax + S + 5.5 * mm, cw = W - x0 - 4 * mm, pad = 2.2 * mm;
    const { fs, lines } = fitTitle(ctx, item.title, cw - 2 * pad, mm, 5.4, 3.4, 3);
    const lh = fs * 1.02 * mm;
    const chip = item.series && item.count > 1 ? countText(item.count) : "";
    const plateH = lines.length * lh + 2 * pad + 0.6 * mm;
    const py = Math.max(4 * mm, (H - plateH - (chip ? 6.5 * mm : 0)) / 2);
    ctx.save(); ctx.translate(x0 + cw / 2, py + plateH / 2); ctx.rotate(1.5 * Math.PI / 180); ctx.translate(-(x0 + cw / 2), -(py + plateH / 2));
    ctx.shadowColor = "rgba(0,0,0,.25)"; ctx.shadowBlur = 1.5 * mm; ctx.shadowOffsetY = 0.5 * mm;
    ctx.fillStyle = "#fff"; rr(ctx, x0, py, cw, plateH, 2.4 * mm); ctx.fill(); ctx.shadowColor = "transparent";
    ctx.font = `800 ${fs * mm}px "Baloo 2", sans-serif`; ctx.fillStyle = NAVY; ctx.textAlign = "center";
    let y = py + pad + fs * 0.8 * mm;
    for (const l of lines) { ctx.fillText(l, x0 + cw / 2, y); y += lh; }
    ctx.restore(); ctx.textAlign = "left";
    if (chip) {
      ctx.font = `600 ${2.7 * mm}px Inter, sans-serif`;
      const tw = ctx.measureText(chip).width + 4 * mm, cy = py + plateH + 2.2 * mm;
      ctx.fillStyle = "rgba(0,0,0,.22)"; rr(ctx, x0 + (cw - tw) / 2, cy, tw, 5 * mm, 2.5 * mm); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.fillText(chip, x0 + cw / 2, cy + 3.5 * mm); ctx.textAlign = "left";
    }
    if (opts.brand) { ctx.font = `600 ${2 * mm}px Inter, sans-serif`; ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.textAlign = "right"; ctx.fillText(opts.brandText, W - 3 * mm, H - 2.5 * mm); ctx.textAlign = "left"; }
    return c;
  }

  if (opts.style === "clean") {
    // "Einfalt": white card, colour stripe with the type icon, whole cover, big dark title (easy to read, little ink)
    ctx.fillStyle = "#fff"; ctx.fillRect(-blx, -bly, W + 2 * blx, H + 2 * bly);
    ctx.save(); rr(ctx, 0, 0, W, H, st.r * mm); ctx.clip();
    const stripe = 7 * mm;
    ctx.fillStyle = main; ctx.fillRect(0, 0, stripe, H);
    drawIcon(ctx, item.series ? "series" : item.kind, stripe / 2, 6 * mm, 4.6 * mm, "#fff");
    const ax = stripe + 3.5 * mm, S = artSize(ctx, item.title, W - ax - 7.5 * mm, mm, H - 8 * mm, H * 0.6), ay = (H - S) / 2;
    drawArt(ctx, item, img, extras, ax, ay, S, mm, main, { r: 2 });
    const x0 = ax + S + 4 * mm, cw = W - x0 - 3.5 * mm;
    ctx.font = `600 ${2.5 * mm}px Inter, sans-serif`; ctx.fillStyle = main;
    ctx.fillText((item.series && item.count > 1 ? `${cat.chip} · ${countText(item.count)}` : cat.chip).toUpperCase(), x0, 7.5 * mm);
    const { fs, lines } = fitTitle(ctx, item.title, cw, mm, 5.4, 3.4, 4);
    const lh = fs * 1.04 * mm;
    ctx.fillStyle = NAVY;
    let y = 9.5 * mm + fs * 0.85 * mm;
    for (const l of lines) { ctx.fillText(l, x0, y); y += lh; }
    if (opts.brand) { ctx.font = `600 ${2 * mm}px Inter, sans-serif`; ctx.fillStyle = "#8a93a6"; ctx.fillText(opts.brandText, x0, H - 3.5 * mm); }
    ctx.restore();
    ctx.strokeStyle = "#d9dde5"; ctx.lineWidth = 0.25 * mm; rr(ctx, 0.15 * mm, 0.15 * mm, W - 0.3 * mm, H - 0.3 * mm, st.r * mm); ctx.stroke();
    return c;
  }

  if (opts.style === "classic") {
    ctx.fillStyle = "#fff"; ctx.fillRect(-blx, -bly, W + 2 * blx, H + 2 * bly);
    ctx.save(); rr(ctx, 0, 0, W, H, st.r * mm); ctx.clip();
    ctx.fillStyle = main; ctx.fillRect(0, 0, W, H);
    const S = H;
    ctx.fillStyle = "#17284A"; ctx.fillRect(0, 0, S, S);
    if (item.series) {
      // a little pile of books: two behind, tilted, the card's own cover in front
      ctx.fillStyle = main; ctx.globalAlpha = 0.35; ctx.fillRect(0, 0, S, S); ctx.globalAlpha = 1;
      const b = S * 0.55;
      drawBook(ctx, extras[1] || null, S * 0.38, S * 0.41, b, -9, mm, main);
      drawBook(ctx, extras[0] || null, S * 0.62, S * 0.39, b, 8, mm, main);
      drawBook(ctx, img, S * 0.5, S * 0.56, S * 0.64, 0, mm, main);
    } else if (img) drawCover(ctx, img, 0, 0, S, S);
    else drawIcon(ctx, icon, S / 2, S / 2, S * 0.5, "rgba(255,255,255,.8)");
    const x0 = S + 2.6 * mm, maxW = W - x0 - 2.4 * mm;
    let cx = x0;
    // chips with an icon and a word: [♪ Tónlist] / [book Saga] and [books Sería]; wrap if needed
    ctx.font = `600 ${3 * mm}px Inter, sans-serif`;
    let cy = 2.8 * mm;
    const ch = 5.6 * mm, is = 4.2 * mm;
    const chip = (txt, iconName, ghost) => {
      const cw = 1.5 * mm + is + 1 * mm + ctx.measureText(txt).width + 2.2 * mm;
      if (cx > x0 && cx + cw > W - 2 * mm) { cx = x0; cy += ch + 1.2 * mm; }
      rr(ctx, cx, cy, cw, ch, ch / 2);
      if (ghost) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 0.35 * mm; ctx.stroke(); }
      else { ctx.fillStyle = "#fff"; ctx.fill(); }
      drawIcon(ctx, iconName, cx + 1.5 * mm + is / 2, cy + ch / 2, is, ghost ? "#fff" : cat.bg);
      ctx.fillStyle = ghost ? "#fff" : "#17284A";
      ctx.fillText(txt, cx + 1.5 * mm + is + 1 * mm, cy + ch / 2 + 1.05 * mm); cx += cw + 1 * mm;
    };
    chip(cat.chip, item.kind, false);
    const count = item.count || 0;
    if (item.series) chip(count > 1 ? `${count} ${count % 10 === 1 && count % 100 !== 11 ? "bók" : "bækur"}` : "Sería", "series", true);
    if (item.series && count > 1 && opts.dots !== false) {
      const r = 0.85 * mm, step = 2.7 * mm, maxDots = Math.max(3, Math.floor((maxW + step - 7 * mm) / step));
      const shown = count > maxDots ? maxDots - 1 : count;
      let dx = x0 + r, dy = cy + ch + 2.6 * mm;
      ctx.fillStyle = "#fff";
      for (let k = 0; k < shown; k++) { ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI * 2); ctx.fill(); dx += step; }
      if (count > shown) {
        ctx.font = `600 ${2.6 * mm}px Inter, sans-serif`;
        ctx.fillText(`+${count - shown}`, dx - r, dy + 0.95 * mm);
      }
    }
    let bottom = H - 2.6 * mm;
    if (opts.brand) {
      ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.85; ctx.font = `600 ${2.2 * mm}px Inter, sans-serif`;
      ctx.fillText(opts.brandText, x0, bottom); ctx.globalAlpha = 1; bottom -= 3.4 * mm;
    }
    const { fs, lines } = fitTitle(ctx, item.title, maxW, mm, 4.6, 2.8, item.series ? 3 : 4);
    const lh = fs * 1.05 * mm;
    ctx.fillStyle = "#fff";
    let y = bottom - (lines.length - 1) * lh;
    for (const l of lines) { ctx.fillText(l, x0, y); y += lh; }
    ctx.restore();
    return c;
  }

  // ---- big picture style ----
  ctx.fillStyle = main; ctx.fillRect(-blx, -bly, W + 2 * blx, H + 2 * bly);
  if (img) drawCover(ctx, img, -blx, -bly, W + 2 * blx, H + 2 * bly);
  else drawIcon(ctx, icon, W / 2, H * 0.4, H * 0.5, "rgba(255,255,255,.35)");

  // title band
  const pad = 4 * mm, maxW = W - 2 * pad;
  const { fs, lines } = fitTitle(ctx, item.title, maxW, mm, 7, 3.6, 2);
  const lh = fs * 1.02 * mm, brandH = opts.brand ? 3 * mm : 0;
  const bandH = lines.length * lh + 3.6 * mm + brandH;
  const bandY = H - bandH;
  ctx.fillStyle = main;
  ctx.beginPath(); ctx.moveTo(-blx, bandY + 2.2 * mm);
  ctx.quadraticCurveTo(W / 2, bandY - 2.2 * mm, W + blx, bandY + 2.2 * mm);
  ctx.lineTo(W + blx, H + bly); ctx.lineTo(-blx, H + bly); ctx.closePath(); ctx.fill();
  ctx.textAlign = "center";
  let y = bandY + 1.4 * mm + fs * 0.82 * mm;
  ctx.font = `800 ${fs * mm}px "Baloo 2", sans-serif`;
  ctx.lineJoin = "round"; ctx.lineWidth = 0.7 * mm; ctx.strokeStyle = "rgba(0,0,0,.28)";
  for (const l of lines) { ctx.strokeText(l, W / 2, y); ctx.fillStyle = "#fff"; ctx.fillText(l, W / 2, y); y += lh; }
  if (opts.brand) {
    ctx.font = `600 ${2.1 * mm}px Inter, sans-serif`; ctx.globalAlpha = 0.85; ctx.fillStyle = "#fff";
    ctx.fillText(opts.brandText, W / 2, H - 2 * mm); ctx.globalAlpha = 1;
  }
  ctx.textAlign = "left";

  // type badge (top-left): note = music, book = story, stack = series
  const br = 4.8 * mm, bx = 3 * mm + br, by = 3 * mm + br;
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,.3)"; ctx.shadowBlur = 1.2 * mm; ctx.shadowOffsetY = 0.3 * mm;
  ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.restore();
  drawIcon(ctx, icon, bx, by, br * 1.25, cat.bg);

  // thin type-coloured frame just inside the cut line
  ctx.strokeStyle = cat.bg; ctx.lineWidth = 1.2 * mm;
  rr(ctx, 0.9 * mm, 0.9 * mm, W - 1.8 * mm, H - 1.8 * mm, Math.max(0.5, st.r - 0.9) * mm); ctx.stroke();
  return c;
}

// Back of a card: title band, the books in a series (or a short hint), and a "return me" line.
// Book lists: drop a start most titles share ("Gurra Grís - Sögusafn" -> "Sögusafn").
function shortNames(names) {
  if (names.length < 3) return names;
  const words = names.map((n) => String(n).split(/\s+/));
  let best = 0;
  for (let k = 1; k <= 4; k++) {
    const key = norm(words[0].slice(0, k).join(" "));
    const share = words.filter((w) => w.length > k && norm(w.slice(0, k).join(" ")) === key).length;
    if (key.length >= 3 && share >= Math.ceil(names.length * 0.6)) best = k; else break;
  }
  if (!best) return names;
  const key = norm(words[0].slice(0, best).join(" "));
  return names.map((n, i) => {
    if (norm(words[i].slice(0, best).join(" ")) !== key) return n;
    const rest = words[i].slice(best).join(" ").replace(/^[\s\-–—:,.]+/, "");
    return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : n;
  });
}

function drawBack(item, opts, px, withBleed = true, img = null) {
  const st = geom(opts), mm = px;
  const blx = withBleed ? st.bx * mm : 0, bly = withBleed ? st.by * mm : 0, W = st.w * mm, H = st.h * mm;
  const c = document.createElement("canvas"); c.width = Math.round(W + 2 * blx); c.height = Math.round(H + 2 * bly);
  const ctx = c.getContext("2d");
  const cat = CAT[item.kind];
  const main = opts.color === "cover" && item.color ? item.color : cat.bg;
  ctx.translate(blx, bly);
  ctx.save(); rr(ctx, -blx, -bly, W + 2 * blx, H + 2 * bly, (st.r * mm) + Math.min(blx, bly)); ctx.clip();
  ctx.fillStyle = "#fff"; ctx.fillRect(-blx, -bly, W + 2 * blx, H + 2 * bly);

  // title band
  const bandH = 10.5 * mm, pad = 3.6 * mm;
  ctx.fillStyle = main; ctx.fillRect(-blx, -bly, W + 2 * blx, bandH + bly);
  drawIcon(ctx, item.series ? "series" : item.kind, W - pad - 2.8 * mm, bandH / 2, 5.6 * mm, "#fff");
  const t = fitTitle(ctx, item.title, W - 2 * pad - 7 * mm, mm, 5.4, 3.2, 1);
  ctx.fillStyle = "#fff"; ctx.fillText(t.lines[0], pad, bandH / 2 + t.fs * 0.34 * mm);

  const footY = H - 3 * mm, lineY = footY - 3.6 * mm, top = bandH + 4.4 * mm;
  const names = item.series ? shortNames(item.names || []) : [];
  if (names.length) {
    const lh = 3.2 * mm, per = Math.max(1, Math.floor((lineY - 1.6 * mm - top) / lh) + 1);
    const cols = names.length > per ? 2 : 1, gap = 2.4 * mm, colW = (W - 2 * pad - (cols - 1) * gap) / cols;
    const cap = per * cols, shown = names.length > cap ? cap - 1 : names.length;
    ctx.font = `600 ${2.45 * mm}px Inter, sans-serif`; ctx.fillStyle = "#17284A";
    const at = (k) => [pad + Math.floor(k / per) * (colW + gap), top + (k % per) * lh];
    for (let k = 0; k < shown; k++) {
      let s = `${k + 1}. ${names[k]}`;
      while (ctx.measureText(s).width > colW && s.length > 5) s = s.slice(0, -2) + "…";
      const [x, y] = at(k); ctx.fillText(s, x, y);
    }
    if (names.length > shown) {
      const [x, y] = at(shown); ctx.fillStyle = main; ctx.fillText(`+ ${names.length - shown} í viðbót`, x, y);
    }
  } else {
    // the cover small on the left, so the back matches its front; how to use it on the right
    const S = Math.min(lineY - bandH - 4 * mm, 24 * mm), sy = bandH + (lineY - bandH - S) / 2;
    if (img) {
      ctx.save(); rr(ctx, pad, sy, S, S, 1.6 * mm); ctx.clip(); drawCover(ctx, img, pad, sy, S, S); ctx.restore();
    } else drawIcon(ctx, item.kind, pad + S / 2, sy + S / 2, S * 0.7, "rgba(23,40,74,.15)");
    ctx.fillStyle = "#17284A";
    const tx = pad + S + 3.5 * mm, tw = W - tx - pad;
    const hint = item.kind === "story" ? "Leggðu mig á Vordísarvarpið og hlustaðu á söguna" : "Leggðu mig á Vordísarvarpið og hlustaðu";
    const h = fitTitle(ctx, hint, tw, mm, 4, 2.8, 4), lh = h.fs * 1.08 * mm;
    let y = sy + S / 2 - ((h.lines.length - 1) * lh) / 2 + h.fs * 0.3 * mm;
    for (const l of h.lines) { ctx.fillText(l, tx, y); y += lh; }
  }

  // "if you find me" line
  ctx.strokeStyle = main; ctx.lineWidth = 0.3 * mm; ctx.setLineDash([1 * mm, 0.8 * mm]);
  ctx.beginPath(); ctx.moveTo(pad, lineY); ctx.lineTo(W - pad, lineY); ctx.stroke(); ctx.setLineDash([]);
  let fz = 3;
  do { ctx.font = `600 ${fz * mm}px Inter, sans-serif`; fz -= 0.1; } while (fz > 1.6 && ctx.measureText(opts.returnText).width > W - 2 * pad);
  ctx.fillStyle = main; ctx.textAlign = "center"; ctx.fillText(opts.returnText, W / 2, footY); ctx.textAlign = "left";
  ctx.restore();

  ctx.strokeStyle = main; ctx.lineWidth = 0.6 * mm;
  rr(ctx, 0.6 * mm, 0.6 * mm, W - 1.2 * mm, H - 1.2 * mm, Math.max(0.5, st.r - 0.6) * mm); ctx.stroke();
  return c;
}

// Slot k (0-9) on an A4 page, in mm.
function slotPos(st, k) {
  return { x: st.x0 + (k % 2) * (st.w + st.gx), y: st.y0 + Math.floor(k / 2) * (st.h + st.gy) };
}

// Positions on A4 (mm) for each label, 10 per page. On sticker sheets the first page can start
// at a later slot (a half-used sheet).
function layout(opts, n, start = 1) {
  const st = geom(opts), s0 = st.cut ? 0 : Math.min(9, Math.max(0, (start | 0) - 1));
  const pos = [];
  for (let i = 0; i < n; i++) {
    const k = i + s0;
    pos.push({ page: Math.floor(k / 10), slot: k % 10, ...slotPos(st, k % 10) });
  }
  return { st, pos, s0, pages: Math.max(1, Math.ceil((n + s0) / 10)) };
}

async function renderAll(entries, opts) {
  await ensureFonts();
  const out = [];
  for (const { it, back } of entries) {
    if (back) { out.push(drawBack(it, opts, PRINT_PX, true, await loadImage(it.image)).toDataURL("image/jpeg", 0.92)); continue; }
    const extras = await Promise.all((it.stack || []).map(loadImage));
    out.push(drawCard(it, await loadImage(it.image), opts, PRINT_PX, true, extras).toDataURL("image/jpeg", 0.92));
  }
  return out;
}

const PRINTED_KEY = "vordis-kortamidar-printed";
const NAMES_KEY = "vordis-kortamidar-names";   // uri -> {name, image}: books outside your library (Spotify, Storytel)
const RETURN_TEXT = "Ef þú finnur mig: skilaðu mér til Vordísar ♥";
const GROUPS = [["music", "Tónlist"], ["story", "Sögur"]];
const mediaOf = (c) => c.media_id || (c.media && c.media.media_content_id) || "";
const moreOf = (c) => String(c.more_media || "").split("\n").map((x) => x.trim()).filter(Boolean);
const MEDIA_TYPES = "album|playlist|audiobook|podcast|artist|track|radio";
// "library://album/2", "spotify--x://playlist/abc", or a Music Assistant web address ".../#/albums/library/2"
function parseMedia(v) {
  v = String(v || "").trim();
  const web = v.match(new RegExp(`#/(${MEDIA_TYPES})s?/([^/]+)/([^/?#]+)`));
  if (web) return { uri: `${web[2]}://${web[1]}/${decodeURIComponent(web[3])}`, type: web[1] };
  const m = v.match(new RegExp(`^[\\w.-]+://(${MEDIA_TYPES})/.+$`));
  return { uri: v, type: m ? m[1] : null };
}
// where a media item comes from, from its uri: "spotify--tXX://album/1" -> Spotify
const PROVIDERS = { library: "Safnið", spotify: "Spotify", storytel: "Storytel", tunein: "TuneIn", radiobrowser: "Radio Browser",
  tidal: "Tidal", deezer: "Deezer", qobuz: "Qobuz", ytmusic: "YouTube Music", apple_music: "Apple Music", soundcloud: "SoundCloud",
  filesystem_local: "Skrár", filesystem_smb: "Skrár", plex: "Plex", jellyfin: "Jellyfin", subsonic: "Subsonic", audible: "Audible",
  podcastfeed: "Hlaðvarp (RSS)", builtin: "Innbyggt", bbc_sounds: "BBC Sounds", http: "Vefslóð", https: "Vefslóð" };
function sourceOf(uri) {
  const key = String(uri || "").split("://")[0].split("--")[0].toLowerCase();
  return { key: key.replace(/[^a-z0-9_]/g, ""), name: PROVIDERS[key] || key || "?" };
}
const srcBadge = (uri) => { const s = sourceOf(uri); return uri ? `<span class="src src-${s.key}">${esc(s.name)}</span>` : ""; };
// for comparing titles: lower case, no punctuation, single spaces
const norm = (t) => String(t || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const SRC_RANK = (uri) => (String(uri).startsWith("library://") ? 0 : String(uri).startsWith("storytel") ? 1 : 2);
// The words a series' books share: the longest start of the query that at least `min` titles contain.
function seriesKey(q, names, min = 3) {
  const words = norm(q).split(" ").filter(Boolean);
  for (let n = words.length; n >= 1; n--) {
    const key = words.slice(0, n).join(" ");
    if (n === 1 && key.length < 4) break;
    if (names.filter((t) => ` ${norm(t)} `.includes(` ${key} `)).length >= min) return key;
  }
  return "";
}
const TNAME = { playlist: "Lagalisti", album: "Plata", audiobook: "Hljóðbók", podcast: "Hlaðvarp", artist: "Flytjandi", track: "Lag", radio: "Útvarp" };
const FILTERS = [["all", "Allt"], ["audiobook", "Hljóðbækur"], ["album", "Plötur"], ["playlist", "Lagalistar"], ["podcast", "Hlaðvörp"], ["radio", "Útvarp"]];
let IMG_FETCH = null;   // Home Assistant's authenticated fetch, for pictures kept in Home Assistant
const newId = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : String(Math.random()).slice(2)).slice(0, 12);
const play_items_of = (c) => [mediaOf(c), ...moreOf(c)].filter(Boolean);
const shortDate = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : `${d.getDate()}.${d.getMonth() + 1}.`; };

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ---------- the card ----------

class VordisarvarpidKortamidarCard extends HTMLElement {
  setConfig(config) {
    this._config = { brand: "Vordísarvarpið", style: "big", ...config };
    this._opts = { style: this._config.style, color: "cover", brand: false, dots: true, back: false, start: 1,
      sheet: this._config.sheet || "herma5028", cal: {} };
    this._labels = {};
    this._known = {};
    this._items = null;
    this._loading = false;
    this._covers = {};
    this._panel = -1;
    this._ptab = "spilar";
    this._printOpen = false;
    this._names = {};
    this._ftype = "all";
    this._pending = { labels: {}, names: {}, settings: null };
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    IMG_FETCH = (url) => hass.fetchWithAuth(url);
    if (!this._loaded && !this._loading) this._load();
    if (this.isConnected) this._subscribe();
  }

  connectedCallback() {
    if (this._hass) this._subscribe();
    this._onKey = (e) => {
      if (e.key !== "Escape") return;
      if (this._menu) { this._menu = false; this._render(); }
      else if (this._panel >= 0 || this._printOpen) { this._panel = -1; this._printOpen = false; this._render(); }
    };
    document.addEventListener("keydown", this._onKey);
  }

  disconnectedCallback() {
    const s = this._sub; this._sub = null;
    if (s) s.then((unsub) => unsub && unsub()).catch(() => 0);
    if (this._onKey) document.removeEventListener("keydown", this._onKey);
    this._flush();
  }

  getCardSize() { return 8; }
  static getStubConfig() { return {}; }

  _drawOpts() { return { ...this._opts, brandText: this._config.brand, returnText: this._config.return_text || RETURN_TEXT }; }

  // print settings are kept in Home Assistant (shared by every device that opens this page)
  _saveOpts() {
    this._pending.settings = { ...this._opts };
    this._queueFlush();
  }

  _queueFlush() {
    clearTimeout(this._flushT);
    this._flushT = setTimeout(() => this._flush(), 700);
  }

  async _flush() {
    clearTimeout(this._flushT);
    const p = this._pending;
    if (!this._entryId || (!Object.keys(p.labels).length && !Object.keys(p.names).length && !p.settings)) return;
    this._pending = { labels: {}, names: {}, settings: null };
    const msg = { type: "vordisarvarpid/update", entry_id: this._entryId };
    if (Object.keys(p.labels).length) msg.labels = p.labels;
    if (Object.keys(p.names).length) msg.names = p.names;
    if (p.settings) msg.settings = p.settings;
    try { await this._hass.callWS(msg); } catch (e) { this._error = "Gat ekki vistað stillingar: " + (e.message || e); this._render(); }
  }

  _input() { return this._ent || {}; }

  async _service(domain, service, data) {
    const r = await this._hass.callWS({ type: "call_service", domain, service, service_data: data, return_response: true });
    return r.response;
  }

  async _cover(entry, card) {
    const want = mediaOf(card), type = card.media_type || "playlist";
    if (this._lib && this._lib[want] && this._lib[want].image) return this._lib[want].image;
    if (this._known[want] && this._known[want].image) return this._known[want].image;
    try {
      const lib = await this._service("music_assistant", "get_library", { config_entry_id: entry, media_type: type, search: card.name, limit: 25 });
      const hit = (lib.items || []).find((i) => i.uri === want);
      if (hit && hit.image) return this._img(hit.image);
    } catch (e) { /* fall through */ }
    try {
      const res = await this._service("music_assistant", "search", { config_entry_id: entry, name: card.name, media_type: [type], limit: 10 });
      const all = Object.values(res || {}).filter(Array.isArray).flat();
      const hit = all.find((i) => i.uri === want) || all[0];
      if (hit && hit.image) return this._img(hit.image);
    } catch (e) { /* no cover */ }
    return "";
  }

  // Music Assistant serves covers from its own address (http://<ip>:8095/imageproxy/...), which the
  // browser blocks on an https Home Assistant page. When Music Assistant runs as a Home Assistant
  // app, the same images are reachable through Home Assistant's ingress, on Home Assistant's own address.
  async _ingress() {
    if (this._ingressBase !== undefined && Date.now() - (this._ingressAt || 0) < 10 * 60000) return this._ingressBase;
    this._ingressBase = null;
    try {
      const sup = (endpoint, method = "get") => this._hass.callWS({ type: "supervisor/api", endpoint, method });
      const list = await sup("/addons");
      const ma = (list.addons || list).find((a) => /music_assistant/.test(a.slug) && a.state === "started");
      if (ma) {
        const info = await sup(`/addons/${ma.slug}/info`);
        if (info.ingress && info.ingress_url) {
          const s = await sup("/ingress/session", "post");
          document.cookie = `ingress_session=${s.session};path=/api/hassio_ingress/;SameSite=Strict` +
            (location.protocol === "https:" ? ";Secure" : "");
          this._ingressBase = info.ingress_url;
        }
      }
    } catch (e) { /* not an admin, or no Supervisor: use the original addresses */ }
    this._ingressAt = Date.now();
    return this._ingressBase;
  }

  _img(url) {
    if (!url || !this._ingressBase) return url || "";
    const i = url.indexOf("/imageproxy");
    if (i < 0 || url.startsWith(location.origin)) return url;
    return this._ingressBase + url.slice(i + 1).replace(/([?&])size=0\b/, "$1size=1024");  // allowed: 0, 80, 160, 256, 512, 1024
  }

  // uri -> {image, name} for whole library types, one request per type (series stacks and book lists)
  async _library(entry, types) {
    const map = {};
    for (const t of [...new Set(types.filter(Boolean))]) {
      try {
        const lib = await this._service("music_assistant", "get_library", { config_entry_id: entry, media_type: t, limit: 500 });
        for (const i of lib.items || []) { map[i.uri] = { image: this._img(i.image), name: i.name }; this._names[i.uri] = i.name; }
      } catch (e) { /* falls back to blank books */ }
    }
    return map;
  }

  async _load() {
    this._loading = true; this._error = ""; this._render();
    try {
      let st;
      try {
        st = await this._hass.callWS({ type: "vordisarvarpid/get", ...(this._config.entry_id ? { entry_id: this._config.entry_id } : {}) });
      } catch (e) {
        throw new Error("Vordísarvarpið samþættingin er ekki uppsett (Stillingar → Tæki og þjónustur).");
      }
      this._ent = st.entry; this._entryId = st.entry.entry_id;
      this._entry = this._config.config_entry_id || st.music_assistant_entry_id;
      this._saved = st.cards || [];
      this._labels = st.labels || {};
      this._known = st.names || {};
      this._opts = { ...this._opts, ...(st.settings || {}) };
      this._current = st.current;
      this._lastScanTime = st.last_scan ? st.last_scan.time : null;
      if (!(st.settings || {}).migrated) this._migrate();
      this._edit = null; this._dirty = false;
      this._loadTags();
      await ensureFonts();
      await this._ingress();
      const series = this._saved.filter((c) => moreOf(c).length);
      this._lib = this._entry ? await this._library(this._entry, series.map((c) => c.media_type)) : {};
      for (const [u, v] of Object.entries(this._known)) if (v && v.name && !this._names[u]) this._names[u] = v.name;
      this._loaded = true;
      this._items = null;
      this._subscribe();
    } catch (e) {
      this._error = e.message || String(e);
    }
    this._loading = false; this._render();
  }

  // One-time move of what this page used to keep in the browser (before the integration).
  _migrate() {
    const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
    const opts = read(OPTS_KEY), printed = read(PRINTED_KEY) || {}, names = read(NAMES_KEY) || {};
    if (opts) this._opts = { ...this._opts, ...opts };
    for (const c of this._saved) {
      const when = printed[`${c.tag_id || ""}|${c.media_id || ""}`];
      if (when && !(this._labels[c.id] || {}).printed) {
        this._labels[c.id] = { ...(this._labels[c.id] || {}), printed: when };
        this._pending.labels[c.id] = { printed: when };
      }
    }
    for (const [u, v] of Object.entries(names)) if (v && v.name && !this._known[u]) { this._known[u] = v; this._pending.names[u] = v; }
    this._opts.migrated = 1;
    this._saveOpts();
  }

  // ---------- one label per card ----------

  _label(card) { return (card && this._labels[card.id]) || {}; }

  _setLabel(it, patch) {
    const id = it.card.id, cur = { ...(this._labels[id] || {}), ...patch };
    for (const k of Object.keys(cur)) if (cur[k] === null || cur[k] === undefined) delete cur[k];
    this._labels[id] = cur;
    this._pending.labels[id] = { ...(this._pending.labels[id] || {}), ...patch };
    this._queueFlush();
  }

  // Keep one item (label + pictures) per card, in the cards' order; load pictures when a card's media changes.
  _syncItems() {
    if (!this._loaded) return;
    const cards = this._editCards();
    const prev = new Map((this._items || []).map((it) => [it.card.id, it]));
    this._items = cards.map((c) => {
      if (!c.id) c.id = newId();
      const it = prev.get(c.id) || { image: "", origImage: "", color: null, preview: "", backPreview: "", stack: [], names: [] };
      const lab = this._label(c);
      it.card = c;
      it.title = lab.title || c.name || mediaOf(c) || "(nýtt kort)";
      it.kind = lab.kind || kindOf(c);
      it.series = moreOf(c).length > 0;
      it.count = 1 + moreOf(c).length;
      it.copies = lab.copies || 1;
      it.include = lab.include !== false;
      const mkey = [mediaOf(c), c.more_media || "", c.media_type || ""].join("|");
      const sig = `${mkey}|${it.title}|${it.kind}|${lab.image || ""}`;
      if (it._sig !== sig) {
        it._sig = sig;
        if (it._mkey !== mkey || it._img !== (lab.image || "")) { it._mkey = mkey; it._img = lab.image || ""; this._loadArt(it); }
        else this._refresh(it).then(() => this._render());
      }
      return it;
    });
  }

  async _loadArt(it) {
    const c = it.card, media = mediaOf(c), lab = this._label(c);
    let cover = this._covers[media];
    if (cover === undefined && this._entry && media) { cover = await this._cover(this._entry, c); this._covers[media] = cover; }
    it.origImage = cover || "";
    it.image = lab.image || it.origImage;
    if (it.series) {
      if (this._entry) await this._resolveSeries(this._entry, [it]);
      const next = moreOf(c), lib = this._lib || {}, kn = this._known;
      it.stack = next.map((u) => (lib[u] && lib[u].image) || (kn[u] && kn[u].image) || this._covers[u]).filter(Boolean).slice(0, 2);
      const nm = (u) => (lib[u] || {}).name || (kn[u] || {}).name;
      it.names = [nm(media) || it.title, ...next.map((u, k) => nm(u) || `Bók ${k + 2}`)];
      for (const u of [media, ...next]) if (nm(u)) this._names[u] = nm(u);
    } else { it.stack = []; it.names = []; }
    await this._refresh(it);
    this._render();
    clearTimeout(this._thumbT);
    this._thumbT = setTimeout(() => this._styleThumbs().then(() => this._render()), 500);
  }

  // Redraw one label's previews (front and back) and its cover colour.
  async _refresh(it) {
    const img = await loadImage(it.image);
    if (it._colorFor !== it.image) { it.color = coverColor(img); it._colorFor = it.image; }
    const extras = await Promise.all((it.stack || []).map(loadImage));
    const o = this._drawOpts();
    it.preview = drawCard(it, img, o, PREVIEW_PX, false, extras).toDataURL("image/jpeg", 0.85);
    it.backPreview = o.back ? drawBack(it, o, PREVIEW_PX, false, img).toDataURL("image/jpeg", 0.85) : "";
  }

  // small preview of each style, drawn with one of your own labels
  async _styleThumbs() {
    const it = (this._items || []).find((i) => i.include && i.image && i.series) || (this._items || []).find((i) => i.image);
    if (!it) return;
    const img = await loadImage(it.image), extras = await Promise.all((it.stack || []).map(loadImage));
    this._thumbs = {};
    for (const k of Object.keys(STYLES)) {
      this._thumbs[k] = drawCard(it, img, { ...this._drawOpts(), style: k }, 70 / 25.4, false, extras).toDataURL("image/jpeg", 0.8);
    }
  }

  async _refreshAll() {
    if (!this._items) return;
    await this._styleThumbs();
    await Promise.all(this._items.map((it) => this._refresh(it)));
    this._render();
  }

  _list() {
    return (this._items || []).filter((i) => i.include).flatMap((i) => Array(Math.max(1, i.copies | 0)).fill(i));
  }

  // what goes on the paper: fronts, then (optionally) a back for each
  _entries() {
    const f = this._list().map((it) => ({ it, back: false }));
    return this._opts.back ? f.concat(f.map((e) => ({ it: e.it, back: true }))) : f;
  }

  _herma() { const s = SHEETS[this._opts.sheet]; return !!(s && s.w); }
  _start() { return this._herma() ? Math.min(10, Math.max(1, this._opts.start | 0 || 1)) : 1; }

  _inApp() {
    return /Home ?Assistant\//i.test(navigator.userAgent) || !!window.externalApp ||
      !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.getExternalAuth);
  }

  _remember(list) {
    for (const b of list) {
      if (!b || !b.uri || !b.name) continue;
      const v = { name: b.name, image: b.image || (this._known[b.uri] || {}).image || "" };
      this._known[b.uri] = v; this._pending.names[b.uri] = v;
    }
    this._queueFlush();
  }

  // Names and covers for series books that are not in the library: search with the card's name
  // (and its first words) and keep the hits that are on the card.
  async _resolveSeries(entry, series) {
    for (const it of series) {
      const want = [mediaOf(it.card), ...moreOf(it.card)];
      const missing = new Set(want.filter((u) => !(this._lib[u] && this._lib[u].name) && !this._known[u]));
      if (!missing.size) continue;
      const words = String(it.card.name || "").split(/\s+/).filter(Boolean);
      const queries = [...new Set([words.join(" "), words.slice(0, 2).join(" "), words[0]].filter((q) => q && q.length >= 3))];
      for (const q of queries) {
        if (!missing.size) break;
        try {
          const res = await this._service("music_assistant", "search", { config_entry_id: entry, name: q, media_type: [it.card.media_type || "audiobook"], limit: 50 });
          const hits = Object.values(res || {}).filter(Array.isArray).flat().filter((b) => missing.has(b.uri));
          this._remember(hits.map((b) => ({ uri: b.uri, name: b.name, image: this._img(b.image) })));
          hits.forEach((b) => missing.delete(b.uri));
        } catch (e) { /* keep "Bók N" */ }
      }
    }
  }

  _printedAt(it) { return this._label(it.card).printed; }

  _markPrinted() {
    const now = new Date().toISOString();
    for (const it of (this._items || []).filter((i) => i.include)) this._setLabel(it, { printed: now });
  }

  _forget(it) { this._setLabel(it, { printed: null }); }

  // after printing on a sticker sheet: where the next print would start on the same sheet
  _afterPrint(n) {
    if (!this._herma()) return 0;
    const used = (this._start() - 1 + n) % 10;
    return used ? used + 1 : 0;
  }

  async _pdf() {
    const list = this._entries();
    if (!list.length || this._busy) return;
    this._busy = true; this._notice = "busy"; this._render();
    try {
      const { jsPDF } = await loadJsPdf();
      const opts = this._drawOpts(), imgs = await renderAll(list, opts), { st, pos } = layout(opts, list.length, this._start());
      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      let missing = 0;
      for (let i = 0; i < list.length; i++) {
        const p = pos[i];
        if (i && p.page !== pos[i - 1].page) doc.addPage();
        if (!list[i].back && list[i].it.image && !(await loadImage(list[i].it.image))) missing++;
        doc.addImage(imgs[i], "JPEG", p.x - st.bx, p.y - st.by, st.w + 2 * st.bx, st.h + 2 * st.by);
        if (st.cut) {
          doc.setDrawColor(150); doc.setLineWidth(0.15); doc.setLineDashPattern([1, 1], 0);
          const o = st.bx ? 0 : 1;  // big: cut on the edge; classic: guide 1 mm outside
          doc.roundedRect(p.x - o, p.y - o, st.w + 2 * o, st.h + 2 * o, st.r + o, st.r + o, "S");
        }
      }
      download(doc.output("blob"), "vordisarvarpid-kortamidar.pdf");
      this._markPrinted();
      this._next = this._afterPrint(list.length);
      this._notice = missing ? "missing:" + missing : "done";
    } catch (e) {
      this._notice = ""; this._error = "Gat ekki búið til PDF: " + (e.message || e);
    }
    this._busy = false; this._render();
  }

  // Outline-only page for lining up with a sticker sheet (print on plain paper, hold against the sheet).
  async _testPage() {
    try {
      const { jsPDF } = await loadJsPdf();
      const { st, pos } = layout(this._drawOpts(), 10);
      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      doc.setFontSize(9); doc.setTextColor(90);
      doc.text("Vordisarvarpid - profunarblad. Prentadu i 100 % a venjulegan pappir, leggdu yfir limmidablad og berdu upp ad ljosi.", 105, 8, { align: "center" });
      pos.forEach((p, i) => {
        doc.setDrawColor(232, 64, 127); doc.setLineWidth(0.3); doc.setLineDashPattern([], 0);
        doc.roundedRect(p.x, p.y, st.w, st.h, st.r, st.r, "S");
        const cx = p.x + st.w / 2, cy = p.y + st.h / 2;
        doc.setDrawColor(23, 40, 74); doc.line(cx - 4, cy, cx + 4, cy); doc.line(cx, cy - 4, cx, cy + 4);
        doc.setFontSize(14); doc.setTextColor(23, 40, 74); doc.text(String(i + 1), p.x + 4, p.y + 8);
      });
      download(doc.output("blob"), "vordisarvarpid-profunarblad.pdf");
    } catch (e) { this._error = "Gat ekki búið til prófunarblað: " + (e.message || e); this._render(); }
  }

  async _print() {
    const list = this._entries();
    if (!list.length || this._busy) return;
    if (this._inApp()) { this._notice = "app"; this._render(); return; }
    this._busy = true; this._render();
    const opts = this._drawOpts(), imgs = await renderAll(list, opts), { st, pos } = layout(opts, list.length, this._start());
    const pages = [];
    pos.forEach((p, i) => {
      (pages[p.page] = pages[p.page] || []).push(
        `<img src="${imgs[i]}" style="position:absolute;left:${p.x - st.bx}mm;top:${p.y - st.by}mm;width:${st.w + 2 * st.bx}mm;height:${st.h + 2 * st.by}mm">`);
    });
    const o = st.bx ? 0 : 1;
    const cuts = (page) => !st.cut ? "" : pos.filter((p) => p.page === page).map((p) =>
      `<rect x="${p.x - o}" y="${p.y - o}" width="${st.w + 2 * o}" height="${st.h + 2 * o}" rx="${st.r + o}" fill="none" stroke="#999" stroke-width="0.15" stroke-dasharray="1 1"/>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      @page { size: A4; margin: 0; } body { margin: 0; }
      .pg { position: relative; width: 210mm; height: 297mm; overflow: hidden; break-after: page; }
      img, svg { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      </style></head><body>${[...pages].map((imgsOnPage, n) => `<div class="pg">${(imgsOnPage || []).join("")}
      <svg style="position:absolute;left:0;top:0" width="210mm" height="297mm" viewBox="0 0 210 297">${cuts(n)}</svg></div>`).join("")}</body></html>`;
    const old = document.getElementById("vordis-kortamidar-print");
    if (old) old.remove();
    const f = document.createElement("iframe");
    f.id = "vordis-kortamidar-print";
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    f.srcdoc = html;
    f.onload = () => {
      setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); }, 300);
      setTimeout(() => f.remove(), 60000);
    };
    document.body.appendChild(f);
    this._markPrinted();
    this._next = this._afterPrint(list.length);
    this._notice = "printed";
    this._busy = false; this._render();
  }

  // Your own picture for a label: made smaller, then kept in Home Assistant's image store
  // (the one profile pictures use), so it is there on every device.
  async _setImage(it, file) {
    if (!file || !/^image\//.test(file.type)) return;
    this._msg = "Hleð upp mynd…"; this._render();
    try {
      const bmp = await createImageBitmap(file);
      const s = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
      const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
      cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
      const blob = await new Promise((r) => cv.toBlob(r, "image/jpeg", 0.88));
      let url;
      try {
        const fd = new FormData(); fd.append("file", blob, "vordisarvarpid-midi.jpg");
        const resp = await this._hass.fetchWithAuth("/api/image/upload", { method: "POST", body: fd });
        if (!resp.ok) throw new Error(resp.status);
        const j = await resp.json();
        url = `/api/image/serve/${j.id}/original`;
      } catch (e) {
        url = cv.toDataURL("image/jpeg", 0.8);   // no image store: keep it in the label itself
      }
      this._setLabel(it, { image: url });
      this._msg = "";
    } catch (e) { this._msg = "Gat ekki lesið myndina: " + (e.message || e); }
    this._render();
  }

  // ---------- scanning, test play ----------

  _subscribe() {
    if (this._sub || !this._hass || !this._hass.connection || !this._entryId) return;
    this._sub = this._hass.connection.subscribeMessage((m) => this._onUpdate(m || {}),
      { type: "vordisarvarpid/subscribe", entry_id: this._entryId }).catch(() => { this._sub = null; return null; });
  }

  _onUpdate(m) {
    const was = this._current && this._current.card_id;
    this._current = m.current;
    const s = m.last_scan;
    if (s && s.time && s.time !== this._lastScanTime) { this._lastScanTime = s.time; this._onScan(s); return; }
    if (((this._current || {}).card_id) !== was) this._render();
  }

  _onScan(s) {
    if (!this._loaded) return;
    const tag = String(s.tag_id || "").trim().toUpperCase();
    const cards = this._editCards(), i = cards.findIndex((c) => String(c.tag_id || "").trim().toUpperCase() === tag);
    this._printOpen = false; this._menu = false; this._find = null; this._ser = null; this._msg = "";
    if (i >= 0) {
      this._scan = null; this._scanned = cards[i].id;
      this._openPanel(i, "spilar");
    } else {
      this._scan = { id: s.tag_id, i: -1 }; this._panel = -1; this._render();
      requestAnimationFrame(() => { const el = this.shadowRoot.querySelector(".scan"); if (el && el.scrollIntoView) el.scrollIntoView({ block: "center", behavior: "smooth" }); });
    }
    this._loadTags();
  }

  _openPanel(i, tab) {
    this._panel = i; if (tab) this._ptab = tab; this._find = null; this._ser = null;
    this._render();
    const c = this._editCards()[i];
    if (c && c.media_id && !(this._info && this._info.i === i && this._info.uri === c.media_id)) this._lookup(i, c.media_id, false);
  }

  async _play(c) {
    if (!play_items_of(c).length) { this._msg = "Kortið spilar ekkert enn."; this._render(); return; }
    try {
      await this._hass.callWS({ type: "vordisarvarpid/play", entry_id: this._entryId, card: { ...c } });
      this._playing = c.id;
      const p = this._input().player, name = (this._hass.states[p] && this._hass.states[p].attributes.friendly_name) || p;
      this._msg = `▶ Spilar „${c.name || mediaOf(c)}“ á ${name}.`;
    } catch (e) { this._msg = "Gat ekki spilað: " + (e.message || e); }
    this._render();
  }

  async _stop() {
    try { await this._hass.callWS({ type: "vordisarvarpid/stop", entry_id: this._entryId }); } catch (e) { /* ignore */ }
    this._playing = null; this._msg = ""; this._render();
  }

  // ---------- cards ----------

  _editCards() {
    if (!this._edit) {
      this._edit = JSON.parse(JSON.stringify(this._saved || []));
      this._dirty = false;
    }
    return this._edit;
  }

  async _loadTags() {
    try {
      const all = await this._hass.callWS({ type: "tag/list" });
      const reader = this._input().reader_device;
      this._tags = all
        .filter((t) => !reader || t.device_id === reader)
        .sort((a, b) => String(b.last_scanned || "").localeCompare(String(a.last_scanned || "")));
    } catch (e) { this._tags = this._tags || []; }
    this._render();
  }

  _real(tagId) { return !!tagId && (this._tags || []).some((t) => t.id === tagId); }

  _tagLabel(t) {
    const nm = String(t.name || "").split(" - Tag ")[0];
    return nm && nm !== `Tag ${t.id}` ? `${nm} (${t.id})` : t.id;
  }

  _placeholder() {
    const used = new Set(this._editCards().map((c) => c.tag_id));
    for (let n = 1; n < 100; n++) { const id = `VANTAR-KORT-${String(n).padStart(2, "0")}`; if (!used.has(id)) return id; }
    return "VANTAR-KORT";
  }

  // whole library of one type, cached for this session
  _libType(type) {
    this._libT = this._libT || {};
    if (!this._libT[type]) {
      this._libT[type] = this._service("music_assistant", "get_library", { config_entry_id: this._entry, media_type: type, limit: 500 })
        .then((r) => r.items || []).catch(() => { delete this._libT[type]; return []; });
    }
    return this._libT[type];
  }

  // Look a media address up in Music Assistant. apply = fill in type, name and cover on the card.
  async _lookup(i, value, apply = true) {
    const c = this._editCards()[i];
    if (!c) return;
    const { uri, type } = parseMedia(value);
    if (apply) {
      if (!uri) { delete c.media_id; this._info = null; this._dirty = true; this._render(); return; }
      c.media_id = uri; if (type) c.media_type = type; delete c.media;
      this._dirty = true; this._msg = "";
    }
    if (!uri) return;
    const info = this._info = { i, uri, busy: true };
    this._render();
    let hit = null;
    if (type && this._entry) {
      await this._ingress();
      const items = await this._libType(type);
      hit = items.find((x) => x.uri === uri) || null;
      if (!hit && !uri.startsWith("library://")) {
        // not in the library under this address: try a search on the id's provider
        try {
          const res = await this._service("music_assistant", "search", { config_entry_id: this._entry, name: uri, media_type: [type], limit: 5 });
          hit = Object.values(res || {}).filter(Array.isArray).flat().find((x) => x.uri === uri) || null;
        } catch (e) { /* not found */ }
      }
    }
    if (this._info !== info) return;  // another lookup started meanwhile
    info.busy = false;
    if (!hit) { info.miss = !!type; info.bad = !type; this._render(); return; }
    info.name = hit.name; this._names[uri] = hit.name;
    info.type = hit.media_type || type;
    info.sub = (hit.artists || []).map((a) => a.name).join(", ") || (hit.authors || []).join?.(", ") || "";
    info.image = this._img(hit.image);
    if (info.image) this._covers[uri] = info.image;
    if (apply && this._editCards()[i] === c) {
      if (!c.name || c.name === c._auto) { c.name = hit.name; }
      c.media_type = info.type;
      Object.defineProperty(c, "_auto", { value: hit.name, enumerable: false, writable: true, configurable: true });
    }
    this._render();
  }

  // the "what does this card play" box at the top of the editor
  _renderInfo(i, c) {
    const f = this._info && this._info.i === i ? this._info : null;
    if (f && f.busy) return `<div class="sel"><div class="msg small">Sæki upplýsingar úr Music Assistant…</div></div>`;
    if (!c.media_id && !c.media) return `<div class="sel empty">Kortið spilar ekkert enn. Leitaðu hér fyrir neðan eða límdu tengil.</div>`;
    const uri = mediaOf(c);
    const name = (f && f.name) || this._names[uri] || "";
    const image = (f && f.image) || this._covers[uri] || "";
    const type = (f && f.type) || c.media_type;
    const warn = f && (f.miss || f.bad)
      ? `<span class="warn">⚠ ${f.bad ? "Þekki ekki þetta snið" : "Fannst ekki í Music Assistant"}, en reynt verður að spila það.</span>` : "";
    return `<div class="sel">
      ${image ? `<img class="th" src="${esc(image)}" referrerpolicy="no-referrer">` : `<div class="th none">${kindOf(c) === "story" ? "📖" : "♪"}</div>`}
      <div class="kt"><span class="cap-l">Kortið spilar</span><b>${esc(name || uri)}</b>
        <span class="msg">${srcBadge(uri)} ${TNAME[type] || type || ""}${f && f.sub ? " · " + esc(f.sub) : ""}</span>${warn}</div></div>`;
  }

  _change(i, field, value) {
    const c = this._editCards()[i];
    if (value === "" || value === null || value === undefined) delete c[field]; else c[field] = value;
    this._dirty = true; this._msg = ""; this._render();
  }

  // reorder: keep the open card open
  _reorder(fn) {
    const cards = this._editCards(), open = cards[this._panel];
    fn(cards);
    this._panel = open ? cards.indexOf(open) : -1;
    this._dirty = true; this._render();
  }

  _move(i, dir) {
    const cards = this._editCards(), k = kindOf(cards[i]);
    let j = i + dir;
    while (j >= 0 && j < cards.length && kindOf(cards[j]) !== k) j += dir;
    if (j < 0 || j >= cards.length) return;
    this._reorder((cs) => { [cs[i], cs[j]] = [cs[j], cs[i]]; });
  }

  _drop(from, to) {
    if (from === to || from < 0 || to < 0) return;
    this._reorder((cs) => { const [c] = cs.splice(from, 1); cs.splice(to, 0, c); });
  }

  _export() {
    const data = { app: "vordisarvarpid", version: 1, exported: new Date().toISOString(), cards: this._editCards() };
    download(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      `vordisarvarpid-kort-${new Date().toISOString().slice(0, 10)}.json`);
    this._msg = "Afrit sótt (Downloads)."; this._render();
  }

  _import(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result), cards = Array.isArray(d) ? d : d.cards;
        if (!Array.isArray(cards) || !cards.every((c) => c && typeof c === "object" && (c.name || c.media_id)))
          throw new Error("þetta er ekki afrit af kortum");
        this._edit = JSON.parse(JSON.stringify(cards));
        this._panel = -1; this._dirty = true;
        this._msg = `Afrit hlaðið inn (${cards.length} kort). Skoðaðu og ýttu á Vista breytingar til að nota það.`;
      } catch (e) { this._msg = "Gat ekki lesið afritið: " + (e.message || e); }
      this._render();
    };
    r.readAsText(file);
  }

  // One box for everything: words search Music Assistant (your library first, then Spotify, Storytel…);
  // a link or address (https://open.spotify.com/…, library://album/2, MA web address) is looked up directly.
  async _search(i, q) {
    q = String(q || "").trim();
    if (!q || !this._entry) return;
    const type = this._ftype || "all";
    const f = this._find = { i, q, busy: true, results: [] }; this._ser = null; this._render();
    await this._ingress();
    const ALL = ["audiobook", "album", "playlist", "podcast", "artist", "track", "radio"];
    const types = type === "all" ? ALL : [type];
    const flat = (res) => Object.values(res || {}).filter(Array.isArray).flat();
    const map = (r) => {
      const name = r.name + (r.version ? ` (${r.version})` : "");
      this._names[r.uri] = name;
      return { uri: r.uri, name, type: r.media_type, image: this._img(r.image),
        sub: (r.artists || []).map((a) => a.name).join(", ") || (Array.isArray(r.authors) ? r.authors.join(", ") : "") };
    };
    try {
      const pm = parseMedia(q);
      if (/^[\w.+-]+:\/\/\S+$/.test(pm.uri)) {
        f.addr = true;
        let hits = [];
        if (pm.uri.startsWith("library://")) {
          if (pm.type) hits = (await this._libType(pm.type)).filter((x) => x.uri === pm.uri);
        } else {
          const all = flat(await this._service("music_assistant", "search", { config_entry_id: this._entry, name: pm.uri, limit: 5 }));
          hits = all.filter((x) => x.uri === pm.uri);
          // Music Assistant turns a web link (Spotify, Tidal…) into the item itself
          if (!hits.length && /^https?:/i.test(pm.uri) && all.length && all.length <= 2) hits = all;
        }
        f.results = hits.map(map);
        if (this._find !== f) return;
        f.busy = false;
        if (f.results.length === 1) { f.auto = true; this._pick(i, f.results[0], false); return; }
        if (!f.results.length) f.raw = pm.uri;
      } else {
        const libTypes = types.filter((t) => t !== "artist" && t !== "track").slice(0, 4);
        const [libs, res] = await Promise.all([
          Promise.all(libTypes.map((t) => this._service("music_assistant", "get_library", { config_entry_id: this._entry, media_type: t, search: q, limit: 5 })
            .then((r) => r.items || []).catch(() => []))),
          this._service("music_assistant", "search", { config_entry_id: this._entry, name: q, media_type: types, limit: type === "all" ? 4 : 12 }).catch(() => ({})),
        ]);
        const order = { audiobook: 0, album: 1, playlist: 2, podcast: 3, radio: 4, artist: 5, track: 6 };
        const seen = new Set(), out = [];
        const rest = flat(res).sort((a, b) => (order[a.media_type] ?? 9) - (order[b.media_type] ?? 9));
        for (const r of [...libs.flat(), ...rest]) { if (!r || seen.has(r.uri)) continue; seen.add(r.uri); out.push(map(r)); }
        f.results = out.slice(0, 30);
        const books = out.filter((r) => r.type === "audiobook");
        const key = books.length >= 3 ? seriesKey(q, books.map((r) => r.name), 3) : "";
        if (key) f.seriesHint = key;
      }
    } catch (e) { f.error = e.message || String(e); }
    if (this._find !== f) return;
    f.busy = false; this._render();
  }

  // Book series: books are named "Mamma Mu cyklar", "Mamma Mu simmar"… so the series' own name
  // ("Mamma Mu och Kråkan") rarely finds them. Search with the name and shorter starts of it,
  // find the words the titles share, and offer the matching books to tick.
  async _findSeries(i, q) {
    q = String(q || "").trim();
    if (!q || !this._entry) return;
    const sr = this._ser = { i, q, busy: true, books: [] };
    this._find = null; this._render();
    await this._ingress();
    const words = q.split(/\s+/).filter(Boolean);
    const queries = [...new Set(words.map((w, k) => words.slice(0, words.length - k).join(" "))
      .filter((x, k) => k === 0 || norm(x).length >= 4))].slice(0, 4);
    const flat = (res) => Object.values(res || {}).filter(Array.isArray).flat();
    const lists = await Promise.all(queries.flatMap((x) => [
      this._service("music_assistant", "search", { config_entry_id: this._entry, name: x, media_type: ["audiobook", "podcast"], limit: 50 }).then(flat).catch(() => []),
      this._service("music_assistant", "get_library", { config_entry_id: this._entry, media_type: "audiobook", search: x, limit: 50 }).then((r) => r.items || []).catch(() => []),
    ]));
    if (this._ser !== sr) return;
    // one book per title: prefer your library, then Storytel, then the rest
    const byTitle = new Map();
    for (const b of lists.flat()) {
      if (!b || !b.uri || !["audiobook", "podcast"].includes(b.media_type)) continue;
      const k = norm(b.name), old = byTitle.get(k);
      if (!old || SRC_RANK(b.uri) < SRC_RANK(old.uri)) byTitle.set(k, b);
    }
    const all = [...byTitle.values()];
    const key = seriesKey(q, all.map((b) => b.name), 2) || norm(q);
    sr.key = key;
    sr.books = all.map((b) => {
      this._names[b.uri] = b.name;
      const on = ` ${norm(b.name)} `.includes(` ${key} `);
      return { uri: b.uri, name: b.name, type: b.media_type, image: this._img(b.image), on, match: on };
    }).sort((a, b) => (b.match - a.match) || a.name.localeCompare(b.name, "sv"));
    sr.busy = false; this._render();
  }

  _useSeries(i, append) {
    const sr = this._ser, c = this._editCards()[i];
    const picked = sr.books.filter((b) => b.on);
    if (!picked.length) return;
    let list = picked.map((b) => b.uri);
    if (append && mediaOf(c)) list = [mediaOf(c), ...moreOf(c), ...list.filter((u) => u !== mediaOf(c) && !moreOf(c).includes(u))];
    list = [...new Set(list)];
    c.media_id = list[0]; c.media_type = append && c.media_type ? c.media_type : (picked[0].type || "audiobook"); delete c.media;
    if (list.length > 1) c.more_media = list.slice(1).join("\n"); else delete c.more_media;
    const first = sr.books.find((b) => b.uri === list[0]) || picked[0];
    if (first.image) this._covers[first.uri] = first.image;
    if (!c.name || c.name === c._auto) {
      c.name = sr.q;
      Object.defineProperty(c, "_auto", { value: sr.q, enumerable: false, writable: true, configurable: true });
    }
    this._info = { i, uri: first.uri, name: first.name, type: c.media_type, image: first.image };
    this._remember(picked);
    this._ser = null; this._serOpen = i; this._dirty = true;
    this._msg = `${list.length} bækur í seríunni „${c.name}“. Mundu að vista.`;
    this._render();
  }

  _renderSeriesFinder(i) {
    const sr = this._ser;
    if (!sr || sr.i !== i) return "";
    if (sr.busy) return `<div class="serfind"><div class="msg">📚 Leita að bókum í seríunni „${esc(sr.q)}“…</div></div>`;
    const n = sr.books.filter((b) => b.on).length, matches = sr.books.filter((b) => b.match).length;
    return `<div class="serfind">
      <div class="sf-h"><b>📚 Sería: „${esc(sr.q)}“</b>
        <span class="msg">${matches} bækur með „${esc(sr.key)}“ í titlinum${sr.books.length > matches ? `, ${sr.books.length - matches} aðrar fyrir neðan` : ""}</span>
        <button class="x" data-serx="${i}" aria-label="Loka">✕</button></div>
      <div class="sf-bar"><button class="sec sm" data-serall="${i}">Velja allar</button><button class="sec sm" data-sernone="${i}">Engar</button>
        <span class="msg">${n} valdar · röðin hér er röðin sem þær spilast í</span></div>
      <div class="results">${sr.books.map((b, k) => `
        <label class="res sf${b.on ? " cur" : ""}${b.match ? "" : " other"}">
          <input type="checkbox" data-serck="${k}" ${b.on ? "checked" : ""}>
          ${b.image ? `<img class="th sm" src="${esc(b.image)}" referrerpolicy="no-referrer" loading="lazy">` : `<div class="th sm none">📖</div>`}
          <div class="kt"><b>${esc(b.name)}</b><span class="msg">${srcBadge(b.uri)} ${TNAME[b.type] || b.type}</span></div>
          <span class="acts"><button class="ic" data-serup="${k}" title="Færa upp">↑</button><button class="ic" data-serdown="${k}" title="Færa niður">↓</button></span>
        </label>`).join("")}</div>
      <div class="sf-bar end">
        ${mediaOf(this._editCards()[i]) ? `<button class="sec" data-seradd="${i}" ${n ? "" : "disabled"}>Bæta aftan við núverandi</button>` : ""}
        <button data-seruse="${i}" ${n ? "" : "disabled"}>Setja ${n} ${n % 10 === 1 && n % 100 !== 11 ? "bók" : "bækur"} á kortið</button>
      </div></div>`;
  }

  _pick(i, r, asSeries) {
    const c = this._editCards()[i];
    if (asSeries) {
      const lines = moreOf(c);
      if (!lines.includes(r.uri) && r.uri !== c.media_id) lines.push(r.uri);
      c.more_media = lines.join("\n");
    } else {
      c.media_id = r.uri; c.media_type = r.type;
      this._info = { i, uri: r.uri, name: r.name, type: r.type, sub: r.sub, image: r.image };
      delete c.media;   // text media wins; drop an old media-browser pick
      if (!c.name || c.name === c._auto) c.name = r.name;
      Object.defineProperty(c, "_auto", { value: r.name, enumerable: false, writable: true, configurable: true });
    }
    this._names[r.uri] = r.name;
    this._remember([r]);
    if (r.image) this._covers[r.uri] = r.image;
    this._dirty = true; this._render();
  }

  async _saveCards() {
    const cards = this._editCards();
    const problems = [];
    const seen = {};
    cards.forEach((c, i) => {
      if (!c.name) problems.push(`Kort ${i + 1} vantar heiti`);
      if (!c.media_id && !c.media) problems.push(`„${c.name || i + 1}“ spilar ekkert`);
      if (!c.tag_id) c.tag_id = this._placeholder();
      if (seen[c.tag_id]) problems.push(`„${c.name}“ og „${seen[c.tag_id]}“ nota sama kort`);
      seen[c.tag_id] = c.name;
      if (typeof c.shuffle !== "boolean") c.shuffle = false;
    });
    if (problems.length) { this._msg = "Ekki vistað: " + problems.join(" · "); this._render(); return; }
    this._saving = true; this._render();
    try {
      const r = await this._hass.callWS({ type: "vordisarvarpid/save_cards", entry_id: this._entryId, cards: cards.map((c) => ({ ...c })) });
      this._saved = r.cards;
      // name real tags after their card, so Home Assistant's tag list shows the right name
      for (const c of this._saved) {
        const t = (this._tags || []).find((x) => x.id === c.tag_id);
        const want = `${c.name} - Tag ${c.tag_id}`;
        if (t && t.name !== want) {
          try { await this._hass.callWS({ type: "tag/update", tag_id: t.id, name: want }); t.name = want; } catch (e) { /* not critical */ }
        }
      }
      this._edit = null; this._dirty = false; this._msg = "Vistað ✓"; this._scan = null;
    } catch (e) {
      this._msg = "Gat ekki vistað: " + (e.message || e);
    }
    this._saving = false; this._render();
  }

  _renderScan() {
    const s = this._scan;
    if (!s) return "";
    const cards = this._editCards();
    const linked = cards.findIndex((c) => String(c.tag_id || "").toUpperCase() === String(s.id).toUpperCase());
    if (linked >= 0)
      return `<div class="scan ok-b">✓ <span>Kortið <b>${esc(s.id)}</b> er tengt við <b>„${esc(cards[linked].name || "nýja kortið")}“</b>. Ýttu á Vista breytingar.</span><button class="x" id="scanX" aria-label="Loka">✕</button></div>`;
    const missing = cards.map((c, i) => ({ c, i })).filter(({ c }) => !this._real(c.tag_id));
    return `<div class="scan">📡 <span>Nýtt kort lagt á Vordísarvarpið: <b>${esc(s.id)}</b></span>
      <span class="flex"></span>
      ${missing.length ? `<span class="link">Tengja við
        <select id="scanTo">${missing.map(({ c, i }) => `<option value="${i}">${esc(c.name || "(nýtt kort)")}</option>`).join("")}</select>
        <button class="sm" id="scanLink">Tengja</button></span>` : ""}
      <button class="sec sm" id="scanNew">+ Búa til nýtt kort</button>
      <button class="x" id="scanX" aria-label="Loka">✕</button></div>`;
  }

  _renderSheet(st) {
    const entries = this._entries(), herma = this._herma(), start = this._start();
    const { pos, s0, pages } = layout(this._opts, entries.length, start);
    const pct = (p) => `left:${p.x / 2.1}%;top:${p.y / 2.97}%;width:${st.w / 2.1}%;height:${st.h / 2.97}%`;
    const html = [];
    for (let pg = 0; pg < pages; pg++) {
      const slots = [];
      for (let k = 0; k < 10; k++) {
        const i = pos.findIndex((p) => p.page === pg && p.slot === k);
        const e = entries[i], used = pg === 0 && k < s0;
        const src = e ? (e.back ? e.it.backPreview : e.it.preview) : "";
        slots.push(`<div class="slot${used ? " used" : ""}${e ? " f" : ""}${herma && pg === 0 ? " pick" : ""}" ${herma && pg === 0 ? `data-slot="${k + 1}" title="Byrja á miða ${k + 1}"` : ""} style="${pct(slotPos(st, k))}">${src ? `<img src="${src}">` : ""}</div>`);
      }
      html.push(`<div class="pgw"><div class="page">${slots.join("")}</div><span>Blað ${pg + 1}</span></div>`);
    }
    const n = entries.length;
    return `<div class="sheet">
      <div class="sheet-h"><b>Á blaðinu</b>
        <span class="msg">${n} ${n % 10 === 1 && n % 100 !== 11 ? "miði" : "miðar"} á ${pages} ${pages === 1 ? "blað" : "blöð"}</span>
        <span class="flex"></span>
        ${herma ? `<span class="stepper">Byrja á miða
          <button class="sec ic" id="stDown" ${start <= 1 ? "disabled" : ""}>−</button><b>${start}</b>
          <button class="sec ic" id="stUp" ${start >= 10 ? "disabled" : ""}>+</button></span>` : ""}
      </div>
      <div class="pages">${html.join("")}</div>
      ${herma ? `<div class="msg small">Hálfnotað blað? Smelltu á fyrsta lausa límmiðann á blaði 1. Gráu reitirnir eru þegar notaðir.</div>` : ""}
    </div>`;
  }

  // ---------- the page: one grid of cards ----------

  _renderMain() {
    const items = this._items || [], st = geom(this._opts);
    const sel = items.filter((i) => i.include), n = this._entries().length;
    const cur = (this._current || {}).card_id;
    const curName = cur && ((items.find((i) => i.card.id === cur) || {}).card || {}).name;
    const tile = (it, i) => {
      const pr = this._printedAt(it), real = this._real(it.card.tag_id), playing = cur === it.card.id;
      return `<div class="tile${it.include ? " on" : ""}" data-tile="${i}" data-drag="${i}" draggable="true" tabindex="0">
        <div class="img" style="aspect-ratio:${st.w}/${st.h}">
          ${it.preview ? `<img src="${it.preview}" alt="" draggable="false">` : `<div class="ph">${it.card.media_id || it.card.media ? "…" : "＋"}</div>`}
          <button class="tick" data-tick="${i}" title="${it.include ? "Prentast (smelltu til að sleppa)" : "Prentast ekki (smelltu til að velja)"}">✓</button>
          ${it.copies > 1 ? `<span class="copies">×${it.copies}</span>` : ""}
          ${playing ? `<span class="nowp">♪ spilar</span>` : ""}
          <button class="tplay" data-play="${i}" title="${this._playing === it.card.id ? "Stöðva" : "Prófa á hátalara"}">${this._playing === it.card.id ? "■" : "▶"}</button>
        </div>
        <div class="cap"><span class="t">${esc(it.card.name || "(nýtt kort)")}</span>
          <span class="meta">${this._tags ? `<span class="${real ? "ok" : "warn"}">${real ? "✓ tengt" : "⚠ vantar kort"}</span>` : ""}
          ${pr ? `<span class="pr">prentað ${shortDate(pr)}</span>` : ""}</span></div>
      </div>`;
    };
    const groups = GROUPS.map(([k, label]) => {
      const idx = items.map((x, i) => i).filter((i) => kindOf(items[i].card) === k);
      if (!idx.length) return "";
      return `<h3 class="gh">${label} <span>${idx.length}</span></h3><div class="grid">${idx.map((i) => tile(items[i], i)).join("")}</div>`;
    }).join("");
    return `
      <div class="top">
        <div class="ttl"><h2>${esc(this._ent ? this._ent.title : "Vordísarvarpið")}</h2>
          <span class="msg">${items.length} kort · ${sel.length} valin til prentunar${curName ? ` · ♪ ${esc(curName)}` : ""}</span></div>
        <span class="flex"></span>
        <button class="sec" id="addCard">+ Nýtt kort</button>
        <button class="sec" id="openPrint" ${n ? "" : "disabled"}>🖨 Prenta${n ? ` (${n})` : ""}</button>
        ${this._dirty ? `<button class="sec" id="undo">Afturkalla</button>
          <button id="save" ${this._saving ? "disabled" : ""}>${this._saving ? "Vista…" : "Vista breytingar"}</button>` : ""}
        <span class="menu-w"><button class="sec ic" id="menuBtn" title="Meira">⋮</button>
          ${this._menu ? `<div class="menu">
            <button id="mExport">Sækja afrit af kortunum</button>
            <button id="mImport">Hlaða inn afriti</button>
            <button id="mReload">Sækja allt aftur</button></div>` : ""}</span>
        <input type="file" id="importFile" accept="application/json,.json" hidden>
      </div>
      ${this._renderScan()}
      ${this._msg && this._panel < 0 ? `<div class="notice">${esc(this._msg)}${this._playing ? ` <button class="sec sm" id="stopAll">■ Stöðva</button>` : ""}
        <button class="x" id="msgX" aria-label="Loka">✕</button></div>` : ""}
      ${this._error ? `<div class="err">${esc(this._error)}</div>` : ""}
      ${this._loading && !items.length ? `<div class="msg">Sæki kort og myndir…</div>` : ""}
      ${this._loaded && !items.length ? `<div class="empty">Engin kort enn. Ýttu á <b>+ Nýtt kort</b> eða leggðu kort á Vordísarvarpið.</div>` : ""}
      ${items.length ? `<div class="selbar">
        <button class="sec sm" id="selAll">Velja allt</button>
        <button class="sec sm" id="selNone">Ekkert</button>
        <button class="sec sm" id="selNew">Bara óprentaðir</button>
        <span class="msg">Smelltu á kort til að breyta · leggðu kort á tækið og það opnast</span>
      </div>` : ""}
      ${groups}
      ${this._panel >= 0 && items[this._panel] ? this._renderCardPanel(this._panel) : ""}
      ${this._printOpen ? this._renderPrintPanel() : ""}`;
  }

  // ---------- one panel per card: what it plays, its NFC card, its label ----------

  _renderCardPanel(i) {
    const it = this._items[i], c = it.card, st = geom(this._opts);
    const real = this._real(c.tag_id), series = moreOf(c).length, playing = this._playing === c.id;
    const tabs = [["spilar", "Spilar"], ["kort", "Kort"], ["midi", "Miði"]];
    let body = "";
    if (this._ptab === "kort") body = this._renderTabKort(i, c, real);
    else if (this._ptab === "midi") body = this._renderTabMidi(it, st);
    else body = this._renderTabSpilar(i, c, series);
    return `<div class="ovl" id="ovl"><div class="dlg wide" role="dialog" aria-label="${esc(c.name || "Nýtt kort")}" data-keep="dlg">
      <div class="dlg-h">
        ${it.preview ? `<img class="hthumb" src="${it.preview}" alt="">` : `<div class="hthumb ph">＋</div>`}
        <div class="kt"><b>${esc(c.name || "Nýtt kort")}</b>
          <span><span class="${real ? "ok" : "warn"}">${real ? "✓ kort tengt" : "⚠ vantar kort"}</span>
          ${series ? `<span class="pill">· sería, ${countText(series + 1)}</span>` : ""}
          ${this._scanned === c.id ? `<span class="pill">· 📡 lagt á tækið</span>` : ""}</span></div>
        <span class="acts">
          <button class="ic ${playing ? "on" : ""}" data-play="${i}" title="${playing ? "Stöðva" : "Prófa á hátalara"}">${playing ? "■" : "▶"}</button>
          <button class="ic" data-up="${i}" title="Færa framar">↑</button>
          <button class="ic" data-down="${i}" title="Færa aftar">↓</button>
        </span>
        <button class="x" id="pClose" aria-label="Loka">✕</button>
      </div>
      <div class="ptabs">${tabs.map(([k, n]) => `<button data-ptab="${k}" class="${this._ptab === k ? "on" : ""}">${n}</button>`).join("")}</div>
      ${this._msg ? `<div class="notice">${esc(this._msg)}${this._playing ? ` <button class="sec sm" id="stopAll">■ Stöðva</button>` : ""}</div>` : ""}
      <div class="pbody">${body}</div>
      <div class="dlg-f">
        ${this._dirty ? `<span class="msg small">Óvistaðar breytingar á kortum</span>` : `<span class="msg small">Miðastillingar vistast sjálfkrafa</span>`}
        <span class="flex"></span>
        ${this._dirty ? `<button class="sec" id="pSave" ${this._saving ? "disabled" : ""}>${this._saving ? "Vista…" : "Vista breytingar"}</button>` : ""}
        <button id="pDone">Lokið</button>
      </div>
    </div></div>`;
  }

  _renderTabSpilar(i, c, series) {
    const f = this._find && this._find.i === i ? this._find : null;
    const TYPES = ["playlist", "album", "audiobook", "podcast", "artist", "track", "radio"];
    return `<div class="kf">
      ${this._renderInfo(i, c)}
      <div class="find big">
        <input type="search" id="q${i}" placeholder="Leitaðu að sögu, plötu eða lagalista – eða límdu tengil" value="${esc(f ? f.q : "")}" autocomplete="off">
        <button data-find="${i}">Leita</button>
      </div>
      <div class="chips">${FILTERS.map(([k, n]) => `<button class="chip ${this._ftype === k ? "on" : ""}" data-ftype="${k}" data-fi="${i}">${n}</button>`).join("")}
        <button class="chip ser-chip" data-serfind="${i}" title="Finna allar bækur í bókaseríu">📚 Finna seríu</button></div>
      ${this._renderSeriesFinder(i)}
      ${f && !f.busy && f.seriesHint ? `<div class="hint-b">📚 Margar bækur heita „${esc(f.seriesHint)} …“ – er þetta sería?
        <button class="sm" data-serfind="${i}">Sjá allar bækurnar</button></div>` : ""}
      ${f && f.busy ? `<div class="msg">Leita…</div>` : ""}
      ${f && f.error ? `<div class="err">${esc(f.error)}</div>` : ""}
      ${f && f.auto ? `<div class="msg small ok">✓ Fann tengilinn og setti hann á kortið.</div>` : ""}
      ${f && !f.busy && f.raw ? `<div class="warn-b">⚠ Music Assistant þekkti ekki þennan tengil.
        <button class="sec sm" data-raw="${i}">Nota hann samt</button></div>` : ""}
      ${f && !f.busy && !f.raw && !f.auto && !f.results.length && !f.error ? `<div class="msg">Ekkert fannst.</div>` : ""}
      ${f && !f.auto && f.results.length ? `<div class="results" data-keep="res">${f.results.map((r, k) => `
        <div class="res${r.uri === c.media_id ? " cur" : ""}">
          ${r.image ? `<img class="th sm" src="${esc(r.image)}" referrerpolicy="no-referrer" loading="lazy">` : `<div class="th sm none">♪</div>`}
          <div class="kt"><b>${esc(r.name)}</b><span class="msg">${srcBadge(r.uri)} ${TNAME[r.type] || r.type}${r.sub ? " · " + esc(r.sub) : ""}</span></div>
          <button class="sm" data-pick="${i}:${k}">${r.uri === c.media_id ? "✓ Valið" : "Velja"}</button>
          <button class="sec sm" data-series="${i}:${k}" title="Bæta við sem næstu bók í seríu">+ Sería</button>
        </div>`).join("")}</div>` : ""}
      ${series ? `<div class="ser"><span class="lbl">Sería – spilast í þessari röð</span>
        <div class="ser-i"><span class="n">1.</span><span class="t">${esc(this._names[mediaOf(c)] || mediaOf(c))}</span>${srcBadge(mediaOf(c))}</div>
        ${moreOf(c).map((u, k) => (this._serOpen === i || series <= 5 || k < 4) ? `<div class="ser-i"><span class="n">${k + 2}.</span><span class="t">${esc(this._names[u] || u)}</span>${srcBadge(u)}
          <button class="x" data-unser="${i}:${k}" title="Taka úr seríu">✕</button></div>` : "").join("")}
        ${series > 5 ? `<button class="link-b" data-seropen="${i}">${this._serOpen === i ? "Sýna færri" : `Sýna allar ${series + 1} bækurnar`}</button>` : ""}</div>` : ""}
      <label class="sw"><input type="checkbox" data-e="shuffle" data-i="${i}" ${c.shuffle ? "checked" : ""}> Stokka (handahófsröð)</label>
      <details class="adv"><summary>Ítarlegt</summary>
        <label>Miðill <input type="text" data-e="media_id" data-i="${i}" value="${esc(c.media_id || "")}" placeholder="library://album/2"></label>
        <label>Tegund <select data-e="media_type" data-i="${i}">
          ${TYPES.map((t) => `<option value="${t}" ${c.media_type === t ? "selected" : ""}>${TNAME[t]}</option>`).join("")}</select></label>
        <label class="top">Sería (einn miðill í línu)
          <textarea data-e="more_media" data-i="${i}" rows="${Math.min(6, Math.max(2, series + 1))}">${esc(c.more_media || "")}</textarea></label>
      </details>
    </div>`;
  }

  _renderTabKort(i, c, real) {
    const tags = this._tags || [], usedBy = {};
    this._editCards().forEach((x) => { usedBy[x.tag_id] = x.name; });
    const tagOpts = [`<option value="">— ekkert —</option>`]
      .concat(c.tag_id && !real ? [`<option value="${esc(c.tag_id)}" selected>${esc(c.tag_id)} (ekki skannað enn)</option>`] : [])
      .concat(tags.map((t) => `<option value="${esc(t.id)}" ${t.id === c.tag_id ? "selected" : ""}>${esc(this._tagLabel(t))}${usedBy[t.id] && t.id !== c.tag_id ? ` · notað: ${esc(usedBy[t.id])}` : ""}</option>`));
    return `<div class="kf">
      <label class="fld"><span>Heiti kortsins</span><input type="text" data-e="name" data-i="${i}" value="${esc(c.name || "")}" placeholder="t.d. Lína langsokkur"></label>
      <label class="fld"><span>NFC kort</span>
        <span class="rowc"><select data-e="tag_id" data-i="${i}">${tagOpts.join("")}</select>
        <button class="sec sm" data-newest="${i}" title="Leggðu kortið á Vordísarvarpið fyrst">Nota síðasta skannaða</button></span></label>
      <div class="msg small">${real ? "✓ Þetta kort hefur verið lagt á Vordísarvarpið." : "Leggðu nýja kortið á Vordísarvarpið og veldu það hér, eða notaðu „Tengja við“ sem birtist efst á síðunni."}</div>
      <div class="sep"></div>
      <div class="row-end"><button class="sec sm danger" data-del="${i}">Eyða korti</button></div>
    </div>`;
  }

  _renderTabMidi(it, st) {
    const pr = this._printedAt(it), lab = this._label(it.card), custom = !!lab.image;
    return `<div class="kf">
      <div class="pv">
        ${it.preview ? `<img src="${it.preview}" style="aspect-ratio:${st.w}/${st.h}">` : `<div class="ph" style="aspect-ratio:${st.w}/${st.h}">…</div>`}
        ${this._opts.back && it.backPreview ? `<img src="${it.backPreview}" style="aspect-ratio:${st.w}/${st.h}" title="Bakhlið">` : ""}
      </div>
      <label class="fld"><span>Titill á miðanum</span><input type="text" id="pTitle" value="${esc(lab.title || "")}" placeholder="${esc(it.card.name || "")}"></label>
      <div class="rowc"><span class="lbl">Eintök</span>
        <button class="sec ic" id="pMinus" ${it.copies <= 1 ? "disabled" : ""}>−</button><b class="num">${it.copies}</b>
        <button class="sec ic" id="pPlus" ${it.copies >= 20 ? "disabled" : ""}>+</button>
        <span class="flex"></span>
        <label class="sw"><input type="checkbox" id="pInc" ${it.include ? "checked" : ""}> Prenta</label></div>
      <div class="rowc"><span class="lbl">Tegund</span>
        <span class="seg">${GROUPS.map(([k]) => `<button data-pkind="${k}" class="${it.kind === k ? "on" : ""}">${CAT[k].chip}</button>`).join("")}</span></div>
      <div class="drop" id="drop">
        <span>🖼️ Dragðu mynd hingað eða</span>
        <button class="sec sm" id="pPick">Velja mynd</button>
        ${custom ? `<button class="sec sm" id="pReset">Nota forsíðu</button>` : ""}
        <input type="file" id="pFile" accept="image/*" hidden>
      </div>
      <div class="rowc small"><span class="msg">${pr ? `Prentað ${shortDate(pr)} <button class="link-b" id="pForget">gleyma</button>` : "Ekki prentað enn"}</span></div>
    </div>`;
  }

  // ---------- printing ----------

  _renderPrintPanel() {
    const o = this._opts, st = geom(o), items = this._items || [];
    const cal = this._herma() ? { ...SHEETS[o.sheet].cal, ...((o.cal || {})[o.sheet] || {}) } : null;
    const n = this._entries().length, sel = items.filter((i) => i.include).length;
    const seg = (opt, entries) => `<span class="seg">${entries.map(([k, name]) =>
      `<button data-opt="${opt}" data-v="${k}" class="${o[opt] === k ? "on" : ""}">${name}</button>`).join("")}</span>`;
    const nxt = this._next ? ` <button class="sec sm" id="useNext">Næst: byrja á miða ${this._next}</button>` : "";
    return `<div class="ovl" id="ovlP"><div class="dlg wide" role="dialog" aria-label="Prenta miða" data-keep="dlgp">
      <div class="dlg-h"><div class="kt"><b>Prenta miða</b><span class="msg">${sel} kort valin · ${n} ${n % 10 === 1 && n % 100 !== 11 ? "miði" : "miðar"}${o.back ? " með bakhliðum" : ""}</span></div>
        <button class="x" id="prClose" aria-label="Loka">✕</button></div>
      <div class="pbody"><div class="kf">
        <div class="grp sty"><span class="lbl">Útlit</span><div class="stylepick">${Object.entries(STYLES).map(([k, s2]) =>
          `<button data-opt="style" data-v="${k}" class="sp ${o.style === k ? "on" : ""}" title="${s2.name}">${this._thumbs && this._thumbs[k] ? `<img src="${this._thumbs[k]}" alt="">` : ""}<span>${s2.name}</span></button>`).join("")}</div></div>
        <div class="opts">
          <div class="grp"><span class="lbl">Litur</span>${seg("color", [["cover", "Úr forsíðu"], ["type", "Eftir tegund"]])}</div>
          <div class="grp"><span class="lbl">Blað</span>${seg("sheet", Object.entries(SHEETS).map(([k, s]) => [k, s.name]))}</div>
          <label class="sw"><input type="checkbox" id="back" ${o.back ? "checked" : ""}> Bakhlið</label>
        </div>
        <details class="more" id="more" ${this._more ? "open" : ""}>
          <summary>Fleiri stillingar og stilla prentara</summary>
          <div class="more-b">
            <label class="sw"><input type="checkbox" id="brand" ${o.brand ? "checked" : ""}> Sýna „${esc(this._config.brand)}“ á miðum</label>
            ${o.style === "classic" ? `<label class="sw"><input type="checkbox" id="dots" ${o.dots !== false ? "checked" : ""}> Punktar fyrir bækur í seríu</label>` : ""}
            <span class="msg">Stærð miða: ${st.w} × ${st.h} mm${st.cut ? ", klipptu á punktalínunni" : ", forskornir límmiðar"}.
              ${o.back ? "Bakhliðarnar koma á eftir framhliðunum." : ""}</span>
            ${cal ? `<div class="cal">
              <b>Staðsetning á blaði (mm)</b>
              <label>Vinstri <input type="number" step="0.1" data-cal="left" value="${cal.left}"></label>
              <label>Efst <input type="number" step="0.1" data-cal="top" value="${cal.top}"></label>
              <label>Bil milli dálka <input type="number" step="0.1" data-cal="gap" value="${cal.gap}"></label>
              <label>Bil milli raða <input type="number" step="0.1" data-cal="vgap" value="${cal.vgap}"></label>
              <button class="sec sm" id="testpage">Prófunarblað (PDF)</button>
              <span class="msg">Prentaðu prófunarblaðið á venjulegan pappír, leggðu það yfir límmiðablað og berðu upp að ljósi. Lagaðu tölurnar þar til rammarnir falla á límmiðana.</span>
            </div>` : ""}
          </div>
        </details>
        ${n ? this._renderSheet(st) : `<div class="msg">Engin kort valin. Hakaðu við kortin sem á að prenta.</div>`}
        ${this._notice === "busy" ? `<div class="notice">Bý til PDF með ${n} miðum…</div>` : ""}
        ${this._notice === "done" ? `<div class="notice">PDF tilbúið: <b>vordisarvarpid-kortamidar.pdf</b> er í niðurhali (Downloads). Prentaðu í 100 %.${nxt}</div>` : ""}
        ${this._notice === "printed" ? `<div class="notice">Sent í prentun. Veldu 100 % (raunstærð) í prentglugganum.${nxt}</div>` : ""}
        ${String(this._notice).startsWith("missing:") ? `<div class="notice">PDF tilbúið, en ${this._notice.split(":")[1]} mynd(ir) náðust ekki frá Music Assistant. Opnaðu kortið og veldu aðra mynd.${nxt}</div>` : ""}
        ${this._notice === "app" ? `<div class="notice">Appið getur ekki prentað beint. Notaðu <b>Sækja PDF</b> og prentaðu skrána.</div>` : ""}
      </div></div>
      <div class="dlg-f">
        <span class="flex"></span>
        ${this._inApp() ? "" : `<button class="sec" id="print" ${n && !this._busy ? "" : "disabled"}>Prenta</button>`}
        <button id="pdf" ${n && !this._busy ? "" : "disabled"}>${this._busy ? "Augnablik…" : `Sækja PDF${n ? ` (${n})` : ""}`}</button>
      </div>
    </div></div>`;
  }

  // ---------- events ----------

  _bind() {
    const root = this.shadowRoot, q = (sel) => root.querySelectorAll(sel), $ = (id) => root.getElementById(id);
    const on = (id, ev, fn) => { const el = $(id); if (el) el[ev] = fn; };
    const stop = (fn) => (e) => { e.stopPropagation(); fn(e); };
    const o = this._opts, items = this._items || [];
    const newCard = (tag) => {
      const cards = this._editCards();
      cards.push({ id: newId(), name: "", tag_id: tag || this._placeholder(), media_type: "audiobook", shuffle: false });
      this._dirty = true; this._info = null;
      this._openPanel(cards.length - 1, "spilar");
      const inp = root.getElementById("q" + (cards.length - 1)); if (inp) inp.focus();
    };
    // top bar
    on("addCard", "onclick", () => newCard());
    on("openPrint", "onclick", () => { this._printOpen = true; this._notice = ""; this._render(); });
    on("save", "onclick", () => this._saveCards());
    on("pSave", "onclick", () => this._saveCards());
    on("undo", "onclick", () => { this._edit = null; this._dirty = false; this._msg = ""; this._panel = -1; this._render(); });
    on("menuBtn", "onclick", stop(() => { this._menu = !this._menu; this._render(); }));
    on("mExport", "onclick", () => { this._menu = false; this._export(); });
    on("mImport", "onclick", () => { this._menu = false; this._render(); this.shadowRoot.getElementById("importFile").click(); });
    on("mReload", "onclick", () => { this._menu = false; this._loaded = false; this._items = null; this._covers = {}; this._load(); });
    on("importFile", "onchange", (e) => this._import(e.target.files && e.target.files[0]));
    on("stopAll", "onclick", () => this._stop());
    on("msgX", "onclick", () => { this._msg = ""; this._render(); });
    if (this._menu) root.querySelector("ha-card").onclick = (e) => { if (!e.target.closest(".menu-w")) { this._menu = false; this._render(); } };
    // scanning
    on("scanX", "onclick", () => { this._scan = null; this._render(); });
    on("scanNew", "onclick", () => { const id = this._scan.id; this._scan.i = this._editCards().length; newCard(id); });
    on("scanLink", "onclick", () => {
      const i = +$("scanTo").value;
      this._scan.i = i; this._change(i, "tag_id", this._scan.id); this._openPanel(i, "kort");
    });
    // grid
    const selectAll = (fn) => { items.forEach((it) => { const v = fn(it); if (v !== it.include) this._setLabel(it, { include: v ? null : false }); it.include = v; }); this._render(); };
    on("selAll", "onclick", () => selectAll(() => true));
    on("selNone", "onclick", () => selectAll(() => false));
    on("selNew", "onclick", () => selectAll((it) => !this._printedAt(it)));
    q("[data-tick]").forEach((el) => el.onclick = stop(() => {
      const it = items[+el.dataset.tick]; it.include = !it.include; this._setLabel(it, { include: it.include ? null : false }); this._render();
    }));
    q("[data-play]").forEach((el) => el.onclick = stop(() => {
      const c = this._editCards()[+el.dataset.play];
      if (this._playing === c.id) this._stop(); else this._play(c);
    }));
    q("[data-tile]").forEach((el) => {
      const i = +el.dataset.tile, it = items[i];
      el.onclick = () => { this._scanned = null; this._openPanel(i, this._ptab || "spilar"); };
      el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.onclick(); } };
      el.ondragstart = (e) => { e.dataTransfer.setData("text/x-vordis-card", String(i)); e.dataTransfer.effectAllowed = "move"; };
      el.ondragover = (e) => {
        const t = [...e.dataTransfer.types];
        if (t.includes("Files") || t.includes("text/x-vordis-card")) { e.preventDefault(); el.classList.add("over"); }
      };
      el.ondragleave = () => el.classList.remove("over");
      el.ondrop = (e) => {
        e.preventDefault(); el.classList.remove("over");
        if (e.dataTransfer.files && e.dataTransfer.files.length) { this._setImage(it, e.dataTransfer.files[0]); return; }
        const from = parseInt(e.dataTransfer.getData("text/x-vordis-card"), 10);
        if (!isNaN(from)) this._drop(from, i);
      };
    });
    // panels
    const closeAll = () => { this._panel = -1; this._printOpen = false; this._scanned = null; this._msg = ""; this._render(); };
    on("ovl", "onclick", (e) => { if (e.target.id === "ovl") closeAll(); });
    on("ovlP", "onclick", (e) => { if (e.target.id === "ovlP") closeAll(); });
    on("pClose", "onclick", closeAll); on("pDone", "onclick", closeAll); on("prClose", "onclick", closeAll);
    q("[data-ptab]").forEach((el) => el.onclick = () => { this._ptab = el.dataset.ptab; this._render(); });
    q("[data-up]").forEach((el) => el.onclick = () => this._move(+el.dataset.up, -1));
    q("[data-down]").forEach((el) => el.onclick = () => this._move(+el.dataset.down, 1));
    this._bindSpilar(q, root);
    if (this._panel >= 0 && items[this._panel]) this._bindMidi(items[this._panel]);
    if (this._printOpen) this._bindPrint(q, $, o);
  }

  _bindSpilar(q, root) {
    q('[data-e="media_id"]').forEach((el) => {
      el.onpaste = () => setTimeout(() => this._lookup(+el.dataset.i, el.value), 0);
      el.onkeydown = (e) => { if (e.key === "Enter") el.blur(); };
    });
    q("[data-e]").forEach((el) => el.onchange = () => {
      if (el.dataset.e === "media_id") { this._lookup(+el.dataset.i, el.value); return; }
      const v = el.type === "checkbox" ? el.checked : el.value.trim();
      this._change(+el.dataset.i, el.dataset.e, el.dataset.e === "more_media" ? el.value.split("\n").map((x) => x.trim()).filter(Boolean).join("\n") : v);
    });
    q("[data-newest]").forEach((el) => el.onclick = async () => {
      await this._loadTags();
      const i = +el.dataset.newest, t = (this._tags || [])[0];
      if (!t) { this._msg = "Ekkert kort hefur verið lagt á Vordísarvarpið."; this._render(); return; }
      const other = this._editCards().findIndex((c, k) => k !== i && c.tag_id === t.id);
      this._change(i, "tag_id", t.id);
      this._msg = other >= 0 ? `Athugið: ${t.id} er líka á „${this._editCards()[other].name}“.` : `Tengt við ${t.id}.`;
      this._render();
    });
    q("[data-find]").forEach((el) => {
      const i = +el.dataset.find, inp = root.getElementById("q" + i);
      el.onclick = () => this._search(i, inp.value.trim());
      inp.onkeydown = (e) => { if (e.key === "Enter") this._search(i, inp.value.trim()); };
      inp.onpaste = () => setTimeout(() => { if (/:\/\//.test(inp.value)) this._search(i, inp.value.trim()); }, 0);
    });
    q("[data-ftype]").forEach((el) => el.onclick = () => {
      this._ftype = el.dataset.ftype;
      const i = +el.dataset.fi, inp = root.getElementById("q" + i), v = inp ? inp.value.trim() : "";
      if (v) this._search(i, v); else this._render();
    });
    q("[data-serfind]").forEach((el) => el.onclick = () => {
      const i = +el.dataset.serfind, inp = root.getElementById("q" + i);
      const v = (inp && inp.value.trim()) || this._editCards()[i].name || "";
      if (!v) { if (inp) inp.focus(); return; }
      this._findSeries(i, v);
    });
    const sr = this._ser;
    q("[data-serx]").forEach((el) => el.onclick = () => { this._ser = null; this._render(); });
    q("[data-serall]").forEach((el) => el.onclick = () => { sr.books.forEach((b) => { b.on = true; }); this._render(); });
    q("[data-sernone]").forEach((el) => el.onclick = () => { sr.books.forEach((b) => { b.on = false; }); this._render(); });
    q("[data-serck]").forEach((el) => el.onchange = () => { sr.books[+el.dataset.serck].on = el.checked; this._render(); });
    const swap = (k, d) => { const j = k + d; if (j < 0 || j >= sr.books.length) return; [sr.books[k], sr.books[j]] = [sr.books[j], sr.books[k]]; this._render(); };
    q("[data-serup]").forEach((el) => el.onclick = (e) => { e.preventDefault(); swap(+el.dataset.serup, -1); });
    q("[data-serdown]").forEach((el) => el.onclick = (e) => { e.preventDefault(); swap(+el.dataset.serdown, 1); });
    q("[data-seruse]").forEach((el) => el.onclick = () => this._useSeries(+el.dataset.seruse, false));
    q("[data-seradd]").forEach((el) => el.onclick = () => this._useSeries(+el.dataset.seradd, true));
    q("[data-raw]").forEach((el) => el.onclick = () => { const i = +el.dataset.raw; const raw = this._find.raw; this._find = null; this._lookup(i, raw); });
    q("[data-seropen]").forEach((el) => el.onclick = () => { const i = +el.dataset.seropen; this._serOpen = this._serOpen === i ? -1 : i; this._render(); });
    q("[data-unser]").forEach((el) => el.onclick = () => {
      const [i, k] = el.dataset.unser.split(":").map(Number), c = this._editCards()[i], lines = moreOf(c);
      lines.splice(k, 1);
      this._change(i, "more_media", lines.join("\n"));
    });
    q("[data-pick]").forEach((el) => el.onclick = () => { const [i, k] = el.dataset.pick.split(":").map(Number); this._pick(i, this._find.results[k], false); });
    q("[data-series]").forEach((el) => el.onclick = () => { const [i, k] = el.dataset.series.split(":").map(Number); this._pick(i, this._find.results[k], true); });
    q("[data-del]").forEach((el) => el.onclick = () => {
      const i = +el.dataset.del, c = this._editCards()[i];
      if (!confirm(`Eyða „${c.name || "nýju korti"}“? (Vistast þegar þú ýtir á Vista breytingar)`)) return;
      this._editCards().splice(i, 1); this._panel = -1; this._dirty = true; this._render();
    });
  }

  _bindMidi(it) {
    const root = this.shadowRoot, $ = (id) => root.getElementById(id), on = (id, ev, fn) => { const el = $(id); if (el) el[ev] = fn; };
    on("pTitle", "onchange", (e) => { const v = e.target.value.trim(); this._setLabel(it, { title: v && v !== it.card.name ? v : null }); this._render(); });
    on("pMinus", "onclick", () => { this._setLabel(it, { copies: Math.max(1, it.copies - 1) === 1 ? null : it.copies - 1 }); this._render(); });
    on("pPlus", "onclick", () => { this._setLabel(it, { copies: Math.min(20, it.copies + 1), include: null }); this._render(); });
    on("pInc", "onchange", (e) => { this._setLabel(it, { include: e.target.checked ? null : false }); this._render(); });
    root.querySelectorAll("[data-pkind]").forEach((b) => b.onclick = () => {
      this._setLabel(it, { kind: b.dataset.pkind === kindOf(it.card) ? null : b.dataset.pkind }); this._render();
    });
    on("pPick", "onclick", () => $("pFile").click());
    on("pFile", "onchange", (e) => this._setImage(it, e.target.files && e.target.files[0]));
    on("pReset", "onclick", () => { this._setLabel(it, { image: null }); this._render(); });
    const drop = $("drop");
    if (drop) {
      drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
      drop.ondragleave = () => drop.classList.remove("over");
      drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); this._setImage(it, e.dataTransfer.files[0]); };
    }
    on("pForget", "onclick", () => { this._forget(it); this._render(); });
  }

  _bindPrint(q, $, o) {
    const on = (id, ev, fn) => { const el = $(id); if (el) el[ev] = fn; };
    on("print", "onclick", () => this._print());
    on("pdf", "onclick", () => this._pdf());
    on("useNext", "onclick", () => { o.start = this._next; this._next = 0; this._notice = ""; this._saveOpts(); this._render(); });
    on("more", "ontoggle", (e) => { this._more = e.target.open; });
    on("back", "onchange", (e) => { o.back = e.target.checked; this._saveOpts(); this._refreshAll(); });
    on("brand", "onchange", (e) => { o.brand = e.target.checked; this._saveOpts(); this._refreshAll(); });
    on("dots", "onchange", (e) => { o.dots = e.target.checked; this._saveOpts(); this._refreshAll(); });
    on("testpage", "onclick", () => this._testPage());
    const setStart = (s) => { o.start = Math.min(10, Math.max(1, s)); this._saveOpts(); this._render(); };
    on("stDown", "onclick", () => setStart(this._start() - 1));
    on("stUp", "onclick", () => setStart(this._start() + 1));
    q("[data-slot]").forEach((el) => el.onclick = () => setStart(+el.dataset.slot));
    q("[data-cal]").forEach((el) => el.onchange = () => {
      o.cal = o.cal || {}; o.cal[o.sheet] = { ...(o.cal[o.sheet] || {}), [el.dataset.cal]: parseFloat(el.value) };
      this._saveOpts(); this._render(); this._refreshAll();
    });
    q("[data-opt]").forEach((b) => {
      b.onclick = () => { o[b.dataset.opt] = b.dataset.v; this._saveOpts(); this._render(); this._refreshAll(); };
    });
  }

  _render() {
    const root = this.shadowRoot;
    if (!root) return;
    const keep = {};
    for (const el of root.querySelectorAll("[data-keep]")) keep[el.dataset.keep] = el.scrollTop;
    this._syncItems();
    root.innerHTML = `
      <style>
        :host { --vk-r: 12px; }
        ha-card { padding:16px; }
        .head { display:flex; align-items:center; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
        .head h2 { margin:0; font-size:20px; flex:1; min-width:120px; }
        button { font:inherit; border:0; border-radius:10px; padding:8px 16px; cursor:pointer; font-weight:500;
                 background:var(--primary-color); color:var(--text-primary-color, #fff); transition:filter .15s; }
        button:hover:not([disabled]) { filter:brightness(1.08); }
        button[disabled] { opacity:.45; cursor:default; }
        button.sec { background:var(--secondary-background-color); color:var(--primary-text-color); }
        button.ic { width:34px; height:34px; padding:0; display:inline-flex; align-items:center; justify-content:center; border-radius:50%; }
        button.x { background:transparent; color:var(--secondary-text-color); padding:4px 8px; margin-left:auto; }
        button.link-b { background:none; color:var(--primary-color); padding:0; text-decoration:underline; font-size:inherit; }
        .sm { padding:6px 12px; font-size:13px; }
        input[type=text], input[type=search], input[type=number], select, textarea {
          font:inherit; color:var(--primary-text-color); background:var(--card-background-color, #fff);
          border:1px solid var(--divider-color); border-radius:8px; padding:7px 9px; box-sizing:border-box; }
        input:focus, select:focus, textarea:focus { outline:2px solid var(--primary-color); outline-offset:-1px; }
        input[type=checkbox] { accent-color:var(--primary-color); width:18px; height:18px; margin:0; }
        .opts { display:flex; gap:10px 18px; flex-wrap:wrap; align-items:center; padding:10px 12px;
                border-radius:var(--vk-r); background:var(--secondary-background-color); font-size:14px; }
        .grp { display:flex; gap:8px; align-items:center; }
        .lbl { color:var(--secondary-text-color); font-size:13px; }
        .sw { display:inline-flex; gap:8px; align-items:center; cursor:pointer; }
        .grp.sty { flex-basis:100%; align-items:flex-start; }
        .stylepick { display:flex; gap:8px; flex-wrap:wrap; }
        .sp { display:flex; flex-direction:column; align-items:center; gap:4px; padding:5px; width:104px; border-radius:10px; font-size:12px;
              background:var(--card-background-color, #fff); color:var(--primary-text-color); border:2px solid var(--divider-color); }
        .sp img { width:92px; border-radius:4px; box-shadow:0 1px 3px rgba(0,0,0,.25); }
        .sp.on { border-color:var(--primary-color); box-shadow:0 0 0 2px color-mix(in srgb, var(--primary-color) 25%, transparent); }
        @media (max-width: 520px) { .sp { width:calc(33% - 6px); } .sp img { width:100%; } }
        .seg { display:inline-flex; border-radius:10px; overflow:hidden; border:1px solid var(--divider-color); background:var(--card-background-color, #fff); }
        .seg button { border-radius:0; background:transparent; color:var(--primary-text-color); padding:6px 12px; font-size:13px; }
        .seg button + button { border-left:1px solid var(--divider-color); }
        .seg button.on { background:var(--primary-color); color:var(--text-primary-color, #fff); }
        details.more { margin:8px 0 12px; font-size:14px; }
        details.more summary { cursor:pointer; color:var(--secondary-text-color); padding:4px 2px; }
        .more-b { display:flex; flex-direction:column; gap:10px; padding:10px 12px; border-left:3px solid var(--divider-color); margin-top:6px; }
        .cal { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
        .cal label { display:flex; gap:6px; align-items:center; }
        .cal input { width:72px; }
        .msg { color:var(--secondary-text-color); }
        .small { font-size:13px; }
        .err { color:var(--error-color); margin-bottom:8px; }
        .notice { display:flex; gap:8px; align-items:center; flex-wrap:wrap; background:var(--secondary-background-color);
                  border-radius:var(--vk-r); padding:10px 12px; margin-bottom:12px; font-size:14px; line-height:1.4; }
        .tabs { display:flex; gap:4px; margin:-4px 0 14px; border-bottom:1px solid var(--divider-color); }
        .tabs button { background:transparent; color:var(--secondary-text-color); border-radius:10px 10px 0 0; padding:10px 18px; }
        .tabs button.on { color:var(--primary-color); box-shadow:inset 0 -3px 0 var(--primary-color); }
        .flex { flex:1; }
        .gh { font-size:15px; margin:18px 0 8px; display:flex; gap:8px; align-items:center; }
        .gh span { font-size:12px; font-weight:500; color:var(--secondary-text-color); background:var(--secondary-background-color); border-radius:10px; padding:1px 8px; }
        /* sheet preview */
        .sheet { margin:4px 0 6px; }
        .sheet-h { display:flex; gap:10px; align-items:center; flex-wrap:wrap; font-size:14px; margin-bottom:8px; }
        .stepper { display:inline-flex; gap:6px; align-items:center; font-size:13px; }
        .stepper b { min-width:20px; text-align:center; }
        .pages { display:flex; gap:12px; overflow-x:auto; padding:2px 2px 8px; }
        .pgw { display:flex; flex-direction:column; align-items:center; gap:4px; font-size:12px; color:var(--secondary-text-color); flex:none; }
        .page { position:relative; width:128px; aspect-ratio:210/297; background:#fff; border-radius:3px; box-shadow:0 1px 4px rgba(0,0,0,.3); }
        .slot { position:absolute; box-sizing:border-box; border:1px dashed #c4c9d4; border-radius:2px; overflow:hidden; }
        .slot img { width:100%; height:100%; object-fit:cover; display:block; }
        .slot.f { border:0; }
        .slot.used { background:repeating-linear-gradient(45deg,#d7dbe3 0 3px,#eef0f4 3px 6px); border-color:#b8bfcc; }
        .slot.pick { cursor:pointer; }
        .slot.pick:hover { outline:2px solid var(--primary-color); }
        /* grid */
        .selbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:10px 0 0; font-size:13px; }
        .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(165px, 1fr)); gap:14px; }
        .tile { cursor:pointer; border-radius:var(--vk-r); padding:6px; transition:background .15s; outline:none; }
        .tile:hover, .tile:focus-visible { background:var(--secondary-background-color); }
        .tile.over { outline:2px dashed var(--primary-color); }
        .tile .img { position:relative; }
        .tile .img img, .tile .img .ph { width:100%; height:100%; display:block; border-radius:2.4mm; box-shadow:0 1px 5px rgba(0,0,0,.28); object-fit:cover; transition:opacity .15s, filter .15s; }
        .tile:not(.on) .img img { opacity:.4; filter:grayscale(.6); }
        .ph { background:var(--secondary-background-color); display:flex; align-items:center; justify-content:center; color:var(--secondary-text-color); }
        .tick { position:absolute; top:-7px; right:-7px; width:30px; height:30px; padding:0; border-radius:50%;
                background:var(--card-background-color, #fff); color:transparent; border:2px solid var(--divider-color); font-size:15px; font-weight:700;
                box-shadow:0 1px 3px rgba(0,0,0,.25); }
        .tile.on .tick { background:var(--primary-color); color:var(--text-primary-color, #fff); border-color:var(--primary-color); }
        .copies { position:absolute; bottom:6px; right:6px; background:rgba(0,0,0,.7); color:#fff; font-size:12px; font-weight:600; border-radius:10px; padding:2px 8px; }
        .cap { display:flex; flex-direction:column; gap:2px; padding:8px 2px 0; font-size:13px; }
        .cap .t { font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .meta { display:flex; gap:8px; flex-wrap:wrap; font-size:12px; }
        .pr { color:var(--secondary-text-color); }
        .ok { color:var(--success-color, #2e7d32); font-size:12px; }
        .warn { color:var(--warning-color, #e65100); font-size:12px; }
        /* dialog */
        .ovl { position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; padding:16px; box-sizing:border-box; }
        .dlg { background:var(--card-background-color, #fff); color:var(--primary-text-color); border-radius:20px; width:100%; max-width:480px;
               max-height:100%; overflow:auto; padding:16px 18px 18px; box-sizing:border-box; display:flex; flex-direction:column; gap:12px;
               box-shadow:0 10px 40px rgba(0,0,0,.35); }
        .dlg-h { display:flex; align-items:center; gap:8px; font-size:18px; }
        .pv { display:flex; gap:10px; overflow-x:auto; }
        .pv img, .pv .ph { width:100%; min-width:0; flex:1 1 0; border-radius:3mm; box-shadow:0 2px 8px rgba(0,0,0,.3); }
        .fld { display:flex; flex-direction:column; gap:4px; font-size:13px; color:var(--secondary-text-color); }
        .fld input { font-size:15px; }
        .rowc { display:flex; gap:8px; align-items:center; flex-wrap:wrap; font-size:14px; }
        .rowc .lbl { min-width:60px; }
        .num { min-width:22px; text-align:center; font-size:16px; }
        .drop { border:2px dashed var(--divider-color); border-radius:var(--vk-r); padding:12px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; font-size:14px; color:var(--secondary-text-color); }
        .drop.over { border-color:var(--primary-color); background:var(--secondary-background-color); }
        /* cards tab */
        .bar { display:flex; gap:8px; align-items:center; margin-bottom:10px; flex-wrap:wrap; }
        .danger { color:var(--error-color) !important; }
        .hint { font-size:13px; margin-bottom:4px; }
        .scan { display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:10px 12px; margin-bottom:10px; border-radius:var(--vk-r);
                background:color-mix(in srgb, var(--primary-color) 14%, transparent); border:1px solid var(--primary-color); font-size:14px; }
        .scan.ok-b { background:color-mix(in srgb, var(--success-color, #2e7d32) 12%, transparent); border-color:var(--success-color, #2e7d32); }
        .scan .link { display:inline-flex; gap:6px; align-items:center; }
        .scan select { max-width:180px; padding:5px 8px; }
        .kc { border:1px solid var(--divider-color); border-radius:var(--vk-r); margin-bottom:8px; overflow:hidden; }
        .kc.open { border-color:var(--primary-color); }
        .kc.over { border-color:var(--primary-color); box-shadow:0 -3px 0 var(--primary-color); }
        .kh { display:flex; gap:10px; align-items:center; padding:8px 10px; cursor:pointer; }
        .grip { color:var(--secondary-text-color); cursor:grab; font-size:16px; user-select:none; }
        .th { width:44px; height:44px; border-radius:8px; object-fit:cover; flex:none; }
        .th.sm { width:36px; height:36px; }
        .th.none { background:var(--secondary-background-color); display:flex; align-items:center; justify-content:center; font-size:20px; }
        .kt { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; font-size:14px; }
        .kt b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .pill { font-size:12px; color:var(--secondary-text-color); }
        .acts { display:flex; gap:4px; }
        .acts .ic { width:32px; height:32px; background:var(--secondary-background-color); color:var(--primary-text-color); font-size:13px; }
        .acts .ic.on { background:var(--primary-color); color:var(--text-primary-color, #fff); }
        .chev { color:var(--secondary-text-color); }
        .kf { display:flex; flex-direction:column; gap:8px; padding:4px 12px 12px; font-size:14px; }
        .kf label { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .kf label.top { align-items:flex-start; flex-direction:column; }
        .kf input[type=text], .kf select { flex:1; min-width:160px; }
        .kf textarea { width:100%; font:12px monospace; }
        .find { display:flex; gap:8px; } .find input { flex:1; }
        .res { display:flex; gap:10px; align-items:center; padding:4px 0; }
        .sel { display:flex; gap:12px; align-items:center; padding:10px; border-radius:var(--vk-r); background:var(--secondary-background-color); }
        .sel.empty { color:var(--secondary-text-color); font-size:14px; }
        .sel .th { width:56px; height:56px; }
        .cap-l { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--secondary-text-color); }
        .find.big input { font-size:15px; padding:10px 12px; border-radius:10px; }
        .chips { display:flex; gap:6px; flex-wrap:wrap; }
        .chip { padding:4px 12px; font-size:12px; border-radius:16px; background:transparent; color:var(--primary-text-color); border:1px solid var(--divider-color); }
        .chip.on { background:var(--primary-color); color:var(--text-primary-color, #fff); border-color:var(--primary-color); }
        .results { display:flex; flex-direction:column; gap:2px; max-height:420px; overflow:auto; border:1px solid var(--divider-color); border-radius:var(--vk-r); padding:4px; }
        .results .res { padding:6px; border-radius:8px; }
        .results .res:hover { background:var(--secondary-background-color); }
        .results .res.cur { background:color-mix(in srgb, var(--primary-color) 12%, transparent); }
        .src { display:inline-block; font-size:10.5px; font-weight:600; line-height:16px; padding:0 6px; border-radius:8px; margin-right:4px;
               background:var(--secondary-background-color); color:var(--primary-text-color); border:1px solid var(--divider-color); vertical-align:1px; }
        .src-library { background:var(--primary-color); color:var(--text-primary-color, #fff); border-color:transparent; }
        .src-spotify { background:#1DB954; color:#fff; border-color:transparent; }
        .src-storytel { background:#FF5C28; color:#fff; border-color:transparent; }
        .src-tunein, .src-radiobrowser { background:#14b8a6; color:#fff; border-color:transparent; }
        .src-ytmusic { background:#FF0000; color:#fff; border-color:transparent; }
        .src-tidal, .src-apple_music { background:#111; color:#fff; border-color:transparent; }
        .ser-chip { border-style:dashed; }
        .hint-b { display:flex; gap:8px; align-items:center; flex-wrap:wrap; font-size:13px; padding:8px 10px; border-radius:10px;
                  background:color-mix(in srgb, var(--primary-color) 10%, transparent); }
        .serfind { display:flex; flex-direction:column; gap:8px; padding:10px; border:1px solid var(--primary-color); border-radius:var(--vk-r); }
        .sf-h { display:flex; gap:8px; align-items:baseline; flex-wrap:wrap; }
        .sf-bar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; font-size:13px; }
        .sf-bar.end { justify-content:flex-end; }
        .res.sf { cursor:pointer; }
        .res.sf input { flex:none; }
        .res.sf.other:not(.cur) { opacity:.55; }
        .res.sf .acts .ic { width:28px; height:28px; }
        .warn-b { display:flex; gap:8px; align-items:center; flex-wrap:wrap; color:var(--warning-color, #e65100); font-size:13px; }
        .sep { border-top:1px solid var(--divider-color); margin:4px 0; }
        .ser { display:flex; flex-direction:column; gap:2px; font-size:13px; }
        .ser .lbl { margin-bottom:2px; }
        .ser .link-b { align-self:flex-start; font-size:13px; margin-top:2px; }
        .ser-i { display:flex; gap:6px; align-items:center; padding:2px 0; }
        .ser-i .n { color:var(--secondary-text-color); min-width:22px; }
        .ser-i .t { flex:0 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .ser-i .x { margin-left:auto; padding:0 6px; }
        details.adv summary { cursor:pointer; color:var(--secondary-text-color); font-size:13px; }
        details.adv[open] { display:flex; flex-direction:column; gap:8px; }
        .res.found { padding:6px 8px; border-radius:10px; background:var(--secondary-background-color); margin-top:-2px; }
        .row-end { display:flex; justify-content:flex-end; }
        @media (max-width: 520px) {
          ha-card { padding:12px; }
          .grid { grid-template-columns:repeat(2, minmax(0, 1fr)); gap:8px; }
          .acts [data-up], .acts [data-down] { width:28px; }
          .opts { gap:8px 12px; }
        }

        .top { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:12px; }
        .ttl { display:flex; flex-direction:column; gap:2px; min-width:160px; }
        .ttl h2 { margin:0; font-size:20px; }
        .ttl .msg { font-size:13px; }
        .menu-w { position:relative; }
        .menu { position:absolute; right:0; top:40px; z-index:20; background:var(--card-background-color, #fff); border-radius:12px;
                box-shadow:0 6px 24px rgba(0,0,0,.25); padding:6px; display:flex; flex-direction:column; min-width:220px; }
        .menu button { background:transparent; color:var(--primary-text-color); text-align:left; border-radius:8px; }
        .menu button:hover { background:var(--secondary-background-color); }
        .empty { padding:24px; text-align:center; color:var(--secondary-text-color); border:2px dashed var(--divider-color); border-radius:var(--vk-r); }
        .tplay { position:absolute; left:6px; bottom:6px; width:30px; height:30px; padding:0; border-radius:50%; font-size:12px;
                 background:rgba(0,0,0,.6); color:#fff; opacity:0; transition:opacity .15s; }
        .tile:hover .tplay, .tile:focus-within .tplay { opacity:1; }
        @media (hover: none) { .tplay { opacity:.85; } }
        .nowp { position:absolute; left:6px; top:6px; background:var(--primary-color); color:var(--text-primary-color, #fff); font-size:11px; font-weight:600; border-radius:10px; padding:2px 8px; }
        .dlg.wide { max-width:720px; padding:0; gap:0; }
        .dlg.wide .dlg-h { padding:14px 16px 8px; }
        .hthumb { width:76px; border-radius:6px; box-shadow:0 1px 4px rgba(0,0,0,.3); flex:none; }
        .hthumb.ph { height:48px; display:flex; align-items:center; justify-content:center; background:var(--secondary-background-color); }
        .dlg-h .kt b { font-size:17px; }
        .ptabs { display:flex; gap:4px; padding:0 16px; border-bottom:1px solid var(--divider-color); }
        .ptabs button { background:transparent; color:var(--secondary-text-color); border-radius:10px 10px 0 0; padding:9px 16px; }
        .ptabs button.on { color:var(--primary-color); box-shadow:inset 0 -3px 0 var(--primary-color); }
        .pbody { padding:12px 16px; }
        .dlg.wide > .notice { margin:10px 16px 0; }
        .dlg-f { position:sticky; bottom:0; display:flex; gap:8px; align-items:center; padding:10px 16px; border-top:1px solid var(--divider-color);
                 background:var(--card-background-color, #fff); border-radius:0 0 20px 20px; }
        .kf .fld select { flex:1; min-width:160px; }
        .kf label.fld { flex-direction:column; align-items:stretch; flex-wrap:nowrap; }
        .kf label.fld input[type=text] { width:100%; min-width:0; }
        .kf .fld .rowc { flex-wrap:nowrap; }
        @media (max-width: 520px) {
          .ovl { padding:0; align-items:flex-end; }
          .dlg, .dlg.wide { border-radius:16px 16px 0 0; max-height:92%; }
          .dlg-f { border-radius:0; }
          .hthumb { width:56px; }
          .top .ttl { flex-basis:100%; }
        }
      </style>
      <ha-card>${this._renderMain()}</ha-card>`;
    for (const el of root.querySelectorAll("[data-keep]")) if (keep[el.dataset.keep] !== undefined) el.scrollTop = keep[el.dataset.keep];
    this._bind();
  }
}

if (!customElements.get("vordisarvarpid-kortamidar-card")) {
  customElements.define("vordisarvarpid-kortamidar-card", VordisarvarpidKortamidarCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "vordisarvarpid-kortamidar-card",
    name: "Vordísarvarpið",
    description: "Kortin á Vordísarvarpinu: hvað þau spila og prentanlegir miðar með forsíðumyndum.",
  });
}
