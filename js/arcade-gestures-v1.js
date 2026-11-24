/* Intentional double tap only; a drag or cancelled pointer is never a special attack. */
(() => {
 "use strict";
 function create({maxDelay=320,maxDistance=28,dragDistance=12}={}){
  let previous=null,current=null;
  return {
   down(e){current={id:e.pointerId,x:e.clientX,y:e.clientY,t:performance.now(),drag:false};},
   move(e){if(current?.id===e.pointerId&&Math.hypot(e.clientX-current.x,e.clientY-current.y)>dragDistance){current.drag=true;previous=null;}},
   up(e){
    if(current?.id!==e.pointerId)return false;
    const p=current;current=null;
    if(p.drag||Math.hypot(e.clientX-p.x,e.clientY-p.y)>dragDistance||performance.now()-p.t>maxDelay){previous=null;return false;}
    const t=performance.now(),hit=!!previous&&t-previous.t<=maxDelay&&Math.hypot(p.x-previous.x,p.y-previous.y)<=maxDistance;
    previous=hit?null:{x:p.x,y:p.y,t};return hit;
   },
   cancel(){current=null;previous=null;}
  };
 }
 window.BeaguArcadeGestures={create};
})();
