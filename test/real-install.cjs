'use strict';
// CI-only process-level checks using the literal shipped entry and real endpoints.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const env = { ...process.env, 'INPUT_SHOUTX-VERSION': '0.3.0-rc.1',
  'INPUT_GITHUB-TOKEN': process.env.GH_TOKEN,
  'INPUT_CHECKSUMS-SHA256': '0'.repeat(64) };
const beforePath = fs.readFileSync(env.GITHUB_PATH); const beforeOutput = fs.readFileSync(env.GITHUB_OUTPUT);
let result = spawnSync(process.execPath, [path.join(__dirname, '../dist/index.cjs')], {env, encoding:'utf8', timeout:150000});
assert.equal(result.status, 1); assert.equal(result.stdout, '');
assert.equal(result.stderr, 'setup-shoutx: installation failed\n');
assert.deepEqual(fs.readFileSync(env.GITHUB_PATH),beforePath); assert.deepEqual(fs.readFileSync(env.GITHUB_OUTPUT),beforeOutput);
env['INPUT_CHECKSUMS-SHA256'] = 'b280ecb4122b02c0961638c0eb84bae6932af55193c3ea9ae2aa2b02ef8afa99';
result = spawnSync(process.execPath, [path.join(__dirname, '../dist/index.cjs')], {env, encoding:'utf8', timeout:150000});
assert.equal(result.status, 0); assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
const directory=fs.readFileSync(env.GITHUB_PATH,'utf8').slice(beforePath.length).trimEnd();
assert.equal(path.dirname(directory),path.normalize(env.RUNNER_TEMP));
assert.equal(fs.readFileSync(env.GITHUB_OUTPUT,'utf8').slice(beforeOutput.length),'version=0.3.0-rc.1\n');
