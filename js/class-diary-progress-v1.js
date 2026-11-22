/* Class Diary: code-scoped progress, held only in memory.
 * The identity code never enters storage or game-state payloads.
 */
(function(root){
 'use strict';
 const ENDPOINT='https://ycwuugggqbunlbwuzvbx.supabase.co/functions/v1/class-diary-progress-v1';
 const VERSION='class-diary-semester/v1';
 function compatible(s){
  return !!s&&typeof s==='object'&&s.version===VERSION&&
   ['semester_chapter','semester_reflection','semester_ending'].includes(s.phase)&&
   Number.isInteger(s.episode)&&s.episode>=1&&s.episode<=36&&
   Array.isArray(s.history)&&s.history.length<=36&&
   !!s.profile&&typeof s.profile==='object'&&!!s.stats;
 }
 function create(token,onStatus){
  if(typeof token!=='string'||!/^p1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))throw Error('INVALID_PROGRESS_TOKEN');
  let revision=0,blocked=false,pending=Promise.resolve();
  const report=typeof onStatus==='function'?onStatus:()=>{};
  async function request(action,extra){
   const response=await fetch(ENDPOINT,{
    method:'POST',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action,token,...extra})
   });
   const data=await response.json().catch(()=>({error:'INVALID_RESPONSE'}));
   if(!response.ok||data.ok!==true){
    const error=new Error(data.error||'SAVE_UNAVAILABLE');
    error.code=data.error||'SAVE_UNAVAILABLE';
    error.status=response.status;
    throw error;
   }
   return data;
  }
  async function load(){
   // Explicit continue waits for any earlier save to settle before reading the server.
   await pending.catch(()=>false);
   report('loading');
   const result=await request('load',{});
   revision=Number(result.progress?.revision)||0;
   blocked=false;
   report(result.progress?'loaded':'new');
   return result.progress?{...result.progress,compatible:compatible(result.progress.state)}:null;
  }
  function save(state){
   if(blocked){report('conflict');return Promise.resolve(false);}
   if(!compatible(state)){report('invalid');return Promise.resolve(false);}
   // Freeze each checkpoint immediately; sequential requests keep revision order.
   const snapshot=JSON.parse(JSON.stringify(state));
   pending=pending.catch(()=>false).then(async()=>{
    if(blocked)return false;
    report('saving');
    try{
     const result=await request('save',{expectedRevision:revision,state:snapshot});
     revision=Number(result.revision);
     report('saved');
     return true;
    }catch(error){
     if(error.status===409){blocked=true;report('conflict');}
     else if(error.status===401){blocked=true;report('expired');}
     else report('failed');
     return false;
    }
   });
   return pending;
  }
  return Object.freeze({load,save,getRevision:()=>revision,isBlocked:()=>blocked});
 }
 const api=Object.freeze({create,compatible,VERSION});
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.BeaguClassDiaryProgress=api;
})(typeof window!=='undefined'?window:globalThis);
