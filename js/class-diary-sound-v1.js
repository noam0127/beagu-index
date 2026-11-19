/* 『나의 OO한 학급일지』 배경음과 진행 효과음.
 * 음악: Scott Buckley, CC BY 4.0; 공식 사이트에서 직접 배포하는 MP3.
 * 플레이 기록과 음향 설정을 어디에도 저장하지 않는다.
 */
(function(root){
'use strict';
const VERSION='class-diary-sound/v1';
const LICENSE='https://creativecommons.org/licenses/by/4.0/';
const TRACKS=Object.freeze({
 daily:Object.freeze({name:'Simplicity',url:'https://www.scottbuckley.com.au/library/wp-content/uploads/2024/03/Simplicity.mp3',license:LICENSE}),
 tension:Object.freeze({name:'Intervention',url:'https://www.scottbuckley.com.au/library/wp-content/uploads/2019/01/sb_intervention.mp3',license:LICENSE}),
 bright:Object.freeze({name:'Felicity',url:'https://www.scottbuckley.com.au/library/wp-content/uploads/2021/03/sb_felicity.mp3',license:LICENSE}),
 tender:Object.freeze({name:'Moonlight',url:'https://www.scottbuckley.com.au/library/wp-content/uploads/2022/07/Moonlight.mp3',license:LICENSE}),
 ending:Object.freeze({name:'Home Was You',url:'https://www.scottbuckley.com.au/library/wp-content/uploads/2026/07/HomeWasYou.mp3',license:LICENSE})
});
const DAYS=Object.freeze(['daily','tension','bright','tension','daily','tender','daily']);
let enabled=false,currentId=null,current=null,context=null,request=0;
const AudioAPI=typeof root.Audio==='function'?root.Audio:null;
const AudioContextAPI=root.AudioContext||root.webkitAudioContext;
let onStatus=()=>{};
function status(value){try{onStatus(value)}catch(e){}}
function createPlayer(id){
 if(!AudioAPI)return null;
 const audio=new AudioAPI();
 audio.src=TRACKS[id].url;audio.preload='none';audio.loop=id!=='ending';audio.volume=.14;
 audio.addEventListener('error',()=>status('배경음악을 불러오지 못했습니다. 음악 없이 계속 플레이할 수 있습니다.'));
 return audio;
}
function stop(){
 request++;if(current){current.pause();current.currentTime=0;current=null;}
 currentId=null;
}
async function setTrack(id){
 if(!Object.prototype.hasOwnProperty.call(TRACKS,id))throw Error('UNKNOWN_TRACK');
 if(!enabled)return;
 if(currentId===id&&current&&!current.paused)return;
 const turn=++request;
 const next=createPlayer(id);
 if(!next){status('이 브라우저에서는 배경음악을 사용할 수 없습니다.');return;}
 const previous=current;current=next;currentId=id;
 if(previous){previous.pause();previous.currentTime=0;}
 try{
  await next.play();
  if(turn!==request){next.pause();return;}
  status(TRACKS[id].name+' 재생 중');
 }catch(e){
  if(turn!==request)return;
  status('음악 재생이 차단됐습니다. 음악 켜기 버튼을 다시 누르면 재생을 시도합니다.');
 }
}
function setEnabled(on){
 enabled=Boolean(on);
 if(!enabled){stop();status('배경음악 꺼짐');}
 else status('배경음악 켜짐');
}
function isEnabled(){return enabled;}
function dayTrack(day){
 if(!Number.isInteger(day)||day<1||day>7)throw Error('INVALID_DAY');
 return DAYS[day-1];
}
function choiceTrack(day,choice){
 if(day===2||day===4)return ['reopen','together','listen'].includes(choice)?'daily':'tension';
 if(day===3)return 'bright';
 if((day===5&&choice==='invite')||(day===6&&choice==='coffee'))return 'tender';
 return dayTrack(day);
}
function note(tone){
 // original, gentle short interface tones via Web Audio; no sound files/rights needed
 if(!AudioContextAPI)return;
 try{
  if(!context)context=new AudioContextAPI();
  if(context.state==='suspended')context.resume().catch(()=>{});
  const now=context.currentTime,osc=context.createOscillator(),gain=context.createGain();
  osc.type='sine';osc.frequency.setValueAtTime(tone==='choice'?587.33:440,now);
  osc.frequency.exponentialRampToValueAtTime(tone==='choice'?783.99:659.25,now+.085);
  gain.gain.setValueAtTime(.0001,now);
  gain.gain.exponentialRampToValueAtTime(tone==='choice'?.038:.02,now+.009);
  gain.gain.exponentialRampToValueAtTime(.0001,now+.14);
  osc.connect(gain);gain.connect(context.destination);
  osc.start(now);osc.stop(now+.16);
 }catch(e){}
}
function credit(){
 return {
  creator:'Scott Buckley',
  url:'https://www.scottbuckley.com.au',
  license:LICENSE,
  credit:"Music: 'Simplicity', 'Intervention', 'Felicity', 'Moonlight', 'Home Was You' by Scott Buckley — CC BY 4.0."
 };
}
const api=Object.freeze({
 VERSION,TRACKS,dayTrack,choiceTrack,note,setTrack,setEnabled,isEnabled,stop,credit,
 onStatus(fn){onStatus=typeof fn==='function'?fn:()=>{}}
});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiarySound=api;
})(typeof window!=='undefined'?window:globalThis);
