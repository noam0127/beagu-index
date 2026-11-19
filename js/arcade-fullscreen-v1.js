/* Game-only fullscreen: supports both standalone game pages and homepage iframes. */
(() => {
 'use strict';
 const area=document.querySelector('[data-arcade-fullscreen]');
 const button=area?.querySelector('[data-arcade-fullscreen-button]');
 if(!area||!button)return;
 const active=()=>document.fullscreenElement===area||document.webkitFullscreenElement===area;
 function sync(){
  const expanded=active();
  button.textContent=expanded?'🔽':'🔳';
  button.setAttribute('aria-label',expanded?'작은 화면으로 돌아가기':'게임 화면 전체화면');
  button.setAttribute('aria-pressed',String(expanded));
  button.title=expanded?'작은 화면으로':'게임만 전체화면';
 }
 button.addEventListener('click',async()=>{
  try{
   if(active()){
    if(document.exitFullscreen)await document.exitFullscreen();
    else if(document.webkitExitFullscreen)document.webkitExitFullscreen();
   }else if(area.requestFullscreen){
    await area.requestFullscreen();
   }else if(area.webkitRequestFullscreen){
    area.webkitRequestFullscreen();
   }else{
    button.title='이 브라우저에서는 전체화면을 지원하지 않습니다.';
   }
  }catch(_){button.title='전체화면을 사용할 수 없습니다. 브라우저 설정을 확인해 주세요.';}
  sync();
 });
 document.addEventListener('fullscreenchange',sync);
 document.addEventListener('webkitfullscreenchange',sync);
 sync();
})();
