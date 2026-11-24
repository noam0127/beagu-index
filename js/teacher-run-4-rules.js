/* Teacher Run 4.0 pure rules. Preview only until official versioned score validation is ready. */
(function(root){
 "use strict";
 const duration=190,secondsPerYear=5;
 const rounds=Object.freeze([
  Object.freeze({start:0,end:30,name:"신규교사의 시련",phase:"24~29세"}),
  Object.freeze({start:30,end:80,name:"격동의 교직생활",phase:"30~39세"}),
  Object.freeze({start:80,end:130,name:"책임의 무게",phase:"40~49세"}),
  Object.freeze({start:130,end:180,name:"베테랑의 투혼",phase:"50~59세"}),
  Object.freeze({start:180,end:190,name:"마지막 교직생활",phase:"60~62세"})
 ]);
 const age=t=>24+Math.floor(Math.max(0,Math.min(duration,t))/secondsPerYear);
 function roundAt(t){for(let i=rounds.length-1;i>=0;i--)if(t>=rounds[i].start)return i;return 0;}
 const multiplier=n=>n>=30?3:n>=20?2:n>=10?1.5:n>=5?1.2:1;
 function create(){
  let combo=0,maxCombo=0,near=0,hits=0,lastHit=-Infinity,lowSince=null,lowEpisode=false;
  const paid=new Set(),objects=new WeakSet();
  function award(id,amount,out){if(paid.has(id))return;paid.add(id);out.push({id,amount});}
  return {
   nearMiss(object,clearance){
    if(!object||object.good||!Number.isFinite(clearance)||clearance<=0||clearance>=58||objects.has(object))return 0;
    objects.add(object);near++;combo++;maxCombo=Math.max(maxCombo,combo);return Math.round(90*multiplier(combo));
   },
   hit(t){hits++;lastHit=t;combo=0;},
   health(t,hp,maxHp){
    const out=[],ratio=maxHp>0?hp/maxHp:0;
    if(ratio<=.1&&ratio>0){lowEpisode=true;if(lowSince===null)lowSince=t;if(t-lowSince>=5)award("low-survival",150,out);}
    else{lowSince=null;if(ratio>=.8&&lowEpisode){award("low-recovery",250,out);lowEpisode=false;}else if(ratio<=0){lowEpisode=false;}}
    return out;
   },
   complete(t){const out=[];if(t>=duration&&lastHit<=duration-10)award("final-ten",200,out);return out;},
   stats(){return {combo,maxCombo,near,hits,crises:paid.size,lastHit};}
  };
 }
 root.BeaguRun4Rules=Object.freeze({duration,secondsPerYear,rounds,age,roundAt,multiplier,create});
})(typeof window!=="undefined"?window:globalThis);
