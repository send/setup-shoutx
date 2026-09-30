'use strict';

const zlib = require('node:zlib');
const { ensure, LIMITS } = require('./policy.cjs');

function zero(bytes) { return bytes.every(b => b === 0); }
function ascii(bytes) { ensure(bytes.every(b => b > 0 && b < 128)); return bytes.toString('ascii'); }
function inflate(bytes, maximum) {
  const result = zlib.inflateRawSync(bytes, { maxOutputLength: Math.max(1, maximum), info: true });
  ensure(result.buffer.length <= maximum); return result;
}
function gunzip(bytes) {
  ensure(bytes.length >= 18 && bytes[0] === 31 && bytes[1] === 139 && bytes[2] === 8);
  const flags = bytes[3]; ensure((flags & 0xe0) === 0);
  let pos = 10;
  if (flags & 4) { ensure(pos + 2 <= bytes.length); pos += 2 + bytes.readUInt16LE(pos); }
  for (const flag of [8, 16]) if (flags & flag) { const end = bytes.indexOf(0, pos); ensure(end >= pos); pos = end + 1; }
  if (flags & 2) { ensure(pos + 2 <= bytes.length); ensure((zlib.crc32(bytes.subarray(0, pos)) & 0xffff) === bytes.readUInt16LE(pos)); pos += 2; }
  ensure(pos <= bytes.length - 8);
  const r = inflate(bytes.subarray(pos), LIMITS.expanded); const trailer = pos + r.engine.bytesWritten;
  ensure(trailer + 8 === bytes.length);
  ensure(zlib.crc32(r.buffer) === bytes.readUInt32LE(trailer) && r.buffer.length === bytes.readUInt32LE(trailer + 4));
  return r.buffer;
}
function collector(root, executable) {
  const files = new Set([`${root}/${executable}`, `${root}/README.md`, `${root}/LICENSE`]);
  const seen = new Set(); let binary;
  return {
    add(name, directory, bytes) {
      ensure(!seen.has(name)); seen.add(name);
      if (directory) ensure(name === `${root}/` && bytes.length === 0);
      else { ensure(files.has(name)); if (name === `${root}/${executable}`) { ensure(bytes.length > 0); binary = bytes; } }
    },
    finish() { ensure([...files].every(name => seen.has(name)) && binary); return binary; },
  };
}
function octal(field) {
  ensure(field.every(b => b === 0 || b === 32 || (b >= 48 && b <= 55)));
  const value = field.toString('ascii'); ensure(/^[ ]*[0-7]*[\x00 ]*$/.test(value));
  const number = parseInt(value.replace(/[\x00 ]/g, '') || '0', 8); ensure(Number.isSafeInteger(number)); return number;
}
function tar(bytes, root, executable) {
  const data = gunzip(bytes); const members = collector(root, executable); let pos = 0;
  ensure(data.length % 512 === 0);
  while (pos + 512 <= data.length) {
    const h = data.subarray(pos, pos + 512);
    if (zero(h)) {
      ensure(pos + 1024 <= data.length && zero(data.subarray(pos)));
      return members.finish();
    }
    const checksum = h.reduce((sum, b, i) => sum + (i >= 148 && i < 156 ? 32 : b), 0);
    ensure(checksum === octal(h.subarray(148, 156)));
    ensure(h.subarray(257, 265).equals(Buffer.from([117, 115, 116, 97, 114, 0, 48, 48])) || h.subarray(257, 265).equals(Buffer.from('ustar  \0')));
    ensure(zero(h.subarray(157, 257)) && zero(h.subarray(345, 500)));
    const end = h.indexOf(0); const n = end < 0 || end >= 100 ? 100 : end;
    ensure(zero(h.subarray(n, 100))); const name = ascii(h.subarray(0, n));
    const kind = h[156]; ensure(kind === 0 || kind === 48 || kind === 53);
    const size = octal(h.subarray(124, 136)); const start = pos + 512; const next = start + Math.ceil(size / 512) * 512;
    ensure(size <= LIMITS.expanded && next <= data.length && zero(data.subarray(start + size, next)));
    members.add(name, kind === 53, data.subarray(start, start + size)); pos = next;
  }
  throw new Error('invalid archive');
}
function zip(bytes, root, executable) {
  ensure(bytes.length >= 22); const e = bytes.length - 22;
  ensure(bytes.readUInt32LE(e) === 0x06054b50 && bytes.readUInt16LE(e + 20) === 0);
  ensure(bytes.readUInt16LE(e + 4) === 0 && bytes.readUInt16LE(e + 6) === 0);
  const count = bytes.readUInt16LE(e + 10); ensure(count >= 3 && count <= 4 && bytes.readUInt16LE(e + 8) === count);
  const centralSize = bytes.readUInt32LE(e + 12); const centralStart = bytes.readUInt32LE(e + 16);
  ensure(centralStart + centralSize === e);
  const members = collector(root, executable); const spans = []; let c = centralStart; let expanded = 0;
  for (let i = 0; i < count; i++) {
    ensure(c + 46 <= e && bytes.readUInt32LE(c) === 0x02014b50);
    const flags = bytes.readUInt16LE(c + 8); const method = bytes.readUInt16LE(c + 10);
    ensure((flags & ~0x806) === 0 && (method === 0 || method === 8) && (method !== 0 || (flags & 6) === 0));
    const crc = bytes.readUInt32LE(c + 16); const compressed = bytes.readUInt32LE(c + 20); const size = bytes.readUInt32LE(c + 24);
    const length = bytes.readUInt16LE(c + 28); const local = bytes.readUInt32LE(c + 42);
    ensure(bytes.readUInt16LE(c + 30) === 0 && bytes.readUInt16LE(c + 32) === 0 && bytes.readUInt16LE(c + 34) === 0);
    ensure(c + 46 + length <= e && local + 30 <= centralStart && bytes.readUInt32LE(local) === 0x04034b50);
    const nameBytes = bytes.subarray(c + 46, c + 46 + length); const name = ascii(nameBytes);
    const mode = bytes.readUInt32LE(c + 38); const type = (mode >>> 16) & 0xf000; const directory = name.endsWith('/');
    ensure(type === 0 || type === (directory ? 0x4000 : 0x8000));
    ensure(!(mode & 0x10) || directory);
    ensure(bytes.readUInt16LE(local + 28) === 0 && bytes.readUInt16LE(local + 26) === length);
    // Version, flags, compression, timestamp, CRC, and both sizes must agree.
    ensure(bytes.subarray(local + 4, local + 26).equals(bytes.subarray(c + 6, c + 28)));
    const start = local + 30 + length; const end = start + compressed;
    ensure(end <= centralStart && bytes.subarray(local + 30, start).equals(nameBytes));
    expanded += size; ensure(expanded <= LIMITS.expanded);
    let data;
    if (method === 0) { ensure(compressed === size); data = bytes.subarray(start, end); }
    else { const r = inflate(bytes.subarray(start, end), size); ensure(r.engine.bytesWritten === compressed); data = r.buffer; }
    ensure(data.length === size && zlib.crc32(data) === crc);
    members.add(name, directory, data); spans.push([local, end]); c += 46 + length;
  }
  ensure(c === e); spans.sort((a, b) => a[0] - b[0]); let pos = 0;
  for (const [start, end] of spans) { ensure(start === pos); pos = end; }
  ensure(pos === centralStart); return members.finish();
}
function extract(bytes, root, target) {
  ensure(Buffer.isBuffer(bytes) && bytes.length <= LIMITS.archive);
  return target.extension === 'zip' ? zip(bytes, root, target.executable) : tar(bytes, root, target.executable);
}
module.exports = { extract };
