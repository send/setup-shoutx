'use strict';
const z = require('node:zlib');
const crypto = require('node:crypto');
function hash(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
function checksum(h) { h.fill(32, 148, 156); const sum = [...h].reduce((a,b) => a+b, 0); h.write(sum.toString(8).padStart(6, '0') + '\0 ',148,8,'ascii'); }
function tarRaw(entries) {
  const blocks = [];
  for (const { name, data = Buffer.alloc(0), type = '0' } of entries) {
    const h = Buffer.alloc(512); h.write(name); h.write('0000755\0',100); h.write('0000000\0',108); h.write('0000000\0',116);
    h.write(data.length.toString(8).padStart(11,'0')+'\0',124); h.write('00000000000\0',136); h.write(type,156);
    Buffer.from([117,115,116,97,114,0,48,48]).copy(h,257); checksum(h);
    blocks.push(h,data,Buffer.alloc((512-data.length%512)%512));
  }
  return Buffer.concat([...blocks,Buffer.alloc(1024)]);
}
function tar(entries) { return z.gzipSync(tarRaw(entries)); }
function zip(entries) {
  const locals = []; const central = []; let offset = 0;
  for (const {name,data=Buffer.alloc(0),method=8,mode=0} of entries) {
    const n = Buffer.from(name); const packed = method === 8 ? z.deflateRawSync(data) : data; const crc = z.crc32(data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20,4); h.writeUInt16LE(method,8);
    h.writeUInt32LE(crc,14); h.writeUInt32LE(packed.length,18); h.writeUInt32LE(data.length,22); h.writeUInt16LE(n.length,26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50); c.writeUInt16LE(0x314,4); h.copy(c,6,4,26);
    c.writeUInt16LE(n.length,28); c.writeUInt32LE(mode>>>0,38); c.writeUInt32LE(offset,42);
    locals.push(h,n,packed); central.push(c,n); offset += h.length+n.length+packed.length;
  }
  const cd = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length,8); end.writeUInt16LE(entries.length,10); end.writeUInt32LE(cd.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,cd,end]);
}
function files(root, exe='shoutx', data=Buffer.from('fixture')) { return [{name:`${root}/${exe}`,data},{name:`${root}/README.md`,data:Buffer.from('readme')},{name:`${root}/LICENSE`,data:Buffer.from('license')}]; }
module.exports = { hash, checksum, tarRaw, tar, zip, files };
