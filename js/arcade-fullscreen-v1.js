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
 // Familiar outward/inward arrows replace ambiguous square emoji.
 const svgBase='xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
 const maximizeIcon='<svg '+svgBase+'><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/><path d="m3 3 6 6m12-6-6 6m6 12-6-6M3 21l6-6"/></svg>';
 const minimizeIcon='<svg '+svgBase+'><path d="M9 9H3M9 9V3M15 9h6M15 9V3M9 15H3M9 15v6M15 15h6M15 15v6"/><path d="m3 3 6 6m18-6-12 12M3 21l6-6m12 6-6-6" style="display:none"/></svg>';
 // Inward-facing corners express returning to the smaller game viewport.
 function sync(){
  const expanded=active();
  button.innerHTML=expanded?minimizeIcon:maximizeIcon;
  button.setAttribute('aria-label',expanded?'전체화면 종료 · 작은 화면으로':'전체화면으로 확대');
  button.setAttribute('aria-pressed',String(expanded));
  button.title=expanded?'작은 화면으로':'전체화면으로';
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
