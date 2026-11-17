/* Public directory loader for the comparison-only statistics page.
 * Fetches only the existing anonymous school directory and verified Lv.0 snapshot.
 * Deliberately does not access school-level private survey answers.
 */
(() => {
  'use strict';
  const $ = id=>document.getElementById(id);
  async function directory() {
    if(typeof supabaseClient==='undefined') throw Error('공개 학교목록 연결 코드가 없습니다.');
    const map=new Map(), pageSize=700;
    for(let offset=0;offset<20000;offset+=pageSize){
      const {data,error}=await supabaseClient.from('schools')
        .select('school_id,school_name,sido_standard,support_office,establishment,status')
        .eq('status','운영')
        .order('school_id',{ascending:true})
        .range(offset,offset+pageSize-1);
      if(error) throw Error('학교목록 조회 실패: '+(error.message||'DB_ERROR'));
      if(!Array.isArray(data))throw Error('학교목록 응답 형식 오류');
      for(const s of data){
        const id=String(s?.school_id||'');
        if(!/^[A-Z0-9]{7}$/.test(id)||!String(s?.school_name||'').trim())continue;
        if(map.has(id))throw Error('중복 학교 코드 확인');
        map.set(id,s);
      }
      if(data.length<pageSize)break;
    }
    if(!map.size)throw Error('학교목록이 비어 있습니다.');
    return [...map.values()];
  }
  async function snapshot(){
    const res=await fetch('data/public-lv0-percentiles-v1.2.json',{cache:'no-cache'});
    if(!res.ok)throw Error('공개 백분위 로드 실패');
    if(!window.BeaguPublic?.buildIndex)throw Error('공개 백분위 검증 함수가 없습니다.');
    const map=window.BeaguPublic.buildIndex(await res.json());
    if(!(map instanceof Map)||!map.size)throw Error('공개본이 비어 있습니다.');
    return map;
  }
  async function start(){
    const loading=window.BeaguLoading?.start('비교할 학교 목록을 불러오는 중…');
    const progress=$('compareFeedback');
    if(progress) progress.textContent='학교 목록을 불러오는 중…';
    try{
      const [schools,snap]=await Promise.allSettled([directory(),snapshot()]);
      const list=schools.status==='fulfilled'?schools.value:[];
      const data=snap.status==='fulfilled'?snap.value:new Map();
      window.dispatchEvent(new CustomEvent('beagu:statistics-ready',{
        detail:{schools:list,snapshot:data,snapshotReady:snap.status==='fulfilled'}
      }));
      if(schools.status==='rejected'){
        if(progress)progress.textContent='학교 목록을 불러오지 못했습니다. 연결을 확인하고 새로고침해 주세요.';
        console.error('공개 학교목록 조회 실패',schools.reason);
      }else if(snap.status==='rejected'){
        if(progress)progress.textContent='학교 검색은 가능하지만 공개 백분위를 확인할 수 없습니다.';
        console.error('공개 백분위 조회 실패',snap.reason);
      }else if(progress&&progress.textContent==='학교 목록을 불러오는 중…'){
        progress.textContent='';
      }
    }finally{window.BeaguLoading?.finish(loading)}
  }
  start();
})();
