/* 『나의 OO한 학급일지』 사운드 v1.
 * 배경음악: Scott Buckley 원곡 CC BY 4.0 (출처 및 곡별 크레디트를 페이지에 표시).
 * 버튼 효과음: 자체 Web Audio 합성음. 게임 데이터/취향/진행 기록 미저장.
 * 모바일 자동재생 정책에 따라 사용자의 게임 시작 클릭 이후에만 소리가 난다.
 */
(function(root){
'use strict';
const TRACKS=Object.freeze({
 calm:{name:'Simplicity',author:'Scott Buckley',mood:'일상',src:'https://www.scottbuckley.com.au/library/wp-content/uploads/2024/03/Simplicity.mp3',
  page:'https://www.scottbuckley.com.au/library/simplicity/'},
 tense:{name:'Intervention',author:'Scott Buckley',mood:'긴장',src:'https://www.scottbuckley.com.au/library/wp-content/uploads/2019/01/sb_intervention.mp3',
  page:'https://www.scottbuckley.com.au/library/intervention/'},
 happy:{name:'Felicity',author:'Scott Buckley',mood:'즐거움',src:'https://www.scottbuckley.com.au/library/wp-content/uploads/2021/03/sb_felicity.mp3',
  page:'https://www.scottbuckley.com.au/library/felicity/'},
 romance:{name:'Moonlight',author:'Scott Buckley',mood:'설렘',src:'https://www.scottbuckley.com.au/library/wp-content/uploads/2022/07/Moonlight.mp3',
  page:'https://www.scottbuckley.com.au/library/moonlight/'},
 ending:{name:'Home Was You',author:'Scott Buckley',mood:'여운',src:'https://www.scottbuckley.com.au/library/wp-content/uploads/2026/07/HomeWasYou.mp3',
  page:'https://www.scottbuckley.com.au/library/home-was-you/'}
});
const MAX_VOL=.18;
let enabled=false,players=null,playing=null,serial=0,currentMood='calm',context=null,sink=()=>{};
function onStatus(fn){sink=typeof fn==='function'?fn:()=>{};}
function createPlayers(){
 if(players||typeof Audio==='undefined')return;
 players=[new Audio(),new Audio()];
 players.forEach(a=>{
  a.preload='none';a.volume=0;a.loop=true;
  a.addEventListener('error',()=>sink('음원 연결이 원활하지 않습니다. 음악을 끄거나 다시 켜 보세요.'));
 });
}
function emitStatus(){
 const tr=TRACKS[currentMood];
 sink(enabled?tr.mood+' · '+tr.name+' 재생':'음악 꺼짐');
}
function fade(from,to,duration){
 const ticket=++serial;
 const start=typeof performance!=='undefined'&&performance.now?performance.now():Date.now();
 const old=from?from.volume:0,newVol=MAX_VOL;
 function frame(){
  if(ticket!==serial)return;
  const elapsed=(typeof performance!=='undefined'&&performance.now?performance.now():Date.now())-start;
  const t=Math.min(1,elapsed/duration);
  if(from)from.volume=Math.max(0,old*(1-t));
  if(to)to.volume=newVol*t;
  if(t<1&&typeof requestAnimationFrame==='function')requestAnimationFrame(frame);
  else{if(from&&from!==to){from.pause();from.currentTime=0;}if(to)to.volume=newVol;}
 }
 frame();
}
function setMood(mood){
 if(!TRACKS[mood])mood='calm';
 currentMood=mood;
 if(!enabled){emitStatus();return;}
 createPlayers();
 if(!players){sink('오디오를 지원하지 않는 기기입니다.');return;}
 const other=players.find(a=>a!==playing);
 if(playing&&playing.dataset&&playing.dataset.mood===mood){emitStatus();return;}
 const next=other||players[0];
 if(next.src!==TRACKS[mood].src)next.src=TRACKS[mood].src;
 next.loop=mood!=='ending';next.currentTime=0;next.volume=0;
 next.dataset.mood=mood;
 const prev=playing;playing=next;
 const promise=next.play();
 if(promise&&typeof promise.catch==='function')promise.catch(()=>sink('음악이 차단되었습니다. 음악 켜기를 다시 눌러 주세요.'));
 fade(prev,next,1500);
 emitStatus();
}
function setEnabled(next){
 enabled=!!next;
 createPlayers();
 if(!enabled){
  ++serial;
  if(players)players.forEach(a=>{a.pause();a.volume=0;});
  playing=null;emitStatus();return;
 }
 setMood(currentMood);
}
function ensureContext(){
 if(context)return context;
 const C=root.AudioContext||root.webkitAudioContext;
 if(!C)return null;
 context=new C();
 return context;
}
function click(kind){
 if(!enabled)return;
 try{
  const ctx=ensureContext();if(!ctx)return;
  if(ctx.state==='suspended')ctx.resume();
  const now=ctx.currentTime,choice=kind==='choice',freq=choice?660:520;
  const osc=ctx.createOscillator(),env=ctx.createGain();
  osc.type='sine';osc.frequency.setValueAtTime(freq,now);
  osc.frequency.exponentialRampToValueAtTime(choice?850:620,now+.055);
  env.gain.setValueAtTime(.0001,now);
  env.gain.exponentialRampToValueAtTime(choice?.07:.04,now+.008);
  env.gain.exponentialRampToValueAtTime(.0001,now+(choice?.13:.08));
  osc.connect(env);env.connect(ctx.destination);
  osc.start(now);osc.stop(now+(choice?.14:.09));
 }catch(e){}
}
const api=Object.freeze({TRACKS,setMood,setEnabled,click,onStatus,
 get enabled(){return enabled;},get currentMood(){return currentMood;}});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryAudio=api;
})(typeof window!=='undefined'?window:globalThis);
