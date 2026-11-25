/* Beagu school-interest telemetry: user-confirmed actions ONLY.
 * No raw query strings, names, email, password, access code, IP, or page credentials.
 * This client cannot authenticate Lv.1/Lv.2; the level is a page label only.
 * RPC verifies school_id existence and stores only minimal event attributes.
 */
(function(){
 'use strict';
 const ID=/^[A-Z0-9]{7}$/;
 const PAGES=Object.freeze({'search':0,'search-lv1':1,'search-lv2':2,'school-report':0});
 const TYPES=new Set(['search_confirmed','school_selected','detail_viewed']);
 const recent=new Map(),viewed=new Set();
 const uuid=()=>typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():null;
 const now=()=>Date.now();
 function valid(id,type,level,page){
  return ID.test(String(id))&&TYPES.has(type)&&Object.prototype.hasOwnProperty.call(PAGES,page)&&PAGES[page]===level;
 }
 function send(id,type,level,page,actionId){
  const schoolId=String(id);
  if(!valid(schoolId,type,level,page)||!actionId)return false;
  // The existing visitor UUID is used ONLY for server-side hourly rate limiting;
  // the RPC stores a rotating salted hash in a private table, not the identifier.
  const visitor=window.beaguVisitor;
  if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(String(visitor||'')))
    return false;
  if(typeof supabaseClient==='undefined'||typeof supabaseClient.rpc!=='function')return false;
  try{
   void supabaseClient.rpc('beagu_log_school_search',{
    p_school_id:schoolId,p_event_type:type,p_viewer_level:level,
    p_source_page:page,p_action_id:actionId,p_visitor:visitor
   }).then(({data,error})=>{
     if(error){console.warn('학교 이용 이벤트 기록 비활성화');return;}
     if(data!==true)return;
     // Count confirmed searches and actual detail renders independently; the server deduplicates each kind.
     // A missing/late-loading school-view widget must not silently discard the write.
     if(type==='detail_viewed'||type==='search_confirmed'||(type==='school_selected'&&page!=='school-report')){
       void supabaseClient.rpc('beagu_record_school_view_v2',{
         p_school_id:schoolId,p_action_id:actionId,p_visitor:visitor,p_event_type:type
       }).then(({data:view,error:viewError})=>{
         if(viewError){
           console.warn('학교 조회수 기록 비활성화');
           return;
         }
         if(view?.school_id===schoolId && Number.isSafeInteger(Number(view.views)) && Number(view.views)>=0)
           window.BeaguSchoolViewCounts?.applyConfirmedCount?.(schoolId,Number(view.views));
       }).catch(()=>{console.warn('학교 조회수 기록 연결 실패');});
     }
     // Only a server-accepted school action can contribute to rankings.
     // The database stores a salted digest, never the visitor UUID.
     return supabaseClient.rpc('beagu_record_school_interest',{
      p_school_id:schoolId,p_action_id:actionId,p_visitor:visitor
     }).then(({error:interestError})=>{
      if(interestError)console.warn('학교 관심 집계 비활성화');
     });
   }).catch(()=>{});
   return true;
  }catch(_){return false;}
 }
 function emit(id,type,level,page,actionId){
  const key=page+'|'+type+'|'+id;
  const last=recent.get(key)||0;
  if(now()-last<5000)return null;
  const action=actionId||uuid();
  if(!action)return null;
  if(send(id,type,level,page,action)){
   recent.set(key,now());
   // Protect memory usage on very long-lived tabs.
   if(recent.size>300)recent.clear();
   return action;
  }
  return null;
 }
 function searchConfirmed(id,level,page){
  return emit(id,'search_confirmed',level,page);
 }
 function selected(id,level,page,ev){
  // Programmatic click() from automatic search previews is not an intention.
  if(!ev||ev.isTrusted!==true)return null;
  return emit(id,'school_selected',level,page);
 }
 function selectedFromReport(id){
  // Opening a specific school's public report is a school selection, including direct links.
  // The server still requires a saved school_selected action and deduplicates per day.
  return emit(id,'school_selected',0,'school-report');
 }
 function detailViewed(id,level,page,actionId){
  // Count once per actual school detail render on the current page.
  const key=page+'|'+id;
  if(viewed.has(key))return null;
  const action=emit(id,'detail_viewed',level,page,actionId);
  if(action)viewed.add(key);
  return action;
 }
 window.BeaguSearchTelemetry=Object.freeze({searchConfirmed,selected,selectedFromReport,detailViewed});
})();
