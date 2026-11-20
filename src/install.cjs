'use strict';

const fs = require('node:fs/promises');
const constants = require('node:fs').constants;
const path = require('node:path');
const { ensure, text, selectArtifact, unavailableProvider, platform, absolutePath, environment, expectedDigest } = require('./policy.cjs');
const { createClient } = require('./client.cjs');
const { installArtifact } = require('./artifact.cjs');

async function openCommandFile(value, os) {
  absolutePath(value, os); const before = await fs.lstat(value, { bigint: true }); ensure(before.isFile() && !before.isSymbolicLink());
  const handle = await fs.open(value, constants.O_WRONLY | constants.O_APPEND | (constants.O_NOFOLLOW || 0));
  try { const after = await handle.stat({ bigint: true }); ensure(after.isFile() && before.dev === after.dev && before.ino === after.ino); return handle; }
  catch (error) { await handle.close(); throw error; }
}
async function install(env = process.env, runtime = { os: process.platform, arch: process.arch }, client = createClient()) {
  environment(env);
  const expected = expectedDigest(env['INPUT_CHECKSUMS-SHA256'] || '');
  const token = text(env['INPUT_GITHUB-TOKEN'] || '', 16384); ensure(/^[\x21-\x7e]*$/.test(token));
  const target = platform(runtime.os, runtime.arch, env);
  const selection = selectArtifact(env['INPUT_SHOUTX-VERSION'], env.INPUT_PROVIDER ?? 'github-actions', target);
  const root = absolutePath(env.RUNNER_TEMP, target.os); ensure((await fs.stat(root)).isDirectory());
  let pathFile; let outputFile; let directory; let installed = false;
  try {
    pathFile = await openCommandFile(env.GITHUB_PATH, target.os);
    outputFile = await openCommandFile(env.GITHUB_OUTPUT, target.os);
    const p = await pathFile.stat({ bigint: true }); const o = await outputFile.stat({ bigint: true }); ensure(p.dev !== o.dev || p.ino !== o.ino);
    directory = await fs.mkdtemp(path.join(root, 'setup-shoutx-')); await fs.chmod(directory, 0o700);
    absolutePath(directory, target.os);
    await installArtifact(selection, target, directory, token, expected, env, client);
    await outputFile.writeFile(`version=${selection.version}\n`, 'utf8');
    await pathFile.writeFile(`${directory}\n`, 'utf8');
    installed = true;
  } finally {
    await Promise.allSettled([pathFile?.close(), outputFile?.close()]);
    if (directory && !installed) await fs.rm(directory, { recursive: true, force: true });
  }
}
module.exports = { install, installAzure: require('./azure.cjs').installAzure, unavailableProvider };
