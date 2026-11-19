/* Game-only fullscreen with an iPhone Safari and embedded-homepage fallback. */
(() => {
 'use strict';
 const area=document.querySelector('[data-arcade-fullscreen]');
 const button=area?.querySelector('[data-arcade-fullscreen-button]');
 if(!area||!button)return;
 let fallback=false;
 const nativeActive=()=>document.fullscreenElement===area||document.webkitFullscreenElement===area;
 const active=()=>fallback||nativeActive();
 const isEmbedded=()=>window.parent!==window;
 const sameOriginParent=()=>{
  if(!isEmbedded())return false;
  try{return window.parent.location.origin===window.location.origin;}catch(_){return false;}
 };
 function sync(){
  const expanded=active();
  button.textContent=expanded?'🔽':'🔳';
  button.setAttribute('aria-label',expanded?'작은 화면으로 돌아가기':'게임 화면 전체화면');
  button.setAttribute('aria-pressed',String(expanded));
  button.title=expanded?'작은 화면으로':'게임만 전체화면';
 }
 function setFallback(value){
  fallback=Boolean(value);
  area.classList.toggle('arcade-fullscreen-fallback',fallback);
  document.documentElement.classList.toggle('arcade-fullscreen-document',fallback);
  sync();
  // The survival game remeasures its canvas via ResizeObserver.
  window.dispatchEvent(new Event('resize'));
 }
 async function toggle(){
  if(sameOriginParent()){
   // iOS Safari does not reliably allow Fullscreen API requests on arbitrary
   // canvas containers. The host expands the existing iframe without reloading it.
   window.parent.postMessage({type:'arcade:fullscreen-request',active:!fallback},window.location.origin);
   return;
  }
  if(fallback){setFallback(false);return;}
  if(nativeActive()){
   try{
    if(document.exitFullscreen)await document.exitFullscreen();
    else if(document.webkitExitFullscreen)document.webkitExitFullscreen();
    else setFallback(false);
   }catch(_){setFallback(false);}
   sync();return;
  }
  try{
   if(area.requestFullscreen)await area.requestFullscreen();
   else if(area.webkitRequestFullscreen)await area.webkitRequestFullscreen();
   // Some WebKit versions expose the method but silently decline fullscreen.
   // A resolved call without an active fullscreen element still gets CSS fallback.
   if(!nativeActive())setFallback(true);
  }catch(_){setFallback(true);}
  sync();
 }
 button.addEventListener('click',()=>{void toggle();});
 window.addEventListener('message',event=>{
  if(!isEmbedded()||event.source!==window.parent||
     event.origin!==window.location.origin||event.data?.type!=='arcade:fullscreen-state')return;
  setFallback(event.data.active===true);
 });
 document.addEventListener('fullscreenchange',sync);
 document.addEventListener('webkitfullscreenchange',sync);
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&fallback){
   event.preventDefault();
   if(sameOriginParent())window.parent.postMessage({type:'arcade:fullscreen-request',active:false},window.location.origin);
   else setFallback(false);
  }
 });
 window.addEventListener('pagehide',()=>{
  if(fallback&&sameOriginParent())
   window.parent.postMessage({type:'arcade:fullscreen-request',active:false},window.location.origin);
 });
 sync();
})();
