const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const telemetry=fs.readFileSync('js/search-telemetry-v1.js','utf8');
const widget=fs.readFileSync('js/school-view-counts-v1.js','utf8');
new vm.Script(telemetry);
new vm.Script(widget);
for(const path of ['search.html','search-lv1.html','school-report.html']){
  const html=fs.readFileSync(path,'utf8');
  assert.ok(html.includes('js/search-telemetry-v1.js?v=11117-combined1-clean1'),'Search telemetry must be cache-busted on '+path);
  assert.ok(html.includes('js/school-view-counts-v1.js?v=11117-combined1'),'Counter widget must be cache-busted on '+path);
}
assert.ok(telemetry.includes("supabaseClient.rpc('beagu_record_school_view_v2'"));
assert.ok(widget.includes('applyConfirmedCount:paint'));
const visitor='123e4567-e89b-42d3-a456-426614174000';
async function scenario(withWidget){
  const calls=[],paints=[];
  let seq=0;
  const win={beaguVisitor:visitor};
  if(withWidget)win.BeaguSchoolViewCounts={applyConfirmedCount:(id,count)=>paints.push({id,count})};
  const rpc=(name,args)=>{
    calls.push({name,args});
    if(name==='beagu_log_school_search')return Promise.resolve({data:true,error:null});
    if(name==='beagu_record_school_view_v2')return Promise.resolve({
      data:{school_id:args.p_school_id,views:1,counted:true},error:null
    });
    return Promise.resolve({data:true,error:null});
  };
  vm.runInNewContext(telemetry,{
    window:win,supabaseClient:{rpc},
    crypto:{randomUUID:()=>('00000000-0000-4000-8000-'+String(++seq).padStart(12,'0'))},
    Date,console,Promise
  },{filename:'search-telemetry-v1.js'});
  assert.equal(win.BeaguSearchTelemetry.selected('1234567',0,'search',{isTrusted:false}),null);
  assert.equal(calls.length,0,'Programmatic selection must not log views');
  const action=win.BeaguSearchTelemetry.selected('1234567',0,'search',{isTrusted:true});
  assert.ok(action,'Trusted selection emits an action ID');
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls.map(c=>c.name),[
    'beagu_log_school_search','beagu_record_school_view_v2'
  ]);
  const view=calls.find(c=>c.name==='beagu_record_school_view_v2');
  assert.equal(view.args.p_school_id,'1234567');
  assert.equal(view.args.p_action_id,action);
  assert.equal(view.args.p_visitor,visitor);
  assert.equal(paints.length,withWidget?1:0);
  if(withWidget)assert.deepEqual(paints[0],{id:'1234567',count:1});
  assert.equal(win.BeaguSearchTelemetry.selected('1234567',0,'search',{isTrusted:true}),null);
  assert.equal(calls.length,2,'Repeated client click within five seconds is ignored');
  win.BeaguSearchTelemetry.searchConfirmed('7654321',0,'search');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.filter(c=>c.name==='beagu_record_school_view_v2').length,2,'Confirmed search increments the search category');
  win.BeaguSearchTelemetry.detailViewed('1234567',0,'search',action);
  await new Promise(resolve=>setImmediate(resolve));
  const records=calls.filter(c=>c.name==='beagu_record_school_view_v2');
  assert.deepEqual(records.map(c=>c.args.p_event_type),['school_selected','search_confirmed','detail_viewed']);
  const reportAction=win.BeaguSearchTelemetry.selectedFromReport('7654321');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.filter(c=>c.name==='beagu_record_school_view_v2').length,3,'Direct report navigation is not a search');
  win.BeaguSearchTelemetry.detailViewed('7654321',0,'school-report',reportAction);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.filter(c=>c.name==='beagu_record_school_view_v2').length,4,'Direct report detail still counts');
  assert.ok(calls.every(c=>['beagu_log_school_search','beagu_record_school_view_v2'].includes(c.name)),'No legacy write on any route');
}
(async()=>{
 await scenario(false);
 await scenario(true);
 console.log('PASS: verified selections record server-side views with/without the optional UI widget; no synthetic clicks, confirmed searches and detail events counted separately');
})().catch(e=>{console.error(e);process.exitCode=1;});
