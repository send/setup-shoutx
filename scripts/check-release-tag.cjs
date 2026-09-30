'use strict';
const { execFileSync } = require('node:child_process');
const tag = process.env.TAG; const repo = process.env.GH_REPO;
if (!/^v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(tag) || repo !== 'send/setup-shoutx') process.exit(1);
function read(endpoint) { return JSON.parse(execFileSync('gh', ['api', `repos/${repo}/${endpoint}`], { encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 30000 })); }
let object = read(`git/ref/tags/${tag}`).object;
for (let i = 0; object.type === 'tag' && i < 8; i++) object = read(`git/tags/${object.sha}`).object;
if (object.type !== 'commit' || object.sha !== process.env.GITHUB_SHA) process.exit(1);
