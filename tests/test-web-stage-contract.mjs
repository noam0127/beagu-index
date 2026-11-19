import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {new Script} from 'node:vm';
import {test} from 'node:test';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ui=read('test-web/index.html');
const js=read('test-web/app.js');
const recover=read('test-web/recover.js');
const config=read('test-web/config.js');
const sql=read('test-environment/supabase/20261120_stage_v1.sql');
const edge=read('test-environment/supabase/functions/beagu-test-v1/index.ts');

test('test environment starts disconnected, no prod API in site scripts',()=>{
 assert.match(config,/enabled:false/);
 for(const text of [ui,js,recover,config]){
   assert.doesNotMatch(text,/https:\/\/snvzwrexuqavnfvzgxqj\.supabase\.co/);
   assert.doesNotMatch(text,/service.role.key|SUPABASE_SERVICE_ROLE_KEY|BEAGU_2026_INGEST_TOKEN/i);
 }
 assert.match(js,/cfg\.projectRef!==PROD/);
 assert.match(js,/cfg\.siteOrigin===location\.origin/);
 assert.match(edge,/expected !== PROD/);
 assert.match(edge,/origin!==site/);
 assert.match(edge,/validProject/);
});
test('all browser handlers refer to existing elements',()=>{
 const ids=new Set([...ui.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]));
 for(const m of js.matchAll(/\$\('([^']+)'\)/g)){
   assert.ok(ids.has(m[1]),'missing UI id '+m[1]);
 }
 for(const id of ['accountPanel','upgradePanel','surveyInvite','notice','turnstile'])
   assert.ok(ids.has(id));
 new Script(js,{filename:'app.js'});
 new Script(recover,{filename:'recover.js'});
 new Script(config,{filename:'config.js'});
});
test('private tables use RLS and deny anon direct reads',()=>{
 for(const table of ['members','level1_proofs','referrals','submissions','rate_limits','fake_schools'])
   assert.match(sql,new RegExp('alter table stage_private\\.'+table+' enable row level security'));
 assert.match(sql,/revoke all on all tables in schema stage_private from public, anon, authenticated/);
 assert.match(sql,/nspname='beagu_private'/);
 assert.match(sql,/security invoker/g);
 assert.doesNotMatch(sql,/security definer/i);
});
test('referral submit is atomic and rejects duplicate/self submission',()=>{
 assert.match(sql,/constraint different_accounts check\(respondent<>referrer\)/);
 assert.match(sql,/respondent uuid primary key/);
 assert.match(sql,/on conflict\(respondent\) do nothing/);
 assert.match(sql,/where token_sha=p_hash and revoked_at is null for update/);
 assert.match(sql,/level=greatest\(level,2\)/);
 assert.match(sql,/upgrade_unseen=\(level<2 or upgrade_unseen\)/);
 assert.match(edge,/p_respondent:uid/);
 assert.match(edge,/p_hash:await sha\(token\)/);
});
test('account identity, verification, email safety and auth gates',()=>{
 assert.match(edge,/admin!\.auth\.getUser\(token\)/);
 assert.match(edge,/email_confirmed_at/);
 assert.match(edge,/captchaReady/);
 assert.match(edge,/captchaToken/);
 assert.match(edge,/rate\('login'/);
 assert.match(edge,/admin!\.auth\.admin\.signOut/);
 assert.match(edge,/admin!\.auth\.admin\.deleteUser/);
 assert.match(sql,/references auth\.users\(id\) on delete cascade/);
 assert.match(js,/history\.replaceState\(null,'',location\.pathname\+location\.search\)/);
 assert.match(recover,/history\.replaceState\(null,'',location\.pathname\)/);
 assert.match(js,/location\.hash\.replace/);
 assert.match(recover,/location\.hash\.replace/);
});
test('no production survey or challenge identifiers are linked',()=>{
 assert.doesNotMatch(sql,/challenge_identity_codes|survey_submissions|2026_noon_sync/i);
 assert.doesNotMatch(edge,/baegu_challenge_identity|2026_referral|google\.com\/forms/);
 assert.match(read('test-web/robots.txt'),/Disallow:\s*\//);
 for(const required of ['noindex,nofollow','가상별빛초등학교','회원가입','레벨업하기'])
   assert.ok((ui+sql).includes(required),required);
});
console.log('STAGING CONTRACT: static checks only; not a live two-account test.');
test('edge preview accepts both stripped and gateway URL paths',()=>{
 const preview=read('test-environment/supabase/functions/beagu-stage-preview/index.ts');
 assert.match(preview,/raw===.\/.|raw\.endsWith/);
 assert.match(preview,/suffixes\.find/);
 assert.match(preview,/beagu-stage-preview/);
});
