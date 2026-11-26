// VI13-only private Google Sheets sync. Candidate; do not install automatically.
// Load beside beagu-2026-noon-sync.gs. The previous verification tabs remain read-only.
const BEAGU_VI13_SYNC_TAB='VI13_자동동기화';
const BEAGU_VI13_BASELINE_TAB='수직성_백분위_검증';
const BEAGU_VI13_METHOD='VERTICAL_EXACT_VI13_MIN9_A4_P2_R1_V1';
function beagu26VI13Aliases(value,region,office){
 const name=normalize(value).replace(/(?:초등학교|초등학|초등|초교|초)$/,'');
 const out=new Set([name]);
 const prefixes=[region,office];
 // Verified combined office: both municipal prefixes are legitimate aliases.
 if(region==='경기'&&office==='안양과천')prefixes.push('안양','과천');
 for(const prefix of prefixes){
  if(prefix&&name.startsWith(prefix)&&name.length>prefix.length)out.add(name.slice(prefix.length));
 }
 return [...out].filter(Boolean);
}
function beagu26VI13Resolve(row,c,schools){
 const exact=resolveSchool(row,c,schools);
 if(exact.school)return exact;
 const region=regionOf(row[c.region]),offices=c.office.map(i=>String(row[i]||'').trim()).filter(Boolean);
 if(!region||offices.length!==1)return exact;
 const office=normalizeOffice(offices[0]),names=beagu26VI13Aliases(row[c.school],region,office);
 if(!office||!names.length)return exact;
 const matches=schools.filter(s=>s.status==='운영'&&regionOf(s.sido_standard)===region&&
  normalizeOffice(s.support_office)===office&&beagu26VI13Aliases(s.school_name,region,office).some(n=>names.includes(n)));
 if(matches.length!==1)return exact;
 const selected=String(row[c.schoolType]||'').match(/(?:공립|국립|사립)/)?.[0]||'';
 const registered=String(matches[0].establishment||'').match(/(?:공립|국립|사립)/)?.[0]||'';
 if(!selected||selected!==registered)return exact;
 return {school:matches[0],region,office,typeConflict:false,recovered:true};
}
function beagu26VI13Rank(groups,schools){
 const directory=new Map(schools.map(s=>[String(s.school_id),s]));
 if(!Array.isArray(groups)||groups.length<2||groups.length>10000)throw Error('VI13 invalid school count');
 const seen=new Set(),rows=groups.map(g=>{
  const id=String(g.school_id),s=directory.get(id),n=g.observations,sum=g.sum_units,flags=g.flags;
  if(!/^[A-Z0-9]{7}$/.test(id)||seen.has(id)||!s||s.status!=='운영'||
   !Number.isSafeInteger(n)||n<1||n>50000||!Number.isSafeInteger(sum)||sum<0||sum>n*360360*100||
   !Number.isSafeInteger(flags)||flags<0||flags>n)throw Error('VI13 invalid aggregate');
  seen.add(id);
  return {school_id:id,school_name:String(s.school_name),region:[regionOf(s.sido_standard),normalizeOffice(s.support_office)].filter(Boolean).join(' '),
   observations:n,sum_units:sum,flags};
 });
 // Smaller respect VI13 score = greater verticality. Compare exact rational means.
 const cmp=(a,b)=>{const left=BigInt(a.sum_units)*BigInt(b.observations),right=BigInt(b.sum_units)*BigInt(a.observations);return left<right?-1:left>right?1:0;};
 rows.sort((a,b)=>cmp(a,b)||a.school_id.localeCompare(b.school_id));
 for(let i=0;i<rows.length;){
  let j=i+1;while(j<rows.length&&cmp(rows[i],rows[j])===0)j++;
  const pct=Math.round(1000*(rows.length-j)/(rows.length-1))/10;
  for(let k=i;k<j;k++){rows[k].rank=i+1;rows[k].percentile=pct;}
  i=j;
 }
 return rows;
}
function beagu26VI13CheckBaseline(rows,baseline){
 if(!Array.isArray(baseline)||baseline.length<572)throw Error('VI13 baseline missing');
 const current=new Map(rows.map(r=>[r.school_id,r])),seen=new Set();
 let missing=0,lower=0,changed=0;
 for(const b of baseline){
  const id=String(b[0]),n=Number(b[1]),sum=Number(b[2]),den=Number(b[3]);
  if(!/^[A-Z0-9]{7}$/.test(id)||seen.has(id)||!Number.isSafeInteger(n)||n<1||
    !Number.isSafeInteger(sum)||sum<0||sum>n*360360*100||den!==360360)throw Error('VI13 invalid baseline row');
  seen.add(id);
  const r=current.get(id);
  if(!r){missing++;continue;}
  if(r.observations<n){lower++;continue;}
  const delta=r.sum_units-sum;
  if(delta<0||delta>(r.observations-n)*360360*100)changed++;
 }
 return {ok:missing===0&&lower===0&&changed===0,missing,lower,changed,baseline:baseline.length};
}
function beagu26VI13PrivateSnapshot(){
 const source=SpreadsheetApp.openById(BEAGU26.sourceId).getSheetByName(BEAGU26.sourceTab);
 const headers=source.getRange(1,1,1,source.getLastColumn()).getDisplayValues()[0],c=questionColumns(headers);
 const last=Math.max(...c.q,c.school,c.schoolType,c.region,...c.office);
 if(source.getLastRow()>BEAGU26.maxResponses+1||headers.slice(0,last+1).some(h=>/^Q(?:1[4-9]|[2-9][0-9])\./.test(String(h))))throw Error('VI13 source boundary');
 const keep=new Set([0,c.school,c.schoolType,c.region,...c.office,...c.q]);
 const values=source.getRange(1,1,Math.max(1,source.getLastRow()),last+1).getDisplayValues()
  .map((r,i)=>i===0?r:r.map((v,j)=>keep.has(j)?v:''));
 const schools=fetchSchools(),built=beagu26BuildVI13(values,schools,beagu26VI13Resolve);
 const rows=beagu26VI13Rank(built.schools,schools);
 return {rows,sourceRows:values.slice(1).filter(r=>r[0]||r[c.school]).length,unmatched:built.unmatched,invalid:built.invalid,excluded:built.excluded};
}
function beagu26VI13Workbook(){
 const id=PropertiesService.getScriptProperties().getProperty('BEAGU_VI13_PRIVATE_WORKBOOK_ID');
 if(!id||id===BEAGU26.sourceId||id===BEAGU26.destinationId)throw Error('VI13 separate private workbook required');
 const book=SpreadsheetApp.openById(id),baseline=book.getSheetByName(BEAGU_VI13_BASELINE_TAB);
 if(!baseline||baseline.getLastRow()<573)throw Error('VI13 verification baseline not found');
 return {book,baseline};
}
function previewBeagu2026VI13SheetSync(){
 const {baseline}=beagu26VI13Workbook(),s=beagu26VI13PrivateSnapshot();
 const guard=beagu26VI13CheckBaseline(s.rows,baseline.getRange(2,1,baseline.getLastRow()-1,4).getValues());
 // No school identifiers, answers or credentials in the log.
 const result={schools:s.rows.length,observations:s.rows.reduce((n,r)=>n+r.observations,0),sourceRows:s.sourceRows,unmatched:s.unmatched,invalid:s.invalid,excluded:s.excluded,guard};
 Logger.log(JSON.stringify(result));return result;
}
function refreshBeagu2026VI13SheetSync(){
 const lock=LockService.getScriptLock();if(!lock.tryLock(1000))throw Error('VI13 sync busy');
 try{
  const {book,baseline}=beagu26VI13Workbook(),s=beagu26VI13PrivateSnapshot();
  const guard=beagu26VI13CheckBaseline(s.rows,baseline.getRange(2,1,baseline.getLastRow()-1,4).getValues());
  if(!guard.ok)throw Error('VI13 baseline regression: '+JSON.stringify(guard));
  let tab=book.getSheetByName(BEAGU_VI13_SYNC_TAB);
  if(tab&&tab.getLastRow()>=4){
   const old=tab.getRange(1,1,tab.getLastRow(),8).getValues();
   if(old[0][0]!=='VI13_SYNC_V1'||Number(old[0][2])!==old.length-2)throw Error('VI13 previous snapshot invalid');
   const previous=old.slice(2).map(r=>[r[0],r[5],r[6],360360]);
   const continuity=beagu26VI13CheckBaseline(s.rows,previous);
   if(!continuity.ok)throw Error('VI13 last-good regression: '+JSON.stringify(continuity));
  }
  // One rectangular write; the verified original tabs are never edited.
  if(!tab)tab=book.insertSheet(BEAGU_VI13_SYNC_TAB);
  const rows=[
   ['VI13_SYNC_V1',new Date().toISOString(),s.rows.length,s.rows.reduce((n,r)=>n+r.observations,0),BEAGU_VI13_METHOD,s.sourceRows,'PRIVATE',''],
   ['school_id','school_name','region','percentile','rank','observations','sum_units','flags'],
   ...s.rows.map(r=>[r.school_id,r.school_name,r.region,r.percentile,r.rank,r.observations,r.sum_units,r.flags])
  ];
  if(tab.getMaxRows()<rows.length)tab.insertRowsAfter(tab.getMaxRows(),rows.length-tab.getMaxRows());
  if(tab.getMaxColumns()<8)tab.insertColumnsAfter(tab.getMaxColumns(),8-tab.getMaxColumns());
  tab.getRange(1,1,rows.length,8).setValues(rows);
  SpreadsheetApp.flush();
  if(PropertiesService.getScriptProperties().getProperty('BEAGU_VI13_PUSH_ENABLED')==='1'){
   try{beagu26VI13PushRows(rows);}catch(e){Logger.log('VI13_PUSH_FAILED');throw Error('VI13 push failed; private sheet retained');}
  }
  return {schools:s.rows.length,sourceRows:s.sourceRows};
 }finally{lock.releaseLock();}
}
// Manual retry sends the already verified private tab, without reaggregating or touching triggers.
function pushBeagu2026VI13ExistingSnapshot(){
 const lock=LockService.getScriptLock();if(!lock.tryLock(1000))throw Error('VI13 sync busy');
 try{
  const {book,baseline}=beagu26VI13Workbook(),tab=book.getSheetByName(BEAGU_VI13_SYNC_TAB);
  if(!tab||tab.getLastRow()<606)throw Error('VI13 snapshot missing');
  const rows=tab.getRange(1,1,tab.getLastRow(),8).getValues(),m=rows[0];
  if(m[0]!=='VI13_SYNC_V1'||m[2]!==rows.length-2||m[2]<604||m[3]<724||m[4]!==BEAGU_VI13_METHOD||m[6]!=='PRIVATE')throw Error('VI13 snapshot invalid');
  const guard=beagu26VI13CheckBaseline(rows.slice(2).map(r=>({school_id:String(r[0]),observations:r[5],sum_units:r[6]})),baseline.getRange(2,1,baseline.getLastRow()-1,4).getValues());
  if(!guard.ok)throw Error('VI13 baseline regression');
  return beagu26VI13PushRows(rows);
 }finally{lock.releaseLock();}
}
function beagu26VI13PushRows(rows){
 const token=PropertiesService.getScriptProperties().getProperty('BEAGU_2026_INGEST_TOKEN')||'';
 if(token.length<32)throw Error('VI13 ingest token required');
 const values=rows.map((r,i)=>i<2?r.slice(0,8):[String(r[0]),...r.slice(1,8)]);
 // getValues can represent an ISO timestamp as a Date; transmit its canonical representation.
 if(values[0][1] instanceof Date)values[0][1]=values[0][1].toISOString();
 const response=UrlFetchApp.fetch(BEAGU26.supabaseUrl+'/functions/v1/beagu-2026-results-ingest',{method:'post',contentType:'application/json',headers:{'X-Beagu-Ingest-Token':token},payload:JSON.stringify({kind:'VI13_SHEET_PUSH_V1',values}),muteHttpExceptions:true});
 if(response.getResponseCode()!==200)throw Error('VI13 push HTTP '+response.getResponseCode());
 const result=JSON.parse(response.getContentText());
 if(result.ok!==true||result.kind!=='VI13_SHEET_PUSH_V1'||result.schools!==values[0][2]||result.observations!==values[0][3])throw Error('VI13 push acknowledgment invalid');
 Logger.log('VI13_PUSH_OK schools='+result.schools+' observations='+result.observations);
 return {schools:result.schools,observations:result.observations};
}
function installBeagu2026VI13SheetSync(){
 // The owner must run this manually, after the read-only preview passes.
 const preview=previewBeagu2026VI13SheetSync();
 if(!preview.guard.ok)throw Error('VI13 baseline regression; no trigger installed');
 refreshBeagu2026VI13SheetSync();
 const name='refreshBeagu2026VI13SheetSync';
 const existing=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()===name);
 if(existing.length===0)ScriptApp.newTrigger(name).timeBased().everyDays(1).atHour(12).nearMinute(30).inTimezone('Asia/Seoul').create();
 else existing.slice(1).forEach(t=>ScriptApp.deleteTrigger(t));
}
if(typeof module==='object'&&module.exports)module.exports={beagu26VI13Rank,beagu26VI13CheckBaseline,beagu26VI13Aliases,beagu26VI13Resolve};
