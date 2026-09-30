'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const LIMITS = Object.freeze({ archive: 256 * 1024 * 1024, expanded: 256 * 1024 * 1024,
  metadata: 1024 * 1024, manifest: 1024 * 1024, requestMs: 30000,
  redirects: 5, childMs: 10000, childBytes: 4096 });
const REPOSITORY = 'send/shoutx';
const REPOSITORY_ID = 1381947214;
function ensure(condition) { if (!condition) throw new Error('setup validation failed'); }
function text(value, limit = 16384) {
  ensure(typeof value === 'string' && value.isWellFormed() && Buffer.byteLength(value) <= limit);
  return value;
}
function version(value) {
  text(value, 55);
  const match = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  ensure(match);
  const numbers = match.slice(1, 4).map(BigInt);
  ensure(numbers.every(n => n <= 18446744073709551615n));
  const pre = match[4]?.split('.');
  if (pre) ensure(pre.every(p => !/^[0-9]+$/.test(p) || p === '0' || !p.startsWith('0')));
  const [major, minor, patch] = numbers;
  ensure(major > 0n || minor > 3n || (minor === 3n && (patch > 0n || !pre || comparePre(pre, ['rc', '1']) >= 0)));
  return value;
}
function comparePre(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) continue;
    const an = /^[0-9]+$/.test(a[i]); const bn = /^[0-9]+$/.test(b[i]);
    if (an && bn) return BigInt(a[i]) > BigInt(b[i]) ? 1 : -1;
    if (an !== bn) return an ? -1 : 1;
    return a[i] > b[i] ? 1 : -1;
  }
  return Math.sign(a.length - b.length);
}
function platform(os, arch, env) {
  const entries = {
    'linux/x64': ['Linux', 'X64', 'x86_64-unknown-linux-musl'],
    'linux/arm64': ['Linux', 'ARM64', 'aarch64-unknown-linux-musl'],
    'darwin/x64': ['macOS', 'X64', 'x86_64-apple-darwin'],
    'darwin/arm64': ['macOS', 'ARM64', 'aarch64-apple-darwin'],
    'win32/x64': ['Windows', 'X64', 'x86_64-pc-windows-msvc'],
  };
  const entry = entries[`${os}/${arch}`];
  ensure(entry && env.RUNNER_OS === entry[0] && env.RUNNER_ARCH === entry[1]);
  return { os, target: entry[2], extension: os === 'win32' ? 'zip' : 'tar.gz', executable: os === 'win32' ? 'shoutx.exe' : 'shoutx' };
}
function absolutePath(value, os) {
  text(value); ensure(value.length > 0 && !/[\x00-\x1f\x7f"\uFEFF]/u.test(value));
  if (os === 'win32') ensure(/^[A-Za-z]:[\\/]/.test(value) && !value.includes(';'));
  else ensure(value.startsWith('/') && !value.includes(':') && !value.endsWith('\\'));
  ensure((os === 'win32' ? path.win32 : path.posix).isAbsolute(value));
  return value;
}
function environment(env) {
  for (const key of ['NODE_OPTIONS', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR']) ensure(!env[key]);
  ensure(env.NODE_TLS_REJECT_UNAUTHORIZED === undefined || env.NODE_TLS_REJECT_UNAUTHORIZED === '1');
  ensure(!env.GITHUB_API_URL || env.GITHUB_API_URL === 'https://api.github.com');
  ensure(!env.GITHUB_SERVER_URL || env.GITHUB_SERVER_URL === 'https://github.com');
}
function digest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function expectedDigest(value) { text(value, 64); ensure(value === '' || /^[a-f0-9]{64}$/.test(value)); return value; }
function manifest(bytes, selected) {
  ensure(bytes.length <= LIMITS.manifest);
  const contents = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  ensure(contents.endsWith('\n'));
  const seen = new Set(); let result;
  for (const line of contents.split('\n')) {
    if (line === '') continue;
    const m = /^([a-f0-9]{64})  ([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(line);
    ensure(m && m[2] !== '.' && m[2] !== '..' && !seen.has(m[2]));
    seen.add(m[2]); if (m[2] === selected) result = m[1];
  }
  ensure(result); return result;
}
module.exports = { LIMITS, REPOSITORY, REPOSITORY_ID, ensure, text, version, platform, absolutePath, environment, digest, expectedDigest, manifest };
