/* Keep the visible page stationary while an arcade match is being played.
   An embedded game asks its trusted same-origin home page to lock scrolling. */
(() => {
  "use strict";
  let active=false, previous=null, scrollY=0,maxScrollY=0;
  const embedded=window.parent!==window;
  function standaloneLock(lock){
    const body=document.body;
    if(!body)return;
    if(lock){
      if(previous)return;
      scrollY=window.scrollY||window.pageYOffset||0;
      // Center either game in the visible phone area before the page locks.
      // In a very short survival viewport, prioritize the bottom character.
      const canvas=document.querySelector(".arcade-game-viewport canvas");
      const mobile=window.matchMedia?.("(max-width: 768px)").matches;
      const survival=Boolean(canvas?.closest?.(".stage"));
      const fullscreen=Boolean(document.fullscreenElement||document.webkitFullscreenElement||
        document.querySelector(".arcade-fullscreen-fallback"));
      if(canvas&&(mobile||survival)&&!fullscreen){
        const viewport=window.visualViewport;
        const height=viewport?.height||window.innerHeight;
        if(survival&&height>0)
          document.documentElement.style.setProperty("--arcade-run-parent-visible-height",height+"px");
        const rect=canvas.getBoundingClientRect();
        if(height>0&&rect.height>0){
          const visibleCenter=(viewport?.offsetTop||0)+height/2;
          let target=scrollY+rect.top+rect.height/2-visibleCenter;
          if(survival&&rect.height>height-24)target=scrollY+rect.top-12;
          // Retain the existing vertical priority for volleyball on very
          // short phones; survival instead fits the whole canvas above.
          else if(!survival&&rect.height>height-32)
            target=Math.max(target,scrollY+rect.bottom-(height-24));
          const pageHeight=Math.max(document.documentElement.scrollHeight,
            document.body.scrollHeight);
          scrollY=Math.max(0,Math.min(Math.max(0,pageHeight-height),target));
          window.scrollTo(0,scrollY);
        }
      }
      const visibleHeight=window.visualViewport?.height||window.innerHeight||1;
      maxScrollY=Math.max(0,document.documentElement.scrollHeight-visibleHeight,
        document.body.scrollHeight-visibleHeight);
      previous={
        position:body.style.position,top:body.style.top,left:body.style.left,
        right:body.style.right,width:body.style.width,overflow:body.style.overflow
      };
      Object.assign(body.style,{
        position:"fixed",top:-scrollY+"px",left:"0",right:"0",width:"100%",overflow:"hidden"
      });
      window.ArcadeScrollRail?.show({
        get:()=>scrollY,
        max:()=>maxScrollY,
        set:position=>{
          scrollY=Math.max(0,Math.min(maxScrollY,Number(position)||0));
          body.style.top=-scrollY+"px";
        }
      });
    }else if(previous){
      window.ArcadeScrollRail?.hide();
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
