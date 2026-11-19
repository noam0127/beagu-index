import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,runInNewContext} from 'node:vm';
const read = p => readFileSync(p,'utf8');
const sql=read('supabase/migrations/20261119_account_auth_private_v1.sql');
const edge=read('supabase/functions/beagu-account-v1/index.ts');
const client=read('js/beagu-account-client-v1.js');
const confirmation=read('account-email-confirmed.html');
const clean=read('js/beagu-account-confirm-cleanup-v1.js');

// Privacy/non-regression: no buttons added to existing screens and not even an
// account script tag in production-visible HTML.
for(const html of ['index.html','search.html','search-lv1.html',
 'search-lv2.html','statistics.html','challenge.html']) {
 const x=read(html);
 assert.ok(!x.includes('beagu-account-client-v1.js'),html+' must remain unlinked');
 assert.ok(!x.includes('account-email-confirmed.html'),html+' must remain unlinked');
}
assert.ok(!confirmation.includes('<button'), 'Confirmation page has no buttons');
assert.ok(confirmation.includes('http-equiv="Content-Security-Policy"'));
assert.ok(confirmation.includes('name="referrer" content="no-referrer"'));
assert.ok(clean.includes('history.replaceState'));

// Only service role may query or mutate app-owned account data.
for(const table of ['account_profiles_v1','account_login_budgets_v1','account_v1_settings']){
 assert.ok(sql.includes('alter table beagu_private.'+table+' enable row level security'));
 assert.ok(sql.includes('revoke all on beagu_private.'+table+' from public, anon, authenticated'));
}
for(const fn of ['beagu_account_v1_feature','beagu_account_v1_take_slot',
 'beagu_account_v1_bind','beagu_account_v1_owner','beagu_account_v1_profile']){
 assert.ok(sql.includes('revoke all on function public.'+fn));
 assert.ok(sql.includes('to service_role'));
}
assert.ok(sql.includes("('signup_enabled',false),('login_enabled',false)") ||
          sql.includes("('signup_enabled',false),('login_enabled',false),"));
assert.ok(sql.includes("('registration_enabled',false),('recovery_enabled',false)"));
assert.ok(sql.includes('references auth.users(id) on delete cascade'));
assert.ok(!sql.includes('password_hash')&&!sql.includes('refresh_token')&&!sql.includes('email text'));
assert.ok(sql.includes('unique'),'Unique account names are required');

// Edge does not use client-provided user_id, visitor UUID, challenge code, or
// editable user_metadata to authorize privileges.
assert.ok(edge.includes('admin.auth.getUser(jwt)'));
assert.ok(edge.includes('admin.auth.admin.getUserById'));
assert.ok(edge.includes("admin.rpc('beagu_account_v1_bind'"));
assert.ok(edge.includes("admin.rpc('beagu_account_v1_owner'"));
assert.ok(edge.includes("admin.rpc('beagu_account_v1_take_slot'"));
assert.ok(edge.includes('RATE_PEPPER.length < 32'));
assert.ok(edge.includes("response") || edge.includes('respond('));
assert.ok(edge.includes('confirmationRequired:true'));
assert.ok(edge.includes('signInWithPassword'));
assert.ok(edge.includes('email_confirmed_at'));
assert.ok(!edge.includes('identityCode')&&!edge.includes('visitor_id'));
assert.ok(!edge.includes('console.log')&&!edge.includes('console.error'));
assert.ok(!edge.includes('localStorage')&&!edge.includes('sessionStorage'));
assert.ok(!edge.includes('Deno.env.get(\'SUPABASE_SERVICE_ROLE_KEY\')!)'), 'Env handling is explicit');
for(const action of ['sign-up','bootstrap-sign-in','sign-in','complete-registration','me','refresh','sign-out'])
 assert.ok(edge.includes("action==='"+action+"'"),action);

// Headless client has no markup, navigation or persistence; all credentials are
// held only inside a closure and authorization is attached to a direct request.
const jsWithoutComments=client.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
assert.ok(!jsWithoutComments.includes('localStorage'));
assert.ok(!jsWithoutComments.includes('sessionStorage'));
assert.ok(!jsWithoutComments.includes('document.'));
assert.ok(!jsWithoutComments.includes('createElement('));
assert.ok(!jsWithoutComments.includes('service_role'));
new Script(client);
const requests=[];
const sample=(v)=>({ok:true,async json(){return v;}});
const network={
 'sign-up':{ok:true,confirmationRequired:true},
 'bootstrap-sign-in':{ok:true,registered:false,level:0,session:{access_token:'fake-a',refresh_token:'fake-r'}},
 'complete-registration':{ok:true,registered:true,level:0,username:'teacher_one'},
 'me':{ok:true,registered:true,level:0,username:'teacher_one'},
 'sign-out':{ok:true}
};
const ctx={window:{},fetch:async (url,options)=>{
 const p=JSON.parse(options.body);
 requests.push({url,options,action:p.action});
 return sample(network[p.action]||{});
},Error,JSON,Object,Number};
runInNewContext(client,ctx,{timeout:3000});
const sdk=ctx.window.BeaguAccountCoreV1.createClient();
assert.equal(requests.length,0,'No silent auth request before user action');
assert.equal(sdk.status().loggedIn,false);
await sdk.signUp({username:'teacher_one',email:'private@example.test',password:'Testpassword1234#'});
assert.equal(requests.at(-1).options.credentials,'omit');
assert.equal(requests.at(-1).options.cache,'no-store');
await sdk.beginConfirmedRegistration({email:'private@example.test',password:'Testpassword1234#'});
assert.equal(sdk.status().loggedIn,true);
await sdk.finishRegistration('teacher_one');
assert.equal(requests.at(-1).options.headers.Authorization,'Bearer fake-a');
assert.equal(sdk.status().registered,true);
await sdk.me();
await sdk.logout();
assert.equal(sdk.status().loggedIn,false);
assert.equal(requests.at(-1).options.headers.Authorization,'Bearer fake-a');
console.log('PASS: disabled account backend schema/API contracts, no visible UI, session memory-only and privacy-safe client flow');
