import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyModerationWithAudit} from '../supabase/functions/_shared/moderation-audit.mjs';

async function simulate({failIntent=false,failAuth=false,failOutcome=false,failFailureLog=false}={}){
  const calls=[];
  const intent=new Error('audit insert unavailable');
  const authError=new Error('Auth Admin API unavailable');
  const outcomeError=new Error('completion audit unavailable');
  const record=async phase=>{
    calls.push('audit:'+phase);
    if(phase==='intent'&&failIntent)throw intent;
    if(phase==='error'&&failFailureLog)throw new Error('failed to record Auth failure');
    if(phase==='success'&&failOutcome)throw outcomeError;
  };
  const action=async()=>{
    calls.push('auth:mutate');
    if(failAuth)throw authError;
  };
  let exception=null;
  try{await applyModerationWithAudit(record,action);}
  catch(error){exception=error;}
  return {calls,exception,intent,authError,outcomeError};
}

let r=await simulate();
assert.deepEqual(r.calls,['audit:intent','auth:mutate','audit:success']);
assert.equal(r.exception,null,'successful action has durable intent and completion');

r=await simulate({failIntent:true});
assert.deepEqual(r.calls,['audit:intent'],'No Auth mutation after missing intent');
assert.equal(r.exception,r.intent,'Return original audit failure');

r=await simulate({failAuth:true});
assert.deepEqual(r.calls,['audit:intent','auth:mutate','audit:error']);
assert.equal(r.exception,r.authError,'Failure returns original Auth error');

r=await simulate({failAuth:true,failFailureLog:true});
assert.deepEqual(r.calls,['audit:intent','auth:mutate','audit:error']);
assert.equal(r.exception,r.authError,'Secondary audit failure must not mask Auth result');

r=await simulate({failOutcome:true});
assert.deepEqual(r.calls,['audit:intent','auth:mutate','audit:success']);
assert.equal(r.exception,r.outcomeError,
  'If completion audit fails after successful Auth update, report indeterminate action, preserve intent');

await assert.rejects(()=>applyModerationWithAudit(null,async()=>{}),TypeError);
await assert.rejects(()=>applyModerationWithAudit(async()=>{},null),TypeError);

const api=readFileSync('supabase/functions/beagu-admin-members-v1/index.ts','utf8');
assert.match(api,/import \{ applyModerationWithAudit \} from "\.\.\/_shared\/moderation-audit\.mjs";/);
assert.match(api,/const operationId = crypto\.randomUUID\(\);/);
assert.match(api,/operation_id: operationId/);
assert.match(api,/phase: "intent" \| "success" \| "error"/);
assert.match(api,/event_type: phase === "intent" \? event \+ "_intent" : event/);
assert.match(api,/outcome: phase === "error" \? "error" : "success"/);
assert.match(api,/await applyModerationWithAudit\(/);
assert.match(api,/if \(actor\.role !== "owner"\) throw new HttpError\(403, "owner_required"\)/);
assert.match(api,/if \(id === actor\.id\)/);
assert.match(api,/if \(admins\.has\(id\)\)/);
const moderated=api.slice(api.indexOf('async function moderate('),api.indexOf('Deno.serve('));
assert.ok(moderated.indexOf('await applyModerationWithAudit(')<moderated.indexOf('db.auth.admin.updateUserById('),
 'Authenticated moderation action must be inside audited workflow');
console.log('PASS: moderation intent precedes Auth changes; failure/partial-completion audit state preserved in five failure scenarios.');
console.log('SCOPE: isolated simulated effects only; real admin MFA and two-account HTTP E2E still blocked.');
