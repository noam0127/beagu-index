(function(){
 'use strict';
 const fields=[['학생 수','student_count','명'],['교원 수','teacher_total','명'],['남교사 비율','male_teacher_ratio','%'],['2급 정교사 비율','second_grade_teacher_ratio','%']];
 const metricKeys=new Set(['student_count','male_teacher_ratio','junior_teacher_ratio','beagu_percentile_2025']);
 const integer=(n,max)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
 function parseIndex(data){
  if(data?.version!=='schoolinfo-2026-certified-v1'||data.source_year!==2026||!Array.isArray(data.rows)||data.rows.length!==6277)throw Error('INVALID_OFFICIAL_BASICS');
  const out=new Map();
  for(const row of data.rows){
   if(!Array.isArray(row)||row.length!==5)throw Error('INVALID_OFFICIAL_ROW');
   const [id,n,t,m,s]=row;
   if(typeof id!=='string'||!/^[A-Z0-9]{7}$/.test(id)||out.has(id)||!integer(n,100000)||!integer(t,10000)||t===0||!integer(m,t)||!integer(s,t))throw Error('INVALID_OFFICIAL_ROW');
   out.set(id,Object.freeze({source_year:2026,student_count:n,teacher_total:t,male_teacher_ratio:Math.round(m*10000/t)/100,second_grade_teacher_ratio:Math.round(s*10000/t)/100}));
  }
  return out;
 }
 let pending;
 function index(){
  if(!pending)pending=fetch('data/public-school-basics-2026-v1.json?v=11118-static1',{cache:'default'}).then(r=>{if(!r.ok)throw Error('OFFICIAL_BASICS_UNAVAILABLE');return r.json()}).then(parseIndex).catch(e=>{pending=null;throw e});
  return pending;
 }
 async function load(ids){
  if(!Array.isArray(ids)||!ids.length||ids.length>20||ids.some(id=>!/^[A-Z0-9]{7}$/.test(id)))return {};
  const source=await index(),out=Object.create(null);
  for(const id of ids)if(source.has(id))out[id]=source.get(id);
  return out;
 }
 function rank(rows,sort,direction,basics,publicIndex){
  if(!metricKeys.has(sort)||!['asc','desc'].includes(direction))throw Error('INVALID_SORT');
  const mean=school=>{
   const values=window.BeaguPublic.values(publicIndex.get(String(school.school_id))).filter(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100);
   return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  };
  const key=school=>{
   const p=basics.get(String(school.school_id));
   if(sort==='beagu_percentile_2025')return mean(school);
   return p?.[sort==='junior_teacher_ratio'?'second_grade_teacher_ratio':sort]??null;
  };
  return rows.map(s=>({...s,staticFactsOnly:true,rankValue:key(s)})).sort((a,b)=>{
   const x=a.rankValue,y=b.rankValue;
   if(x===null&&y!==null)return 1;if(y===null&&x!==null)return -1;
   if(x!==null&&y!==null&&x!==y)return direction==='asc'?x-y:y-x;
   return String(a.school_name).localeCompare(String(b.school_name),'ko')||String(a.school_id).localeCompare(String(b.school_id));
  });
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
   val.textContent=valid?n.toLocaleString('ko-KR',{maximumFractionDigits:2})+unit:failed?'조회 실패':'자료 없음';
   item.append(name,val);facts.append(item);
  }
  host.replaceChildren(title,facts);
 }
 window.BeaguPublicSchoolBasics2026=Object.freeze({load,render,index,parseIndex,rank,metricKeys});
})();