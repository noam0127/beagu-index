/* Lightweight, privacy-preserving page-performance sampling.
 * Navigation: browser window.load end, NOT interactive data-ready.
 * Actions: explicit completed/failed school searches, selections, directory loads.
 * No search text, URLs, names, IPs, raw errors or private survey data are transmitted.
 */
(() => {
  'use strict';
  const allowedPages=new Set(['index','search','search-lv1','statistics','school-report',
    'result','challenge','volleyball','teacher-run']);
  const pageFromPath={
    'index.html':'index','search.html':'search','search-lv1.html':'search-lv1',
    'statistics.html':'statistics','school-report.html':'school-report',
    'result.html':'result','challenge.html':'challenge',
    'teacher-volleyball.html':'volleyball','teacher-run.html':'teacher-run'
  };
  const raw=(location.pathname.split('/').pop()||'index.html');
  const page=pageFromPath[raw];
  if(!allowedPages.has(page)||!window.crypto?.randomUUID)return;
  const pattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let visitor=typeof window.beaguVisitor==='string'&&pattern.test(window.beaguVisitor)
    ?window.beaguVisitor:null;
  if(!visitor){
    for(const name of ['localStorage','sessionStorage']){
      try{
        const store=window[name],saved=store.getItem('beagu-visitor-v1');
        visitor=pattern.test(saved||'')?saved:crypto.randomUUID();
        if(!pattern.test(saved||''))store.setItem('beagu-visitor-v1',visitor);
        break;
      }catch(_){visitor=null;}
    }
  }
  if(!visitor)return;
  const allowedActions=new Set(['navigation','school_search','school_selection','compare_directory']);
  let pending=0;
  function record(operation,duration,ok){
    if(!allowedActions.has(operation)||!Number.isFinite(duration)||
       duration<0||typeof ok!=='boolean'||pending>3||
       typeof supabaseClient==='undefined')return;
    const rounded=Math.max(1,Math.round(duration));
    if(rounded>120000)return;
    pending++;
    // The public RPC only writes into private tables, and may silently discard
    // a duplicate sample; failures never change the searched schools or gameplay.
    Promise.resolve().then(()=>supabaseClient.rpc('beagu_perf_record_v1',{
      p_visitor:visitor,p_page:page,p_operation:operation,
      p_duration_ms:rounded,p_ok:ok
    })).catch(()=>{}).finally(()=>{pending=Math.max(0,pending-1)});
  }
  window.BeaguPerf=Object.freeze({record});
  function navigationSample(){
    // NavigationTiming.loadEventEnd may still be 0 INSIDE a window.load handler.
    // Read it in the next task, after the load event has completely finished.
    window.setTimeout(()=>{
      const nav=performance.getEntriesByType?.('navigation')?.[0];
      const old=performance.timing;
      const elapsed=Number(nav?.loadEventEnd)||(old?.loadEventEnd&&old?.navigationStart
        ?old.loadEventEnd-old.navigationStart:0);
      if(Number.isFinite(elapsed)&&elapsed>0){
        // Measurement collection never delays the interactive page.
        window.setTimeout(()=>record('navigation',elapsed,true),1700);
      }
    },120);
  }
  if(document.readyState==='complete')navigationSample();
  else window.addEventListener('load',navigationSample,{once:true});
})();
