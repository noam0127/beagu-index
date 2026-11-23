/* Shared illustrated mystery pickups for both BAEGUINDEX arcade games.
   The field conceals contents behind red/blue ?, revealing themed icons on pickup. */
(() => {
 "use strict";
 const bad=[
  {id:"shackle",good:false,name:"업무족쇄",icon:"⛓️",detail:"비행·점프 제한"},
  {id:"complaint",good:false,name:"악성민원",icon:"☎️",detail:"이동 속도 감소"},
  {id:"bullying",good:false,name:"학폭",icon:"⚠️",detail:"현재 총점 10% 차감"},
  {id:"report",good:false,name:"무고성 아동학대 신고",icon:"🚨",detail:"현재 총점 25% 차감"},
  {id:"conflict",good:false,name:"교직원 갈등",icon:"💢",detail:"동료 일시 퇴장"},
  {id:"ball_add",good:false,name:"공 추가",icon:"🏐",detail:"경기 중 공 1개 증가"}
 ];
 const good=[
  {id:"wings",good:true,name:"날개",icon:"🪽",detail:"족쇄 해제·비행"},
  {id:"letter",good:true,name:"편지",icon:"💌",detail:"이동 속도 증가"},
  {id:"salary",good:true,name:"월급",icon:"💵",detail:"누적 점수 +100"},
  {id:"friends",good:true,name:"친한 동학년",icon:"🤝",detail:"동료 일시 증가"},
  {id:"bonus",good:true,name:"성과금",icon:"🏅",detail:"누적 점수 +200"},
  {id:"chalk",good:true,name:"분필탄환",icon:"🖍️",detail:"분필 지원 활성화"},
  {id:"ball_remove",good:true,name:"공 삭제",icon:"🏐",detail:"공 1개 제거 · 최소 1개 유지"},
  {id:"rapid_smash",good:true,name:"속공 강화",icon:"⚡",detail:"5초 동안 스매시 속도 2배"},
  {id:"bullet",good:true,name:"분필 탄환",icon:"🎯",detail:"5초 동안 자동 탄환 지원"}
 ];
 const pools={bad,good};
 function pick(includeChalk=false,forceGood=null,includeBalls=false){
  const positive=forceGood===null?Math.random()<.51:Boolean(forceGood);
  // Ball-count effects belong to volleyball only, not the survival runner.
  const pool=positive
    ?(includeBalls?good.filter(x=>x.id!=="chalk"&&x.id!=="bullet"):
       includeChalk?good.filter(x=>x.id!=="ball_remove"&&x.id!=="rapid_smash"):good.slice(0,5))
    :(includeBalls?bad:bad.slice(0,5));
  return {...pool[Math.floor(Math.random()*pool.length)]};
 }
 // Crisp vector pickup badge: broad double silhouette and a visible large ?.
 function drawMystery(ctx,x,y,positive,r=21,phase=0){
  const main=positive?"#2f91ed":"#e8525b",light=positive?"#b6ebff":"#ffcfce";
  ctx.save();ctx.translate(x,y);
  const pulse=1+Math.sin(phase*5)*.045;ctx.scale(pulse,pulse);
  ctx.shadowColor=main;ctx.shadowBlur=15;ctx.lineWidth=3;
  ctx.fillStyle=positive?"#1c457c":"#79252e";
  ctx.beginPath();
  for(let i=0;i<16;i++){
   const a=i*Math.PI/8-Math.PI/2,rad=r*(i%2?0.89:1.09);
   const px=Math.cos(a)*rad,py=Math.sin(a)*rad;
   if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
  }
  ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle=light;ctx.stroke();
  ctx.fillStyle=main;ctx.beginPath();ctx.arc(0,0,r*.75,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle="rgba(255,255,255,.63)";ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(-r*.18,-r*.2,r*.47,Math.PI*1.05,Math.PI*1.65);ctx.stroke();
  ctx.font="900 "+Math.floor(r*1.34)+"px system-ui,sans-serif";
  ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.lineWidth=3;ctx.strokeStyle=positive?"#0b3869":"#70111f";
  ctx.strokeText("?",0,1);ctx.fillStyle="#fff";ctx.fillText("?",0,1);
  ctx.restore();
 }
 // The image revealed upon collection is a themed illustrated collectible badge.
 function drawReveal(ctx,item,x,y,r=27){
  if(!item)return;
  ctx.save();ctx.translate(x,y);
  ctx.shadowColor=item.good?"#56dbff":"#ff8791";ctx.shadowBlur=16;
  const gradient=ctx.createLinearGradient(-r,-r,r,r);
  gradient.addColorStop(0,item.good?"#e5faff":"#fff1e8");
  gradient.addColorStop(1,item.good?"#91d7ff":"#f8a9ad");
  ctx.fillStyle=gradient;ctx.strokeStyle=item.good?"#2375bc":"#b3364b";
  ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(-r,-r,r*2,r*2,r*.35);ctx.fill();ctx.stroke();
  ctx.shadowBlur=0;
  ctx.font=Math.floor(r*1.35)+"px Apple Color Emoji,Segoe UI Emoji,sans-serif";
  ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(item.icon,0,0,r*1.75);
  if(item.id==="ball_add"||item.id==="ball_remove"){
    ctx.fillStyle=item.good?"#17639e":"#b63045";
    ctx.strokeStyle="#fff";ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(r*.63,r*.65,r*.43,0,Math.PI*2);
    ctx.fill();ctx.stroke();
    ctx.fillStyle="#fff";ctx.font="900 "+Math.floor(r*.7)+"px system-ui,sans-serif";
    ctx.fillText(item.id==="ball_add"?"+":"−",r*.63,r*.64);
  }
  ctx.restore();
 }
 window.ArcadeMysteryItems={bad,good,pools,pick,drawMystery,drawReveal};
})();
