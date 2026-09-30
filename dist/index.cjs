'use strict';

// Install the boundary before loading the bundle. Never render an exception.
const fs = require('node:fs');
let failed = false;
function fail() {
  if (!failed) {
    failed = true;
    try { fs.writeSync(2, 'setup-shoutx: installation failed\n'); } catch { /* stderr can be closed */ }
  }
  process.exit(1);
}
process.removeAllListeners('warning');
process.on('warning', fail);
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);
try { Promise.resolve(require('./bundle.cjs').install()).catch(fail); } catch { fail(); }
