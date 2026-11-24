/* Pure target input state; no network or score authority. */
(function(root){
 "use strict";
 const sign=d=>Math.abs(d)<.5?0:Math.sign(d);
 const limit=(delta,distance)=>Math.sign(delta)===Math.sign(distance)?Math.sign(delta)*Math.min(Math.abs(delta),Math.abs(distance)):0;
 function create(){
  let pointer=null,target=null,jump=false;
  return {
   get pointerId(){return pointer},
   down(id,p,playerY){if(pointer!==null)return false;pointer=id;target={...p};jump=p.y<playerY-16;return true},
   move(id,p,playerY,grounded){if(id!==pointer)return false;if(grounded&&p.y<playerY-16&&p.y<target.y-12)jump=true;target={...p};return true},
   up(id,flight){if(id!==pointer)return;pointer=null;if(flight){target=null;jump=false}},
   cancel(id){if(id===pointer)this.clear()},
   clear(){pointer=null;target=null;jump=false},
   axes(x,y,flight){return target?{x:sign(target.x-x),y:flight?sign(target.y-y):0}:null},
   takeJump(){const value=jump;jump=false;return value},
   limitX(delta,x){return target?limit(delta,target.x-x):delta},
   limitY(delta,y){return target?limit(delta,target.y-y):delta},
   settled(x,flight){if(pointer===null&&target&&(flight||Math.abs(target.x-x)<.5)){target=null;jump=false}}
  };
 }
 root.BeaguVolleyTouch=Object.freeze({create});
})(window);
