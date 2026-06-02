"use strict";

/* ============================================================
   Little Zine — all processing happens here, in the browser.
   8 pages from one single-sided sheet:
     page 1 = front cover
     pages 2-3, 4-5, 6-7 = three interior spreads
     page 8 = back cover
   A landscape photo dropped on a spread is auto-split across
   its two facing pages.
   ============================================================ */

const SPREADS = [
  { id: 0, pages: [2, 3] },
  { id: 1, pages: [4, 5] },
  { id: 2, pages: [6, 7] },
];

// Treat anything noticeably wider than tall as "landscape".
const LANDSCAPE_RATIO = 1.15;

const state = {
  paper: "letter",
  cover: { title: "", subtitle: "", author: "", img: null },
  back: { text: "", img: null },
  // each spread: split flag, a spanning source image, or two portrait pages
  spreads: SPREADS.map(() => ({
    split: true,
    source: null, // HTMLImageElement when a wide photo spans the spread
    wideCap: "",
    a: { img: null, cap: "" }, // left page
    b: { img: null, cap: "" }, // right page
  })),
};

/* ---------- paper geometry (landscape sheet) ---------- */
function paperInches() {
  return state.paper === "a4"
    ? { w: 11.69, h: 8.27 }
    : { w: 11.0, h: 8.5 };
}
// page (panel) aspect ratio = (sheetW/4) : (sheetH/2)
function pageAspect() {
  const p = paperInches();
  return (p.w / 4) / (p.h / 2);
}

/* ---------- image helpers ---------- */
function fileToImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("Not an image"));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}
function isLandscape(img) {
  return img.naturalWidth >= img.naturalHeight * LANDSCAPE_RATIO;
}

// cover-fit a whole image into a single page rect
function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

// cover-fit a wide image across a 2-page spread, drawing only one half
function drawSpanHalf(ctx, img, x, y, u, v, side) {
  const W = 2 * u, H = v;
  const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const ox = (W - dw) / 2;
  const oy = (H - dh) / 2;
  const shift = side === "right" ? -u : 0;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, u, v);
  ctx.clip();
  ctx.drawImage(img, x + ox + shift, y + oy, dw, dh);
  ctx.restore();
}

/* ---------- text helpers ---------- */
function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
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
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  lines.forEach((ln, i) => {
    ctx.fillText(ln, x + pad, y + h - boxH + pad + i * fs * 1.25);
  });
}

/* ---------- page model ---------- */
function pageModel(pageId) {
  if (pageId === 1) return { type: "cover" };
  if (pageId === 8) return { type: "back" };
  const sIndex = Math.floor((pageId - 2) / 2);
  const side = (pageId - 2) % 2 === 0 ? "left" : "right";
  return { type: "spread", spread: state.spreads[sIndex], side };
}

/* ---------- the single renderer (used by preview + PDF) ---------- */
function renderPage(ctx, x, y, w, h, pageId) {
  // page background
  ctx.fillStyle = "#fafaf7";
  ctx.fillRect(x, y, w, h);

  const m = pageModel(pageId);

  if (m.type === "cover") {
    if (state.cover.img) drawCover(ctx, state.cover.img, x, y, w, h);
    drawCoverText(ctx, x, y, w, h, !!state.cover.img);
    return;
  }

  if (m.type === "back") {
    if (state.back.img) drawCover(ctx, state.back.img, x, y, w, h);
    drawBackText(ctx, x, y, w, h, !!state.back.img);
    return;
  }

  // spread page
  const sp = m.spread;
  if (sp.source && sp.split) {
    drawSpanHalf(ctx, sp.source, x, y, w, h, m.side);
    if (m.side === "right") caption(ctx, sp.wideCap, x, y, w, h);
  } else {
    const page = m.side === "left" ? sp.a : sp.b;
    if (page.img) {
      drawCover(ctx, page.img, x, y, w, h);
      caption(ctx, page.cap, x, y, w, h);
    } else {
      // empty page placeholder (only visible in PDF if left blank)
      ctx.fillStyle = "#ececea";
      ctx.fillRect(x, y, w, h);
    }
  }
}

function drawCoverText(ctx, x, y, w, h, overImage) {
  const { title, subtitle, author } = state.cover;
  if (overImage && (title || subtitle || author)) {
    const grad = ctx.createLinearGradient(0, y + h * 0.45, 0, y + h);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.75)");
    ctx.fillStyle = grad;
    ctx.fillRect(x, y + h * 0.45, w, h * 0.55);
  }
  ctx.textAlign = "center";
  const cx = x + w / 2;
  const ink = overImage ? "#ffffff" : "#18181b";
  const sub = overImage ? "rgba(255,255,255,0.85)" : "#52525b";
  const pad = w * 0.08;

  if (overImage) {
    // anchored near the bottom over the gradient
    let cy = y + h - h * 0.07;
    if (author) {
      ctx.fillStyle = sub;
      ctx.font = `500 ${Math.round(h * 0.032)}px -apple-system, Helvetica, Arial, sans-serif`;
      ctx.textBaseline = "bottom";
      ctx.fillText(author, cx, cy);
      cy -= h * 0.05;
    }
    if (subtitle) {
      ctx.fillStyle = sub;
      ctx.font = `500 ${Math.round(h * 0.034)}px -apple-system, Helvetica, Arial, sans-serif`;
      ctx.textBaseline = "bottom";
      drawCentered(ctx, subtitle, cx, cy, w - pad * 2, h * 0.04);
      cy -= h * 0.055;
    }
    if (title) {
      ctx.fillStyle = ink;
      const fs = Math.round(h * 0.082);
      ctx.font = `700 ${fs}px -apple-system, Helvetica, Arial, sans-serif`;
      ctx.textBaseline = "bottom";
      cy -= drawCenteredUp(ctx, title, cx, cy, w - pad * 2, fs);
    }
  } else {
    // centered on a blank cover
    let cy = y + h * 0.42;
    if (title) {
      ctx.fillStyle = ink;
      const fs = Math.round(h * 0.085);
      ctx.font = `700 ${fs}px -apple-system, Helvetica, Arial, sans-serif`;
      ctx.textBaseline = "top";
      cy = drawCentered(ctx, title, cx, cy, w - pad * 2, fs) + h * 0.01;
    }
    if (subtitle) {
      ctx.fillStyle = sub;
      const fs = Math.round(h * 0.036);
      ctx.font = `500 ${fs}px -apple-system, Helvetica, Arial, sans-serif`;
      ctx.textBaseline = "top";
      cy = drawCentered(ctx, subtitle, cx, cy, w - pad * 2, fs) + h * 0.02;
    }
    if (author) {
      ctx.fillStyle = sub;
      ctx.font = `500 ${Math.round(h * 0.032)}px -apple-system, Helvetica, Arial, sans-serif`;
      ctx.textBaseline = "bottom";
      ctx.fillText(author, cx, y + h - h * 0.06);
    }
  }
}

// draw wrapped centered text downward; returns y after last line
function drawCentered(ctx, text, cx, top, maxW, fs) {
  const lines = wrapText(ctx, text, maxW);
  lines.forEach((ln, i) => ctx.fillText(ln, cx, top + i * fs * 1.18));
  return top + lines.length * fs * 1.18;
}
// draw wrapped centered text anchored at a bottom baseline; returns height used
function drawCenteredUp(ctx, text, cx, bottom, maxW, fs) {
  const lines = wrapText(ctx, text, maxW);
  const lh = fs * 1.12;
  lines.forEach((ln, i) => {
    const yy = bottom - (lines.length - 1 - i) * lh;
    ctx.fillText(ln, cx, yy);
  });
  return lines.length * lh;
}

function drawBackText(ctx, x, y, w, h, overImage) {
  const text = state.back.text;
  if (!text) return;
  const pad = w * 0.1;
  const fs = Math.round(h * 0.03);
  ctx.font = `500 ${fs}px -apple-system, Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const lines = wrapText(ctx, text, w - pad * 2).slice(0, 8);
  const blockH = lines.length * fs * 1.35;
  let top = y + h - blockH - h * 0.08;
  if (overImage) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x, top - h * 0.03, w, blockH + h * 0.06);
    ctx.fillStyle = "#fff";
  } else {
    top = y + h * 0.4;
    ctx.fillStyle = "#52525b";
  }
  lines.forEach((ln, i) => ctx.fillText(ln, x + w / 2, top + i * fs * 1.35));
}

/* ============================================================
   UI: build spreads, wire inputs
   ============================================================ */
const spreadsRoot = document.getElementById("spreads");

function buildSpreads() {
  SPREADS.forEach((s) => {
    const card = document.createElement("article");
    card.className = "spread-card";
    card.innerHTML = `
      <div class="spread-head">
        <h2>Spread <span class="page-tag">pages ${s.pages[0]}–${s.pages[1]}</span></h2>
        <button class="spread-clear" type="button" data-spread="${s.id}" hidden>Clear</button>
      </div>
      <div class="spread-stage" data-spread="${s.id}">
        <div class="spread-page" data-side="left">
          <input type="file" accept="image/*" class="file-input" data-spread="${s.id}" data-side="left" />
          <canvas class="pg-canvas" hidden></canvas>
          <label class="slot-label"><span class="slot-icon">＋</span><span class="slot-text">Left page</span></label>
        </div>
        <div class="spread-page" data-side="right">
          <input type="file" accept="image/*" class="file-input" data-spread="${s.id}" data-side="right" />
          <canvas class="pg-canvas" hidden></canvas>
          <label class="slot-label"><span class="slot-icon">＋</span><span class="slot-text">Right page</span></label>
        </div>
      </div>
      <div class="spread-meta">
        <span class="spread-hint">Drop a wide (landscape) photo to fill both pages.</span>
      </div>
      <div class="captions">
        <input class="txt" type="text" placeholder="Left caption" data-cap="left" data-spread="${s.id}" maxlength="80" />
        <input class="txt" type="text" placeholder="Right caption" data-cap="right" data-spread="${s.id}" maxlength="80" />
      </div>
    `;
    spreadsRoot.appendChild(card);
  });
}

/* ---------- spread upload handling ---------- */
async function handleSpreadFile(spreadId, side, file) {
  let img;
  try {
    img = await fileToImage(file);
  } catch (e) {
    showToast("That file isn't a readable image.");
    return;
  }
  const sp = state.spreads[spreadId];
  if (isLandscape(img) && sp.split) {
    // wide photo → spans both pages, auto-split
    sp.source = img;
    sp.a.img = null;
    sp.b.img = null;
    showToast("Landscape photo split across both pages.");
  } else {
    // portrait/square → fills just this page
    sp.source = null;
    if (side === "left") sp.a.img = img;
    else sp.b.img = img;
  }
  refreshSpread(spreadId);
  renderPreview();
}

function clearSpread(spreadId) {
  const sp = state.spreads[spreadId];
  sp.source = null;
  sp.a.img = null;
  sp.b.img = null;
  refreshSpread(spreadId);
  renderPreview();
}

function refreshSpread(spreadId) {
  const sp = state.spreads[spreadId];
  const stage = spreadsRoot.querySelector(`.spread-stage[data-spread="${spreadId}"]`);
  const clearBtn = spreadsRoot.querySelector(`.spread-clear[data-spread="${spreadId}"]`);
  const spanning = !!(sp.source && sp.split);
  stage.classList.toggle("is-landscape", spanning);

  const hasAny = spanning || sp.a.img || sp.b.img;
  clearBtn.hidden = !hasAny;

  const captionRow = stage.parentElement.querySelector(".captions");
  captionRow.classList.toggle("single", spanning);

  ["left", "right"].forEach((side) => {
    const pageEl = stage.querySelector(`.spread-page[data-side="${side}"]`);
    const canvas = pageEl.querySelector(".pg-canvas");
    const input = pageEl.querySelector(".file-input");
    const pageId = SPREADS[spreadId].pages[side === "left" ? 0 : 1];

    const filled = spanning || (side === "left" ? sp.a.img : sp.b.img);
    pageEl.classList.toggle("has-image", !!filled);
    // when spanning, the right input is redundant; keep left input active to replace
    input.disabled = spanning && side === "right";

    if (filled) {
      drawToThumb(canvas, pageId);
      canvas.hidden = false;
    } else {
      canvas.hidden = true;
    }
  });

  // hide right caption when spanning
  const rightCap = stage.parentElement.querySelector('input[data-cap="right"]');
  const leftCap = stage.parentElement.querySelector('input[data-cap="left"]');
  if (spanning) {
    rightCap.style.display = "none";
    leftCap.placeholder = "Caption";
  } else {
    rightCap.style.display = "";
    leftCap.placeholder = "Left caption";
  }
}

/* draw a page into a thumbnail canvas sized to its display box */
function drawToThumb(canvas, pageId) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  let cssW = rect.width, cssH = rect.height;
  if (!cssW || !cssH) {
    // fall back to page aspect at a sensible size
    cssW = 300;
    cssH = cssW / pageAspect();
  }
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderPage(ctx, 0, 0, cssW, cssH, pageId);
}

/* ============================================================
   Cover / back uploads
   ============================================================ */
async function handleSimpleFile(which, file) {
  let img;
  try {
    img = await fileToImage(file);
  } catch (e) {
    showToast("That file isn't a readable image.");
    return;
  }
  state[which].img = img;
  refreshSimpleSlot(which);
  renderPreview();
}
function clearSimple(which) {
  state[which].img = null;
  refreshSimpleSlot(which);
  renderPreview();
}
function refreshSimpleSlot(which) {
  const slot = document.querySelector(`.slot[data-slot="${which}"]`);
  const clearBtn = slot.querySelector(".slot-clear");
  let canvas = slot.querySelector("canvas");
  if (state[which].img) {
    if (!canvas) {
      canvas = document.createElement("canvas");
      slot.insertBefore(canvas, slot.querySelector(".slot-clear"));
    }
    slot.classList.add("has-image");
    clearBtn.hidden = false;
    drawToThumb(canvas, which === "cover" ? 1 : 8);
  } else {
    slot.classList.remove("has-image");
    clearBtn.hidden = true;
    if (canvas) canvas.remove();
  }
}

/* ============================================================
   Booklet preview (reading order: 1..8)
   ============================================================ */
const bookletRoot = document.getElementById("bookletPreview");
function buildPreviewSlots() {
  for (let p = 1; p <= 8; p++) {
    const mini = document.createElement("div");
    mini.className = "mini";
    mini.dataset.page = p;
    const c = document.createElement("canvas");
    mini.appendChild(c);
    const num = document.createElement("span");
    num.className = "mini-num";
    num.textContent = p;
    mini.appendChild(num);
    bookletRoot.appendChild(mini);
  }
}
function renderPreview() {
  bookletRoot.querySelectorAll(".mini").forEach((mini) => {
    const p = Number(mini.dataset.page);
    const canvas = mini.querySelector("canvas");
    drawToThumb(canvas, p);
  });
}

/* ============================================================
   PDF generation (client-side imposition)
   single-sided sheet, 4 cols x 2 rows:
     bottom row (upright): 6 7 8 1
     top row (rot 180):    5 4 3 2
   ============================================================ */
const IMPOSITION = [
  // {page, col, row(0=top), rotate}
  { page: 5, col: 0, row: 0, rot: true },
  { page: 4, col: 1, row: 0, rot: true },
  { page: 3, col: 2, row: 0, rot: true },
  { page: 2, col: 3, row: 0, rot: true },
  { page: 6, col: 0, row: 1, rot: false },
  { page: 7, col: 1, row: 1, rot: false },
  { page: 8, col: 2, row: 1, rot: false },
  { page: 1, col: 3, row: 1, rot: false },
];

function generatePDF() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    showToast("PDF library still loading — try again in a moment.");
    return;
  }
  const btn = document.getElementById("downloadBtn");
  btn.disabled = true;
  btn.textContent = "Building…";

  // Defer so the button state paints before the heavy work.
  setTimeout(() => {
    try {
      const DPI = 300;
      const p = paperInches();
      const u = Math.round((p.w / 4) * DPI); // panel width px
      const v = Math.round((p.h / 2) * DPI); // panel height px
      const sheetW = u * 4;
      const sheetH = v * 2;

      const sheet = document.getElementById("workCanvas");
      sheet.width = sheetW;
      sheet.height = sheetH;
      const ctx = sheet.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sheetW, sheetH);

      // render each page to an offscreen panel canvas, then place it
      const panel = document.createElement("canvas");
      panel.width = u;
      panel.height = v;
      const pctx = panel.getContext("2d");

      for (const cell of IMPOSITION) {
        pctx.clearRect(0, 0, u, v);
        renderPage(pctx, 0, 0, u, v, cell.page);
        const px = cell.col * u;
        const py = cell.row * v;
        if (cell.rot) {
          ctx.save();
          ctx.translate(px + u / 2, py + v / 2);
          ctx.rotate(Math.PI);
          ctx.drawImage(panel, -u / 2, -v / 2, u, v);
          ctx.restore();
        } else {
          ctx.drawImage(panel, px, py, u, v);
        }
      }

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "in",
        format: state.paper === "a4" ? "a4" : "letter",
      });
      const imgData = sheet.toDataURL("image/jpeg", 0.92);
      doc.addImage(imgData, "JPEG", 0, 0, p.w, p.h);
      const name = (state.cover.title || "little-zine")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "little-zine";
      doc.save(`${name}.pdf`);
      showToast("PDF downloaded — print at 100%, single-sided.");
    } catch (e) {
      console.error(e);
      showToast("Something went wrong building the PDF.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Download PDF";
    }
  }, 30);
}

/* ============================================================
   Toast
   ============================================================ */
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

/* ============================================================
   Wire up
   ============================================================ */
function init() {
  buildSpreads();
  buildPreviewSlots();

  // paper size
  document.getElementById("paperSize").addEventListener("change", (e) => {
    state.paper = e.target.value;
    // aspect ratios change slightly; re-render everything
    document.querySelectorAll(".spread-page .pg-canvas").forEach((c) => {
      if (!c.hidden) {
        const stage = c.closest(".spread-stage");
        const sId = Number(stage.dataset.spread);
        refreshSpread(sId);
      }
    });
    refreshSimpleSlot("cover");
    refreshSimpleSlot("back");
    renderPreview();
  });

  // cover text
  document.getElementById("coverTitle").addEventListener("input", (e) => {
    state.cover.title = e.target.value;
    renderPreview();
  });
  document.getElementById("coverSubtitle").addEventListener("input", (e) => {
    state.cover.subtitle = e.target.value;
    renderPreview();
  });
  document.getElementById("coverAuthor").addEventListener("input", (e) => {
    state.cover.author = e.target.value;
    renderPreview();
  });
  document.getElementById("backText").addEventListener("input", (e) => {
    state.back.text = e.target.value;
    renderPreview();
  });

  // cover / back file inputs + clears
  document.getElementById("file-cover").addEventListener("change", (e) => {
    if (e.target.files[0]) handleSimpleFile("cover", e.target.files[0]);
  });
  document.getElementById("file-back").addEventListener("change", (e) => {
    if (e.target.files[0]) handleSimpleFile("back", e.target.files[0]);
  });
  document.querySelectorAll(".slot[data-slot] .slot-clear").forEach((btn) => {
    btn.addEventListener("click", () => {
      const which = btn.closest(".slot").dataset.slot;
      clearSimple(which);
    });
  });

  // spread inputs (event delegation)
  spreadsRoot.addEventListener("change", (e) => {
    const input = e.target;
    if (!input.classList.contains("file-input")) return;
    if (!input.files[0]) return;
    handleSpreadFile(Number(input.dataset.spread), input.dataset.side, input.files[0]);
  });
  spreadsRoot.addEventListener("click", (e) => {
    if (e.target.classList.contains("spread-clear")) {
      clearSpread(Number(e.target.dataset.spread));
    }
  });
  spreadsRoot.addEventListener("input", (e) => {
    if (!e.target.dataset.cap) return;
    const sId = Number(e.target.dataset.spread);
    const side = e.target.dataset.cap;
    const sp = state.spreads[sId];
    if (sp.source && sp.split) {
      sp.wideCap = e.target.value;
    } else if (side === "left") {
      sp.a.cap = e.target.value;
    } else {
      sp.b.cap = e.target.value;
    }
    renderPreview();
  });

  document.getElementById("downloadBtn").addEventListener("click", generatePDF);

  renderPreview();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
