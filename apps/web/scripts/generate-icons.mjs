/**
 * PWA ikonlarini uretir (PRD §11).
 *
 * Bagimlilik eklememek icin PNG'ler saf Node ile (zlib + CRC32) yazilir.
 * Kaynak tasarim `public/icons/icon.svg` ile ayni: mavi yuvarlatilmis kare uzerinde
 * bilgisayara giden yukari ok.
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

const BRAND_FROM = [59, 130, 246]; // #3b82f6
const BRAND_TO = [29, 78, 216]; // #1d4ed8

/* ----------------------------- PNG yazici ----------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ------------------------------ tasarim ------------------------------- */

/** Ok + tabla sekli; koordinatlar [-1, 1] araliginda, Y yukari pozitif. */
function isGlyph(x, y) {
  if (Math.abs(x) <= 0.17 && y >= -0.3 && y <= 0.46) return true; // govde
  if (y >= 0.46 && y <= 0.95 && Math.abs(x) <= 0.95 - y) return true; // ok basi
  if (y >= -0.86 && y <= -0.62 && Math.abs(x) <= 0.78) return true; // tabla
  if (y >= -0.62 && y <= -0.44 && Math.abs(x) >= 0.6 && Math.abs(x) <= 0.78) return true; // ayaklar
  return false;
}

function insideRoundedSquare(u, v, radius) {
  const dx = Math.max(radius - u, 0, u - (1 - radius));
  const dy = Math.max(radius - v, 0, v - (1 - radius));
  if (dx === 0 || dy === 0) return true;
  return dx * dx + dy * dy <= radius * radius;
}

function renderIcon(size, { maskable = false, opaque = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const samples = 3;
  const radius = 0.22;
  const glyphScale = maskable ? 0.3 : 0.36; // maskable'da guvenli alan icin daha kucuk

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let bgHits = 0;
      let glyphHits = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const u = (px + (sx + 0.5) / samples) / size;
          const v = (py + (sy + 0.5) / samples) / size;
          const inBackground = maskable || opaque ? true : insideRoundedSquare(u, v, radius);
          if (inBackground) bgHits += 1;
          const gx = (u - 0.5) / glyphScale;
          const gy = (0.5 - v) / glyphScale;
          if (inBackground && isGlyph(gx, gy)) glyphHits += 1;
        }
      }
      const total = samples * samples;
      const bgAlpha = bgHits / total;
      const glyphAlpha = glyphHits / total;

      const t = (px / size + py / size) / 2;
      const bg = BRAND_FROM.map((from, index) => Math.round(from + (BRAND_TO[index] - from) * t));
      const r = Math.round(bg[0] * (1 - glyphAlpha) + 255 * glyphAlpha);
      const g = Math.round(bg[1] * (1 - glyphAlpha) + 255 * glyphAlpha);
      const b = Math.round(bg[2] * (1 - glyphAlpha) + 255 * glyphAlpha);

      const offset = (py * size + px) * 4;
      rgba[offset] = r;
      rgba[offset + 1] = g;
      rgba[offset + 2] = b;
      rgba[offset + 3] = Math.round(bgAlpha * 255);
    }
  }
  return encodePng(size, size, rgba);
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="PhoneShare">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3b82f6"/>
      <stop offset="1" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="113" fill="url(#g)"/>
  <g fill="#ffffff">
    <path d="M256 42 L344 148 L288 148 L288 311 L224 311 L224 148 L168 148 Z"/>
    <path d="M113 361 h286 v44 h-286 z"/>
    <path d="M113 405 h33 v33 h-33 z M366 405 h33 v33 h-33 z"/>
  </g>
</svg>
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "icon.svg"), SVG, "utf8");
writeFileSync(join(OUT_DIR, "icon-192.png"), renderIcon(192));
writeFileSync(join(OUT_DIR, "icon-512.png"), renderIcon(512));
writeFileSync(join(OUT_DIR, "icon-maskable-512.png"), renderIcon(512, { maskable: true }));
// iOS ana ekran ikonu seffaflik desteklemez; tam dolu uretilir.
writeFileSync(join(OUT_DIR, "apple-touch-icon.png"), renderIcon(180, { opaque: true }));

console.log(`PWA ikonlari uretildi: ${OUT_DIR}`);
