'use strict';

const https = require('node:https');
const { LIMITS, REPOSITORY, REPOSITORY_ID, ensure, digest, manifest } = require('./policy.cjs');

// Only tests inject a transport. The production entry always uses node:https.
function createClient(request = https.request) {
  async function get(initial, limit, token = '') {
    let url = new URL(initial); const deadline = Date.now() + LIMITS.requestMs;
    for (let redirects = 0; ; redirects++) {
      ensure(url.protocol === 'https:' && !url.username && !url.password && !url.hash);
      const headers = { 'user-agent': 'setup-shoutx', accept: 'application/vnd.github+json', 'accept-encoding': 'identity' };
      if (token && redirects === 0 && url.origin === 'https://api.github.com') headers.authorization = `Bearer ${token}`;
      const remaining = deadline - Date.now(); ensure(remaining > 0);
      const response = await new Promise((resolve, reject) => {
        let settled = false; let req; let timer;
        const finish = (error, result) => {
          if (settled) return; settled = true; clearTimeout(timer);
          if (error) { req?.destroy(); reject(new Error('download failed')); } else resolve(result);
        };
        timer = setTimeout(() => finish(true), remaining);
        try {
          req = request(url, { method: 'GET', headers, agent: false }, res => {
            res.on('error', () => finish(true));
            res.on('aborted', () => finish(true));
            if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
              const location = res.headers.location;
              finish(null, { location }); res.destroy(); return;
            }
            if (res.statusCode !== 200 || (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity')) {
              finish(true); res.destroy(); return;
            }
            const declared = res.headers['content-length'];
            if (declared !== undefined && (!/^(0|[1-9][0-9]*)$/.test(declared) || Number(declared) > limit)) {
              finish(true); res.destroy(); return;
            }
            let count = 0; const chunks = [];
            res.on('data', chunk => {
              count += chunk.length;
              if (count > limit) { finish(true); res.destroy(); } else chunks.push(chunk);
            });
            res.on('end', () => {
              if (declared !== undefined && count !== Number(declared)) finish(true);
              else finish(null, { bytes: Buffer.concat(chunks) });
            });
          });
          req.on('error', () => finish(true)); req.end();
        } catch { finish(true); }
      });
      if (response.bytes) return response.bytes;
      ensure(redirects < LIMITS.redirects && typeof response.location === 'string');
      url = new URL(response.location, url);
    }
  }
  async function json(url, token) {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await get(url, LIMITS.metadata, token)));
  }
  async function download(version, target, token, expected) {
    const repo = await json(`https://api.github.com/repos/${REPOSITORY}`, token);
    ensure(repo.id === REPOSITORY_ID && repo.full_name === REPOSITORY);
    const tag = `v${version}`;
    const release = await json(`https://api.github.com/repos/${REPOSITORY}/releases/tags/${tag}`, token);
    ensure(release.tag_name === tag && release.draft === false && release.immutable === true && Array.isArray(release.assets));
    const root = `shoutx-${tag}-${target.target}`;
    const filename = `${root}.${target.extension}`;
    function asset(name, bound) {
      const matches = release.assets.filter(a => a.name === name); ensure(matches.length === 1);
      const a = matches[0]; const url = `https://github.com/${REPOSITORY}/releases/download/${tag}/${name}`;
      ensure(a.state === 'uploaded' && /^sha256:[a-f0-9]{64}$/.test(a.digest) &&
        Number.isSafeInteger(a.size) && a.size > 0 && a.size <= bound && a.browser_download_url === url);
      return { ...a, url };
    }
    const sums = asset('SHA256SUMS', LIMITS.manifest); const archive = asset(filename, LIMITS.archive);
    const sumBytes = await get(sums.url, LIMITS.manifest);
    ensure(sumBytes.length === sums.size && `sha256:${digest(sumBytes)}` === sums.digest);
    ensure(!expected || digest(sumBytes) === expected);
    const hash = manifest(sumBytes, filename);
    const bytes = await get(archive.url, LIMITS.archive);
    ensure(bytes.length === archive.size && digest(bytes) === hash && `sha256:${hash}` === archive.digest);
    return { bytes, root };
  }
  return { get, download };
}
module.exports = { createClient };
