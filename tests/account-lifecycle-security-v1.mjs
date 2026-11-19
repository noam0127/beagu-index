import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,runInNewContext} from 'node:vm';
const html=readFileSync('account-password-reset.html','utf8');
const src=readFileSync('js/beagu-account-password-reset-v1.js','utf8');
const edge=readFileSync('supabase/functions/beagu-account-v1/index.ts','utf8');
const sql=readFileSync('supabase/migrations/20261119_account_auth_private_v1.sql','utf8');
assert.ok(html.includes('name="referrer" content="no-referrer"'));
assert.ok(html.includes('form-action \'none\''));
assert.ok(!/<button|type="submit"/i.test(html));
assert.ok(src.includes('history.replaceState'));
assert.ok(src.includes('complete-recovery'));
assert.ok(src.includes("form.addEventListener('keydown'"));
assert.ok(edge.includes("auth.auth.verifyOtp({"));
assert.ok(edge.includes("type:'recovery'"));
assert.ok(edge.includes("auth.auth.updateUser({"));
assert.ok(edge.includes("scope:'global'"));
assert.ok(edge.includes("action==='delete-account'"));
assert.ok(edge.includes("admin.auth.admin.deleteUser(user.id)"));
assert.ok(edge.includes("input.confirm!=='DELETE_MY_ACCOUNT'"));
assert.ok(edge.includes("verified?.user?.id!==user.id"));
assert.ok(sql.includes("'account_deletion_enabled',false"));
assert.ok(sql.includes('beagu_account_v1_purge_budgets'));
assert.ok(sql.includes('beagu_account_v1_expire_budgets'));
assert.ok(sql.includes("interval '30 days'"));
assert.ok(edge.includes("admin.rpc('beagu_account_v1_purge_budgets'"));
assert.ok(edge.includes('securityBudgetCleanupPending'));
assert.ok(edge.includes('captchaToken:proof')||edge.includes('options:{captchaToken:proof}'));
assert.ok(edge.includes("error:'CAPTCHA_REQUIRED'"));
assert.ok(edge.includes("beagu_account_v1_take_slot"));
assert.ok(!edge.includes('console.log'));
assert.ok(!edge.includes('console.error'));
for(const page of ['index.html','search.html','search-lv1.html','statistics.html','challenge.html']){
  const source=readFileSync(page,'utf8');
  assert.ok(!source.includes('account-password-reset.html'),'Do not expose unlaunched screen '+page);
}
// Simulate browser page reading and scrubbing one-time token, without any
// network requests before the user chooses a new password.
const elements={
 resetStatus:{textContent:''},
 resetForm:{hidden:true,handlers:{},addEventListener(type,cb){this.handlers[type]=cb;}},
 resetPassword:{value:'StrongNewPasscode#12'},
 resetPasswordConfirm:{value:'StrongNewPasscode#12'}
};
const ctx={
 document:{getElementById:id=>elements[id]},
 location:{href:'https://baeguindex.com/account-password-reset.html?token_hash='+'a'.repeat(64),hash:''},
 history:{replaceState(_a,_b,path){this.path=path;}},
 URL,JSON,Error,Event:class {constructor(type){this.type=type;}},fetch:async()=>({ok:true,json:async()=>({passwordUpdated:true})})
};
new Script(src);
runInNewContext(src,ctx,{timeout:3000});
assert.equal(ctx.history.path,'/account-password-reset.html');
assert.equal(elements.resetForm.hidden,false);
assert.equal(elements.resetStatus.textContent,'새 비밀번호를 두 번 입력해 주세요.');
console.log('PASS: reset recovery-only verifier, deletion reauthentication and staged native Auth captcha');
