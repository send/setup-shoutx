'use strict';
// CI-only process-level checks using the literal shipped entry and real endpoints.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const version = process.env.CLI_VERSION;
const checksum = process.env.CLI_CHECKSUMS_SHA256;
assert.match(version, /^\d+\.\d+\.\d+$/);
assert.match(checksum, /^[a-f0-9]{64}$/);
assert.notEqual(checksum, '0'.repeat(64));
const env = { ...process.env, 'INPUT_SHOUTX-VERSION': version,
  'INPUT_GITHUB-TOKEN': process.env.GH_TOKEN,
  'INPUT_CHECKSUMS-SHA256': '0'.repeat(64) };
const beforePath = fs.readFileSync(env.GITHUB_PATH); const beforeOutput = fs.readFileSync(env.GITHUB_OUTPUT);
let result = spawnSync(process.execPath, [path.join(__dirname, '../dist/index.cjs')], {env, encoding:'utf8', timeout:150000});
assert.equal(result.status, 1); assert.equal(result.stdout, '');
assert.equal(result.stderr, 'setup-shoutx: installation failed\n');
assert.deepEqual(fs.readFileSync(env.GITHUB_PATH),beforePath); assert.deepEqual(fs.readFileSync(env.GITHUB_OUTPUT),beforeOutput);
env['INPUT_CHECKSUMS-SHA256'] = checksum;
result = spawnSync(process.execPath, [path.join(__dirname, '../dist/index.cjs')], {env, encoding:'utf8', timeout:150000});
assert.equal(result.status, 0); assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
const directory=fs.readFileSync(env.GITHUB_PATH,'utf8').slice(beforePath.length).trimEnd();
assert.equal(path.dirname(directory),path.normalize(env.RUNNER_TEMP));
assert.equal(fs.readFileSync(env.GITHUB_OUTPUT,'utf8').slice(beforeOutput.length),`version=${version}\n`);
