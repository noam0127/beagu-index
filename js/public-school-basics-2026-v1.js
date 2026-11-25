(function(){
 'use strict';
 const fields=[['학생 수','student_count','명'],['교원 수','teacher_total','명'],['남교사 비율','male_teacher_ratio','%'],['2급 정교사 비율','second_grade_teacher_ratio','%']];
 async function load(ids){
  if(!Array.isArray(ids)||!ids.length||ids.length>20||ids.some(id=>!/^[A-Z0-9]{7}$/.test(id)))return {};
  const r=await fetch('https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-level-api',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({action:'public_school_basics_2026',schoolIds:ids})});
  if(!r.ok)throw Error('OFFICIAL_BASICS_UNAVAILABLE');
  return (await r.json()).official2026||{};
 }
 function render(host,profile,failed=false){
  if(!host)return;
  const title=document.createElement('h3');title.className='official-school-basics-2026';title.textContent='2026 학교 기본정보';
  const facts=document.createElement('div');facts.className='glory-facts';
  for(const [label,key,unit] of fields){
   const item=document.createElement('div');item.className='glory-fact';item.dataset.factKey=key;
   const name=document.createElement('span');name.className='glory-fact-label';name.textContent=label;
   const val=document.createElement('strong');val.className='glory-fact-value';
   const n=profile?.source_year===2026?profile[key]:null,valid=typeof n==='number'&&Number.isFinite(n)&&n>=0&&(unit!=='%'||n<=100);
   val.textContent=valid?n.toLocaleString('ko-KR',{maximumFractionDigits:1})+unit:failed?'조회 실패':'자료 없음';
   item.append(name,val);facts.append(item);
  }
  host.replaceChildren(title,facts);
 }
 window.BeaguPublicSchoolBasics2026=Object.freeze({load,render});
})();