import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const source=readFileSync('scripts/beagu-2026-noon-sync.gs','utf8');
const runtime=readFileSync('scripts/beagu-2026-results-runtime.js','utf8');
assert.ok(source.endsWith(runtime),'Generated runtime must match');
let now=1000,requests=0,status=200,reply={ok:true},failCreate=false;
const props=new Map();
const propertyStore={getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k)};
const trigger=name=>({getHandlerFunction:()=>name});
let triggers=['onBeagu2026FormSubmitted','refreshBeagu2026AllPrivateStats','refreshBeagu2026Stats','runBeagu2026QuarterHour','pollBeagu2026VI13Requests','referralOther'].map(trigger);
const ScriptApp={getProjectTriggers:()=>triggers.slice(),deleteTrigger:t=>{triggers=triggers.filter(x=>x!==t);},
  newTrigger:name=>({timeBased(){return this},everyMinutes(n){assert.equal(n,15);return this},create(){if(failCreate)throw Error('creation failed');triggers.push(trigger(name));}})};
const context={Logger:{log(){}},ScriptApp,Date:{now:()=>now},PropertiesService:{getScriptProperties:()=>propertyStore},
 Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF_8'},computeDigest:(alg,value)=>[...createHash('sha256').update(value).digest()]},
 UrlFetchApp:{fetch(){requests++;return {getResponseCode:()=>status,getContentText:()=>JSON.stringify(reply)}}}};
vm.runInNewContext(source,context);
failCreate=true;const before=triggers.slice();assert.throws(()=>context.setupBeagu2026BatchTrigger(),/creation failed/);assert.deepEqual(triggers,before);
failCreate=false;context.setupBeagu2026BatchTrigger();context.setupBeagu2026BatchTrigger();
assert.deepEqual(triggers.map(t=>t.getHandlerFunction()).sort(),['pollBeagu2026VI13Requests','referralOther','runBeagu2026QuarterHour'].sort());
context.refreshBeagu2026AllPrivateStats=batch=>assert.equal(batch,true);
context.runBeagu2026QuarterHour();
context.refreshBeagu2026AllPrivateStats=()=>{throw Error('form submit must not aggregate')};
context.onBeagu2026FormSubmitted({range:{getSheet:()=>({getName:()=> '설문지 응답 시트1'})}});
const send=(value,stamp='2026-11-27T00:00:00Z',force=false)=>context.beagu26SendQuestionSnapshot({snapshot_at:stamp,schools:[{school_id:'TEST000',questions:[value]}],totals:{official_rows:1}},'synthetic-test-token',force);
assert.equal(send(1),true);assert.equal(requests,1);
assert.equal(send(1,'2026-11-27T00:15:00Z'),false);assert.equal(requests,1);
assert.equal(send(2),true);assert.equal(requests,2);
status=503;assert.throws(()=>send(3),/HTTP 503/);assert.equal(props.size,0);
status=200;assert.equal(send(2),true,'Ambiguous update must not suppress a revert');assert.equal(requests,4);
reply={ok:false};assert.throws(()=>send(4),/전송 확인 실패/);assert.equal(props.size,0);
reply={ok:true};assert.equal(send(4),true);assert.equal(send(4,undefined,true),true,'Manual force sends unchanged snapshot');
now+=24*60*60*1000;assert.equal(send(4),true,'Daily reconciliation sends unchanged snapshot');
assert.equal(send(4),false);assert.equal(requests,8);
console.log('PASS: single quarter-hour trigger, legacy form handler no-op, acknowledged hash dedupe, failure recovery, forced and daily reconciliation');
