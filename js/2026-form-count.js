/* Live, nationwide 2026 Google Forms submission-row counter.
 * Reads only an approved one-row public aggregate. Never reads survey,
 * respondent, school, per-question or answer data in the browser.
 * This count is NOT the separate challenge ordinal / XP participant count.
 */
(() => {
  'use strict';
  const countNode=document.querySelector('[data-beagu-2026-form-count]');
  const timeNode=document.querySelector('[data-beagu-2026-form-updated]');
  if(!countNode||!timeNode)return;
  let fetching=false;
  const refresh=async()=>{
    if(fetching)return;
    fetching=true;
    try{
      if(typeof supabaseClient==='undefined')throw Error('UNAVAILABLE');
      const {data,error}=await supabaseClient
        .from('beagu_2026_public_progress')
        .select('official_submission_rows,refreshed_at,publish_policy')
        .eq('id',1).maybeSingle();
      if(error)throw error;
      if(!data||data.publish_policy!=='national_submission_count_only_v1'||
        !Number.isSafeInteger(data.official_submission_rows)||data.official_submission_rows<0){
        countNode.textContent='집계 연동 대기';
        timeNode.textContent='자동 집계 설정을 확인하고 있습니다.';
        return;
      }
      countNode.textContent=data.official_submission_rows.toLocaleString('ko-KR')+'건';
      const stamp=Date.parse(data.refreshed_at);
      timeNode.textContent=Number.isFinite(stamp)
        ?'마지막 반영 '+new Date(stamp).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})
        :'마지막 반영 시각 확인 불가';
    }catch{
      countNode.textContent='집계 확인 불가';
      timeNode.textContent='연결 오류입니다. 잠시 후 다시 확인해 주세요.';
    }finally{fetching=false;}
  };
  refresh();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
  window.addEventListener('pageshow',()=>{void refresh();});
  window.setInterval(()=>{if(!document.hidden)void refresh();},60000);
  window.Beagu2026FormCount={refresh};
})();
