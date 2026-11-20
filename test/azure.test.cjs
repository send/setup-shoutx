'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { installAzure } = require('../src/azure.cjs');
const { files, tar } = require('./fixtures.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'setup-azure-'));
  t.after(() => fs.rm(root, {recursive:true, force:true}));
  return {AGENT_OS:'Linux', AGENT_OSARCHITECTURE:'X64', AGENT_TEMPDIRECTORY:root, SHOUTX_VERSION:'1.0.1-rc.1'};
}
const runtime = {platform:'linux', arch:'x64'};

test('Azure host rejects unsupported selections and unsafe temp roots before download or output', async t => {
  const env = await fixture(t);
  const fail = () => assert.fail('unexpected side effect');
  let called = false;
  const client = {download:() => { called = true; fail(); }};
  for (const patch of [{SHOUTX_VERSION:'1.0.0'}, {AGENT_OS:'Darwin'}, {AGENT_OSARCHITECTURE:'ARM64'},
    {AGENT_TEMPDIRECTORY:'/tmp/percent%20'}, {AGENT_TEMPDIRECTORY:'/tmp/path\nline'}, {SHOUTX_CHECKSUMS_SHA256:'invalid'}]) {
    await assert.rejects(installAzure({...env, ...patch}, runtime, client, fail));
  }
  assert.equal(called, false);
});

test('Azure default selects its own archive and registers the verified directory once', {skip:process.platform === 'win32'}, async t => {
  const env = await fixture(t);
  const root = 'shoutx-azure-pipelines-v1.0.1-rc.1-x86_64-unknown-linux-musl';
  const script = Buffer.from('#!/bin/sh\necho "shoutx 1.0.1-rc.1"\n');
  const client = {download:async selection => {
    assert.equal(selection.filename, root + '.tar.gz');
    return tar(files(root, 'shoutx', script));
  }};
  const records = [];
  await installAzure(env, runtime, client, record => records.push(record));
  const [directory] = await fs.readdir(env.AGENT_TEMPDIRECTORY);
  assert.deepEqual(records, [`##vso[task.prependpath]${path.join(env.AGENT_TEMPDIRECTORY, directory)}\n`]);
  assert.deepEqual(await fs.readdir(path.join(env.AGENT_TEMPDIRECTORY, directory)), ['shoutx']);
});

test('failed Azure install cleans up and emits no PATH record', async t => {
  const env = await fixture(t);
  const target = process.platform === 'win32' ? {platform:'win32', arch:'x64'} : runtime;
  if (target.platform === 'win32') env.AGENT_OS = 'Windows_NT';
  const records = [];
  const client = {download:async () => Buffer.from('invalid archive')};
  await assert.rejects(installAzure(env, target, client, record => records.push(record)));
  assert.deepEqual(records, []);
  assert.deepEqual(await fs.readdir(env.AGENT_TEMPDIRECTORY), []);
});
