import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('js/beagu-admin-access-v1.js','utf8');
const html=fs.readFileSync('admin.html','utf8');
const sql=fs.readFileSync('supabase/migrations/20261121093000_referral_funnel_private_v1.sql','utf8');

function renderFixture(){
 const start=source.indexOf('function renderReferralFunnel(data){');
 const end=source.indexOf('function displayDashboard(',start);
 assert.ok(start>=0&&end>start,'existing private referral renderer found');
 const nodes=new Map();
 const root={children:[],replaceChildren(){this.children=[]},append(...items){this.children.push(...items)}};
 const input={value:''};
 const status={textContent:''};
 nodes.set('adminReferralFunnelRows',root);
 nodes.set('adminReferralCodeSearch',input);
 nodes.set('adminReferralFunnelStatus',status);
 const make=(tag,cls,content)=>{
  const n={tag,cls,textContent:content===undefined?'':String(content),children:[],
    append(...items){this.children.push(...items)}};
  return n;
 };
 const num=value=>Number(value).toLocaleString('ko-KR');
 const fn=vm.runInNewContext('('+source.slice(start,end).trim()+')',{
  $:id=>nodes.get(id),make,num,Date
 });
 return {fn,root,status,input};
}
const rows=n=>Array.from({length:n},(_,i)=>({
 code:'REF'+String(i+1).padStart(5,'0'),
 opened:i,proof_issued:i, credited:0,form_events:0,
 handoffs:0,lifetime_valid:0
}));

test('stage34: existing referral RPC limits returned codes to 200 — cannot claim full 10k search',()=>{
 assert.match(sql,/create or replace function public\.beagu_admin_referral_funnel_v1/);
 assert.match(sql,/limit 200/);
 assert.match(source,/\.slice\(0,200\)/);
 assert.match(source,/상위 최대 200개 코드 목록/);
 assert.match(html,/전체 코드 검색·페이지 이동은 아직 지원되지 않습니다/);
 assert.match(html,/<section class="dash-section" id="adminReferralFunnel"/);
});
test('stage34: 10,001 synthetic referral codes render at most 200 rows to prevent browser stalls',()=>{
 const h=renderFixture();
 h.fn({period:'7d',as_of:'2026-11-22T00:00:00Z',rows:rows(10001)});
 assert.equal(h.root.children.length,200);
 assert.equal(h.root.children[0].children[0].textContent,'REF00001');
 assert.equal(h.root.children.at(-1).children[0].textContent,'REF00200');
 assert.match(h.status.textContent,/200개 코드 표시/);
 assert.match(h.status.textContent,/상위 최대 200개 코드 목록 한정/);
});
test('stage34: failed top-200 search warns of truncation, never claims an absent code does not exist',()=>{
 const h=renderFixture();
 h.input.value='REF10001';
 h.fn({period:'all',as_of:'2026-11-22T00:00:00Z',rows:rows(200)});
 assert.equal(h.root.children.length,1);
 assert.match(h.root.children[0].children[0].textContent,/상위 최대 200개 목록에 일치 코드가 없습니다/);
 assert.match(h.status.textContent,/전체 코드 검색 아님/);
 assert.match(h.status.textContent,/최근 30일/);
 assert.doesNotMatch(h.status.textContent,/전체 코드 200개/);
});
