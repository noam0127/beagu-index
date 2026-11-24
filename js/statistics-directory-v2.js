/* Anonymous, publicly approved school directory for comparison.
 * One small first-page query + parallel remaining pages; a short session cache
 * avoids fetching the entire school list every time users revisit comparison.
 * Public percentiles load independently so searching schools does not wait.
 */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const DIRECTORY_KEY='beagu-public-compare-directory-v3';
  const DIRECTORY_TTL_MS=20*60*1000;
  const PAGE_SIZE=1000;
  const fields='school_id,school_name,sido_standard,support_office,establishment,status';
  const valid=s=>s&&/^[A-Z0-9]{7}$/.test(String(s.school_id||''))&&
    typeof s.school_name==='string'&&s.school_name.trim()&&s.status==='운영';
  function cachedDirectory(){
    try{
      const item=JSON.parse(sessionStorage.getItem(DIRECTORY_KEY)||'null');
      if(!item||Date.now()-item.savedAt>DIRECTORY_TTL_MS||!Array.isArray(item.schools)||
         !item.schools.length||item.schools.length>12000||
         !item.schools.every(valid))return null;
      return item.schools;
    }catch(_){return null}
  }
  async function dbDirectory(){
    if(typeof supabaseClient==='undefined')throw Error('공개 학교목록 연결 코드가 없습니다.');
    const query=(offset,count=false)=>supabaseClient.from('schools')
      .select(fields,count?{count:'exact'}:{})
      .eq('status','운영').order('school_id',{ascending:true})
      .range(offset,offset+PAGE_SIZE-1);
    const first=await query(0,true);
    if(first.error||!Array.isArray(first.data))throw Error('학교목록 첫 페이지 조회 실패');
    const total=Number(first.count);
    if(!Number.isInteger(total)||total<1||total>20000)throw Error('학교목록 전체 건수 확인 실패');
    const pages=Math.ceil(total/PAGE_SIZE),all=[first.data];
    // Bound in-flight requests to prevent unnecessary database pressure.
    for(let page=1;page<pages;page+=3){
      const part=await Promise.all(Array.from({length:Math.min(3,pages-page)},(_,i)=>query((page+i)*PAGE_SIZE)));
      if(part.some(item=>item.error||!Array.isArray(item.data)))throw Error('학교목록 추가 페이지 조회 실패');
      all.push(...part.map(item=>item.data));
    }
    const map=new Map();
    for(const page of all)for(const s of page){
      if(!valid(s))continue;
      const id=String(s.school_id);
      if(map.has(id))throw Error('중복 학교 코드 확인');
      map.set(id,s);
    }
    if(map.size!==total)throw Error('학교목록 일부 누락 확인');
    const list=[...map.values()];
    try{sessionStorage.setItem(DIRECTORY_KEY,JSON.stringify({savedAt:Date.now(),schools:list}))}catch(_){}
    return list;
  }
  // Static JSON is generated from public.schools and checked nightly.
  // If missing, incomplete or older than seven days, use the existing DB loader.
  async function staticDirectory(){
    const res=await fetch('data/public-compare-school-directory-v1.json?v=20261120-static1',{cache:'default'});
    if(!res.ok)throw Error('공개 학교목록 파일 응답 오류');
    const body=await res.json();
    const generated=Date.parse(body?.generated_at||'');
    if(body?.schema_version!==2||body?.source!=='public.schools'||
       !Array.isArray(body.rows)||body.rows.length<6000||body.rows.length>15000||
       body.count!==body.rows.length||!Number.isFinite(generated)||
       generated>Date.now()+2*60*60*1000||Date.now()-generated>7*24*60*60*1000)
      throw Error('공개 학교목록 파일 검수 또는 갱신 필요');
    const map=new Map();
    for(const fields of body.rows){
      if(!Array.isArray(fields)||fields.length!==5)throw Error('공개 파일 열 개수 오류');
      const [school_id,school_name,sido_standard,support_office,establishment]=fields;
      const row={school_id,school_name,sido_standard,support_office,establishment,status:'운영'};
      if(!valid(row)||map.has(school_id))throw Error('공개 파일 학교 식별 오류');
      map.set(school_id,row);
    }
    if(map.size!==body.count)throw Error('공개 파일 중복 또는 누락');
    return [...map.values()];
  }
  async function directory(){
    const cached=cachedDirectory();
    if(cached)return cached;
    let list;
    try{list=await staticDirectory();}
    catch(error){
      console.warn('공개 학교목록 정적 파일 미사용, DB 연결로 복구합니다.',error);
      list=await dbDirectory();
    }
    try{sessionStorage.setItem(DIRECTORY_KEY,JSON.stringify({savedAt:Date.now(),schools:list}));}catch(_){}
    return list;
  }
  async function snapshot(){
    const res=await fetch('data/public-lv0-percentiles-v1.2.json?v=20261120-all-regions1',{cache:'default'});
    if(!res.ok)throw Error('공개 백분위 로드 실패');
    if(!window.BeaguPublic?.buildIndex)throw Error('공개 백분위 검증 함수가 없습니다.');
    const index=window.BeaguPublic.buildIndex(await res.json());
    if(!(index instanceof Map)||!index.size)throw Error('공개본이 비어 있습니다.');
    return index;
  }
  // Directory can finish before the comparison script has registered its listener.
  // Retain only the latest directory and percentile events for a one-time replay.
  const readyState={directory:null,snapshot:null};
  window.BeaguStatisticsDirectoryState=readyState;
  function dispatch(detail){
    if(detail.snapshotOnly===true)readyState.snapshot=detail;
    else{readyState.directory=detail;readyState.snapshot=null;}
    window.dispatchEvent(new CustomEvent('beagu:statistics-ready',{detail}));
  }
  async function start(){
    const perfStarted=performance.now();let perfSucceeded=false;
    const loading=window.BeaguLoading?.start('비교할 학교 목록을 불러오는 중…');
    const progress=$('compareFeedback');
    if(progress)progress.textContent='학교 목록을 불러오는 중…';
    // Attach both handlers immediately; a slow percentile file must not block search.
    const snapshotTask=snapshot().then(index=>({index,ready:true})).catch(error=>{
      console.warn('공개 백분위 조회 지연 또는 실패',error);
      return {index:new Map(),ready:false};
    });
    try{
      const schools=await directory();
      dispatch({schools,snapshot:new Map(),snapshotReady:false,snapshotPending:true});
      perfSucceeded=true;
      if(progress&&progress.textContent==='학교 목록을 불러오는 중…')progress.textContent='';
    }catch(error){
      console.error('공개 학교목록 조회 실패',error);
      if(progress)progress.textContent='학교 목록을 불러오지 못했습니다. 새로고침해 주세요.';
      return;
    }finally{
      window.BeaguPerf?.record('compare_directory',performance.now()-perfStarted,perfSucceeded);
      window.BeaguLoading?.finish(loading);
    }
    const snap=await snapshotTask;
    dispatch({snapshotOnly:true,snapshot:snap.index,snapshotReady:snap.ready});
    if(!snap.ready&&progress&&!progress.textContent)
      progress.textContent='학교 검색은 가능하지만 공개 백분위를 확인할 수 없습니다.';
  }
  start();
})();