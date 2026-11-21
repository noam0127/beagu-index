import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const read=p=>fs.readFileSync(p,'utf8');
const code=read('js/beagu-admin-chart-integrity-v1.js');
const admin=read('admin.html');
const adminJs=read('js/beagu-admin-access-v1.js');
const members=read('js/beagu-admin-members-v1.js');
const style=read('styles/beagu-admin-section-index-v1.css');
const publicHome=read('index.html');

function fixture(){
 const ctx={window:{}};
 vm.runInNewContext(code,ctx,{timeout:1200,filename:'beagu-admin-chart-integrity-v1.js'});
 return ctx.window.BeaguAdminChartIntegrity;
}
const toPlain=val=>JSON.parse(JSON.stringify(val));

test('stage32: grouped section links are all in MFA-gated dashboard and owner-only member link stays hidden',()=>{
 const start=admin.indexOf('<section id="adminDashboard" hidden>');
 const end=admin.indexOf('</section>\n\n    <footer>',start);
 assert.ok(start>0&&end>start,'private dashboard is MFA-gated');
 const privateMarkup=admin.slice(start,end);
 const navigation=privateMarkup.match(/<nav class="admin-section-index"[\s\S]*?<\/nav>/)?.[0];
 assert.ok(navigation,'grouped native nav exists');
 assert.equal((admin.match(/id="adminMemberNavLink"/g)||[]).length,1);
 assert.match(navigation,/id="adminMemberNavLink" href="#adminMemberManagement" hidden/);
 assert.match(members,/if \(role !== "owner"\) return;/);
 assert.match(members,/\$\("adminMemberNavLink"\)\.hidden = false/);
 assert.match(members,/\$\("adminMemberNavLink"\)\.hidden = true/);
 for(const hash of [
  'adminSiteHeading','adminPerfHeading','adminSearchHeading','adminGamesHeading',
  'adminLevelHeading','adminMemberManagement','adminReferralFunnel','adminReview2026',
  'adminSecurityHeading'
 ]){
  assert.match(navigation,new RegExp('href="#'+hash+'"'),'no broken anchor: '+hash);
  assert.match(privateMarkup,new RegExp('id="'+hash+'"'),'missing dashboard target: '+hash);
 }
 assert.match(navigation,/href="admin-updates\.html"/);
 assert.ok(admin.indexOf('id="adminSectionIndex"')<admin.indexOf('id="adminPeriods"'));
 assert.equal((admin.match(/id="adminSectionIndex"/g)||[]).length,1);
 assert.match(style,/@media\(max-width:560px\)/);
 assert.match(style,/a\[hidden\]\{display:none!important\}/);
 assert.doesNotMatch(publicHome,/href="admin\.html"/);
 assert.match(admin,/<meta name="robots" content="noindex,nofollow,noarchive">/);
});

test('stage32: statically loaded parser precedes dashboard renderer; no permission API moved to client',()=>{
 assert.ok(admin.indexOf('js/beagu-admin-chart-integrity-v1.js') <
   admin.indexOf('js/beagu-admin-access-v1.js'));
 assert.match(adminJs,/gate\("verify"\)/);
 assert.match(adminJs,/!proof\.permitted \|\| !proof\.mfa_verified/);
 assert.match(adminJs,/BeaguAdminChartIntegrity\?\.daily\(rows,metric,scale\)/);
 assert.match(adminJs,/BeaguAdminChartIntegrity\?\.hourly\(data\?\.hourly_visits\)/);
 assert.match(adminJs,/root\.dataset\.dataState=output\.status/);
 assert.match(adminJs,/if\(count>0\)\{/);
 assert.match(adminJs,/if\(views>0\)\{/);
 assert.match(adminJs,/invalidateChartData\(\)/);
 assert.match(adminJs,/\+\+liveSeq/);
 assert.match(adminJs,/if\(liveSeq!==expectedSeq\|\|\$\("adminDashboard"\)\.hidden\)return/);
 assert.doesNotMatch(adminJs,/\(Number\(d\[metric\]\)\|\|0\)/);
 assert.doesNotMatch(code,/fetch\(|service_role|SUPABASE_SERVICE_ROLE_KEY|localStorage|sessionStorage/);
});

test('stage32: missing/null data are unavailable, explicit empty arrays mean no record, numeric zero is NOT missing',()=>{
 const p=fixture();
 for(const source of [undefined,null,{},''] ){
  assert.equal(p.daily(source,'views','day').status,'unavailable');
  assert.equal(p.hourly(source).status,'unavailable');
 }
 assert.equal(p.daily([],'views','day').status,'empty');
 assert.equal(p.hourly([]).status,'empty');
 let rows=p.daily([{day:'2026-11-21',views:0}],'views','day');
 assert.equal(rows.status,'zero');
 assert.equal(rows.points[0].value,0);
 rows=p.daily([{day:'2026-11-21',views:'0'}],'views','day');
 assert.equal(rows.status,'zero');
 const hours=p.hourly([{hour:0,views:0},{hour:1,views:'0'}]);
 assert.equal(hours.status,'zero');
 assert.equal(hours.points[0].value,0);
 assert.equal(hours.points[1].value,0);
 assert.equal(hours.points[2].value,null,'an unreported hour is NOT fabricated zero');
});

test('stage32: invalid missing, negative, fractional, duplicate, overflow or impossible calendar values fail closed',()=>{
 const p=fixture();
 for(const row of [
  {day:'2026-11-21'}, {day:'2026-11-21',views:null},
  {day:'2026-11-21',views:''},{day:'2026-11-21',views:-1},
  {day:'2026-11-21',views:3.5},{day:'2026-02-30',views:1},
  {day:'2026-13-01',views:1},{day:'2026-11-21',views:'NaN'},
  {day:'2026-11-21',views:[]},{day:'2026-11-21',views:'01'}
 ])assert.equal(p.daily([row],'views','day').status,'invalid',JSON.stringify(row));
 assert.equal(p.daily([{day:'2026-11-21',views:Number.MAX_SAFE_INTEGER},
   {day:'2026-11-21',views:1}],'views','day').status,'invalid','overflow');
 for(const rows of [
  [{hour:24,views:1}],[{hour:-1,views:0}],
  [{hour:1,views:undefined}],[{hour:1,views:null}],
  [{hour:1,views:-1}],[{hour:1,views:0},{hour:1,views:1}],
  [{hour:1,views:'0.5'}],[{hour:1,views:9007199254740992}]
 ])assert.equal(p.hourly(rows).status,'invalid',JSON.stringify(rows));
 assert.equal(p.daily([{day:'2026-11-21',views:1}],'views','year').status,'invalid');
 assert.equal(p.daily([{day:'2026-11-21',unknown:1}],'unknown','day').status,'invalid');
});

test('stage32: daily/weekly/monthly groups preserve real sums and distinguish 0 bars from missing days',()=>{
 const p=fixture();
 const samples=[
  {day:'2026-11-22',views:3,searches:0,plays:4},
  {day:'2026-11-23',views:'4',searches:2,plays:0},
  {day:'2026-12-01',views:0,searches:0,plays:2}
 ];
 assert.deepEqual(toPlain(p.daily(samples,'views','day')),{status:'ready',points:[
  {key:'2026-11-22',value:3},{key:'2026-11-23',value:4},{key:'2026-12-01',value:0}
 ]});
 assert.deepEqual(toPlain(p.daily(samples,'views','week')),{status:'ready',points:[
  {key:'2026-11-16',value:3},{key:'2026-11-23',value:4},{key:'2026-11-30',value:0}
 ]});
 assert.deepEqual(toPlain(p.daily(samples,'views','month')),{status:'ready',points:[
  {key:'2026-11',value:7},{key:'2026-12',value:0}
 ]});
 assert.equal(p.daily(samples,'searches','week').status,'ready');
 assert.equal(p.daily(samples,'plays','day').status,'ready');
});

test('stage32: hourly chart retains missing buckets as missing, never guesses activity',()=>{
 const p=fixture();
 const data=p.hourly([{hour:0,views:4},{hour:7,views:0},{hour:23,views:'2'}]);
 assert.equal(data.status,'ready');
 assert.equal(data.points.length,24);
 assert.deepEqual(toPlain(data.points.filter(v=>v.value!==null)),[
  {hour:0,value:4},{hour:7,value:0},{hour:23,value:2}
 ]);
 assert.ok(Object.isFrozen(p),'cannot replace the approved chart parser');
});
