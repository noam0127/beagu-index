import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('js/beagu-auth-return-v1.js','utf8');
const matrix=JSON.parse(fs.readFileSync('docs/releases/v1.1.0-auth-redirect-matrix.json','utf8'));
const APP='https://baeguindex.com';
const names={challenge:'challenge.html',postit:'postit.html',adminEnroll:'admin-enroll.html',passwordReset:'password-reset.html'};
const htmls={
 challenge:['challenge.html','js/challenge-member-auth-v1.js'],
 postit:['postit.html','js/postit-account-v1.js'],
 adminEnroll:['admin-enroll.html','js/beagu-admin-enroll-v1.js']
};

function loadHelper(href) {
 const url=new URL(href);
 const window={location:{origin:url.origin,pathname:url.pathname}};
 vm.runInNewContext(source,{window,URL},{timeout:1000});
 return window.BEAGU_AUTH_RETURN;
}

test('production redirect URLs and staging paths agree exactly with required Supabase allowlists',()=>{
 for(const [stage,prefix] of [['production','/'],['staging','/_preview/']]){
  const target=matrix.projects[stage];
  assert.equal(target.configured_verified,false,'do not claim dashboard settings verified');
  const origin=APP+prefix;
  assert.equal(target.site_url,origin);
  const helper=loadHelper(origin+'challenge.html');
  const resolved=Object.entries(names).map(([name])=>helper.resolve(name));
  assert.deepEqual(resolved,target.allowed_redirect_urls);
  assert.equal(new Set(resolved).size,4);
  for(const url of resolved) {
   const parsed=new URL(url);
   assert.equal(parsed.origin,APP);
   assert.equal(parsed.search,'');
   assert.equal(parsed.hash,'');
  }
 }
});

test('return URL helper is fail-closed for unknown targets, attacker origins and preview escape',()=>{
 for(const origin of ['https://beagu-index.vercel.app','https://evil.example','http://baeguindex.com','http://localhost:8000']){
  const helper=loadHelper(origin+'/challenge.html');
  assert.throws(()=>helper.resolve('challenge'),/AUTH_REDIRECT_ORIGIN_NOT_ALLOWED/);
 }
 const helper=loadHelper(APP+'/_preview/postit.html');
 assert.equal(helper.resolve('challenge'),APP+'/_preview/challenge.html');
 assert.throws(()=>helper.resolve('../admin.html'),/UNRECOGNIZED_AUTH_REDIRECT/);
 assert.throws(()=>helper.resolve('other'),/UNRECOGNIZED_AUTH_REDIRECT/);
 assert.throws(()=>helper.resolve('__proto__'),/UNRECOGNIZED_AUTH_REDIRECT/);
});

test('every login/signup entry loads helper before app code and never constructs ad hoc redirect targets',()=>{
 for(const [name,[htmlPath,scriptPath]] of Object.entries(htmls)){
  const html=fs.readFileSync(htmlPath,'utf8');
  const a=html.indexOf('js/beagu-auth-return-v1.js');
  const b=html.indexOf(scriptPath);
  assert.ok(a>-1,'missing helper: '+htmlPath);
  assert.ok(b>a,'auth helper must load before auth script: '+htmlPath);
  const code=fs.readFileSync(scriptPath,'utf8');
  assert.match(code,new RegExp('BEAGU_AUTH_RETURN\\.resolve\\('));
  assert.doesNotMatch(code,/emailRedirectTo:\s*new URL|redirectTo:\s*new URL/);
 }
 const postit=fs.readFileSync('js/postit-account-v1.js','utf8');
 assert.match(postit,/signUp\([\s\S]*?emailRedirectTo:window\.BEAGU_AUTH_RETURN\.resolve\('postit'\)/);
});

test('manifest demands explicit, project-specific dashboard confirmation',()=>{
 assert.equal(matrix.configuration_status,'DESIRED_ONLY__NOT_VERIFIED_IN_SUPABASE');
 assert.equal(matrix.operational_change_performed,false);
 assert.equal(matrix.projects.production.ref,'snvzwrexuqavnfvzgxqj');
 assert.equal(matrix.projects.staging.ref,'ycwuugggqbunlbwuzvbx');
 assert.ok(matrix.projects.production.dashboard.endsWith('snvzwrexuqavnfvzgxqj/auth/url-configuration'));
 assert.ok(matrix.projects.staging.dashboard.endsWith('ycwuugggqbunlbwuzvbx/auth/url-configuration'));
 assert.ok(!matrix.projects.production.allowed_redirect_urls.some(x=>/\*|localhost|_preview/.test(x)));
 assert.ok(!matrix.projects.staging.allowed_redirect_urls.some(x=>/\*|localhost/.test(x)));
 assert.notDeepEqual(matrix.projects.production.allowed_redirect_urls,matrix.projects.staging.allowed_redirect_urls);
});
