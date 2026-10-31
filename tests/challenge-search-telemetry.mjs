import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';
import assert from 'node:assert/strict';

const read=path=>readFileSync(path,'utf8');
const xp=read('js/challenge-progress-v1.js');
const telemetry=read('js/search-telemetry-v1.js');
assert.doesNotThrow(()=>new Script(xp));
assert.doesNotThrow(()=>new Script(telemetry));
const xpScope={
 window:{},
 document:{readyState:'loading',addEventListener:()=>{},querySelectorAll:()=>[]}
};
runInNewContext(xp,xpScope);
const progress=xpScope.window.BeaguChallengeProgress;
assert.equal(progress.GOAL,500);
function target(){
 const controls=new Map();
 for(const k of ['number','remainder','progress','state']){
  controls.set(k,{textContent:'순번 확인 중',style:{},attributes:{},
   setAttribute(a,v){this.attributes[a]=v;},
   removeAttribute(a){delete this.attributes[a];}});
 }
 return {dataset:{},querySelector:s=>controls.get(s.match(/data-xp-(.*?)\]/)?.[1]),controls};
}
let a=target();
assert.equal(progress.render(a,499),true);
assert.equal(a.controls.get('remainder').textContent,'1명 남음');
assert.equal(a.controls.get('progress').style.width,'99.8%');
assert.equal(a.controls.get('progress').attributes['aria-valuenow'],'499');
a=target();progress.render(a,500);
assert.equal(a.controls.get('progress').style.width,'100.0%');
assert.equal(a.controls.get('remainder').textContent,'목표 달성');
a=target();progress.render(a,501);
assert.equal(a.controls.get('number').textContent,'501 / 500');
assert.equal(a.controls.get('progress').style.width,'100.0%');
assert.equal(a.controls.get('progress').attributes['aria-valuenow'],'500');
a=target();progress.unavailable(a);
assert.equal(a.controls.get('number').textContent,'집계 확인 불가');
assert.notEqual(a.controls.get('number').textContent,'0 / 500');
assert.equal(a.controls.get('progress').attributes['aria-valuenow'],undefined);
assert.equal(progress.render(a,NaN),false);
assert.notEqual(a.dataset.xpState,'ready');

const calls=[];let index=0;
const context={
 window:{beaguVisitor:'11111111-1111-4111-8111-111111111111'},
 crypto:{randomUUID:()=> '22222222-2222-4222-8222-'+(++index).toString().padStart(12,'0')},
 supabaseClient:{rpc:(name,args)=>{calls.push({name,args});return Promise.resolve({data:true,error:null});}},
 console:{warn:()=>{}}
};
runInNewContext(telemetry,context);
const t=context.window.BeaguSearchTelemetry;
assert.equal(t.selected('1234567',1,'search-lv1',{isTrusted:false}),null);
assert.equal(t.selected('badid',1,'search-lv1',{isTrusted:true}),null);
assert.equal(t.selected('1234567',2,'search-lv1',{isTrusted:true}),null);
assert.equal(calls.length,0,'Auto click and untrusted IDs cannot log');
const action=t.selected('1234567',1,'search-lv1',{isTrusted:true});
assert.ok(action);
assert.equal(calls.length,1);
assert.equal(calls[0].args.p_event_type,'school_selected');
assert.equal(calls[0].args.p_school_id,'1234567');
assert.equal(calls[0].args.p_viewer_level,1);
assert.equal(calls[0].args.p_source_page,'search-lv1');
assert.equal(calls[0].args.p_action_id,action);
assert.equal(t.detailViewed('1234567',1,'search-lv1',action),null===action?null:action);
assert.equal(calls.length,2);
assert.equal(calls[1].args.p_action_id,action,'Pair selection and successfully viewed detail by action ID');
assert.equal(calls[1].args.p_event_type,'detail_viewed');
assert.equal(t.detailViewed('1234567',1,'search-lv1',action),null,'Single view per page');
assert.equal(t.selected('1234567',1,'search-lv1',{isTrusted:true}),null,'Rapid duplicate suppressed');
assert.equal(calls.length,2);
assert.ok(t.searchConfirmed('9876543',0,'search'));
assert.equal(calls.length,3);
assert.equal(calls[2].args.p_event_type,'search_confirmed');
assert.ok(t.detailViewed('9876543',0,'school-report'));
assert.equal(calls.length,4);
assert.equal(calls[3].args.p_source_page,'school-report');
assert.ok(!JSON.stringify(calls).includes('검색어'));
assert.doesNotMatch(telemetry,/p_(?:query|password|ip|code|name)/i);
assert.doesNotMatch(telemetry,/service_role/);
assert.doesNotMatch(xp,/beagu_join_challenge|Google\s*Forms\s*API|random\(\)/,'Never create extra ordinal or fake XP');

const home=read('index.html'),challenge=read('challenge.html');
for(const html of [home,challenge]){
 assert.match(html,/data-beagu-xp/);
 assert.match(html,/styles\/challenge-progress-v1\.css/);
 assert.match(html,/js\/challenge-progress-v1\.js/);
 assert.match(html,/data-xp-progress/);
}
assert.ok(challenge.indexOf('data-beagu-xp')>challenge.indexOf('id="certificate"'),
 'XP should not alter the printable personal certificate');
assert.match(read('js/challenge.js'),/beagu_join_challenge/);
assert.match(read('js/challenge.js'),/BeaguChallengeProgress\.refresh/);
assert.match(read('js/visit-stats.js'),/beagu_record_visit/,'Preserve preexisting visit accounting');

for(const page of ['search.html','search-lv1.html','search-lv2.html','school-report.html']){
 const html=read(page);
 assert.match(html,/js\/search-telemetry-v1\.js\?v=20261031-xp8/);
}
const publicSearch=read('search.html');
const lv1=read('js/level-search.js'),lv2=read('js/lv2-edited-search.js');
for(const source of [publicSearch,lv1,lv2]){
 assert.match(source,/explicitEnter/);
 assert.match(source,/searchConfirmed/);
 assert.match(source,/addEventListener\('keydown'/);
 assert.match(source,/\.selected\(/);
}
assert.match(publicSearch,/count===1&&Array\.isArray\(data\)&&data\.length===1/);
assert.match(lv1,/if\(action\)window\.BeaguSearchTelemetry\?\.detailViewed/);
assert.match(lv2,/if\(loaded&&action\)window\.BeaguSearchTelemetry\?\.detailViewed/);
assert.match(lv1,/showDetails\(detail,\s*data\.rows,\s*school\)/);
assert.match(lv2,/loaded=await showDetail\(detail,s\)/);
assert.match(read('school-report.html'),/if\(!state\.demo\)window\.BeaguSearchTelemetry\?\.detailViewed/);
assert.doesNotMatch(publicSearch,/school-mbti-v1\.js/,'No Lv1 MBTI in Lv0');
const sql=read('supabase/08_xp_search_install.sql');
assert.match(sql,/max\(p\.participant_no\)/);
assert.match(sql,/ALTER TABLE public\.school_search_events ENABLE ROW LEVEL SECURITY/);
assert.match(sql,/REVOKE ALL ON public\.school_search_events FROM PUBLIC,anon,authenticated/);
assert.match(sql,/UNIQUE\(action_id,event_type\)/);
assert.match(sql,/SET search_path (?:=|TO) ''/);
assert.match(sql,/school_search_limits/);
assert.match(sql,/school-report/);
assert.doesNotMatch(sql,/GRANT\s+SELECT\s+ON\s+public\.school_search_events\s+TO\s+anon/i);
for(const file of ['search.html','school-report.html','index.html','challenge.html']){
 const html=read(file);
 for(const block of html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)){
  const opening=block[0].slice(0,block[0].indexOf('>')+1);
  if(/type=["']application\/json["']/.test(opening))continue;
  if(block[1].trim())assert.doesNotThrow(()=>new Script(block[1]),file+' has invalid inline script');
 }
}
console.log('PASS: existing participant ordinal only, 499/500/501, error≠0, intentional school events, privacy and original permissions');
