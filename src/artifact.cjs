'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { ensure, absolutePath, LIMITS } = require('./policy.cjs');
const { extract } = require('./archive.cjs');
const execute = promisify(execFile);

async function verifyBinary(binary, selected, os, env) {
  const childEnv = {};
  if (os === 'win32') {
    absolutePath(env.SystemRoot, os); childEnv.SystemRoot = env.SystemRoot;
  }
  const child = execute(binary, ['--version'], { env: childEnv, timeout: LIMITS.childMs,
    maxBuffer: LIMITS.childBytes, encoding: 'buffer', windowsHide: true, killSignal: 'SIGKILL' });
  child.child.stdin.end();
  const { stdout, stderr } = await child;
  ensure(stdout.equals(Buffer.from(`shoutx ${selected}\n`)) && stderr.length === 0);
}
async function installArtifact(selection, target, directory, token, expected, env, client) {
  const archive = await client.download(selection, token, expected);
  const bytes = extract(archive, selection.root, target);
  const binary = path.join(directory, target.executable);
  await fs.writeFile(binary, bytes, { flag: 'wx', mode: 0o700 });
  await fs.chmod(binary, 0o755);
  await verifyBinary(binary, selection.version, target.os, env);
}
module.exports = { installArtifact, verifyBinary };
