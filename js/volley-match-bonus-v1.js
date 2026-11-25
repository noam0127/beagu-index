/* v1.11.15 provisional bonus policy; negotiated per match. */
(function(root){'use strict';
function volleyMatchEnded(p,c,deuce=false){
 return deuce?Math.max(p,c)>=25&&Math.abs(p-c)>=2:(p===25||c===25)&&!(p===25&&c===25);
}
function matchBonusFromRallies(rallies,player,cpu,ordinary,deuce=false){
 if(typeof rallies!=="string"||rallies.length>(deuce?3601:49)||!/^[PC]*$/.test(rallies)||rallies.length!==player+cpu)throw Error("invalid_rally_history");
 let p=0,c=0,deficit=0,streak=0,longest=0,opponentFirst24=false;
 for(const side of rallies){
  if(volleyMatchEnded(p,c,deuce))throw Error("invalid_rally_history");
  if(side==="P"){p++;streak++;longest=Math.max(longest,streak);}
  else{c++;streak=0;if(c===24&&p<24)opponentFirst24=true;}
  deficit=Math.max(deficit,c-p);
 }
 if(p!==player||c!==cpu)throw Error("invalid_rally_history");
 let kind="none",rate=0;
 if(volleyMatchEnded(p,c,deuce)&&p>c){
  const award=(condition,name,pct)=>{if(condition&&pct>rate){kind=name;rate=pct;}};
  award(c===0,"sweep",50);award(deficit>=10,"great_comeback",50);
  award(opponentFirst24,"dramatic",40);award(c<=5,"dominant",30);
  award(deficit>=5,"comeback",25);award(c>=23,"close",20);award(longest>=10,"streak",15);
 }
 return {kind,rate,points:Math.floor(Math.max(0,ordinary)*rate/100)};
}
const labels=Object.freeze({none:"",sweep:"완승",great_comeback:"대역전승",dramatic:"극적 승리",dominant:"압도적 승리",comeback:"역전승",close:"접전 승리",streak:"연속 득점"});
root.BeaguVolleyMatchBonus=Object.freeze({calculate:matchBonusFromRallies,ended:volleyMatchEnded,labels,version:"fire_court_v1"});
})(window);
