// Branded app-icon generator (ESM — matches the project's "type": "module").
// Produces a white circle on milk-blue (#1e40af) as:
//   public/apple-touch-icon.png  (180x180) — Apple touch icon
//   public/icon-512.png          (512x512) — PWA "any maskable" icon
// Run once with `node .tmp/make_touch_icon.js` whenever the brand mark changes.

import fs from 'fs';
import zlib from 'zlib';
import { Buffer } from 'buffer';

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function createPng(width, height) {
  const w = Buffer.alloc(4);
  w.writeUInt32BE(width, 0);
  const h = Buffer.alloc(4);
  h.writeUInt32BE(height, 0);
  // 8-bit depth, RGBA colour type, default compression/filter/interlace.
  const ihdr = Buffer.concat([w, h, Buffer.from([8, 6, 0, 0, 0])]);

  const pixels = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    pixels[offset++] = 0; // filter byte per scanline
    for (let x = 0; x < width; x++) {
      const dx = x - width / 2;
      const dy = y - height / 2;
      const inside = dx * dx + dy * dy <= (width * 0.38) * (width * 0.38);
      const [r, g, b, a] = inside ? [255, 255, 255, 255] : [30, 64, 175, 255];
      pixels[offset++] = r;
      pixels[offset++] = g;
      pixels[offset++] = b;
      pixels[offset++] = a;
    }
  }

  const compressed = zlib.deflateSync(pixels);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.writeFileSync('public/apple-touch-icon.png', createPng(180, 180));
fs.writeFileSync('public/icon-512.png', createPng(512, 512));
console.log('wrote public/apple-touch-icon.png (180x180) and public/icon-512.png (512x512)');
