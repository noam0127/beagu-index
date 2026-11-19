/* Keep the visible page stationary while an arcade match is being played.
   An embedded game asks its trusted same-origin home page to lock scrolling. */
(() => {
  "use strict";
  let active=false, previous=null, scrollY=0;
  const embedded=window.parent!==window;
  function standaloneLock(lock){
    const body=document.body;
    if(!body)return;
    if(lock){
      if(previous)return;
      scrollY=window.scrollY||window.pageYOffset||0;
      // On a standalone survival page, move the canvas (and the teacher near
      // its bottom) into view before the body becomes immovable.
      const survivalCanvas=document.querySelector(".stage #game");
      const viewportH=window.visualViewport?.height||window.innerHeight;
      if(survivalCanvas&&viewportH){
        const bottom=survivalCanvas.getBoundingClientRect().bottom;
        const gap=Math.max(32,Math.min(76,viewportH*.09));
        if(bottom>viewportH-gap||bottom<viewportH*.43){
          const maxY=Math.max(0,document.documentElement.scrollHeight-viewportH);
          scrollY=Math.max(0,Math.min(maxY,scrollY+bottom-(viewportH-gap)));
          window.scrollTo(0,scrollY);
        }
      }
      previous={
        position:body.style.position,top:body.style.top,left:body.style.left,
        right:body.style.right,width:body.style.width,overflow:body.style.overflow
      };
      Object.assign(body.style,{
        position:"fixed",top:-scrollY+"px",left:"0",right:"0",width:"100%",overflow:"hidden"
      });
    }else if(previous){
      Object.assign(body.style,previous);
      previous=null;
      window.scrollTo(0,scrollY);
    }
  }
  function notifyHost(playing){
    if(!embedded)return;
    try{window.parent.postMessage({type:"arcade:play-state",active:playing},window.location.origin);}catch(_){}
  }
  function sync(playing){
    playing=Boolean(playing);
    if(active===playing)return;
    active=playing;
    document.documentElement.classList.toggle("arcade-play-locked",playing);
    if(embedded)notifyHost(playing);
    else standaloneLock(playing);
  }
  // Safari can scroll the page even when its canvas has touch-action:none.
  document.addEventListener("touchmove",event=>{
    if(active&&event.cancelable)event.preventDefault();
  },{passive:false});
  document.addEventListener("wheel",event=>{
    if(active&&event.cancelable)event.preventDefault();
  },{passive:false});
  window.addEventListener("pagehide",()=>{
    if(!active)return;
    notifyHost(false);
    standaloneLock(false);
    active=false;
  });
  window.ArcadePlayLock={sync};
})();
