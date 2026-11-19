/* Mobile-only game scroll rail: drag the right edge while gameplay itself
   remains protected from accidental browser scrolling. */
(() => {
  "use strict";
  let rail=null,track=null,thumb=null,config=null,dragId=null;
  const mobile=()=>window.matchMedia?.("(max-width: 768px), (pointer: coarse)").matches===true;
  const inFullscreen=()=>Boolean(document.fullscreenElement||document.webkitFullscreenElement||
    document.querySelector(".arcade-fullscreen-fallback"));
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  function ensure(){
    if(rail)return;
    rail=document.createElement("div");
    rail.className="arcade-mobile-scroll-rail";
    rail.setAttribute("role","scrollbar");
    rail.setAttribute("aria-label","게임 중 페이지 위아래 이동");
    rail.setAttribute("aria-orientation","vertical");
    rail.setAttribute("aria-valuemin","0");
    rail.setAttribute("aria-valuemax","100");
    rail.tabIndex=0;
    rail.hidden=true;
    const up=document.createElement("span");
    up.className="arcade-mobile-scroll-arrow";
    up.textContent="⌃";
    up.setAttribute("aria-hidden","true");
    track=document.createElement("div");
    track.className="arcade-mobile-scroll-track";
    thumb=document.createElement("div");
    thumb.className="arcade-mobile-scroll-thumb";
    thumb.setAttribute("aria-hidden","true");
    track.append(thumb);
    const down=document.createElement("span");
    down.className="arcade-mobile-scroll-arrow";
    down.textContent="⌄";
    down.setAttribute("aria-hidden","true");
    rail.append(up,track,down);
    document.body.append(rail);
    function pointToScroll(clientY){
      if(!config||!track||!thumb)return;
      const max=Math.max(0,Number(config.max())||0);
      const rect=track.getBoundingClientRect();
      const thumbHeight=thumb.offsetHeight;
      const travel=Math.max(1,rect.height-thumbHeight);
      const ratio=clamp((clientY-rect.top-thumbHeight/2)/travel,0,1);
      config.set(ratio*max);
      refresh();
    }
    rail.addEventListener("pointerdown",e=>{
      if(!config||!mobile()||(e.pointerType==="mouse"&&e.button!==0))return;
      e.preventDefault();e.stopPropagation();
      dragId=e.pointerId;
      rail.setPointerCapture?.(e.pointerId);
      pointToScroll(e.clientY);
    });
    rail.addEventListener("pointermove",e=>{
      if(dragId!==e.pointerId)return;
      e.preventDefault();e.stopPropagation();
      pointToScroll(e.clientY);
    });
    function finish(e){
      if(dragId!==e.pointerId)return;
      dragId=null;
      if(rail.hasPointerCapture?.(e.pointerId))rail.releasePointerCapture(e.pointerId);
    }
    rail.addEventListener("pointerup",finish);
    rail.addEventListener("pointercancel",finish);
    rail.addEventListener("lostpointercapture",e=>{if(dragId===e.pointerId)dragId=null;});
    rail.addEventListener("keydown",e=>{
      if(!config)return;
      const max=Math.max(0,Number(config.max())||0);
      const current=clamp(Number(config.get())||0,0,max);
      const step=Math.max(72,(window.visualViewport?.height||window.innerHeight)*.25);
      let next=current;
      if(e.key==="ArrowDown")next+=step;
      else if(e.key==="ArrowUp")next-=step;
      else if(e.key==="PageDown")next+=(window.innerHeight||400);
      else if(e.key==="PageUp")next-=(window.innerHeight||400);
      else if(e.key==="Home")next=0;
      else if(e.key==="End")next=max;
      else return;
      e.preventDefault();
      config.set(clamp(next,0,max));
      refresh();
    });
    window.addEventListener("resize",refresh);
    window.addEventListener("fullscreenchange",refresh);
    window.addEventListener("webkitfullscreenchange",refresh);
    window.visualViewport?.addEventListener?.("resize",refresh);
  }
  function refresh(){
    if(!rail||!config)return;
    if(!mobile()||inFullscreen()){rail.hidden=true;return;}
    const max=Math.max(0,Number(config.max())||0);
    if(max<=20){rail.hidden=true;return;}
    rail.hidden=false;
    const current=clamp(Number(config.get())||0,0,max);
    const viewport=Math.max(1,window.visualViewport?.height||window.innerHeight||400);
    const trackHeight=track.clientHeight||250;
    const fraction=viewport/(viewport+max);
    const thumbHeight=clamp(trackHeight*fraction,36,trackHeight);
    thumb.style.height=thumbHeight+"px";
    thumb.style.transform="translateY("+((trackHeight-thumbHeight)*current/max)+"px)";
    rail.setAttribute("aria-valuenow",String(Math.round(current/max*100)));
    rail.setAttribute("aria-valuetext","페이지 "+Math.round(current/max*100)+"%");
  }
  function show(next){
    if(!next||typeof next.get!=="function"||typeof next.max!=="function"||typeof next.set!=="function")return;
    config=next;
    if(!mobile())return;
    ensure();refresh();
  }
  function hide(){
    config=null;
    dragId=null;
    if(rail)rail.hidden=true;
  }
  window.ArcadeScrollRail={show,hide,refresh};
})();
