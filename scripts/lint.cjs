'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
for (const directory of ['src', 'scripts', 'test', 'dist']) {
  for (const file of fs.readdirSync(path.join(__dirname, '..', directory))) {
    if (file.endsWith('.cjs')) execFileSync(process.execPath, ['--check', path.join(__dirname, '..', directory, file)], { stdio: 'inherit' });
  }
}
