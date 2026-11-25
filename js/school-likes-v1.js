/* Anonymous counts; only server-confirmed individual Lv2 may add a permanent like. */
(()=>{'use strict';
 const ID=/^[A-Z0-9]{7}$/,ENDPOINT='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-level-api',key='beagu-level-session-v1';
 let epoch=0;const counts=new Map(),mine=new Set(),pending=new Set();
 const token=()=>{try{return sessionStorage.getItem(key)||''}catch{return ''}};
 async function call(action,args,t=token()){
 const r=await fetch(ENDPOINT,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',...(t?{'X-Beagu-Session':t}:{})},body:JSON.stringify({action,...args})});
 if(!r.ok)throw Error('LIKES_UNAVAILABLE');return r.json();
 }
 function paint(b,canLike=false){
 const id=b.dataset.schoolLikeId,n=counts.get(id),liked=mine.has(id);
 b.querySelector('.school-like-glyph').textContent=liked?'♥':'♡';
 b.querySelector('.school-like-count').textContent=Number.isSafeInteger(n)?n.toLocaleString('ko-KR'):'—';
 b.setAttribute('aria-pressed',String(liked));b.disabled=!canLike||liked||pending.has(id);
 b.title=liked?'이미 좋아요를 누른 학교':canLike?'학교 좋아요 (학교당 한 번)':'Lv.2 개인 참여코드 인증 후 좋아요';
 b.setAttribute('aria-label',b.title+' · '+(Number.isSafeInteger(n)?n+'개':'확인 중'));
 }
 function nodes(id){return [...document.querySelectorAll('[data-school-like-id]')].filter(b=>b.dataset.schoolLikeId===id);}
 function apply(data,ids,g,t){
 if(g!==epoch||t!==token()||!Array.isArray(data?.schools))return;
 for(const r of data.schools){if(!ids.includes(r.school_id)||!Number.isSafeInteger(r.likes)||r.likes<0)continue;
 counts.set(r.school_id,Math.max(counts.get(r.school_id)||0,r.likes));if(data.canLike===true&&r.liked===true)mine.add(r.school_id);
 for(const b of nodes(r.school_id)){b.dataset.canLike=String(data.canLike===true);paint(b,data.canLike===true);}
 }
 }
 async function refreshCards(host=document){
 const ids=[...new Set([...host.querySelectorAll('[data-school-like-id]')].map(b=>b.dataset.schoolLikeId).filter(id=>ID.test(id)))];
 const g=epoch,t=token();for(let i=0;i<ids.length;i+=20){const batch=ids.slice(i,i+20);try{apply(await call('school_like_state',{schoolIds:batch},t),batch,g,t)}catch{/* unconfirmed count remains blank */}}
 }
 function create(id){
 if(!ID.test(String(id)))throw Error('INVALID_SCHOOL');
 const b=document.createElement('button');b.type='button';b.className='school-like-button';b.dataset.schoolLikeId=id;
 const glyph=document.createElement('span');glyph.className='school-like-glyph';glyph.setAttribute('aria-hidden','true');
 const count=document.createElement('strong');count.className='school-like-count';b.append(glyph,count);paint(b);
 b.addEventListener('click',async e=>{
 e.preventDefault();e.stopPropagation();if(b.disabled||pending.has(id)||mine.has(id))return;
 const g=epoch,t=token();pending.add(id);nodes(id).forEach(n=>paint(n,false));
 try{apply(await call('school_like_add',{schoolId:id},t),[id],g,t);}
 catch{if(g===epoch&&t===token())b.title='좋아요 처리 실패 · 다시 확인해 주세요';}
 finally{if(g===epoch&&t===token()){pending.delete(id);await refreshCards(document);}}
 });
 return b;
 }
 function reset(){++epoch;mine.clear();pending.clear();document.querySelectorAll('[data-school-like-id]').forEach(b=>{b.dataset.canLike='false';paint(b)});void refreshCards();}
 window.addEventListener('beagu:level-state-change',reset);window.addEventListener('beagu:participation-logged-out',reset);
 window.BeaguSchoolLikes=Object.freeze({create,refreshCards,search:args=>call('public_school_like_search',args,'')});
})();