# Little Zine

A free, browser-based **8-page mini-zine maker**. Add photos, type a cover, and
download a print-ready PDF. Print it single-sided on one sheet, fold, make one
cut, and you have a little booklet.

Inspired by [dirtylittlezine.com](https://dirtylittlezine.com/), with one extra
trick: **drop a landscape photo on a spread and it's automatically split across
the two facing pages.**

## How it's built

- **Everything runs in the browser.** Photo splitting/resizing (Canvas) and PDF
  generation (jsPDF) happen client-side. Photos never touch the server.
- **The server only serves static files.** `server.js` is a zero-dependency Node
  static file server, so it sits idle and uses almost no CPU/RAM — fine on the
  smallest droplet, or skip it entirely with a static-site host.
- **Mobile friendly.** Responsive layout; "add photo" opens the camera roll on
  phones.

## The zine layout

8 pages from one single-sided sheet:

| Page | Content |
|------|---------|
| 1 | Front cover (title, subtitle, author, optional photo) |
| 2–3 | Interior spread |
| 4–5 | Interior spread |
| 6–7 | Interior spread |
| 8 | Back cover (credits/notes, optional photo) |

Each spread takes either two portrait photos (one per page) or one landscape
photo that gets split down the middle across both pages.

The PDF uses the standard one-sheet, single-cut imposition (4×2 panels; the top
row is rotated 180°). Print at **100% / actual size, single-sided**, then follow
the fold-and-cut steps in the app.

## Run locally

```bash
node server.js
# open http://localhost:8080
```

No `npm install` needed — there are no server dependencies. (Requires Node 18+.)

## Deploy on DigitalOcean

Because the app is just static files, pick whichever is cheapest/simplest:

### Option A — App Platform (Static Site) — lowest cost, no server to manage

1. Push this repo to GitHub.
2. DigitalOcean → **Apps → Create App** → pick the repo.
3. Set the component type to **Static Site**.
4. **Output / source directory:** `public`
5. No build command needed.
6. Deploy. DigitalOcean serves the files from its CDN — your origin does zero work.

### Option B — Droplet with Docker — if you want your own box

On the smallest ($4–6/mo) droplet:

```bash
# one-time
git clone <your-repo> littlezine && cd littlezine
docker build -t littlezine .
docker run -d --restart unless-stopped -p 80:8080 --name littlezine littlezine
```

Update later with:

```bash
git pull && docker build -t littlezine . && \
docker rm -f littlezine && \
docker run -d --restart unless-stopped -p 80:8080 --name littlezine littlezine
```

### Option C — Droplet with plain Node + nginx

```bash
# run the app (e.g. under pm2 or a systemd unit)
PORT=8080 node server.js
```

Then put nginx in front as a reverse proxy on port 80/443 (add TLS with
certbot). The Node process stays idle since all work is client-side.

## Customising

- **Name/branding:** edit `.brand-name` text in `public/index.html` and the
  `<title>`.
- **Colors/typography:** CSS variables at the top of `public/styles.css`.
- **Paper sizes:** US Letter and A4 are supported via the selector; geometry is
  in `paperInches()` in `public/app.js`.
- **Offline / no-CDN:** jsPDF currently loads from a CDN (so the server does no
  work). To self-host, download `jspdf.umd.min.js` into `public/` and point the
  `<script src>` in `index.html` at it.
