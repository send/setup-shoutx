'use strict';
const {test}=require('node:test'); const assert=require('node:assert/strict');
const {publish}=require('../scripts/publish-release.cjs');
const env={TAG:'v0.1.0',GH_REPO:'send/setup-shoutx',GITHUB_SHA:'a'.repeat(40),PRERELEASE:'false'};
function fixture(change=()=>{}) {
  const state={calls:[],release:{id:123,tag_name:'v0.1.0',draft:true,prerelease:false,assets:[],body:'notes',name:'v0.1.0'},existing:[]};change(state);
  const api=(method,url,body)=>{
    state.calls.push({method,url,body});
    if(url.includes('git/ref/tags/')) return {object:{type:'tag',sha:'b'.repeat(40)}};
    if(url.includes('git/tags/')) return {object:{type:'commit',sha:state.sha||env.GITHUB_SHA}};
    if(method==='GET'&&url.includes('?'))return state.existing;
    if(method==='POST')return structuredClone(state.release);
    if(method==='PATCH'){Object.assign(state.release,body,{immutable:state.immutable!==false});return structuredClone(state.release);}
    if(method==='GET')return structuredClone(state.release);
    throw new Error('unexpected request');
  };return {state,api};
}
test('release publication is bound to the created ID, tag, commit and zero assets',()=>{
  const {api,state}=fixture();publish(api,env);
  const writes=state.calls.filter(c=>c.method==='PATCH');assert.equal(writes.length,1);
  assert.equal(writes[0].url,'repos/send/setup-shoutx/releases/123');
  assert.equal(state.calls.filter(c=>c.url.includes('git/ref/tags/v0.1.0')).length,3);
});
test('existing drafts and wrong tag commits stop before release creation',()=>{
  for(const change of [s=>s.existing=[{tag_name:'v0.1.0',draft:true}],s=>s.sha='c'.repeat(40)]) {
    const {api,state}=fixture(change);assert.throws(()=>publish(api,env));assert.ok(state.calls.every(c=>c.method==='GET'));
  }
});
test('unexpected assets and mutable publication fail closed',()=>{
  const withAsset=fixture(s=>s.release.assets=[{id:1}]);assert.throws(()=>publish(withAsset.api,env));
  assert.ok(withAsset.state.calls.every(c=>c.method!=='PATCH'));
  assert.throws(()=>publish(fixture(s=>s.immutable=false).api,env));
});
