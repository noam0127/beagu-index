/* Results are personal device snapshots, never a server-verified certificate. */
(function(root){
 "use strict";
 const LOUNGE="https://indischool.com/tweets/channels/lounge";
 const text=(tag,cls,value)=>{const n=document.createElement(tag);n.className=cls;if(value!==undefined)n.textContent=value;return n;};
 function volleyballTitle({won,early,player=25,opponent,maxDeficit,streak,deuce=false}){
  if(early)return {title:"🏁 이번 도전의 기록!",detail:"다음 경기에서 더 높은 점수에 도전해 보세요."};
  if(!won)return {title:opponent>=25?"💪 끝까지 싸운 경기!":"🏐 경기 종료",detail:"이번 경험을 다음 경기의 힘으로!"};
  if(deuce&&opponent>=24)return {title:"🔥 듀스 승리!",detail:player+" : "+opponent+" · 마지막까지 2점 차를 만들어 냈습니다."};
  if(maxDeficit>0)return {title:maxDeficit>=5?"🔥 대역전승!":"🔥 역전승!",detail:"최대 "+maxDeficit+"점 차의 열세를 극복하고 25점을 달성했습니다."};
  if(opponent===0)return {title:"🏆 25대 0 완벽한 승리!",detail:"한 점도 허용하지 않았습니다."};
  if(opponent>=23)return {title:"🔥 손에 땀을 쥔 접전 승리!",detail:"마지막까지 집중한 멋진 경기!"};
  if(25-opponent>=15)return {title:"⚡ 압승!",detail:"압도적인 경기력을 보여 주었습니다."};
  if(streak>=6)return {title:"🏐 연속 득점의 주인공!",detail:streak+"연속 득점!"};
  return {title:"🎉 25점 승리!",detail:"끝까지 집중한 멋진 경기였습니다."};
 }
 function makeSnapshot(canvas,data){
  const image=document.createElement("canvas"),w=1000,inner=920;
  const aspect=canvas.width>0&&canvas.height>0?canvas.height/canvas.width:5/9;
  const h=Math.min(800,Math.round(inner*aspect)),imgW=Math.min(inner,Math.round(h/aspect));
  const metrics=data.metrics.slice(0,6),rows=Math.ceil(metrics.length/2),top=210,gridY=top+h+32;
  image.width=w;image.height=gridY+rows*84+120;const c=image.getContext("2d");
  if(!c)throw Error("canvas_unavailable");
  const bg=c.createLinearGradient(0,0,w,image.height);bg.addColorStop(0,"#102c48");bg.addColorStop(1,"#283357");c.fillStyle=bg;c.fillRect(0,0,w,image.height);
  c.strokeStyle="#d4b77a";c.lineWidth=3;c.strokeRect(20,20,w-40,image.height-40);
  c.fillStyle="#e4c990";c.font="700 23px sans-serif";c.fillText("BAEGUINDEX  /  "+data.game,40,60,920);
  c.fillStyle="#fff7df";c.font="900 48px sans-serif";c.fillText(data.title,40,125,920);
  c.fillStyle="#e4eff9";c.font="500 25px sans-serif";c.fillText(data.detail||"",40,172,920);
  c.fillStyle="#071b2e";c.fillRect(40,top,920,h);c.drawImage(canvas,(w-imgW)/2,top,imgW,h);
  metrics.forEach((value,i)=>{const x=40+(i%2)*466,y=gridY+Math.floor(i/2)*84;c.fillStyle="#ffffff18";c.fillRect(x,y,454,70);c.fillStyle="#fff";c.font="800 28px sans-serif";c.fillText(value,x+18,y+45,418);});
  c.fillStyle="#bcd2e7";c.font="600 19px sans-serif";c.fillText(data.note||"개인 게임 결과 · 공식 인증서 아님",40,image.height-84,920);
  c.fillText("가상 게임 기록 · 실제 학교의 근무환경 및 교직원 행동 평가가 아님",40,image.height-54,920);
  c.fillStyle="#e4c990";c.fillText("baeguindex.com  |  플레이",40,image.height-29,920);
  return image;
 }
 function create(parent,canvas,{compact=false}={}){
  const section=text("section",compact?"arcade-result-share arcade-result-compact":"arcade-result-share arcade-result-full");
  section.hidden=true;parent.append(section);
  let snapshot=null,blob=null,serial=0;
  const clear=()=>{serial++;snapshot=null;blob=null;section.hidden=true;section.replaceChildren();};
  function show(data,actions=[]){
   clear();const ticket=serial;
   if(!compact){
    const h=text("h2","arcade-result-title",data.title);h.tabIndex=-1;
    section.append(h,text("p","arcade-result-detail",data.detail||""));
    const stats=text("div","arcade-result-metrics");
    for(const value of data.metrics)stats.append(text("span","",value));section.append(stats);
    const nav=text("div","arcade-result-replay");
    for(const item of actions){const b=text("button","",item.label);b.type="button";b.addEventListener("click",item.action);nav.append(b);}
    section.append(nav);
   }
   if(compact){const stats=text("div","arcade-result-metrics");for(const value of data.metrics.slice(0,4))stats.append(text("span","",value));section.append(stats);}
   const buttons=text("div","arcade-result-actions");
   const save=text("button","arcade-result-save","💾 게임결과 저장");save.type="button";save.disabled=true;
   const brag=text("a","arcade-result-brag","자랑하기 ↗");brag.href=LOUNGE;brag.target="_blank";brag.rel="noopener noreferrer";
   const msg=text("p","arcade-result-status","");msg.setAttribute("role","status");msg.setAttribute("aria-live","polite");
   buttons.append(save,brag);section.append(text("p","beagu-survey-limit","게임 속 상황과 난이도는 실제 학교의 근무환경이나 특정 교직원의 행동을 재현·평가한 결과가 아닙니다."),buttons,msg);
   section.hidden=false;section.scrollTop=0;
   const prepared=()=>{if(ticket!==serial)return;save.disabled=!blob;msg.textContent=blob?"":"이미지를 만들 수 없습니다.";};
   try{snapshot=makeSnapshot(canvas,data);snapshot.toBlob(b=>{if(ticket!==serial)return;blob=b;prepared();},"image/png");}catch(_){prepared();}
   save.addEventListener("click",()=>{
    if(ticket!==serial||!blob)return;
    let url;
    try{
     url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;
     a.download="baegu-game-result.png";document.body.append(a);a.click();a.remove();
     msg.textContent="";
    }catch(_){msg.textContent="이미지를 저장할 수 없습니다. 다시 시도해 주세요.";}
    finally{if(url)setTimeout(()=>URL.revokeObjectURL(url),30000);}
   });
  }
  return {show,clear,setVisible:value=>{section.hidden=!value||!section.childNodes.length;}};
 }
 root.BeaguArcadeResult=Object.freeze({create,volleyballTitle});
})(window);
