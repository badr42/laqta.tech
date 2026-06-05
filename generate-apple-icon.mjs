import { renderAsync } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'fs';

const SIZE = 180;

const svg = readFileSync('public/favicon.svg', 'utf8')
  .replace('<svg ', `<svg width="${SIZE}" height="${SIZE}" `);

const png = await renderAsync(svg, {
  font: { loadSystemFonts: false },
  fitTo: { mode: 'width', value: SIZE },
});

writeFileSync('public/apple-touch-icon.png', png.asPng());
console.log('Generated public/apple-touch-icon.png');
