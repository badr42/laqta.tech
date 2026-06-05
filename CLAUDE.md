# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running locally

```bash
node server.js          # serves public/ at http://localhost:8080
```

No `npm install` needed for running the app — `server.js` has zero dependencies. The `devDependencies` (resvg-js, jimp) are only for the OG image generator.

```bash
npm install             # only needed before running generate-og.mjs
node generate-og.mjs    # regenerates public/og-image.png
```

## Deployment (production)

The live site runs on a Droplet behind nginx as a reverse proxy. The systemd unit and nginx config are `laqta-tech.service` and `laqta.tech.nginx` at the repo root. After pushing changes, restart the service:

```bash
sudo systemctl restart laqta-tech
```

Docker is also supported: `docker build -t littlezine . && docker run -d -p 80:8080 littlezine`

## Architecture

This is a **no-build, no-framework** project. There is no bundler, no transpilation, and no node_modules in the browser.

**Server (`server.js`):** Zero-dependency Node static file server. Serves everything from `public/`. Does nothing else — all real work is client-side.

**Client (`public/app.js` + `public/index.html` + `public/styles.css`):** A single vanilla-JS application. State lives in a plain `state` object. The rendering pipeline draws pages onto HTML `<canvas>` elements via the 2D Canvas API — there is no virtual DOM or reactive framework.

### Core data model

```
state.cover     — front cover (title, subtitle, author, image, pan/zoom, style opts)
state.back      — back cover (same as cover + notes, qrLink, qrImg)
state.spreads[] — array of 3 spreads, each with:
    .fused       — bool: one landscape image spanning both pages
    .fusedImg    — the spanning image
    .a / .b      — left/right page objects (img, cap, fit, panX/Y, zoom)
spreadOrder[]   — [0,1,2] permutation; drag-to-reorder shuffles this
```

### Rendering pipeline

- `renderPage(ctx, x, y, w, h, pageId)` — draws a single page onto any canvas context. Used both for the interactive editor thumbnails and for the high-DPI export canvas.
- `drawToThumb(canvas, pageId)` — scales `renderPage` to a specific canvas element using devicePixelRatio.
- `renderPreview()` — redraws all 8 mini thumbnails in the booklet preview sidebar.
- `buildSheetCanvas()` — renders all 8 pages at 300 DPI onto a single sheet canvas using the imposition layout (top row rotated 180°), then jsPDF converts it to a downloadable PDF.

### UI construction pattern

All editor UI is built imperatively with `document.createElement` in JS — there are no HTML templates for the dynamic sections. The two main builders are:
- `buildSpreads()` / `buildSpreadCard()` — rebuilds the entire spreads section from `state.spreads`
- `buildCoverControls(which)` — rebuilds the style controls panel under the cover/back slots

### Imposition layout

The PDF uses a 4×2 panel layout. The `IMPOSITION` array in `app.js` maps each of the 8 pages to a grid position, with `rot: true` for panels that must be printed upside-down (so the booklet reads correctly after folding).

### External CDN scripts

Three libraries are loaded via CDN at runtime (no local copies):
- **jsPDF** — PDF generation
- **QRCode.js** — QR code canvas generation for the back cover link field  
- **exifr** — reads Fujifilm EXIF `FilmMode` tag from uploaded images

### Cache-busting

`index.html` references `app.js?v=N` and `styles.css?v=N`. Increment `N` in both the `<link>` and `<script>` tags when deploying changes that need to bypass browser caches.

### Auto-save

State is serialized to `localStorage` under the key `laqta-zine-v2` on a 500 ms debounce after any change. Images are stored as base64 data URLs. On load, `loadSavedState()` restores the full session.
