/**
 * Just enough PNG for the build scripts, on node:zlib alone: read 8-bit RGB / RGBA (non-interlaced),
 * write RGBA, or an indexed PNG when the picture has 256 colours or fewer.
 * Images are { width, height, data } with data as RGBA bytes, the shape a canvas ImageData has.
 */
import { deflateSync, inflateSync } from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function unfilter(raw, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      else if (filter !== 0) throw new Error(`bad PNG filter ${filter}`);
      out[y * stride + x] = v & 255;
    }
  }
  return out;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  let off = 8;
  let ihdr;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') ihdr = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const [depth, colorType, , , interlace] = ihdr.subarray(8, 13);
  if (depth !== 8 || (colorType !== 6 && colorType !== 2) || interlace !== 0) {
    throw new Error(`unsupported PNG (depth ${depth}, colour type ${colorType}, interlace ${interlace})`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const px = unfilter(inflateSync(Buffer.concat(idat)), width, height, bpp);
  if (bpp === 4) return { width, height, data: px };
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < px.length; i += 3, j += 4) data.set([px[i], px[i + 1], px[i + 2], 255], j);
  return { width, height, data };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, body) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const tb = Buffer.concat([Buffer.from(type, 'latin1'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tb));
  return Buffer.concat([len, tb, crc]);
}

/** Deflated rows: per-row adaptive filters or none at all, whichever is smaller (tiny icons favour none). */
function idat(px, width, height, bpp) {
  const stride = width * bpp;
  const plain = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) px.copy(plain, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const a = deflateSync(filterRows(px, width, height, bpp), { level: 9 });
  const b = deflateSync(plain, { level: 9 });
  return a.length <= b.length ? a : b;
}

/** Per row, the filter with the smallest sum of absolute residuals (the usual heuristic). */
function filterRows(px, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(height * (stride + 1));
  const cand = Array.from({ length: 5 }, () => Buffer.alloc(stride));
  for (let y = 0; y < height; y++) {
    let best = 0;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const v = px[y * stride + x];
        const a = x >= bpp ? px[y * stride + x - bpp] : 0;
        const b = y > 0 ? px[(y - 1) * stride + x] : 0;
        const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
        const r = (v - [0, a, b, (a + b) >> 1, paeth(a, b, c)][f]) & 255;
        cand[f][x] = r;
        score += r < 128 ? r : 256 - r;
      }
      if (score < bestScore) [best, bestScore] = [f, score];
    }
    out[y * (stride + 1)] = best;
    cand[best].copy(out, y * (stride + 1) + 1);
  }
  return out;
}

function ihdr(width, height, colorType, depth = 8) {
  const b = Buffer.alloc(13);
  b.writeUInt32BE(width, 0);
  b.writeUInt32BE(height, 4);
  b.set([depth, colorType, 0, 0, 0], 8);
  return b;
}

/** RGBA, or indexed (with tRNS only when something is see-through) when ≤ 256 colours and `indexed` allows it. */
export function encodePng({ width, height, data }, { indexed = true } = {}) {
  const colors = new Map();
  for (let i = 0; i < data.length && colors.size <= 256; i += 4) {
    const key = data.readUInt32BE(i);
    if (!colors.has(key)) colors.set(key, colors.size);
  }
  if (indexed && colors.size <= 256) {
    const keys = [...colors.keys()];
    const plte = Buffer.alloc(keys.length * 3);
    const trns = Buffer.alloc(keys.length);
    keys.forEach((k, i) => {
      plte.set([k >>> 24, (k >>> 16) & 255, (k >>> 8) & 255], i * 3);
      trns[i] = k & 255;
    });
    const px = Buffer.alloc(width * height);
    for (let i = 0, j = 0; j < px.length; i += 4, j++) px[j] = colors.get(data.readUInt32BE(i));
    const opaque = trns.every((a) => a === 255);
    return Buffer.concat([
      SIG,
      chunk('IHDR', ihdr(width, height, 3)),
      chunk('PLTE', plte),
      ...(opaque ? [] : [chunk('tRNS', trns)]),
      chunk('IDAT', idat(px, width, height, 1)),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
  return Buffer.concat([
    SIG,
    chunk('IHDR', ihdr(width, height, 6)),
    chunk('IDAT', idat(data, width, height, 4)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);
  const dir = [];
  let offset = 6 + 16 * entries.length;
  for (const { size, png } of entries) {
    const e = Buffer.alloc(16);
    e[0] = size;
    e[1] = size;
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    dir.push(e);
  }
  return Buffer.concat([header, ...dir, ...entries.map((p) => p.png)]);
}

export const blank = (width, height) => ({ width, height, data: Buffer.alloc(width * height * 4) });
