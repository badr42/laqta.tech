import { renderAsync } from '@resvg/resvg-js';
import { writeFileSync } from 'fs';

const W = 1200;
const H = 630;

// Scale the 24x24 viewfinder to ~200px
const LOGO_SIZE = 200;
const LOGO_X = W / 2 - LOGO_SIZE / 2;
const LOGO_Y = H / 2 - LOGO_SIZE / 2 - 60;
const S = LOGO_SIZE / 24; // scale factor

function pt(x, y) {
  return `${LOGO_X + x * S},${LOGO_Y + y * S}`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&amp;display=swap');
    </style>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="#111111"/>

  <!-- Subtle vignette -->
  <radialGradient id="vig" cx="50%" cy="50%" r="70%">
    <stop offset="0%" stop-color="#1a1a1a" stop-opacity="0"/>
    <stop offset="100%" stop-color="#000000" stop-opacity="0.6"/>
  </radialGradient>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>

  <!-- Viewfinder logo -->
  <g fill="none" stroke="#ffffff" stroke-width="${2.5 * S}" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="${pt(2,8)} ${pt(2,2)} ${pt(8,2)}"/>
    <polyline points="${pt(16,2)} ${pt(22,2)} ${pt(22,8)}"/>
    <polyline points="${pt(22,16)} ${pt(22,22)} ${pt(16,22)}"/>
    <polyline points="${pt(8,22)} ${pt(2,22)} ${pt(2,16)}"/>
  </g>
  <!-- Center dot -->
  <circle cx="${LOGO_X + 12 * S}" cy="${LOGO_Y + 12 * S}" r="${1.2 * S}" fill="#ffffff"/>

  <!-- laqta.tech -->
  <text
    x="${W / 2}"
    y="${LOGO_Y + LOGO_SIZE + 68}"
    font-family="'Space Grotesk', sans-serif"
    font-weight="700"
    font-size="64"
    fill="#ffffff"
    text-anchor="middle"
    letter-spacing="-1"
  >laqta.tech</text>

  <!-- Tagline -->
  <text
    x="${W / 2}"
    y="${LOGO_Y + LOGO_SIZE + 112}"
    font-family="'Space Grotesk', sans-serif"
    font-weight="400"
    font-size="26"
    fill="#888888"
    text-anchor="middle"
    letter-spacing="0.5"
  >8-page printable zine maker</text>
</svg>`;

const png = await renderAsync(svg, {
  font: { loadSystemFonts: true },
  fitTo: { mode: 'width', value: W },
});

writeFileSync('public/og-image.png', png.asPng());
console.log('Generated public/og-image.png');
