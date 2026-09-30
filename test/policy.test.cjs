'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const p = require('../src/policy.cjs');
test('exact Cargo versions and supported lower boundary', () => {
  for (const v of ['0.3.0-rc.1','0.3.0-rc.2','0.3.0','0.3.1-alpha','1.0.0','0.4.0-0']) assert.equal(p.version(v),v);
  for (const v of ['latest','v0.3.0','0.3','0.3.*','^0.3.0','0.2.0','0.3.0-rc.0','0.3.0-beta','0.3.0-rc','0.3.0-01','00.3.0','0.3.0+build',' 0.3.0','0.3.0\n','1'.repeat(60),'18446744073709551616.0.0']) assert.throws(()=>p.version(v),v);
});
test('native platform and runner metadata must agree', () => {
  for (const [os,arch,runner,runnerArch] of [['linux','x64','Linux','X64'],['linux','arm64','Linux','ARM64'],['darwin','x64','macOS','X64'],['darwin','arm64','macOS','ARM64'],['win32','x64','Windows','X64']]) {
    assert.ok(p.platform(os,arch,{RUNNER_OS:runner,RUNNER_ARCH:runnerArch}));
    assert.throws(()=>p.platform(os,arch,{RUNNER_OS:runner,RUNNER_ARCH:'wrong'}));
  }
  assert.throws(()=>p.platform('win32','arm64',{RUNNER_OS:'Windows',RUNNER_ARCH:'ARM64'}));
});
test('absolute paths cannot introduce records or PATH elements', () => {
  for (const value of ['/tmp/a b','/tmp/日本語']) assert.equal(p.absolutePath(value,'linux'),value);
  for (const value of ['relative','/tmp/a:b','/tmp/a\n','/tmp/a\r','/tmp/a\0','/tmp/a"','/tmp/a\\','/tmp/\ud800','/tmp/\uFEFF']) assert.throws(()=>p.absolutePath(value,'linux'));
  assert.equal(p.absolutePath('C:\\a b','win32'),'C:\\a b');
  for (const value of ['C:relative','\\a','C:\\a;b','\\\\?\\C:\\a']) assert.throws(()=>p.absolutePath(value,'win32'));
});
test('manifest grammar, hashes, duplicates and unrelated files', () => {
  const hash='a'.repeat(64);
  assert.equal(p.manifest(Buffer.from(`${hash}  other.txt\n${hash}  selected.zip\n`),'selected.zip'),hash);
  for(const body of [`${hash}  ../selected.zip\n`,`${hash}  selected.zip\n${hash}  selected.zip\n`,`${hash} selected.zip\n`,`${hash}  selected.zip\r\n`,`${hash}  selected.zip`,`${hash.toUpperCase()}  selected.zip\n`,`\ufeff${hash}  selected.zip\n`]) assert.throws(()=>p.manifest(Buffer.from(body),'selected.zip'));
  assert.throws(()=>p.manifest(Buffer.from([255]),'a'));
});
test('TLS and alternate GitHub environment settings fail closed', () => {
  p.environment({}); p.environment({NODE_TLS_REJECT_UNAUTHORIZED:'1'});
  for(const key of ['NODE_DEBUG','NODE_DEBUG_NATIVE','OPENSSL_CONF']) assert.throws(()=>p.environment({[key]:'http'}));
  for(const [key,value] of [['NODE_OPTIONS','--require hostile'],['NODE_TLS_REJECT_UNAUTHORIZED','0'],['NODE_EXTRA_CA_CERTS','hostile'],['NODE_USE_ENV_PROXY','1'],['NODE_USE_SYSTEM_CA','1'],['SSL_CERT_DIR','hostile'],['GITHUB_API_URL','https://evil.example']]) assert.throws(()=>p.environment({[key]:value}));
});
