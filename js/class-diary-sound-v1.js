/* Class Diary soundtrack: Scott Buckley CC BY 4.0 and original synthesized interface cues.
 * Only per-tab memory; never save player choices, progress or sound preferences.
 * Source credits: https://www.scottbuckley.com.au/library/using-this-music/
 */
(function(root){
'use strict';
const VERSION='class-diary-sound/v2';
const LICENSE='https://creativecommons.org/licenses/by/4.0/';
const HOST='https://www.scottbuckley.com.au/library/';
const FILES={
 daily:['Simplicity','2024/03/Simplicity.mp3','simplicity'],
 playful:['Ice Cream','2023/08/IceCream.mp3','ice-cream'],
 heartfelt:['Amberlight','2025/03/Amberlight.mp3','amberlight'],
 tension:['Intervention','2019/01/sb_intervention.mp3','intervention'],
 tender:['Moonlight','2022/07/Moonlight.mp3','moonlight'],
 restful:['Castles in the Sky','2021/11/sb_castlesinthesky.mp3','castles-in-the-sky'],
 bright:['Felicity','2021/03/sb_felicity.mp3','felicity'],
 ending:['Home Was You','2026/07/HomeWasYou.mp3','home-was-you']
};
const TRACKS=Object.freeze(Object.fromEntries(Object.entries(FILES).map(([id,[name,file,slug]])=>[
 id,Object.freeze({name,url:HOST+'wp-content/uploads/'+file,page:HOST+slug+'/',license:LICENSE})
])));
const DAYS=Object.freeze(['daily','tension','heartfelt','tension','playful','restful','daily']);
let enabled=false,current=null,currentId=null,request=0,fadeTimer=null;
let musicVolume=.13,sfxVolume=.17,fxEnabled=true,ctx=null,onStatus=()=>{};
const AudioAPI=typeof root.Audio==='function'?root.Audio:null;
const ContextAPI=root.AudioContext||root.webkitAudioContext;
function status(message){try{onStatus(message)}catch(_){}}
function clamp(n){return Math.min(1,Math.max(0,Number.isFinite(Number(n))?Number(n):0))}
function stopFade(){if(fadeTimer!==null){root.clearInterval(fadeTimer);fadeTimer=null}}
function stop(){request++;stopFade();if(current){current.pause();current.src='';current=null}currentId=null}
function createAudio(id){
 if(!AudioAPI)return null;
 const player=new AudioAPI(TRACKS[id].url);
 player.preload='none';player.loop=id!=='ending';player.volume=0;
 player.addEventListener('error',()=>status('음원을 불러오지 못했습니다. 화면의 출처 링크에서 음원을 확인해 주세요.'));
 return player;
}
async function setTrack(id){
 if(!Object.prototype.hasOwnProperty.call(TRACKS,id))throw Error('UNKNOWN_TRACK');
 if(!enabled)return;
 if(currentId===id&&current&&!current.paused)return;
 const turn=++request,previous=current,next=createAudio(id);
 if(!next){status('오디오를 지원하지 않는 브라우저입니다.');return}
 current=next;currentId=id;
 try{
  await next.play();
  if(turn!==request){next.pause();return}
  const steps=12;let step=0;stopFade();
  fadeTimer=root.setInterval(()=>{
   if(turn!==request){stopFade();next.pause();return}
   step++;const progress=Math.min(1,step/steps);
   next.volume=musicVolume*progress;
   if(previous){previous.volume=Math.max(0,musicVolume*(1-progress))}
   if(progress===1){stopFade();if(previous){previous.pause();previous.src=''}}
  },45);
  status(TRACKS[id].name+' · Scott Buckley 재생 중');
 }catch(err){
  if(turn!==request)return;
  if(previous){previous.pause();previous.src=''}
  status('브라우저가 재생을 차단했거나 음원에 접근할 수 없습니다. 음악 버튼을 눌러 다시 시도하세요.');
 }
}
function setEnabled(value){
 enabled=!!value;
 if(!enabled){stop();status('배경음악 꺼짐')}
 else status('배경음악 켜짐 · 게임 시작 후 재생');
 return enabled;
}
function isEnabled(){return enabled}
function setMusicVolume(value){
 musicVolume=clamp(value);
 if(current)current.volume=musicVolume;
 return musicVolume;
}
function setSfxVolume(value){sfxVolume=clamp(value);return sfxVolume}
function musicLevel(){return musicVolume}
function sfxLevel(){return sfxVolume}
function setEffectsEnabled(value){fxEnabled=!!value;return fxEnabled}
function dayTrack(day){
 if(!Number.isInteger(day)||day<1||day>7)throw Error('INVALID_DAY');
 return DAYS[day-1];
}
function choiceTrack(day,choice){
 if(day===2||day===4)return ['reopen','together','listen'].includes(choice)?'heartfelt':'tension';
 if(day===3)return ['council','trial'].includes(choice)?'heartfelt':'playful';
 if((day===5&&choice==='invite')||(day===6&&choice==='coffee'))return 'tender';
 if(day===7&&choice==='promise')return 'heartfelt';
 return dayTrack(day);
}
function sceneTrack(event){
 if(!event)return 'daily';
 if(event.kind==='tense'||event.kind==='unsettled'||event.tone==='tense'||event.tone==='unsettled')return 'tension';
 if(event.kind==='gentle'||event.tone==='gentle')return 'heartfelt';
 if(event.tone==='playful')return 'playful';
 if(event.tone==='reflective')return 'restful';
 return 'daily';
}
/* Short original sine-wave cues; no third-party sound recording. */
const CUES=Object.freeze({
 hover:[540,570,.035,.04], choice:[550,740,.10,.16],
 advance:[415,510,.07,.08], affection:[590,880,.19,.24],
 tension:[310,260,.20,.17], transition:[465,615,.12,.12],
 uiTap:[490,570,.055,.06], uiPick:[510,740,.12,.13],
 uiStart:[390,900,.24,.18], uiEnd:[630,860,.20,.15]
});
function note(kind){
 if(!fxEnabled||sfxVolume<=0||!ContextAPI||!CUES[kind])return;
 try{
  if(!ctx)ctx=new ContextAPI();
  if(ctx.state==='suspended')ctx.resume().catch(()=>{});
  const [from,to,seconds,level]=CUES[kind],at=ctx.currentTime;
  const o=ctx.createOscillator(),g=ctx.createGain();
  o.type=kind==='tension'?'triangle':'sine';
  o.frequency.setValueAtTime(from,at);o.frequency.exponentialRampToValueAtTime(to,at+seconds);
  g.gain.setValueAtTime(.0001,at);
  g.gain.exponentialRampToValueAtTime(Math.max(.0002,level*sfxVolume),at+.015);
  g.gain.exponentialRampToValueAtTime(.0001,at+seconds+.035);
  o.connect(g);g.connect(ctx.destination);
  o.start(at);o.stop(at+seconds+.055);
 }catch(_){}
}
function credit(){
 return {creator:'Scott Buckley',url:'https://www.scottbuckley.com.au',
 license:LICENSE,tracks:Object.values(TRACKS).map(t=>({name:t.name,page:t.page})),
 credit:'Music by Scott Buckley — CC BY 4.0. www.scottbuckley.com.au'};
}
const api=Object.freeze({VERSION,TRACKS,dayTrack,choiceTrack,sceneTrack,note,setTrack,setEnabled,
 isEnabled,setMusicVolume,setSfxVolume,musicLevel,sfxLevel,setEffectsEnabled,stop,credit,
 onStatus(fn){onStatus=typeof fn==='function'?fn:()=>{}}});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiarySound=api;
})(typeof window!=='undefined'?window:globalThis);
