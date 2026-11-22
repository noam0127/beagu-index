/* Presence-only collector for game pages. No visit-event writes and no game scoring changes. */
(() => {
  'use strict';
  const key='beagu-visitor-v1';
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let visitor='';
  for(const storage of [()=>localStorage,()=>sessionStorage]){
    try{
      const store=storage(),saved=store.getItem(key);
      visitor=uuid.test(saved||'')?saved:crypto.randomUUID();
      if(!uuid.test(saved||''))store.setItem(key,visitor);
      break;
    }catch(_){visitor='';}
  }
  if(!visitor)return;
  const raw=location.pathname.split('/').pop()||'';
  const page=raw==='teacher-volleyball.html'?'volleyball':raw==='teacher-run.html'?'teacher-run':'other';
  let pending=false;
  async function ping(){
    if(pending||document.visibilityState!=='visible'||typeof supabaseClient==='undefined')return;
    pending=true;
    try{await supabaseClient.functions.invoke('beagu-telemetry-v2',{body:{action:'ping',visitor,page}})}
    catch(_){/* Telemetry must never block gameplay. */}
    finally{pending=false}
  }
  window.setTimeout(()=>{void ping()},1800);
  window.setInterval(()=>{void ping()},60000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void ping()});
})();