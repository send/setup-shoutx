'use strict';
const { execFileSync } = require('node:child_process');
function ensure(condition) { if (!condition) throw new Error('release validation failed'); }
function publish(api, env) {
  const tag = env.TAG; const repo = env.GH_REPO; const sha = env.GITHUB_SHA;
  ensure(/^v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(tag) && repo === 'send/setup-shoutx');
  ensure(/^[a-f0-9]{40}$/.test(sha) && ['true','false'].includes(env.PRERELEASE));
  const base = `repos/${repo}/`;
  function checkTag() {
    let object = api('GET', `${base}git/ref/tags/${tag}`).object;
    for (let i = 0; object.type === 'tag' && i < 8; i++) object = api('GET', `${base}git/tags/${object.sha}`).object;
    ensure(object.type === 'commit' && object.sha === sha);
  }
  checkTag();
  // Refuse existing published releases and drafts. Retained failed drafts need manual handling.
  let complete = false;
  for (let page = 1; page <= 100; page++) {
    const releases = api('GET', `${base}releases?per_page=100&page=${page}`);
    ensure(Array.isArray(releases) && releases.every(r => r.tag_name !== tag));
    if (releases.length < 100) { complete = true; break; }
  }
  ensure(complete);
  const created = api('POST', `${base}releases`, { tag_name: tag, target_commitish: sha,
    draft: true, prerelease: env.PRERELEASE === 'true', generate_release_notes: true, make_latest: 'false' });
  ensure(Number.isSafeInteger(created.id) && created.id > 0);
  const endpoint = `${base}releases/${created.id}`;
  function checkRelease(release, draft) {
    ensure(release.id === created.id && release.tag_name === tag && release.draft === draft);
    ensure(Array.isArray(release.assets) && release.assets.length === 0);
  }
  checkRelease(created, true);
  checkRelease(api('GET', endpoint), true); checkTag();
  api('PATCH', endpoint, { draft: false, prerelease: env.PRERELEASE === 'true', make_latest: 'false',
    body: created.body, name: created.name });
  const published = api('GET', endpoint); checkRelease(published, false);
  ensure(published.immutable === true && published.prerelease === (env.PRERELEASE === 'true'));
  checkTag();
}
function github(method, endpoint, body) {
  const args = ['api','--method',method,endpoint];
  if (body !== undefined) args.push('--input','-');
  return JSON.parse(execFileSync('gh', args, { encoding:'utf8', maxBuffer:1024*1024, timeout:30000,
    input: body === undefined ? undefined : JSON.stringify(body), stdio:['pipe','pipe','pipe'] }));
}
if (require.main === module) {
  try { publish(github, process.env); }
  catch { process.stderr.write('setup-shoutx: release failed\n'); process.exitCode = 1; }
}
module.exports = { publish };
