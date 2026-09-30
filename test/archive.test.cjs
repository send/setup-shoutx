'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const z = require('node:zlib');
const { extract } = require('../src/archive.cjs');
const f = require('./fixtures.cjs');
const root='shoutx-v0.3.0-rc.1-target';
const posix={extension:'tar.gz',executable:'shoutx'}; const windows={extension:'zip',executable:'shoutx.exe'};
test('independent TAR and ZIP fixtures, optional root and compression',()=>{
  for (const dir of [false,true]) {
    const entries=f.files(root); if(dir) entries.unshift({name:`${root}/`,type:'5'});
    assert.equal(extract(f.tar(entries),root,posix).toString(),'fixture');
    for(const method of [0,8]) {
      const entries=f.files(root,'shoutx.exe').map(e=>({...e,method})); if(dir) entries.unshift({name:`${root}/`,method});
      assert.equal(extract(f.zip(entries),root,windows).toString(),'fixture');
    }
  }
});
test('reject path aliases, unexpected entries, duplicates, links and directory payload',()=>{
  for(const [pack,target,exe] of [[f.tar,posix,'shoutx'],[f.zip,windows,'shoutx.exe']]) {
    for(const name of [`../${exe}`,`/${exe}`,`${root}/../${exe}`,`${root}/SHOUTX`,`${root}/extra`]) {
      const entries=f.files(root,exe); entries[0].name=name; assert.throws(()=>extract(pack(entries),root,target));
    }
    const entries=f.files(root,exe);
    for(const addition of [entries[0],{name:`${root}/`,data:Buffer.from('x'),type:'5'}]) assert.throws(()=>extract(pack([...entries,addition]),root,target));
    assert.throws(()=>extract(pack(entries.slice(1)),root,target));
    assert.throws(()=>extract(pack([...entries,{name:`${root}/`,type:'5'},{name:`${root}/`,type:'5'}]),root,target));
  }
  for(const type of ['1','2','3','4','6','x','g','L','K']) { const entries=f.files(root); entries[0].type=type; assert.throws(()=>extract(f.tar(entries),root,posix)); }
  const entries=f.files(root,'shoutx.exe'); entries[0].mode=0xa1ff0000; assert.throws(()=>extract(f.zip(entries),root,windows));
});
test('TAR raw metadata, checksum, padding, and gzip framing',()=>{
  const original=f.tarRaw(f.files(root));
  for(const offset of [157,345,499,100,257]) { const b=Buffer.from(original); b[offset]=65; if(offset!==100)f.checksum(b.subarray(0,512)); assert.throws(()=>extract(z.gzipSync(b),root,posix)); }
  const number=Buffer.from(original); number[124]=0x80; f.checksum(number.subarray(0,512)); assert.throws(()=>extract(z.gzipSync(number),root,posix));
  const pad=Buffer.from(original); pad[520]=1; assert.throws(()=>extract(z.gzipSync(pad),root,posix));
  const packed=f.tar(f.files(root));
  for(const bytes of [packed.subarray(0,-1),Buffer.concat([packed,packed]),Buffer.concat([packed,Buffer.from([0])]),z.gzipSync(original.subarray(0,-512))]) assert.throws(()=>extract(bytes,root,posix));
  const corrupt=Buffer.from(packed); corrupt[corrupt.length-8]^=1; assert.throws(()=>extract(corrupt,root,posix));
});
test('ZIP rejects metadata disagreement, encryption, descriptors, extras, ZIP64 and trailing bytes',()=>{
  const original=f.zip(f.files(root,'shoutx.exe')); const cd=original.readUInt32LE(original.length-6);
  for(const [offset,value,width] of [[6,1,2],[6,8,2],[28,1,2],[30,65,1],[cd+30,1,2],[cd+32,1,2],[cd+34,1,2],[cd+20,0xffffffff,4],[cd+24,0xffffffff,4],[cd+42,1,4],[original.length-18,1,2],[original.length-2,1,2]]) {
    const bytes=Buffer.from(original); if(width===1)bytes[offset]=value; else if(width===2)bytes.writeUInt16LE(value,offset); else bytes.writeUInt32LE(value,offset);
    assert.throws(()=>extract(bytes,root,windows),String(offset));
  }
  for(const bytes of [original.subarray(0,-1),Buffer.concat([original,Buffer.from([0])]),Buffer.concat([Buffer.from([0]),original])]) assert.throws(()=>extract(bytes,root,windows));
  for(const flag of [1,8,64,0x2000]) {const b=Buffer.from(original);b.writeUInt16LE(flag,6);b.writeUInt16LE(flag,cd+8);assert.throws(()=>extract(b,root,windows));}
  const method=Buffer.from(original);method.writeUInt16LE(12,8);method.writeUInt16LE(12,cd+10);assert.throws(()=>extract(method,root,windows));
  assert.throws(()=>extract(f.zip([...f.files(root,'shoutx.exe'),{name:`${root}/x`},{name:`${root}/y`}]),root,windows));
});
test('gzip optional headers, CRC and reserved flags',()=>{
  const packed=f.tar(f.files(root));const header=Buffer.from(packed.subarray(0,10));header[3]=4|8|16|2;
  const optional=Buffer.concat([header,Buffer.from([2,0,42,43]),Buffer.from('filename\0comment\0')]);
  const crc=Buffer.alloc(2);crc.writeUInt16LE(z.crc32(optional)&0xffff);
  const valid=Buffer.concat([optional,crc,packed.subarray(10)]);
  assert.equal(extract(valid,root,posix).toString(),'fixture');
  const invalid=Buffer.from(valid);invalid[optional.length]^=1;assert.throws(()=>extract(invalid,root,posix));
  const reserved=Buffer.from(packed);reserved[3]=0x80;assert.throws(()=>extract(reserved,root,posix));
});
