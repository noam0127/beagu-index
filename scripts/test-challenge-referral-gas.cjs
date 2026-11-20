const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const code=fs.readFileSync('scripts/beagu-2026-referral-integration.gs','utf8');
const props=new Map();
const logs=[];
const triggers=[];
const outgoing=[];
const officialSheet='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4';
const formId='example-form-id-2026';
const fieldId=741258;
const fieldName='배구지수 추천 확인코드 (전용 링크 자동입력 · 수정하지 마세요)';
let items=[];
let formResponseSubmitCount=0;
const item={
  getId:()=>fieldId,
  getTitle:()=>fieldName,
  createResponse:value=>({itemId:fieldId,value}),
  asTextItem(){return this;},
  setTitle(){return this;},
  setHelpText(){return this;},
  setRequired(){return this;},
};
const form={
  getId:()=>formId,
  getDestinationId:()=>officialSheet,
  getPublishedUrl:()=> 'https://docs.google.com/forms/d/e/abc/viewform',
  getItems:()=>items,
  addTextItem:()=>{items.push(item);return item;},
  getItemById:id=>id===fieldId?item:null,
  createResponse:()=>({
    withItemResponse(v){assert.equal(v.value,'REFERRAL_PREVIEW');return this;},
    toPrefilledUrl:()=> 'https://docs.google.com/forms/d/e/abc/viewform?usp=pp_url&entry.741258=REFERRAL_PREVIEW',
    submit(){formResponseSubmitCount++;throw Error('MUST_NOT_SUBMIT');},
  }),
};
const env={
  SpreadsheetApp:{openById(id){assert.equal(id,officialSheet);return{
    getSheetByName:name=>name==='설문지 응답 시트1'?{getFormUrl:()=> 'https://docs.google.com/forms/d/example-form-id-2026/edit'}:null,
  };}},
  FormApp:{openByUrl:()=>form,ItemType:{TEXT:'TEXT'}},
  PropertiesService:{getScriptProperties:()=>({
    setProperty:(k,v)=>props.set(k,v),
    getProperty:k=>props.get(k)||'',
  })},
  ScriptApp:{
    getProjectTriggers:()=>triggers,
    deleteTrigger:t=>{const i=triggers.indexOf(t);if(i!==-1)triggers.splice(i,1);},
    newTrigger:handler=>({
      forForm(f){assert.equal(f,form);return this;},
      onFormSubmit(){return this;},
      create(){triggers.push({getHandlerFunction:()=>handler});},
    }),
  },
  UrlFetchApp:{fetch(url,options){outgoing.push({url,options});
    return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true,decision:'credited'})};
  }},
  Logger:{log:v=>logs.push(v)},
  Date,JSON,String,Number,Object,Error,
};
vm.createContext(env);
vm.runInContext(code,env);
assert.equal(items.length,0,'preflight must not mutate Form at load');
env.prepareBeaguReferralFormField();
assert.equal(items.length,1,'owner action creates one optional field');
assert.equal(props.get('BEAGU_REFERRAL_FORM_ID'),formId);
assert.equal(props.get('BEAGU_REFERRAL_FORM_ITEM_ID'),String(fieldId));
assert.equal(props.get('BEAGU_REFERRAL_FORM_ENTRY'),'entry.741258');
env.prepareBeaguReferralFormField();
assert.equal(items.length,1,'setup is idempotent and must not create duplicate question');
assert.equal(formResponseSubmitCount,0,'must not fabricate a form submission');

let threw=false;
try {env.installBeaguReferralFormSubmitTrigger();}
catch(e){threw=true;assert.match(e.message,/SECRET/);}
assert.equal(threw,true,'install requires owner configured server secret');
props.set('BEAGU_REFERRAL_INGEST_SECRET','t'.repeat(48));
env.installBeaguReferralFormSubmitTrigger();
env.installBeaguReferralFormSubmitTrigger();
assert.equal(triggers.length,1,'trigger installer replaces duplicates');

const proof='BR1.'+'a'.repeat(64)+'.ab8afb27-c498-42c1-8df6-064b6b8102a4.1795248000.'+'f'.repeat(64);
const event={
  source:form,
  response:{
    getItemResponses:()=>[
      {getItem:()=>({getId:()=>42}),getResponse:()=> 'PRIVATE-SURVEY-ANSWER'},
      {getItem:()=>({getId:()=>fieldId}),getResponse:()=>proof},
    ],
    getId:()=> 'response_key_123456789',
    getTimestamp:()=>new Date('2026-11-20T12:00:00Z'),
  },
};
env.onBeaguReferralFormSubmitted({...event,source:{getId:()=> 'wrong-form'}});
assert.equal(outgoing.length,0,'foreign forms ignored');
env.onBeaguReferralFormSubmitted({
  ...event,response:{...event.response,
    getItemResponses:()=>[{getItem:()=>({getId:()=>fieldId}),getResponse:()=> 'bad-proof'}]},
});
assert.equal(outgoing.length,0,'invalid referral proof ignored');
env.onBeaguReferralFormSubmitted(event);
assert.equal(outgoing.length,1,'valid trigger sends exactly one event');
const {url,options}=outgoing[0];
assert.match(url,/beagu-referral-ingest-v1/);
assert.ok(options.headers['X-Beagu-Referral-Ingest-Token']);
const body=JSON.parse(options.payload);
assert.deepEqual(Object.keys(body).sort(),
  ['sourceSpreadsheetId','formResponseId','submittedAt','proof'].sort());
assert.equal(body.sourceSpreadsheetId,officialSheet);
assert.equal(body.proof,proof);
assert.equal(body.formResponseId,'response_key_123456789');
assert.equal(body.submittedAt,'2026-11-20T12:00:00.000Z');
assert.ok(!options.payload.includes('PRIVATE-SURVEY-ANSWER'),
  'actual teacher answers must not leave Google Forms');
assert.ok(!logs.join('|').includes(proof),'proof must not appear in logs');
console.log('PASS: owner-only field install, idempotency, trigger, rejection, minimal response metadata');
