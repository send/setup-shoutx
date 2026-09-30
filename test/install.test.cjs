'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const { spawnSync }=require('node:child_process');
const { install, verifyBinary }=require('../src/install.cjs');
const f=require('./fixtures.cjs');
const runtime={os:process.platform,arch:process.arch};
async function fixture(t) {
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'setup-shoutx-test-'));t.after(()=>fs.rm(tmp,{recursive:true,force:true}));
  const paths=path.join(tmp,'path');const output=path.join(tmp,'output');await fs.writeFile(paths,'');await fs.writeFile(output,'');
  return {tmp,paths,output,env:{RUNNER_TEMP:tmp,GITHUB_PATH:paths,GITHUB_OUTPUT:output,RUNNER_OS:{linux:'Linux',darwin:'macOS',win32:'Windows'}[process.platform],RUNNER_ARCH:process.arch==='arm64'?'ARM64':'X64','INPUT_SHOUTX-VERSION':'0.3.0-rc.1'}};
}
test('invalid inputs or command files fail before network and leave files unchanged',async t=>{
  const f=await fixture(t);let calls=0;const client={download:async()=>{calls++;throw new Error('::error::secret');}};
  for(const patch of [{'INPUT_SHOUTX-VERSION':'latest'},{RUNNER_ARCH:'invalid'},{GITHUB_PATH:''},{GITHUB_PATH:f.tmp},{GITHUB_PATH:path.join(f.tmp,'missing')},{GITHUB_OUTPUT:f.paths},{NODE_OPTIONS:'--require secret'},{'INPUT_CHECKSUMS-SHA256':'bad'},{'INPUT_GITHUB-TOKEN':'secret😀'}]) {
    await assert.rejects(install({...f.env,...patch},runtime,client));
    assert.equal(await fs.readFile(f.paths,'utf8'),'');assert.equal(await fs.readFile(f.output,'utf8'),'');
  }
  assert.equal(calls,0);
  await assert.rejects(install(f.env,runtime,client));assert.equal(calls,1);
  assert.deepEqual((await fs.readdir(f.tmp)).sort(),['output','path']);
});
test('invalid archives leave no installation or output',async t=>{
  const x=await fixture(t);const client={download:async()=>({bytes:Buffer.from('::error::secret'),root:'bad'})};
  await assert.rejects(install(x.env,runtime,client));
  assert.equal(await fs.readFile(x.paths,'utf8'),'');assert.equal(await fs.readFile(x.output,'utf8'),'');
  assert.deepEqual((await fs.readdir(x.tmp)).sort(),['output','path']);
});
test('failed native execution cleans up installation on every OS',async t=>{
  const x=await fixture(t);const win=process.platform==='win32';
  const target=require('../src/policy.cjs').platform(runtime.os,runtime.arch,x.env);
  const root=`shoutx-v0.3.0-rc.1-${target.target}`;
  const entries=f.files(root,target.executable,Buffer.from('invalid executable ::error::secret'));
  const client={download:async()=>({bytes:(win?f.zip:f.tar)(entries),root})};
  await assert.rejects(install({...x.env,SystemRoot:process.env.SystemRoot},runtime,client));
  assert.equal(await fs.readFile(x.paths,'utf8'),'');assert.equal(await fs.readFile(x.output,'utf8'),'');
  assert.deepEqual((await fs.readdir(x.tmp)).sort(),['output','path']);
});
test('symlink command files are rejected before network', {skip:process.platform==='win32'},async t=>{
  const x=await fixture(t);const link=path.join(x.tmp,'link');await fs.symlink(x.paths,link);
  let calls=0;await assert.rejects(install({...x.env,GITHUB_PATH:link},runtime,{download:async()=>{calls++;}}));assert.equal(calls,0);
});
test('successful installation closes stdin, uses minimal environment, emits only file records', {skip:process.platform==='win32'},async t=>{
  const x=await fixture(t);const root='shoutx-v0.3.0-rc.1-x86_64-unknown-linux-musl';
  const script=Buffer.from('#!/bin/sh\nread ignored && exit 3\n[ -z "$SECRET" ] || exit 4\nprintf "shoutx 0.3.0-rc.1\\n"\n');
  const client={download:async()=>({bytes:f.tar(f.files(root,'shoutx',script)),root})};
  await install({...x.env,RUNNER_OS:'Linux',RUNNER_ARCH:'X64',SECRET:'::error::secret'},{os:'linux',arch:'x64'},client);
  assert.equal(await fs.readFile(x.output,'utf8'),'version=0.3.0-rc.1\n');
  const directory=(await fs.readFile(x.paths,'utf8')).trimEnd();assert.equal(path.dirname(directory),x.tmp);
  assert.deepEqual(await fs.readdir(directory),['shoutx']);assert.equal((await fs.stat(path.join(directory,'shoutx'))).mode&0o777,0o755);
});
test('wrong version, child stderr, excessive output, crash and timeout reject', {skip:process.platform==='win32'},async t=>{
  const x=await fixture(t);const binary=path.join(x.tmp,'child');
  for(const source of ['printf "wrong\\n"','printf "::error::secret\\n" >&2','yes x','exit 2','while :; do :; done']) {
    await fs.writeFile(binary,`#!/bin/sh\n${source}\n`,{mode:0o755});
    await assert.rejects(verifyBinary(binary,'0.3.0-rc.1','linux',{}));
  }
});
test('shipped launcher emits one fixed diagnostic and no untrusted bytes',async t=>{
  const x=await fixture(t);const launcher=path.join(__dirname,'../dist/index.cjs');
  for(const patch of [{'INPUT_SHOUTX-VERSION':'::error::secret\n'},{GITHUB_PATH:'::error::secret'},{'INPUT_GITHUB-TOKEN':'secret\r\n::error::evil'},{GITHUB_OUTPUT:''}]) {
    const result=spawnSync(process.execPath,[launcher],{env:{...process.env,...x.env,...patch},encoding:'utf8',timeout:15000});
    assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr,'setup-shoutx: installation failed\n');
  }
  await fs.copyFile(launcher,path.join(x.tmp,'index.cjs'));
  for(const body of [null,'throw new Error("::error::secret");','module.exports.install=()=>Promise.reject(new Error("secret"));','module.exports.install=()=>{setImmediate(()=>{throw new Error("secret")})};']) {
    if(body!==null) await fs.writeFile(path.join(x.tmp,'bundle.cjs'),body);
    const result=spawnSync(process.execPath,[path.join(x.tmp,'index.cjs')],{env:{...process.env,...x.env},encoding:'utf8',timeout:15000});
    assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr,'setup-shoutx: installation failed\n');
  }
  await fs.writeFile(path.join(x.tmp,'bundle.cjs'),'process.emitWarning("::error::secret"); module.exports.install=()=>{};');
  const warning=spawnSync(process.execPath,[path.join(x.tmp,'index.cjs')],{encoding:'utf8',timeout:15000});
  assert.equal(warning.status,0);assert.equal(warning.stdout,'');assert.equal(warning.stderr,'');
});
