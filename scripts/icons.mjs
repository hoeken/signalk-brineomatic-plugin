/**
 * Generates the full icon set in ../public/icons from ../assets/icon.png
 * (a square, full-bleed PNG ≥ 512px). Standalone dev-only step — the outputs
 * are committed to git; re-run only when the source icon changes:
 *   npm run icons
 *
 * Outputs:
 *   favicon.ico            16/32/48 multi-size (browser tabs, legacy)
 *   favicon-16.png, -32.png  <link rel="icon"> in index.html
 *   apple-touch-icon.png   180×180, iOS home-screen bookmark
 *   icon-192.png, -512.png manifest.webmanifest (Android home screen) and
 *                          the SignalK admin UI webapp card (signalk.appIcon)
 *
 * The source is full-bleed with the artwork inside the central ~80%, so the
 * same files serve as both "any" and "maskable" manifest icons — no padded
 * variant is generated.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "assets", "icon.png");
const out = join(here, "..", "public", "icons");

mkdirSync(out, { recursive: true });

const png = (size) => sharp(src).resize(size, size).png().toBuffer();

async function writePng(name, size) {
  writeFileSync(join(out, name), await png(size));
  console.log(`wrote ${name} (${size}x${size})`);
}

/**
 * Build an ICO container around PNG-compressed entries. PNG-in-ICO is
 * supported by every browser we target and is much smaller than uncompressed
 * BMP entries.
 */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // image type: icon
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, buf } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size, 0); // width  (0 would mean 256; we stay below)
    e.writeUInt8(size, 1); // height
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += buf.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.buf)]);
}

await writePng("favicon-16.png", 16);
await writePng("favicon-32.png", 32);
await writePng("apple-touch-icon.png", 180);
await writePng("icon-192.png", 192);
await writePng("icon-512.png", 512);

const icoImages = [];
for (const size of [16, 32, 48]) {
  icoImages.push({ size, buf: await png(size) });
}
writeFileSync(join(out, "favicon.ico"), ico(icoImages));
console.log("wrote favicon.ico (16/32/48)");
