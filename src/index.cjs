'use strict';

// Install the boundary before loading the bundle. Never render an exception.
const fs = require('node:fs');
let failed = false;
function fail(message = 'setup-shoutx: installation failed\n') {
  if (!failed) {
    failed = true;
    try { fs.writeSync(2, message); } catch { /* stderr can be closed */ }
  }
  process.exit(1);
}
process.removeAllListeners('warning');
process.on('warning', () => { /* Never render warning objects or abort a valid install. */ });
process.on('uncaughtException', () => fail());
process.on('unhandledRejection', () => fail());
try {
  const bundle = require('./bundle.cjs');
  Promise.resolve(bundle.install()).catch(error => {
    if (error && error === bundle.unavailableProvider) fail('setup-shoutx: this shoutx version has no Azure Pipelines binary\n');
    else fail();
  });
} catch { fail(); }
