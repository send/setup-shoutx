'use strict';

const fs = require('node:fs/promises');
const constants = require('node:fs').constants;
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { ensure, text, version, platform, absolutePath, environment, expectedDigest, LIMITS } = require('./policy.cjs');
const { createClient } = require('./client.cjs');
const { extract } = require('./archive.cjs');
const execute = promisify(execFile);

async function openCommandFile(value, os) {
  absolutePath(value, os); const before = await fs.lstat(value, { bigint: true }); ensure(before.isFile() && !before.isSymbolicLink());
  const handle = await fs.open(value, constants.O_WRONLY | constants.O_APPEND | (constants.O_NOFOLLOW || 0));
  try { const after = await handle.stat({ bigint: true }); ensure(after.isFile() && before.dev === after.dev && before.ino === after.ino); return handle; }
  catch (error) { await handle.close(); throw error; }
}
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
async function install(env = process.env, runtime = { os: process.platform, arch: process.arch }, client = createClient()) {
  environment(env);
  const selected = version(env['INPUT_SHOUTX-VERSION']);
  const expected = expectedDigest(env['INPUT_CHECKSUMS-SHA256'] || '');
  const token = text(env['INPUT_GITHUB-TOKEN'] || '', 16384); ensure(/^[\x21-\x7e]*$/.test(token));
  const target = platform(runtime.os, runtime.arch, env);
  const root = absolutePath(env.RUNNER_TEMP, target.os); ensure((await fs.stat(root)).isDirectory());
  let pathFile; let outputFile; let directory; let installed = false;
  try {
    pathFile = await openCommandFile(env.GITHUB_PATH, target.os);
    outputFile = await openCommandFile(env.GITHUB_OUTPUT, target.os);
    const p = await pathFile.stat({ bigint: true }); const o = await outputFile.stat({ bigint: true }); ensure(p.dev !== o.dev || p.ino !== o.ino);
    directory = await fs.mkdtemp(path.join(root, 'setup-shoutx-')); await fs.chmod(directory, 0o700);
    absolutePath(directory, target.os);
    const downloaded = await client.download(selected, target, token, expected);
    const binaryBytes = extract(downloaded.bytes, downloaded.root, target);
    const binary = path.join(directory, target.executable);
    await fs.writeFile(binary, binaryBytes, { flag: 'wx', mode: 0o700 });
    await fs.chmod(binary, 0o755);
    await verifyBinary(binary, selected, target.os, env);
    await outputFile.writeFile(`version=${selected}\n`, 'utf8');
    await pathFile.writeFile(`${directory}\n`, 'utf8');
    installed = true;
  } finally {
    await Promise.allSettled([pathFile?.close(), outputFile?.close()]);
    if (directory && !installed) await fs.rm(directory, { recursive: true, force: true });
  }
}
module.exports = { install, verifyBinary };
