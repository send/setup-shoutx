'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { createClient } = require('../src/client.cjs');
const { hash } = require('./fixtures.cjs');
function transport(responses, calls = []) {
  return (url, options, callback) => {
    calls.push({url:url.href,headers:options.headers});
    const req=new EventEmitter(); req.destroy=()=>{};
    req.end=()=>queueMicrotask(()=>{
      const spec=responses.shift(); if(!spec){req.emit('error',new Error('::error::secret'));return;}
      const res=new PassThrough(); res.statusCode=spec.status||200; res.headers=spec.headers||{}; callback(res);
      if(spec.aborted) res.emit('aborted'); else res.end(spec.body||'');
    }); return req;
  };
}
function releaseFixture() {
  const filename='shoutx-v0.3.0-rc.1-x86_64-unknown-linux-musl.tar.gz'; const archive=Buffer.from('fixture');
  const sums=Buffer.from(`${hash(archive)}  ${filename}\n`);
  const asset=(name,bytes)=>({name,state:'uploaded',size:bytes.length,digest:`sha256:${hash(bytes)}`,browser_download_url:`https://github.com/send/shoutx/releases/download/v0.3.0-rc.1/${name}`});
  const repo={id:1381947214,full_name:'send/shoutx'};
  const release={tag_name:'v0.3.0-rc.1',draft:false,immutable:true,assets:[asset('SHA256SUMS',sums),asset(filename,archive)]};
  return {repo,release,sums,archive};
}
function responses(f) {return [{body:JSON.stringify(f.repo)},{body:JSON.stringify(f.release)},{body:f.sums},{body:f.archive}];}
const target={target:'x86_64-unknown-linux-musl',extension:'tar.gz'};
test('metadata identity and two independent digest constraints',async()=>{
  const f=releaseFixture();const calls=[];
  const result=await createClient(transport(responses(f),calls)).download('0.3.0-rc.1',target,'secret',hash(f.sums));
  assert.deepEqual(result.bytes,f.archive); assert.equal(calls.length,4);
  assert.ok(calls.slice(0,2).every(c=>c.headers.authorization==='Bearer secret'));
  assert.ok(calls.slice(2).every(c=>!c.headers.authorization));
});
test('reject identity, mutable releases, duplicate assets, URLs and digest corruption',async()=>{
  for(const mutate of [f=>f.repo.id++,f=>f.repo.full_name='other/shoutx',f=>f.release.immutable=false,f=>f.release.draft=true,f=>f.release.tag_name='v0.3.0',f=>f.release.assets.push(f.release.assets[0]),f=>f.release.assets[0].browser_download_url='https://evil.example',f=>f.release.assets[0].digest='sha256:'+'0'.repeat(64),f=>f.release.assets[1].digest='sha256:'+'0'.repeat(64),f=>f.release.assets[0].state='new',f=>f.sums=Buffer.from('::error::secret'),f=>f.archive=Buffer.from('different')]) {
    const f=releaseFixture();mutate(f);await assert.rejects(createClient(transport(responses(f))).download('0.3.0-rc.1',target,'',''));
  }
  const f=releaseFixture();await assert.rejects(createClient(transport(responses(f))).download('0.3.0-rc.1',target,'','0'.repeat(64)));
});
test('redirects strip credentials even on API origin and prohibit downgrade',async()=>{
  for(const location of ['https://api.github.com/next','https://cdn.example/next']) {
    const calls=[]; const c=createClient(transport([{status:302,headers:{location}},{body:'ok'}],calls));
    assert.equal((await c.get('https://api.github.com/start',100,'secret')).toString(),'ok');
    assert.equal(calls[0].headers.authorization,'Bearer secret');assert.equal(calls[1].headers.authorization,undefined);
  }
  for(const location of ['http://cdn.example','https://user:pass@cdn.example','https://cdn.example/#fragment']) await assert.rejects(createClient(transport([{status:302,headers:{location}}])).get('https://api.github.com/start',10,'secret'));
  const loop=Array.from({length:6},()=>({status:302,headers:{location:'/loop'}}));await assert.rejects(createClient(transport(loop)).get('https://api.github.com/start',10));
});
test('bounded bodies, rate limits, encoding, abort and truncation fail closed',async()=>{
  for(const response of [{status:429},{status:403},{status:500},{body:'12345'},{headers:{'content-length':'5'},body:'12345'},{headers:{'content-length':'3'},body:'12'},{headers:{'content-length':'NaN'}},{headers:{'content-encoding':'gzip'}},{aborted:true}]) await assert.rejects(createClient(transport([response])).get('https://api.github.com/start',4));
});
test('a stalled request has an absolute deadline',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const c=createClient(()=>{const req=new EventEmitter();req.end=()=>{};req.destroy=()=>{};return req;});
  const failure=assert.rejects(c.get('https://api.github.com/start',10));
  t.mock.timers.tick(30001);await failure;
});
