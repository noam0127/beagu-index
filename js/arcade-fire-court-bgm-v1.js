/* v1.11.15 original, game-specific five-stage chip music. Presentation only:
   no simulation clocks, random numbers, recording inputs or score changes. */
(function(root){
'use strict';
const playlists=Object.freeze({
 volleyball:[
 {tempo:124,lead:[72,76,79,76,74,77,81,77],bass:[48,48,50,55]},
 {tempo:136,lead:[76,79,81,84,81,79,74,77],bass:[48,55,53,50]},
 {tempo:148,lead:[74,77,81,86,84,81,77,79],bass:[50,50,53,55]},
 {tempo:160,lead:[76,81,84,88,86,83,79,81],bass:[52,57,55,59]},
 {tempo:176,lead:[79,83,86,91,88,86,83,84],bass:[55,55,57,59]}
 ],
 teacher_run:[
 {tempo:76,lead:[60,64,67,69,67,64,62,60],bass:[48,45,41,43]},
 {tempo:94,lead:[65,69,72,70,69,67,65,62],bass:[41,43,45,48]},
 {tempo:112,lead:[62,65,69,72,70,69,65,63],bass:[38,46,43,45]},
 {tempo:128,lead:[64,67,71,76,74,71,69,67],bass:[40,47,45,43]},
 {tempo:144,lead:[69,72,76,81,79,76,74,72],bass:[45,48,41,43]}
 ]
});
const bossTracks=Object.freeze({confusion:{tempo:132,lead:[60,63,67,66,60,58,63,55],bass:[36,43,38,43]},demands:{tempo:148,lead:[65,68,64,71,65,68,72,64],bass:[41,44,39,43]},responsibility:{tempo:116,lead:[55,58,62,61,55,53,58,50],bass:[31,38,34,36]},burnout:{tempo:144,lead:[61,65,68,64,61,69,66,57],bass:[37,33,40,35]},final:{tempo:178,lead:[72,75,79,81,78,75,82,84],bass:[48,51,55,47]}});
const clampStage=n=>Math.max(0,Math.min(4,Math.floor(Number(n)||0)));
const volleyballStage=(mine,theirs)=>clampStage(Math.max(Number(mine)||0,Number(theirs)||0)/5);
const hz=m=>440*Math.pow(2,(m-69)/12);
function create(kind){
 if(!Object.hasOwn(playlists,kind))throw Error('unknown game music');
 const tracks=playlists[kind],Context=root.AudioContext||root.webkitAudioContext;
 if(!Context){
  const legacy=root.BeaguArcadeBgm.create(kind);
  return Object.freeze({sync:legacy.sync,setStage(){},setBoss(){},dispose:legacy.dispose});
 }
 let ctx=null,master=null,bus=null,timer=null,phase=0,boss=null,step=0,wanted=false,disposed=false,opening=false;
 const voices=new Set(),buses=new Set();
 const track=()=>boss?bossTracks[boss]:tracks[phase];
 function releaseBus(node){if(node&&node!==bus&&node.count===0){node.gain.disconnect();buses.delete(node);}}
 function newBus(){const t=ctx.currentTime,gain=ctx.createGain();gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(1,t+.24);gain.connect(master);bus={gain,count:0};buses.add(bus);}
 function fadeBus(){const old=bus;if(!old)return;bus=null;const t=ctx.currentTime;old.gain.gain.cancelScheduledValues(t);old.gain.gain.setValueAtTime(old.gain.gain.value,t);old.gain.gain.linearRampToValueAtTime(0,t+.24);releaseBus(old);}
 function silence(){
  if(timer!==null){clearInterval(timer);timer=null;}
  if(!ctx)return;
  const t=ctx.currentTime;
  if(master){master.gain.cancelScheduledValues(t);master.gain.setValueAtTime(0,t);}
  for(const osc of voices){try{osc.stop(t);}catch(_){}}
  voices.clear();
  bus=null;for(const node of buses){node.gain.disconnect();}buses.clear();
 }
 function note(m,length,volume,type){
  const t=ctx.currentTime,osc=ctx.createOscillator(),gain=ctx.createGain();
  osc.type=type;osc.frequency.setValueAtTime(hz(m),t);
  gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(volume,t+.015);
  gain.gain.exponentialRampToValueAtTime(.0001,t+length);
  const node=bus;node.count++;osc.connect(gain);gain.connect(node.gain);voices.add(osc);
  osc.onended=()=>{voices.delete(osc);osc.disconnect();gain.disconnect();node.count--;if(buses.has(node))releaseBus(node);};
  osc.start(t);osc.stop(t+length+.02);
 }
 function beat(){
  if(!wanted||disposed||document.hidden||ctx?.state!=='running')return;
  const p=track(),i=step++%p.lead.length,unit=30/p.tempo;
  note(p.lead[i],unit*.85,.045,kind==='volleyball'||boss?'square':'triangle');
  if(i%2===0)note(p.bass[Math.floor(i/2)],unit*1.7,.035,'sine');
 }
 function play(){
  if(disposed||!wanted||document.hidden||!ctx||ctx.state!=='running'||timer!==null)return;
  const t=ctx.currentTime;master.gain.cancelScheduledValues(t);master.gain.setValueAtTime(.7,t);
  if(!bus)newBus();beat();
  timer=setInterval(beat,Math.round(30000/track().tempo));
 }
 function sync(on,gesture=false){
  wanted=Boolean(on);if(disposed)return;
  if(!wanted||document.hidden){silence();return;}
  try{
   if(!ctx){ctx=new Context();master=ctx.createGain();master.gain.value=0;master.connect(ctx.destination);ctx.addEventListener?.("statechange",contextState);}
   if(ctx.state==='running'){play();return;}
   if(opening&&!gesture)return;opening=true;
   Promise.resolve(ctx.resume()).then(()=>{opening=false;play();},()=>{opening=false;});
  }catch(_){opening=false;}
 }
 function setStage(n){
  n=clampStage(n);if(n===phase||disposed)return;phase=n;if(boss)return;
  // Fade the old note bus out while the new phrase fades in; only one beat timer.
  if(timer!==null){clearInterval(timer);timer=null;}
  if(ctx)fadeBus();
  step=0;if(wanted&&!document.hidden)play();
 }
 function setBoss(id){const next=kind==='teacher_run'&&Object.hasOwn(bossTracks,id)?id:null;if(next===boss||disposed)return;if(timer!==null){clearInterval(timer);timer=null;}if(ctx)fadeBus();boss=next;step=0;if(wanted&&!document.hidden)play();}
 const visibility=()=>sync(wanted);
 const gesture=event=>{if(event.isTrusted&&wanted&&ctx?.state!=='running')sync(true,true);};
 const contextState=()=>{if(ctx?.state==='running')play();else if(timer!==null){clearInterval(timer);timer=null;}};
 document.addEventListener('visibilitychange',visibility);
 document.addEventListener('pointerup',gesture,true);
 document.addEventListener('touchend',gesture,true);
 document.addEventListener('keydown',gesture,true);
 return Object.freeze({sync,setStage,setBoss,get boss(){return boss;},get stage(){return phase;},dispose(){
  disposed=true;wanted=false;silence();document.removeEventListener('visibilitychange',visibility);
  document.removeEventListener('pointerup',gesture,true);document.removeEventListener('touchend',gesture,true);document.removeEventListener('keydown',gesture,true);ctx?.removeEventListener?.('statechange',contextState);
  if(ctx)void ctx.close().catch(()=>{});
 }});
}
root.BeaguFireCourtBgm=Object.freeze({create,volleyballStage,clampStage,playlists,bossTracks});
})(window);
