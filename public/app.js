"use strict";

/* ============================================================
   laqta.tech Zine Maker
   ============================================================ */

const SPREAD_COUNT = 3;
const LANDSCAPE_RATIO = 1.15;
const SPREAD_PAGES = [[2,3],[4,5],[6,7]];
const FONTS = {
  system:   { label: "Sans-serif",       css: "-apple-system, Helvetica, Arial, sans-serif" },
  serif:    { label: "Serif",            css: "Georgia, 'Times New Roman', serif" },
  mono:     { label: "Mono",             css: "'Courier New', Courier, monospace" },
  playfair: { label: "Playfair Display", css: "'Playfair Display', Georgia, serif" },
  bebas:    { label: "Bebas Neue",       css: "'Bebas Neue', Impact, sans-serif" },
  lora:     { label: "Lora",             css: "'Lora', Georgia, serif" },
  space:    { label: "Space Grotesk",    css: "'Space Grotesk', Helvetica, sans-serif" },
  aref:     { label: "Aref Ruqaa Ink",  css: "'Aref Ruqaa Ink', serif" },
};

let spreadOrder = [0, 1, 2];

/* ---------- state factories ---------- */
function freshPage() {
  return { img: null, cap: "", fit: "cover", panX: 0, panY: 0, zoom: 1, filmSim: null, showFilmSim: false };
}
function freshSpread() {
  return {
    fused: false,
    fusedImg: null, fusedPanX: 0, fusedPanY: 0, fusedCap: "", fusedZoom: 1, fusedFit: "cover",
    fusedFilmSim: null, fusedShowFilmSim: false,
    a: freshPage(), b: freshPage(),
  };
}
function freshCover() {
  return {
    title: "", subtitle: "", author: "",
    img: null, fit: "cover", panX: 0, panY: 0, zoom: 1,
    bgColor: "",
    textAlign: "center", titleSize: 1,
    overlay: false, overlayColor: "#000000", overlayOpacity: 0.45,
    fontColor: "", font: "system",
    filmSim: null, showFilmSim: false,
  };
}

const state = {
  paper: "letter",
  cover: freshCover(),
  back: Object.assign(freshCover(), { notes: "", qrLink: "", qrImg: null }),
  spreads: Array.from({ length: SPREAD_COUNT }, freshSpread),
};

/* ---------- paper ---------- */
function paperInches() {
  return state.paper === "a4" ? { w: 11.69, h: 8.27 } : { w: 11.0, h: 8.5 };
}
function pageAspect() {
  const p = paperInches();
  return (p.w / 4) / (p.h / 2);
}

/* ---------- image helpers ---------- */
function fileToImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) { reject(new Error("Not an image")); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img._dataUrl = e.target.result;
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not decode image"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}
function imageFromDataURL(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img._dataUrl = dataUrl;
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}
function isLandscape(img) {
  return img.naturalWidth >= img.naturalHeight * LANDSCAPE_RATIO;
}

/* ---------- Fujifilm EXIF helpers ---------- */
function cleanFilmSimName(raw) {
  if (!raw) return null;
  // "F0/Standard (Provia)" → "Provia"
  const paren = raw.match(/\(([^)]+)\)/);
  if (paren) return paren[1];
  // "F4/Classic Chrome" → "Classic Chrome"
  const slash = raw.indexOf('/');
  if (slash !== -1) return raw.slice(slash + 1).trim();
  return raw.trim();
}

async function parseFilmSim(file) {
  try {
    if (typeof exifr === 'undefined') return null;
    const tags = await exifr.parse(file, { makerNote: true });
    if (!tags) return null;
    if (!String(tags.Make || '').toUpperCase().includes('FUJI')) return null;
    return cleanFilmSimName(tags.FilmMode) || 'Film Sim';
  } catch (e) { return null; }
}

async function fileToImageWithExif(file) {
  const [img, filmSim] = await Promise.all([fileToImage(file), parseFilmSim(file)]);
  if (filmSim) img._filmSim = filmSim;
  return img;
}

function drawCover(ctx, img, x, y, w, h, fit = "cover", panX = 0, panY = 0, zoom = 1) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  if (fit === "contain") {
    const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight) * zoom;
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    ctx.fillStyle = "#111111";
    ctx.fillRect(x, y, w, h);
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  } else {
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * zoom;
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    const ox = Math.max(0, (dw - w) / 2), oy = Math.max(0, (dh - h) / 2);
    ctx.drawImage(img, x + (w - dw) / 2 + panX * ox, y + (h - dh) / 2 + panY * oy, dw, dh);
  }
  ctx.restore();
}

function drawSpanHalf(ctx, img, x, y, u, v, side, panX = 0, panY = 0, zoom = 1, fit = "cover") {
  const W = 2 * u, H = v;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, u, v); ctx.clip();
  if (fit === "contain") {
    ctx.fillStyle = "#111111"; ctx.fillRect(x, y, u, v);
    const scale = Math.min(W / img.naturalWidth, H / img.naturalHeight) * zoom;
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    const shift = side === "right" ? -u : 0;
    ctx.drawImage(img, x + (W - dw) / 2 + shift, y + (H - dh) / 2, dw, dh);
  } else {
    const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight) * zoom;
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    const ox = Math.max(0, (dw - W) / 2), oy = Math.max(0, (dh - H) / 2);
    const shift = side === "right" ? -u : 0;
    ctx.drawImage(img, x + (W - dw) / 2 + shift + panX * ox, y + (H - dh) / 2 + panY * oy, dw, dh);
  }
  ctx.restore();
}

/* ---------- text helpers ---------- */
function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = []; let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}
function caption(ctx, text, x, y, w, h) {
  if (!text) return;
  const fs = Math.round(h * 0.032);
  ctx.font = `500 ${fs}px -apple-system, Helvetica, Arial, sans-serif`;
  const pad = h * 0.02;
  const lines = wrapText(ctx, text, w - pad * 2).slice(0, 2);
  const boxH = pad + lines.length * fs * 1.25 + pad * 0.5;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(x, y + h - boxH, w, boxH);
  ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.textBaseline = "top";
  lines.forEach((ln, i) => ctx.fillText(ln, x + pad, y + h - boxH + pad + i * fs * 1.25));
}
function drawCenteredDown(ctx, text, ax, top, maxW, fs) {
  const lines = wrapText(ctx, text, maxW);
  lines.forEach((ln, i) => ctx.fillText(ln, ax, top + i * fs * 1.18));
  return top + lines.length * fs * 1.18;
}
function drawCenteredUp(ctx, text, ax, bottom, maxW, fs) {
  const lines = wrapText(ctx, text, maxW);
  const lh = fs * 1.12;
  lines.forEach((ln, i) => ctx.fillText(ln, ax, bottom - (lines.length - 1 - i) * lh));
  return lines.length * lh;
}

/* ---------- overlay ---------- */
function drawOverlay(ctx, x, y, w, h, color, opacity) {
  ctx.save(); ctx.globalAlpha = opacity; ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h); ctx.restore();
}

/* ---------- placeholder ---------- */
function drawPlaceholder(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = "#e0e0dc"; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#a1a1aa"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `500 ${Math.max(8, Math.round(h * 0.07))}px -apple-system, Helvetica, Arial, sans-serif`;
  ctx.fillText("Add photo here", x + w / 2, y + h / 2);
  ctx.restore();
}

/* ---------- cover/back text ---------- */
function getAnchor(align, x, w, pad) {
  if (align === "left") return x + pad;
  if (align === "right") return x + w - pad;
  return x + w / 2;
}

function drawCoverText(ctx, x, y, w, h, overImage, c) {
  const { title, subtitle, author, textAlign, titleSize, fontColor, font } = c;
  if (!title && !subtitle && !author) return;
  const fontCSS = (FONTS[font] || FONTS.system).css;
  const pad = w * 0.08, maxW = w - pad * 2;
  const align = textAlign || "center";
  ctx.textAlign = align;
  const ax = getAnchor(align, x, w, pad);

  if (overImage && !c.overlay) {
    const grad = ctx.createLinearGradient(0, y + h * 0.45, 0, y + h);
    grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(1, "rgba(0,0,0,0.75)");
    ctx.fillStyle = grad; ctx.fillRect(x, y + h * 0.45, w, h * 0.55);
  }
  let inkAuto = overImage ? "#ffffff" : "#18181b";
  let subAuto = overImage ? "rgba(255,255,255,0.85)" : "#52525b";
  if (!overImage && c.bgColor) {
    const hex = c.bgColor.replace("#", "");
    const lum = (parseInt(hex.slice(0,2),16)*299 + parseInt(hex.slice(2,4),16)*587 + parseInt(hex.slice(4,6),16)*114) / 1000;
    inkAuto = lum < 140 ? "#ffffff" : "#18181b";
    subAuto = lum < 140 ? "rgba(255,255,255,0.8)" : "#52525b";
  }
  const ink = fontColor || inkAuto, sub = fontColor || subAuto;

  if (overImage) {
    let cy = y + h - h * 0.07;
    if (author) {
      ctx.fillStyle = sub;
      ctx.font = `500 ${Math.round(h * 0.032)}px ${fontCSS}`;
      ctx.textBaseline = "bottom"; ctx.fillText(author, ax, cy); cy -= h * 0.05;
    }
    if (subtitle) {
      ctx.fillStyle = sub;
      const fs = Math.round(h * 0.034);
      ctx.font = `500 ${fs}px ${fontCSS}`; ctx.textBaseline = "bottom";
      cy -= drawCenteredUp(ctx, subtitle, ax, cy, maxW, fs) + h * 0.01;
    }
    if (title) {
      ctx.fillStyle = ink;
      const fs = Math.round(h * 0.082 * (titleSize || 1));
      ctx.font = `700 ${fs}px ${fontCSS}`; ctx.textBaseline = "bottom";
      drawCenteredUp(ctx, title, ax, cy, maxW, fs);
    }
  } else {
    // Vertically center the title+subtitle block
    const titleFs = title ? Math.round(h * 0.1 * (titleSize || 1)) : 0;
    const subFs = subtitle ? Math.round(h * 0.042) : 0;
    const estimatedH = (title ? titleFs * 1.4 : 0) + (subtitle ? subFs * 1.4 : 0);
    let cy = Math.max(y + h * 0.12, y + h / 2 - estimatedH / 2);
    if (title) {
      ctx.fillStyle = ink;
      ctx.font = `700 ${titleFs}px ${fontCSS}`; ctx.textBaseline = "top";
      cy = drawCenteredDown(ctx, title, ax, cy, maxW, titleFs) + h * 0.02;
    }
    if (subtitle) {
      ctx.fillStyle = sub;
      ctx.font = `500 ${subFs}px ${fontCSS}`; ctx.textBaseline = "top";
      cy = drawCenteredDown(ctx, subtitle, ax, cy, maxW, subFs) + h * 0.02;
    }
    if (author) {
      ctx.fillStyle = sub;
      ctx.font = `500 ${Math.round(h * 0.034)}px ${fontCSS}`;
      ctx.textBaseline = "bottom"; ctx.fillText(author, ax, y + h - h * 0.06);
    }
  }
}

function drawBackNotes(ctx, x, y, w, h, overImage, notes) {
  if (!notes) return;
  // When a QR code is present, restrict text to the left portion to avoid overlap
  const hasQR = !!state.back.qrImg;
  const textW = hasQR ? w * 0.62 : w;
  const pad = w * 0.1, fs = Math.round(h * 0.028);
  ctx.font = `400 ${fs}px -apple-system, Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  const lines = wrapText(ctx, notes, textW - pad * 2).slice(0, 4);
  const blockH = lines.length * fs * 1.4;
  // Position in lower-center of page, well above the QR zone (~85% down)
  const top = y + h * 0.62 - blockH / 2;
  const cx = x + textW / 2;
  if (overImage) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(x, top - h * 0.02, textW, blockH + h * 0.04);
    ctx.fillStyle = "#fff";
  } else {
    ctx.fillStyle = "#71717a";
  }
  lines.forEach((ln, i) => ctx.fillText(ln, cx, top + i * fs * 1.4));
}

function drawBackQR(ctx, x, y, w, h) {
  const img = state.back.qrImg;
  if (!img) return;
  const size = w * 0.3, pad = w * 0.04, bp = pad * 0.4;
  const qx = x + w - size - pad, qy = y + h - size - pad;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(qx - bp, qy - bp, size + bp * 2, size + bp * 2);
  ctx.drawImage(img, qx, qy, size, size);
}

/* ---------- page model ---------- */
function pageModel(pageId) {
  if (pageId === 1) return { type: "cover" };
  if (pageId === 8) return { type: "back" };
  const pos = Math.floor((pageId - 2) / 2);
  const side = (pageId - 2) % 2 === 0 ? "left" : "right";
  return { type: "spread", spread: state.spreads[spreadOrder[pos]], side };
}

/* ---------- page state (lazy — safe across spreadOrder changes) ---------- */
function pageState(pageId) {
  if (pageId === 1) {
    const c = state.cover;
    return {
      getImg: () => c.img, getPan: () => [c.panX, c.panY], setPan: (nx, ny) => { c.panX = nx; c.panY = ny; },
      getZoom: () => c.zoom || 1, setZoom: z => { c.zoom = z; },
    };
  }
  if (pageId === 8) {
    const b = state.back;
    return {
      getImg: () => b.img, getPan: () => [b.panX, b.panY], setPan: (nx, ny) => { b.panX = nx; b.panY = ny; },
      getZoom: () => b.zoom || 1, setZoom: z => { b.zoom = z; },
    };
  }
  return {
    getImg: () => { const m = pageModel(pageId); const sp = m.spread; return sp.fused ? sp.fusedImg : (m.side === "left" ? sp.a : sp.b).img; },
    getPan: () => { const m = pageModel(pageId); const sp = m.spread; return sp.fused ? [sp.fusedPanX, sp.fusedPanY] : (m.side === "left" ? [sp.a.panX, sp.a.panY] : [sp.b.panX, sp.b.panY]); },
    setPan: (nx, ny) => { const m = pageModel(pageId); const sp = m.spread; if (sp.fused) { sp.fusedPanX = nx; sp.fusedPanY = ny; } else { const pg = m.side === "left" ? sp.a : sp.b; pg.panX = nx; pg.panY = ny; } },
    getZoom: () => { const m = pageModel(pageId); const sp = m.spread; return sp.fused ? (sp.fusedZoom || 1) : ((m.side === "left" ? sp.a : sp.b).zoom || 1); },
    setZoom: z => { const m = pageModel(pageId); const sp = m.spread; if (sp.fused) { sp.fusedZoom = z; } else { (m.side === "left" ? sp.a : sp.b).zoom = z; } },
  };
}

/* ---------- renderer ---------- */
function renderPage(ctx, x, y, w, h, pageId, showPlaceholder = false) {
  ctx.fillStyle = "#fafaf7"; ctx.fillRect(x, y, w, h);
  const m = pageModel(pageId);

  if (m.type === "cover") {
    const c = state.cover;
    if (c.bgColor) { ctx.fillStyle = c.bgColor; ctx.fillRect(x, y, w, h); }
    if (c.img) { drawCover(ctx, c.img, x, y, w, h, c.fit, c.panX, c.panY, c.zoom || 1); if (c.overlay) drawOverlay(ctx, x, y, w, h, c.overlayColor, c.overlayOpacity); }
    else if (!c.bgColor && showPlaceholder) drawPlaceholder(ctx, x, y, w, h);
    drawCoverText(ctx, x, y, w, h, !!c.img, c);
    return;
  }
  if (m.type === "back") {
    const b = state.back;
    if (b.bgColor) { ctx.fillStyle = b.bgColor; ctx.fillRect(x, y, w, h); }
    if (b.img) { drawCover(ctx, b.img, x, y, w, h, b.fit, b.panX, b.panY, b.zoom || 1); if (b.overlay) drawOverlay(ctx, x, y, w, h, b.overlayColor, b.overlayOpacity); }
    else if (!b.bgColor && showPlaceholder) drawPlaceholder(ctx, x, y, w, h);
    drawCoverText(ctx, x, y, w, h, !!b.img, b);
    drawBackNotes(ctx, x, y, w, h, !!b.img, b.notes);
    drawBackQR(ctx, x, y, w, h);
    return;
  }
  const sp = m.spread;
  if (sp.fused && sp.fusedImg) {
    drawSpanHalf(ctx, sp.fusedImg, x, y, w, h, m.side, sp.fusedPanX, sp.fusedPanY, sp.fusedZoom || 1, sp.fusedFit || "cover");
    if (m.side === "right") {
      caption(ctx, sp.fusedCap, x, y, w, h);
    }
  } else if (sp.fused && !sp.fusedImg && showPlaceholder) {
    drawPlaceholder(ctx, x, y, w, h);
  } else {
    const page = m.side === "left" ? sp.a : sp.b;
    if (page.img) {
      drawCover(ctx, page.img, x, y, w, h, page.fit, page.panX, page.panY, page.zoom || 1);
      caption(ctx, page.cap, x, y, w, h);
    } else if (showPlaceholder) {
      drawPlaceholder(ctx, x, y, w, h);
    } else {
      ctx.fillStyle = "#ececea"; ctx.fillRect(x, y, w, h);
    }
  }
}

/* ---------- thumbnail ---------- */
function drawToThumb(canvas, pageId, showPlaceholder = false) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // getBoundingClientRect forces layout so we always get current dimensions.
  // If the canvas hasn't been laid out yet (rect.width===0) use a safe fallback.
  const rect = canvas.getBoundingClientRect();
  const cssW = rect.width > 0 ? rect.width : (canvas.parentElement?.getBoundingClientRect().width / 2 || 260);
  const cssH = rect.height > 0 ? rect.height : cssW / pageAspect();
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderPage(ctx, 0, 0, cssW, cssH, pageId, showPlaceholder);
}

/* ---------- QR ---------- */
async function generateQR(url) {
  if (!url.trim()) {
    state.back.qrImg = null; refreshSimpleSlot("back"); renderPreview(); return;
  }
  if (!window.QRCode) { showToast("QR library not loaded yet."); return; }
  const size = 512;
  const div = document.createElement("div");
  div.style.cssText = `position:absolute;left:-9999px;top:-9999px;width:${size}px;height:${size}px;`;
  document.body.appendChild(div);
  try {
    new QRCode(div, { text: url.trim(), width: size, height: size,
      colorDark: "#000000", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
    const cvs = div.querySelector("canvas");
    if (!cvs) { state.back.qrImg = null; return; }
    const img = new Image(); img._dataUrl = cvs.toDataURL();
    await new Promise(r => { img.onload = r; img.src = img._dataUrl; });
    state.back.qrImg = img;
  } catch(e) {
    showToast("Couldn't generate QR — check the link."); state.back.qrImg = null;
  } finally { document.body.removeChild(div); }
  refreshSimpleSlot("back"); renderPreview();
}

/* ============================================================
   Auto-save
   ============================================================ */
const SAVE_KEY = "laqta-zine-v2";
let saveTimer = null;

function serializableImg(img) { return img && img._dataUrl ? img._dataUrl : null; }

function saveState() {
  try {
    const s = {
      paper: state.paper, spreadOrder,
      cover: {
        title: state.cover.title, subtitle: state.cover.subtitle, author: state.cover.author,
        fit: state.cover.fit, panX: state.cover.panX, panY: state.cover.panY, zoom: state.cover.zoom,
        bgColor: state.cover.bgColor,
        textAlign: state.cover.textAlign, titleSize: state.cover.titleSize,
        overlay: state.cover.overlay, overlayColor: state.cover.overlayColor, overlayOpacity: state.cover.overlayOpacity,
        fontColor: state.cover.fontColor, font: state.cover.font,
        filmSim: state.cover.filmSim || null, showFilmSim: state.cover.showFilmSim || false,
        imgData: serializableImg(state.cover.img),
      },
      back: {
        title: state.back.title, subtitle: state.back.subtitle, author: state.back.author,
        notes: state.back.notes, qrLink: state.back.qrLink,
        fit: state.back.fit, panX: state.back.panX, panY: state.back.panY, zoom: state.back.zoom,
        bgColor: state.back.bgColor,
        textAlign: state.back.textAlign, titleSize: state.back.titleSize,
        overlay: state.back.overlay, overlayColor: state.back.overlayColor, overlayOpacity: state.back.overlayOpacity,
        fontColor: state.back.fontColor, font: state.back.font,
        filmSim: state.back.filmSim || null, showFilmSim: state.back.showFilmSim || false,
        imgData: serializableImg(state.back.img),
        qrImgData: serializableImg(state.back.qrImg),
      },
      spreads: state.spreads.map(sp => ({
        fused: sp.fused, fusedPanX: sp.fusedPanX, fusedPanY: sp.fusedPanY, fusedCap: sp.fusedCap, fusedZoom: sp.fusedZoom, fusedFit: sp.fusedFit,
        fusedFilmSim: sp.fusedFilmSim || null, fusedShowFilmSim: sp.fusedShowFilmSim || false,
        fusedImgData: serializableImg(sp.fusedImg),
        a: { cap: sp.a.cap, fit: sp.a.fit, panX: sp.a.panX, panY: sp.a.panY, zoom: sp.a.zoom, filmSim: sp.a.filmSim || null, showFilmSim: sp.a.showFilmSim || false, imgData: serializableImg(sp.a.img) },
        b: { cap: sp.b.cap, fit: sp.b.fit, panX: sp.b.panX, panY: sp.b.panY, zoom: sp.b.zoom, filmSim: sp.b.filmSim || null, showFilmSim: sp.b.showFilmSim || false, imgData: serializableImg(sp.b.img) },
      })),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch(e) {
    // quota exceeded — silently skip
  }
}

function scheduleAutoSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 500);
}

async function loadSavedState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);

    if (s.paper) state.paper = s.paper;
    if (Array.isArray(s.spreadOrder)) spreadOrder = s.spreadOrder;

    async function restoreImg(dataUrl) { return dataUrl ? imageFromDataURL(dataUrl) : null; }

    if (s.cover) {
      Object.assign(state.cover, s.cover);
      state.cover.img = await restoreImg(s.cover.imgData);
    }
    if (s.back) {
      Object.assign(state.back, s.back);
      state.back.img = await restoreImg(s.back.imgData);
      state.back.qrImg = await restoreImg(s.back.qrImgData);
    }
    if (Array.isArray(s.spreads)) {
      for (let i = 0; i < s.spreads.length && i < SPREAD_COUNT; i++) {
        const ss = s.spreads[i], sp = state.spreads[i];
        sp.fused = ss.fused || false;
        sp.fusedPanX = ss.fusedPanX || 0; sp.fusedPanY = ss.fusedPanY || 0;
        sp.fusedCap = ss.fusedCap || ""; sp.fusedZoom = ss.fusedZoom || 1; sp.fusedFit = ss.fusedFit || "cover";
        sp.fusedFilmSim = ss.fusedFilmSim || null; sp.fusedShowFilmSim = ss.fusedShowFilmSim || false;
        sp.fusedImg = await restoreImg(ss.fusedImgData);
        if (ss.a) { Object.assign(sp.a, ss.a); sp.a.img = await restoreImg(ss.a.imgData); }
        if (ss.b) { Object.assign(sp.b, ss.b); sp.b.img = await restoreImg(ss.b.imgData); }
      }
    }
    return true;
  } catch(e) { return false; }
}

/* ============================================================
   Pan drag helper
   ============================================================ */
function addPanDrag(canvas, getImg, getPan, setPan, opts) {
  const { pageId, showPlaceholder = false, onMove, getZoom, setZoom } = opts;
  let dragging = false, sx = 0, sy = 0, spx = 0, spy = 0;
  let lastPinchDist = null;
  canvas.style.cursor = "grab";

  canvas.addEventListener("pointerdown", e => {
    if (!getImg()) return;
    if (e.isPrimary === false) return;
    e.preventDefault(); dragging = true;
    sx = e.clientX; sy = e.clientY;
    [spx, spy] = getPan();
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  });

  canvas.addEventListener("pointermove", e => {
    if (!dragging) return;
    const img = getImg();
    const rect = canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const zoom = getZoom ? getZoom() : 1;
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * zoom;
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    const ox = Math.max(1, (dw - w) / 2), oy = Math.max(1, (dh - h) / 2);
    const nx = Math.max(-1, Math.min(1, spx + (e.clientX - sx) / ox));
    const ny = Math.max(-1, Math.min(1, spy + (e.clientY - sy) / oy));
    setPan(nx, ny);
    drawToThumb(canvas, pageId, showPlaceholder);
    if (onMove) onMove(); else renderPreview();
    scheduleAutoSave();
  });

  const end = () => { dragging = false; canvas.style.cursor = "grab"; };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  if (getZoom && setZoom) {
    canvas.addEventListener("wheel", e => {
      if (!getImg()) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setZoom(Math.max(0.25, Math.min(4, getZoom() * factor)));
      drawToThumb(canvas, pageId, showPlaceholder);
      if (onMove) onMove(); else renderPreview();
      scheduleAutoSave();
    }, { passive: false });

    canvas.addEventListener("touchmove", e => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastPinchDist !== null) {
        setZoom(Math.max(0.25, Math.min(4, getZoom() * (dist / lastPinchDist))));
        drawToThumb(canvas, pageId, showPlaceholder);
        if (onMove) onMove(); else renderPreview();
        scheduleAutoSave();
      }
      lastPinchDist = dist;
    }, { passive: false });

    canvas.addEventListener("touchend", () => { lastPinchDist = null; });
    canvas.addEventListener("touchcancel", () => { lastPinchDist = null; });
  }
}

/* ============================================================
   Drag-and-drop upload helper
   ============================================================ */
function addDropZone(el, onFile) {
  el.addEventListener("dragover", e => {
    if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); el.classList.add("drag-over"); }
  });
  el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
  el.addEventListener("drop", e => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault(); el.classList.remove("drag-over");
      const f = e.dataTransfer.files[0];
      if (f?.type.startsWith("image/")) onFile(f);
    }
  });
}

/* ============================================================
   Booklet preview
   ============================================================ */
const bookletRoot = document.getElementById("bookletPreview");
function buildPreviewSlots() {
  for (let p = 1; p <= 8; p++) {
    const mini = document.createElement("div");
    mini.className = "mini"; mini.dataset.page = p;
    const c = document.createElement("canvas"); mini.appendChild(c);
    const num = document.createElement("span"); num.className = "mini-num"; num.textContent = p;
    mini.appendChild(num); bookletRoot.appendChild(mini);
  }
}

function refreshEditorCanvas(pageId) {
  let canvas;
  if (pageId === 1) { canvas = document.querySelector('.slot[data-slot="cover"] canvas'); }
  else if (pageId === 8) { canvas = document.querySelector('.slot[data-slot="back"] canvas'); }
  else { canvas = document.querySelector(`.pg-canvas[data-page-id="${pageId}"]`); }
  if (canvas && !canvas.hidden) drawToThumb(canvas, pageId);
}
function renderPreview() {
  bookletRoot.querySelectorAll(".mini").forEach(mini => {
    drawToThumb(mini.querySelector("canvas"), Number(mini.dataset.page), true);
  });
}

/* ============================================================
   Cover / Back slot
   ============================================================ */
async function handleSimpleFile(which, file) {
  let img;
  try { img = await fileToImageWithExif(file); }
  catch(e) { showToast("That file isn't a readable image."); return; }
  state[which].img = img;
  state[which].filmSim = img._filmSim || null;
  state[which].showFilmSim = !!img._filmSim;
  refreshSimpleSlot(which);
  buildCoverControls(which);
  renderPreview(); scheduleAutoSave();
}
function clearSimple(which) {
  state[which].img = null;
  state[which].filmSim = null;
  state[which].showFilmSim = false;
  refreshSimpleSlot(which);
  buildCoverControls(which);
  renderPreview(); scheduleAutoSave();
}
function refreshSimpleSlot(which) {
  const pageId = which === "cover" ? 1 : 8;
  const slot = document.querySelector(`.slot[data-slot="${which}"]`);
  const clearBtn = slot.querySelector(".slot-clear");
  let canvas = slot.querySelector("canvas");
  if (state[which].img) {
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.className = "slot-canvas";
      slot.insertBefore(canvas, clearBtn);
      const s = state[which];
      addPanDrag(canvas,
        () => s.img,
        () => [s.panX, s.panY],
        (nx, ny) => { s.panX = nx; s.panY = ny; },
        { pageId, getZoom: () => s.zoom || 1, setZoom: z => { s.zoom = z; } });
    }
    slot.classList.add("has-image"); clearBtn.hidden = false;
    requestAnimationFrame(() => drawToThumb(canvas, pageId));
  } else {
    slot.classList.remove("has-image"); clearBtn.hidden = true;
    if (canvas) canvas.remove();
  }
}

/* ============================================================
   Control builders
   ============================================================ */
function makeFitToggle(stateObj, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "ctrl-row";
  const label = document.createElement("span"); label.className = "ctrl-label"; label.textContent = "Fit";
  wrap.appendChild(label);
  const grp = document.createElement("div"); grp.className = "btn-group";
  ["cover", "contain"].forEach(val => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "seg-btn" + (stateObj.fit === val ? " active" : "");
    b.textContent = val === "cover" ? "Fill" : "Fit";
    b.addEventListener("click", () => {
      stateObj.fit = val;
      grp.querySelectorAll(".seg-btn").forEach((btn, i) => btn.classList.toggle("active", ["cover","contain"][i] === val));
      onChange();
    });
    grp.appendChild(b);
  });
  wrap.appendChild(grp);
  return wrap;
}

function makeAlignToggle(stateObj, onChange) {
  const wrap = document.createElement("div"); wrap.className = "ctrl-row";
  const label = document.createElement("span"); label.className = "ctrl-label"; label.textContent = "Align";
  wrap.appendChild(label);
  const grp = document.createElement("div"); grp.className = "btn-group";
  const opts = [["left","←"],["center","↔"],["right","→"]];
  opts.forEach(([val, sym]) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "seg-btn" + (stateObj.textAlign === val ? " active" : "");
    b.textContent = sym; b.title = val;
    b.addEventListener("click", () => {
      stateObj.textAlign = val;
      grp.querySelectorAll(".seg-btn").forEach((btn, i) => btn.classList.toggle("active", opts[i][0] === val));
      onChange();
    });
    grp.appendChild(b);
  });
  wrap.appendChild(grp);
  return wrap;
}

function makeTitleSize(stateObj, onChange) {
  const wrap = document.createElement("div"); wrap.className = "ctrl-row";
  const label = document.createElement("span"); label.className = "ctrl-label"; label.textContent = "Title size";
  wrap.appendChild(label);
  const slider = document.createElement("input");
  slider.type = "range"; slider.min = "0.5"; slider.max = "2"; slider.step = "0.05";
  slider.value = stateObj.titleSize || 1;
  slider.className = "ctrl-slider";
  slider.addEventListener("input", () => { stateObj.titleSize = parseFloat(slider.value); onChange(); });
  wrap.appendChild(slider);
  return wrap;
}

function makeOverlayControls(stateObj, onChange) {
  const wrap = document.createElement("div"); wrap.className = "ctrl-col";

  const row1 = document.createElement("div"); row1.className = "ctrl-row";
  const label = document.createElement("span"); label.className = "ctrl-label"; label.textContent = "Overlay";
  row1.appendChild(label);
  const toggle = document.createElement("input"); toggle.type = "checkbox"; toggle.checked = !!stateObj.overlay;
  toggle.className = "ctrl-check";
  toggle.addEventListener("change", () => { stateObj.overlay = toggle.checked; extras.hidden = !toggle.checked; onChange(); });
  row1.appendChild(toggle);
  wrap.appendChild(row1);

  const extras = document.createElement("div"); extras.className = "ctrl-col ctrl-indent"; extras.hidden = !stateObj.overlay;
  const row2 = document.createElement("div"); row2.className = "ctrl-row";
  const cl = document.createElement("span"); cl.className = "ctrl-label"; cl.textContent = "Color";
  row2.appendChild(cl);
  const colorPicker = document.createElement("input"); colorPicker.type = "color"; colorPicker.value = stateObj.overlayColor || "#000000";
  colorPicker.className = "ctrl-color";
  colorPicker.addEventListener("input", () => { stateObj.overlayColor = colorPicker.value; onChange(); });
  row2.appendChild(colorPicker);
  extras.appendChild(row2);

  const row3 = document.createElement("div"); row3.className = "ctrl-row";
  const ol = document.createElement("span"); ol.className = "ctrl-label"; ol.textContent = "Opacity";
  row3.appendChild(ol);
  const opSlider = document.createElement("input"); opSlider.type = "range"; opSlider.min = "0"; opSlider.max = "1"; opSlider.step = "0.05";
  opSlider.value = stateObj.overlayOpacity ?? 0.45; opSlider.className = "ctrl-slider";
  opSlider.addEventListener("input", () => { stateObj.overlayOpacity = parseFloat(opSlider.value); onChange(); });
  row3.appendChild(opSlider);
  extras.appendChild(row3);
  wrap.appendChild(extras);
  return wrap;
}

function makeFontControls(stateObj, onChange) {
  const wrap = document.createElement("div"); wrap.className = "ctrl-col";

  const row1 = document.createElement("div"); row1.className = "ctrl-row";
  const fl = document.createElement("span"); fl.className = "ctrl-label"; fl.textContent = "Font";
  row1.appendChild(fl);
  const sel = document.createElement("select"); sel.className = "ctrl-select";
  Object.entries(FONTS).forEach(([key, { label }]) => {
    const opt = document.createElement("option"); opt.value = key; opt.textContent = label;
    if (stateObj.font === key) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener("change", () => { stateObj.font = sel.value; onChange(); });
  row1.appendChild(sel);
  wrap.appendChild(row1);

  const row2 = document.createElement("div"); row2.className = "ctrl-row";
  const cl = document.createElement("span"); cl.className = "ctrl-label"; cl.textContent = "Text color";
  row2.appendChild(cl);
  const colorPicker = document.createElement("input"); colorPicker.type = "color";
  colorPicker.value = stateObj.fontColor || "#ffffff"; colorPicker.className = "ctrl-color";
  colorPicker.addEventListener("input", () => { stateObj.fontColor = colorPicker.value; onChange(); });
  row2.appendChild(colorPicker);

  const resetBtn = document.createElement("button"); resetBtn.type = "button";
  resetBtn.className = "ctrl-reset"; resetBtn.textContent = "Auto";
  resetBtn.title = "Reset to automatic color";
  resetBtn.addEventListener("click", () => { stateObj.fontColor = ""; onChange(); });
  row2.appendChild(resetBtn);
  wrap.appendChild(row2);
  return wrap;
}

function makeBgColorControl(stateObj, onChange) {
  const wrap = document.createElement("div"); wrap.className = "ctrl-row";
  const label = document.createElement("span"); label.className = "ctrl-label"; label.textContent = "Background";
  wrap.appendChild(label);
  const colorPicker = document.createElement("input"); colorPicker.type = "color";
  colorPicker.value = stateObj.bgColor || "#ffffff"; colorPicker.className = "ctrl-color";
  colorPicker.addEventListener("input", () => { stateObj.bgColor = colorPicker.value; onChange(); });
  wrap.appendChild(colorPicker);
  const clearBtn = document.createElement("button"); clearBtn.type = "button";
  clearBtn.className = "ctrl-reset"; clearBtn.textContent = "None";
  clearBtn.title = "Remove background color";
  clearBtn.addEventListener("click", () => { stateObj.bgColor = ""; onChange(); });
  wrap.appendChild(clearBtn);
  return wrap;
}

function buildCoverControls(which) {
  const el = document.getElementById(`${which}-controls`);
  if (!el) return;
  el.innerHTML = "";
  const s = state[which];
  const onChange = () => { refreshSimpleSlot(which); renderPreview(); scheduleAutoSave(); };
  el.appendChild(makeBgColorControl(s, onChange));
  el.appendChild(makeFitToggle(s, onChange));
  el.appendChild(makeAlignToggle(s, onChange));
  el.appendChild(makeTitleSize(s, onChange));
  el.appendChild(makeOverlayControls(s, onChange));
  el.appendChild(makeFontControls(s, onChange));
}

/* ============================================================
   Spreads
   ============================================================ */
const spreadsRoot = document.getElementById("spreads");
let dragSrcIndex = null; // position in spreadOrder being dragged

function buildSpreads() {
  spreadsRoot.innerHTML = "";
  spreadOrder.forEach((sIdx, pos) => buildSpreadCard(sIdx, pos));
}

function buildSpreadCard(sIdx, pos) {
  const pages = SPREAD_PAGES[pos]; // pages[0]=left, pages[1]=right
  const sp = state.spreads[sIdx];

  const card = document.createElement("article");
  card.className = "spread-card"; card.dataset.pos = pos; card.dataset.sIdx = sIdx;
  card.draggable = true;

  card.addEventListener("dragstart", e => {
    dragSrcIndex = pos;
    e.dataTransfer.effectAllowed = "move";
    setTimeout(() => card.classList.add("dragging"), 0);
  });
  card.addEventListener("dragend", () => { card.classList.remove("dragging"); dragSrcIndex = null; });
  card.addEventListener("dragover", e => { e.preventDefault(); card.classList.add("drag-target"); });
  card.addEventListener("dragleave", () => card.classList.remove("drag-target"));
  card.addEventListener("drop", e => {
    e.preventDefault(); card.classList.remove("drag-target");
    if (dragSrcIndex === null || dragSrcIndex === pos) return;
    const tmp = spreadOrder[dragSrcIndex]; spreadOrder[dragSrcIndex] = spreadOrder[pos]; spreadOrder[pos] = tmp;
    buildSpreads(); renderPreview(); scheduleAutoSave();
  });

  // Header
  const head = document.createElement("div"); head.className = "spread-head";
  const grip = document.createElement("span"); grip.className = "drag-grip"; grip.textContent = "⠿"; grip.title = "Drag to reorder";
  head.appendChild(grip);
  const h2 = document.createElement("h2");
  h2.innerHTML = `Spread <span class="page-tag">pages ${pages[0]}–${pages[1]}</span>`;
  head.appendChild(h2);
  const headBtns = document.createElement("div"); headBtns.className = "spread-head-btns";

  // Swap button
  const swapBtn = document.createElement("button"); swapBtn.type = "button"; swapBtn.className = "icon-btn"; swapBtn.title = "Swap pages";
  swapBtn.textContent = "⇄";
  swapBtn.addEventListener("click", () => {
    const tmp = sp.a; sp.a = sp.b; sp.b = tmp;
    buildSpreads(); renderPreview(); scheduleAutoSave();
  });
  headBtns.appendChild(swapBtn);

  // Merge/split button
  const fuseBtn = document.createElement("button"); fuseBtn.type = "button"; fuseBtn.className = "icon-btn";
  fuseBtn.title = sp.fused ? "Split into two pages" : "Merge into one image";
  fuseBtn.textContent = sp.fused ? "Split" : "Merge";
  fuseBtn.addEventListener("click", () => {
    sp.fused = !sp.fused;
    if (sp.fused && !sp.fusedImg && (sp.a.img || sp.b.img)) sp.fusedImg = sp.a.img || sp.b.img;
    buildSpreads(); renderPreview(); scheduleAutoSave();
  });
  headBtns.appendChild(fuseBtn);

  // Clear button
  const clearBtn = document.createElement("button"); clearBtn.type = "button"; clearBtn.className = "spread-clear";
  clearBtn.textContent = "Clear"; clearBtn.hidden = !hasSpreadContent(sp);
  clearBtn.addEventListener("click", () => {
    sp.fused = false; sp.fusedImg = null; sp.fusedPanX = 0; sp.fusedPanY = 0; sp.fusedCap = ""; sp.fusedZoom = 1; sp.fusedFit = "cover";
    sp.fusedFilmSim = null; sp.fusedShowFilmSim = false;
    sp.a = freshPage(); sp.b = freshPage();
    buildSpreads(); renderPreview(); scheduleAutoSave();
  });
  headBtns.appendChild(clearBtn);
  head.appendChild(headBtns);
  card.appendChild(head);

  if (sp.fused) {
    buildFusedStage(card, sp, sIdx, pages);
  } else {
    buildSplitStage(card, sp, sIdx, pages);
  }

  spreadsRoot.appendChild(card);
}

function hasSpreadContent(sp) {
  return !!(sp.fusedImg || sp.a.img || sp.b.img);
}

function buildFusedStage(card, sp, sIdx, pages) {
  const stage = document.createElement("div"); stage.className = "spread-stage is-landscape";

  const leftPage = buildPageDiv(sIdx, "left", pages[0], sp.a, sp, true);
  const rightPage = buildPageDiv(sIdx, "right", pages[1], sp.b, sp, true);
  stage.appendChild(leftPage); stage.appendChild(rightPage);

  if (sp.fusedImg) {
    // Single unified overlay handles pan/zoom across the full spread
    addFusedPanOverlay(stage, sp, pages);

    // Delete button for the fused image (above overlay)
    const delBtn = document.createElement("button");
    delBtn.type = "button"; delBtn.className = "page-delete-btn"; delBtn.textContent = "×";
    delBtn.addEventListener("click", e => {
      e.stopPropagation();
      sp.fusedImg = null; sp.fusedPanX = 0; sp.fusedPanY = 0; sp.fusedZoom = 1; sp.fusedFit = "cover";
      buildSpreads(); renderPreview(); scheduleAutoSave();
    });
    stage.appendChild(delBtn);
  }

  card.appendChild(stage);

  const hint = document.createElement("div"); hint.className = "spread-meta";
  const hintSpan = document.createElement("span"); hintSpan.className = "spread-hint";
  hintSpan.textContent = sp.fusedImg ? "Drag or scroll to pan and zoom across spread" : "Upload an image to span both pages";
  hint.appendChild(hintSpan);

  if (sp.fusedImg) {
    const fitWrap = document.createElement("div"); fitWrap.className = "page-fit-row";
    ["cover", "contain"].forEach(val => {
      const b = document.createElement("button"); b.type = "button";
      b.className = "seg-btn sm" + ((sp.fusedFit || "cover") === val ? " active" : "");
      b.textContent = val === "cover" ? "Fill" : "Fit";
      b.addEventListener("click", () => {
        sp.fusedFit = val;
        fitWrap.querySelectorAll(".seg-btn").forEach((btn, i) => btn.classList.toggle("active", ["cover", "contain"][i] === val));
        renderPreview(); scheduleAutoSave();
        const lc = card.querySelector('[data-side="left"] .pg-canvas');
        const rc = card.querySelector('[data-side="right"] .pg-canvas');
        if (lc) drawToThumb(lc, pages[0]);
        if (rc) drawToThumb(rc, pages[1]);
      });
      fitWrap.appendChild(b);
    });
    hint.appendChild(fitWrap);
  }

  card.appendChild(hint);

  if (!sp.fusedImg) {
    const uploadRow = document.createElement("div"); uploadRow.className = "fused-upload";
    const fileInput = document.createElement("input"); fileInput.type = "file"; fileInput.accept = "image/*";
    const lbl = document.createElement("label"); lbl.className = "upload-btn"; lbl.textContent = "Choose photo for merged spread";
    lbl.appendChild(fileInput);
    fileInput.addEventListener("change", async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        sp.fusedImg = await fileToImageWithExif(f);
        sp.fusedFilmSim = sp.fusedImg._filmSim || null; sp.fusedShowFilmSim = !!sp.fusedImg._filmSim;
      } catch(err) { showToast("Not a readable image."); return; }
      buildSpreads(); renderPreview(); scheduleAutoSave();
    });
    addDropZone(uploadRow, async f => {
      try {
        sp.fusedImg = await fileToImageWithExif(f);
        sp.fusedFilmSim = sp.fusedImg._filmSim || null; sp.fusedShowFilmSim = !!sp.fusedImg._filmSim;
      } catch(err) { showToast("Not a readable image."); return; }
      buildSpreads(); renderPreview(); scheduleAutoSave();
    });
    uploadRow.appendChild(lbl); card.appendChild(uploadRow);
  }

  const capRow = document.createElement("div"); capRow.className = "captions";
  const capInput = document.createElement("input"); capInput.type = "text"; capInput.className = "txt";
  capInput.placeholder = "Caption (optional)"; capInput.value = sp.fusedCap; capInput.maxLength = 100;
  capInput.addEventListener("input", () => { sp.fusedCap = capInput.value; renderPreview(); scheduleAutoSave(); });
  capRow.appendChild(capInput); card.appendChild(capRow);
}

function addFusedPanOverlay(stage, sp, pages) {
  const overlay = document.createElement("div");
  overlay.className = "fused-pan-overlay";
  stage.appendChild(overlay);

  let dragging = false, sx = 0, sy = 0, spx = 0, spy = 0;
  let lastPinchDist = null;

  function redrawBoth() {
    const lc = stage.querySelector('[data-side="left"] .pg-canvas');
    const rc = stage.querySelector('[data-side="right"] .pg-canvas');
    if (lc) drawToThumb(lc, pages[0]);
    if (rc) drawToThumb(rc, pages[1]);
    renderPreview();
    scheduleAutoSave();
  }

  overlay.addEventListener("pointerdown", e => {
    if (!sp.fusedImg || e.isPrimary === false) return;
    e.preventDefault(); dragging = true;
    sx = e.clientX; sy = e.clientY;
    spx = sp.fusedPanX; spy = sp.fusedPanY;
    overlay.setPointerCapture(e.pointerId);
    overlay.style.cursor = "grabbing";
  });

  overlay.addEventListener("pointermove", e => {
    if (!dragging || !sp.fusedImg) return;
    const img = sp.fusedImg;
    const rect = stage.getBoundingClientRect();
    const W = rect.width, H = rect.height;
    const zoom = sp.fusedZoom || 1;
    const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight) * zoom;
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    const ox = Math.max(1, (dw - W) / 2), oy = Math.max(1, (dh - H) / 2);
    sp.fusedPanX = Math.max(-1, Math.min(1, spx + (e.clientX - sx) / ox));
    sp.fusedPanY = Math.max(-1, Math.min(1, spy + (e.clientY - sy) / oy));
    redrawBoth();
  });

  const endDrag = () => { dragging = false; overlay.style.cursor = "grab"; };
  overlay.addEventListener("pointerup", endDrag);
  overlay.addEventListener("pointercancel", endDrag);

  overlay.addEventListener("wheel", e => {
    if (!sp.fusedImg) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    sp.fusedZoom = Math.max(0.25, Math.min(4, (sp.fusedZoom || 1) * factor));
    redrawBoth();
  }, { passive: false });

  overlay.addEventListener("touchmove", e => {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (lastPinchDist !== null) {
      sp.fusedZoom = Math.max(0.25, Math.min(4, (sp.fusedZoom || 1) * (dist / lastPinchDist)));
      redrawBoth();
    }
    lastPinchDist = dist;
  }, { passive: false });
  overlay.addEventListener("touchend", () => { lastPinchDist = null; });
  overlay.addEventListener("touchcancel", () => { lastPinchDist = null; });

  addDropZone(overlay, async f => {
    try {
      sp.fusedImg = await fileToImageWithExif(f);
      sp.fusedFilmSim = sp.fusedImg._filmSim || null; sp.fusedShowFilmSim = !!sp.fusedImg._filmSim;
    } catch(err) { showToast("Not a readable image."); return; }
    buildSpreads(); renderPreview(); scheduleAutoSave();
  });
}

function buildSplitStage(card, sp, sIdx, pages) {
  const stage = document.createElement("div"); stage.className = "spread-stage";
  const leftPage = buildPageDiv(sIdx, "left", pages[0], sp.a, sp, false);
  const rightPage = buildPageDiv(sIdx, "right", pages[1], sp.b, sp, false);
  stage.appendChild(leftPage); stage.appendChild(rightPage);
  card.appendChild(stage);

  const meta = document.createElement("div"); meta.className = "spread-meta";
  const hint = document.createElement("span"); hint.className = "spread-hint";
  hint.textContent = "Upload photos for left and right pages, or click Merge for a single spanning image.";
  meta.appendChild(hint); card.appendChild(meta);

  const capRow = document.createElement("div"); capRow.className = "captions";
  ["left","right"].forEach(side => {
    const pg = side === "left" ? sp.a : sp.b;
    const inp = document.createElement("input"); inp.type = "text"; inp.className = "txt";
    inp.placeholder = `${side.charAt(0).toUpperCase()+side.slice(1)} caption`; inp.value = pg.cap; inp.maxLength = 80;
    inp.addEventListener("input", () => { pg.cap = inp.value; renderPreview(); scheduleAutoSave(); });

    // Fit toggle per page
    const fitWrap = document.createElement("div"); fitWrap.className = "page-fit-row";
    ["cover","contain"].forEach(val => {
      const b = document.createElement("button"); b.type = "button";
      b.className = "seg-btn sm" + (pg.fit === val ? " active" : "");
      b.textContent = val === "cover" ? "Fill" : "Fit";
      b.addEventListener("click", () => {
        pg.fit = val; fitWrap.querySelectorAll(".seg-btn").forEach((btn,i) => btn.classList.toggle("active", ["cover","contain"][i] === val));
        renderPreview(); scheduleAutoSave();
      });
      fitWrap.appendChild(b);
    });
    const col = document.createElement("div"); col.className = "cap-col";
    col.appendChild(inp); col.appendChild(fitWrap);
    capRow.appendChild(col);
  });
  card.appendChild(capRow);
}

function buildPageDiv(sIdx, side, pageId, pageData, sp, fused) {
  const div = document.createElement("div"); div.className = "spread-page"; div.dataset.side = side;
  const fileInput = document.createElement("input"); fileInput.type = "file"; fileInput.accept = "image/*";
  fileInput.className = "file-input";

  const canvas = document.createElement("canvas"); canvas.className = "pg-canvas"; canvas.dataset.pageId = pageId; canvas.hidden = true;
  const lbl = document.createElement("label"); lbl.className = "slot-label";
  lbl.innerHTML = `<span class="slot-icon">＋</span><span class="slot-text">Add photo here</span>`;

  div.appendChild(fileInput); div.appendChild(canvas); div.appendChild(lbl);

  // Delete button — only for non-fused pages (fused delete is handled at stage level)
  let deleteBtn = null;
  if (!fused) {
    deleteBtn = document.createElement("button");
    deleteBtn.type = "button"; deleteBtn.className = "page-delete-btn"; deleteBtn.textContent = "×";
    deleteBtn.hidden = true;
    deleteBtn.addEventListener("click", e => {
      e.stopPropagation();
      pageData.img = null; pageData.panX = 0; pageData.panY = 0; pageData.zoom = 1;
      buildSpreads(); renderPreview(); scheduleAutoSave();
    });
    div.appendChild(deleteBtn);
  }

  function refresh() {
    const hasImg = fused ? !!sp.fusedImg : !!pageData.img;
    div.classList.toggle("has-image", hasImg);
    if (deleteBtn) deleteBtn.hidden = !hasImg;
    if (hasImg) {
      canvas.hidden = false;
      requestAnimationFrame(() => drawToThumb(canvas, pageId));
    } else {
      canvas.hidden = true;
    }
  }

  fileInput.addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const img = await fileToImageWithExif(f);
      if (fused) {
        sp.fusedImg = img; sp.fusedFilmSim = img._filmSim || null; sp.fusedShowFilmSim = !!img._filmSim;
        buildSpreads();
      } else {
        pageData.img = img; pageData.filmSim = img._filmSim || null; pageData.showFilmSim = !!img._filmSim;
        if (isLandscape(img) && !sp.fused && !sp.fusedImg) {
          sp.fused = true; sp.fusedImg = img; sp.fusedFilmSim = img._filmSim || null; sp.fusedShowFilmSim = !!img._filmSim;
          buildSpreads();
        } else { refresh(); }
      }
    } catch(err) { showToast("Not a readable image."); return; }
    renderPreview(); scheduleAutoSave();
  });

  addDropZone(div, async f => {
    try {
      const img = await fileToImageWithExif(f);
      if (fused) {
        sp.fusedImg = img; sp.fusedFilmSim = img._filmSim || null; sp.fusedShowFilmSim = !!img._filmSim;
        buildSpreads();
      } else {
        pageData.img = img; pageData.filmSim = img._filmSim || null; pageData.showFilmSim = !!img._filmSim;
        if (isLandscape(img) && !sp.fused) {
          sp.fused = true; sp.fusedImg = img; sp.fusedFilmSim = img._filmSim || null; sp.fusedShowFilmSim = !!img._filmSim;
          buildSpreads();
        } else { refresh(); }
      }
    } catch(err) { showToast("Not a readable image."); }
    renderPreview(); scheduleAutoSave();
  });

  // Pan/zoom for non-fused pages; fused pan is handled by the unified overlay in buildFusedStage
  if (!fused) {
    addPanDrag(canvas,
      () => pageData.img,
      () => [pageData.panX, pageData.panY],
      (nx, ny) => { pageData.panX = nx; pageData.panY = ny; },
      { pageId, getZoom: () => pageData.zoom || 1, setZoom: z => { pageData.zoom = z; } });
  }

  refresh();
  return div;
}

/* ============================================================
   Start Over
   ============================================================ */
function showConfirm(msg, onOk) {
  const overlay = document.getElementById("confirm-overlay");
  overlay.querySelector(".confirm-msg").textContent = msg;
  overlay.hidden = false;
  const ok = overlay.querySelector(".confirm-ok");
  const cancel = overlay.querySelector(".confirm-cancel");
  const close = () => { overlay.hidden = true; ok.onclick = null; cancel.onclick = null; };
  ok.onclick = () => { close(); onOk(); };
  cancel.onclick = close;
}

function startOver() {
  showConfirm("Clear everything and start fresh?", () => {
    Object.assign(state.cover, freshCover());
    Object.assign(state.back, freshCover(), { notes: "", qrLink: "", qrImg: null });
    state.spreads = Array.from({ length: SPREAD_COUNT }, freshSpread);
    spreadOrder = [0, 1, 2];
    state.paper = "letter";
    document.getElementById("paperSize").value = "letter";
    document.getElementById("coverTitle").value = "";
    document.getElementById("coverSubtitle").value = "";
    document.getElementById("coverAuthor").value = "";
    document.getElementById("backTitle").value = "";
    document.getElementById("backSubtitle").value = "";
    document.getElementById("backAuthor").value = "";
    document.getElementById("backNotes").value = "";
    document.getElementById("qrLink").value = "";
    localStorage.removeItem(SAVE_KEY);
    buildCoverControls("cover"); buildCoverControls("back");
    refreshSimpleSlot("cover"); refreshSimpleSlot("back");
    buildSpreads(); renderPreview();
    showToast("Started fresh.");
  });
}

/* ============================================================
   Export
   ============================================================ */
const IMPOSITION = [
  { page: 5, col: 0, row: 0, rot: true },
  { page: 4, col: 1, row: 0, rot: true },
  { page: 3, col: 2, row: 0, rot: true },
  { page: 2, col: 3, row: 0, rot: true },
  { page: 6, col: 0, row: 1, rot: false },
  { page: 7, col: 1, row: 1, rot: false },
  { page: 8, col: 2, row: 1, rot: false },
  { page: 1, col: 3, row: 1, rot: false },
];

function buildSheetCanvas() {
  if (!window.jspdf?.jsPDF) { showToast("PDF library still loading — try again."); return null; }
  const DPI = 300, p = paperInches();
  const u = Math.round((p.w / 4) * DPI), v = Math.round((p.h / 2) * DPI);
  const sheet = document.getElementById("workCanvas");
  sheet.width = u * 4; sheet.height = v * 2;
  const ctx = sheet.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, sheet.width, sheet.height);
  const panel = document.createElement("canvas"); panel.width = u; panel.height = v;
  const pctx = panel.getContext("2d");
  for (const cell of IMPOSITION) {
    pctx.clearRect(0, 0, u, v); renderPage(pctx, 0, 0, u, v, cell.page);
    const px = cell.col * u, py = cell.row * v;
    if (cell.rot) {
      ctx.save(); ctx.translate(px + u / 2, py + v / 2); ctx.rotate(Math.PI);
      ctx.drawImage(panel, -u / 2, -v / 2, u, v); ctx.restore();
    } else { ctx.drawImage(panel, px, py, u, v); }
  }
  return sheet;
}

function generatePDF() {
  const btn = document.getElementById("downloadBtn");
  btn.disabled = true; btn.textContent = "Building…";
  setTimeout(() => {
    try {
      const sheet = buildSheetCanvas(); if (!sheet) return;
      const { jsPDF } = window.jspdf;
      const p = paperInches();
      const doc = new jsPDF({ orientation: "landscape", unit: "in", format: state.paper === "a4" ? "a4" : "letter" });
      doc.addImage(sheet.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, p.w, p.h);
      const name = (state.cover.title || "zine").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g,"") || "zine";
      doc.save(`${name}.pdf`);
      window.goatcounter?.count({ path: "download-pdf", title: "Download PDF", event: true });
      showToast("PDF downloaded — print at 100%, single-sided.");
    } catch(e) { console.error(e); showToast("Something went wrong building the PDF."); }
    finally { btn.disabled = false; btn.textContent = "Download PDF"; }
  }, 30);
}

function generateJPG() {
  const btn = document.getElementById("jpgBtn");
  btn.disabled = true; btn.textContent = "Building…";
  setTimeout(() => {
    try {
      const sheet = buildSheetCanvas(); if (!sheet) return;
      const a = document.createElement("a");
      const name = (state.cover.title || "zine").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g,"") || "zine";
      a.href = sheet.toDataURL("image/jpeg", 0.92);
      a.download = `${name}.jpg`; a.click();
      window.goatcounter?.count({ path: "download-jpg", title: "Download JPG", event: true });
      showToast("JPG downloaded.");
    } catch(e) { showToast("Something went wrong."); }
    finally { btn.disabled = false; btn.textContent = "Save JPG"; }
  }, 30);
}

/* ============================================================
   Toast
   ============================================================ */
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 2600);
}

/* ============================================================
   Init
   ============================================================ */
async function init() {
  buildPreviewSlots();
  buildSpreads();

  // Restore saved state
  const restored = await loadSavedState();
  if (restored) {
    // Sync text inputs with restored state
    document.getElementById("coverTitle").value = state.cover.title || "";
    document.getElementById("coverSubtitle").value = state.cover.subtitle || "";
    document.getElementById("coverAuthor").value = state.cover.author || "";
    document.getElementById("backTitle").value = state.back.title || "";
    document.getElementById("backSubtitle").value = state.back.subtitle || "";
    document.getElementById("backAuthor").value = state.back.author || "";
    document.getElementById("backNotes").value = state.back.notes || "";
    document.getElementById("qrLink").value = state.back.qrLink || "";
    document.getElementById("paperSize").value = state.paper;
    refreshSimpleSlot("cover"); refreshSimpleSlot("back");
    buildSpreads();
  }

  buildCoverControls("cover");
  buildCoverControls("back");
  renderPreview();

  // Paper size
  document.getElementById("paperSize").addEventListener("change", e => {
    state.paper = e.target.value; renderPreview(); scheduleAutoSave();
  });

  // Cover text
  document.getElementById("coverTitle").addEventListener("input", e => { state.cover.title = e.target.value; renderPreview(); scheduleAutoSave(); });
  document.getElementById("coverSubtitle").addEventListener("input", e => { state.cover.subtitle = e.target.value; renderPreview(); scheduleAutoSave(); });
  document.getElementById("coverAuthor").addEventListener("input", e => { state.cover.author = e.target.value; renderPreview(); scheduleAutoSave(); });

  // Back text
  document.getElementById("backTitle").addEventListener("input", e => { state.back.title = e.target.value; renderPreview(); scheduleAutoSave(); });
  document.getElementById("backSubtitle").addEventListener("input", e => { state.back.subtitle = e.target.value; renderPreview(); scheduleAutoSave(); });
  document.getElementById("backAuthor").addEventListener("input", e => { state.back.author = e.target.value; renderPreview(); scheduleAutoSave(); });
  document.getElementById("backNotes").addEventListener("input", e => { state.back.notes = e.target.value; renderPreview(); scheduleAutoSave(); });

  // QR
  document.getElementById("qrLink").addEventListener("input", e => { state.back.qrLink = e.target.value; generateQR(e.target.value); scheduleAutoSave(); });

  // Cover / back file inputs + clears
  document.getElementById("file-cover").addEventListener("change", e => { if (e.target.files[0]) handleSimpleFile("cover", e.target.files[0]); });
  document.getElementById("file-back").addEventListener("change", e => { if (e.target.files[0]) handleSimpleFile("back", e.target.files[0]); });
  document.querySelectorAll(".slot[data-slot] .slot-clear").forEach(btn => {
    btn.addEventListener("click", () => clearSimple(btn.closest(".slot").dataset.slot));
  });

  // Drag & drop on cover/back slots
  addDropZone(document.querySelector('.slot[data-slot="cover"]'), f => handleSimpleFile("cover", f));
  addDropZone(document.querySelector('.slot[data-slot="back"]'), f => handleSimpleFile("back", f));

  // Buttons
  document.getElementById("downloadBtn").addEventListener("click", generatePDF);
  document.getElementById("jpgBtn").addEventListener("click", generateJPG);
  document.getElementById("startOverBtn").addEventListener("click", startOver);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
