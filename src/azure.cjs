'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { writeSync } = require('node:fs');
const { ensure, environment, expectedDigest, nativePlatform, selectArtifact, absolutePath, text } = require('./policy.cjs');
const { createClient } = require('./client.cjs');
const { installArtifact } = require('./artifact.cjs');

function writePathRecord(line) {
  ensure(writeSync(1, line) === Buffer.byteLength(line));
}

async function installAzure(env = process.env, runtime = process, client = createClient(), emit = writePathRecord) {
  environment(env);
  const target = nativePlatform(runtime.platform, runtime.arch);
  ensure(env.AGENT_OS === {linux:'Linux', darwin:'Darwin', win32:'Windows_NT'}[target.os]);
  ensure(env.AGENT_OSARCHITECTURE === runtime.arch.toUpperCase());
  const selection = selectArtifact(env.SHOUTX_VERSION, env.SHOUTX_PROVIDER ?? 'azure-pipelines', target);
  const expected = expectedDigest(env.SHOUTX_CHECKSUMS_SHA256 || '');
  const token = text(env.SHOUTX_GITHUB_TOKEN || '', 16384);
  ensure(/^[\x21-\x7e]*$/.test(token));
  const root = absolutePath(env.AGENT_TEMPDIRECTORY, target.os);
  // Only host-generated portable paths enter the agent's stdout command.
  ensure(/^[A-Za-z0-9/\\: ._-]+$/.test(root));
  const directory = await fs.mkdtemp(path.join(root, 'setup-shoutx-'));
  let installed = false;
  try {
    await fs.chmod(directory, 0o700);
    await installArtifact(selection, target, directory, token, expected, env, client);
    emit(`##vso[task.prependpath]${directory}\n`);
    installed = true;
  } finally {
    if (!installed) await fs.rm(directory, { recursive:true, force:true });
  }
}
module.exports = { installAzure };
