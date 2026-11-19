/* Class Diary soundtrack: Scott Buckley CC BY 4.0 and original synthesized interface cues.
 * Only per-tab memory; never save player choices, progress or sound preferences.
 * Source credits: https://www.scottbuckley.com.au/library/using-this-music/
 */
(function(root){
'use strict';
const VERSION='class-diary-sound/v5';
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
 ending:['Home Was You','2026/07/HomeWasYou.mp3','home-was-you'],
 quiet:['Elementary','2017/07/sb_elementary.mp3','elementary'],
 comic:['Quirky Lane','https://www.scottbuckley.com.au/wp-content/audio/iha/sb_iha_quirkylane.mp3','quirky-lane'],
 intimate:['Growing Up','2018/05/sb_growingup.mp3','growing-up'],
 reconcile:['Reawakening','2023/05/Reawakening.mp3','reawakening']
};
const TRACKS=Object.freeze(Object.fromEntries(Object.entries(FILES).map(([id,[name,file,slug]])=>[
 id,Object.freeze({name,url:file.startsWith('https://')?file:HOST+'wp-content/uploads/'+file,page:HOST+slug+'/',license:LICENSE})
])));
/* Field recordings: original public-domain audio served from Wikimedia Commons, not Korean-school recordings.
 * See docs/class-diary-audio-field-recordings.md for attribution and sound provenance.
 */
const AMBIENCE=Object.freeze({
 classroom:Object.freeze({name:'Ambient Classroom-Mono',creator:'rcrossley',
  url:'https://upload.wikimedia.org/wikipedia/commons/1/10/Ambient_classroom_mono.ogg',
  page:'https://commons.wikimedia.org/wiki/File:Ambient_classroom_mono.ogg',
  license:'public-domain',durationSeconds:65,bytes:884672}),
 workroom:Object.freeze({name:'Typing - Medium Speed',creator:'teto_yasha',
  url:'https://upload.wikimedia.org/wikipedia/commons/3/34/Typing_medium_speed.ogg',
  page:'https://commons.wikimedia.org/wiki/File:Typing_medium_speed.ogg',
  license:'public-domain',durationSeconds:48,bytes:777216})
});
const FOLEY=Object.freeze({
 pageTurn:Object.freeze({name:'Turning a page',creator:'planish',
  url:'https://upload.wikimedia.org/wikipedia/commons/6/6b/Turning_a_page.ogg',
  page:'https://commons.wikimedia.org/wiki/File:Turning_a_page.ogg',
  license:'public-domain',durationSeconds:3.4,bytes:49152})
});
/* Sound direction for 2027-03-08 to 07-16, following the 36-episode novel.
 * [music, quiet background recording, short entrance cue]; NULL means intentional silence.
 * Story episodes/choices remain owned by class-diary-semester-v1.js.
 * Episodes 19–23: accident, testimony, family and rumors. Never use cute romance stingers.
 * Schoolchildren's struggles never trigger affection sounds.
 */
const SEMESTER_SCORE=Object.freeze([
 // 제1부 · 1–6화
 ['quiet','classroom','paper'], // 1화
 ['daily','workroom','paper'], // 2화
 ['heartfelt','classroom','paper'], // 3화
 ['quiet',null,'step'], // 4화
 ['tension','workroom','paper'], // 5화
 ['tender',null,'step'], // 6화
 // 제2부 · 7–12화
 ['reconcile','classroom','paper'], // 7화
 ['quiet','workroom','paper'], // 8화
 ['tension',null,'step'], // 9화
 ['heartfelt','classroom','paper'], // 10화
 ['tension',null,'door'], // 11화
 ['restful',null,'paper'], // 12화
 // 제3부 · 13–18화
 ['tension','workroom','paper'], // 13화
 ['tension',null,null], // 14화
 ['heartfelt','classroom','paper'], // 15화
 ['heartfelt',null,'step'], // 16화
 ['tension','workroom','paper'], // 17화
 ['intimate',null,null], // 18화
 // 제4부 · 19–24화
 ['tension',null,'door'], // 19화
 ['quiet',null,null], // 20화
 ['tension',null,null], // 21화
 ['reconcile','workroom','paper'], // 22화
 ['tension',null,'door'], // 23화
 ['reconcile','classroom','paper'], // 24화
 // 제5부 · 25–30화
 ['quiet','classroom','paper'], // 25화
 ['tension','classroom',null], // 26화
 ['restful','workroom','paper'], // 27화
 ['tender',null,'step'], // 28화
 ['tension','workroom','paper'], // 29화
 ['reconcile','classroom','paper'], // 30화
 // 제6부 · 31–36화
 ['bright','workroom','paper'], // 31화
 ['reconcile','workroom','paper'], // 32화
 ['intimate',null,null], // 33화
 ['tender',null,'step'], // 34화
 ['heartfelt','classroom','paper'], // 35화
 ['intimate',null,'paper'] // 36화
].map(([track,ambience,cue])=>Object.freeze({track,ambience,cue})));
const SEMESTER_RELATIONSHIPS=Object.freeze([6,12,18,28,33,34]);
const SEMESTER_REPAIR=Object.freeze([7,10,15,22,24,30,32,35]);
function semesterScore(episode,options={}){
 if(!Number.isInteger(episode)||episode<1||episode>SEMESTER_SCORE.length)throw Error('INVALID_SEMESTER_EPISODE');
 const base=SEMESTER_SCORE[episode-1];
 const reflection=options.reflection===true;
 if(!reflection)return {...base,ambience:base.track==='tension'?null:base.ambience};
 const choice=String(options.choice??'');
 if(!['0','1','2'].includes(choice))throw Error('INVALID_SEMESTER_CHOICE');
 const partner=options.partner||'none';
 const track=SEMESTER_RELATIONSHIPS.includes(episode)?
   (choice==='2'?'restful':partner==='none'?'heartfelt':'intimate'):
   SEMESTER_REPAIR.includes(episode)?
    (choice==='2'?'quiet':'reconcile'):
    choice==='2'?'restful':'quiet';
 // Reflection after a major event is a pause. No recorded footsteps, room loops or sentimental cues.
 return {track,ambience:null,cue:null};
}
const DAYS=Object.freeze(['quiet','tension','heartfelt','tension','playful','restful','intimate']);
let enabled=false,current=null,currentId=null,request=0,fadeTimer=null,ambience=null,ambienceId=null;
let musicVolume=.13,sfxVolume=.17,fxEnabled=true,ctx=null,onStatus=()=>{};
const AudioAPI=typeof root.Audio==='function'?root.Audio:null;
const ContextAPI=root.AudioContext||root.webkitAudioContext;
function status(message){try{onStatus(message)}catch(_){}}
function clamp(n){return Math.min(1,Math.max(0,Number.isFinite(Number(n))?Number(n):0))}
function stopFade(){if(fadeTimer!==null){root.clearInterval(fadeTimer);fadeTimer=null}}
function stopAmbience(){
 if(ambience){ambience.pause();ambience.src='';ambience=null}
 ambienceId=null;
}
function ambienceVolume(){return Math.min(.055,musicVolume*.27)}
function ambienceFor(place,mood){
 if(mood==='tension'||mood==='ending')return null;
 const location=String(place||'');
 if(/카페|뒤뜰|서점|집|상담/.test(location))return null;
 if(/교실/.test(location))return 'classroom';
 if(/학년연구실|교무실|교직원전체회의|교직원 회의|학년회의/.test(location))return 'workroom';
 return null;
}
function setAmbience(id){
 if(id!==null&&!Object.prototype.hasOwnProperty.call(AMBIENCE,id))throw Error('UNKNOWN_AMBIENCE');
 if(!enabled||id===null){stopAmbience();return}
 if(ambienceId===id&&ambience&&!ambience.paused)return;
 stopAmbience();
 if(!AudioAPI)return;
 const player=new AudioAPI(AMBIENCE[id].url);
 if(typeof player.canPlayType==='function'&&!player.canPlayType('audio/ogg'))return;
 player.preload='none';player.loop=true;player.volume=ambienceVolume();
 ambience=player;ambienceId=id;
 const playing=player.play();
 if(playing&&typeof playing.catch==='function')playing.catch(()=>{
  if(ambience===player)stopAmbience();
 });
}
function stop(){
 request++;stopFade();
 if(current){current.pause();current.src='';current=null}
 currentId=null;stopAmbience();
}
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
 if(ambience)ambience.volume=ambienceVolume();
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
 if(day===2||day===4)return ['reopen','together','listen'].includes(choice)?'reconcile':'tension';
 if(day===3)return ['council','trial'].includes(choice)?'reconcile':'playful';
 if((day===5&&choice==='invite')||(day===6&&choice==='coffee'))return 'tender';
 if(day===6&&choice==='letter')return 'intimate';
 if(day===7&&choice==='promise')return 'reconcile';
 if(day===7&&choice==='thanks')return 'intimate';
 return dayTrack(day);
}
function sceneTrack(event){
 if(!event)return 'daily';
 // A result is a reflective pause, not necessarily a happy resolution.
 if(event.result)return 'intimate';
 if(['seat_song','sport'].includes(event.id))return 'comic';
 if(event.kind==='tense'||event.kind==='unsettled'||event.tone==='tense'||event.tone==='unsettled')return 'tension';
 if(event.kind==='bright'||event.tone==='bright'||event.tone==='happy'||event.kind==='happy')return 'bright';
 if(event.kind==='gentle'||event.tone==='gentle')return 'heartfelt';
 if(event.kind==='playful'||event.tone==='playful')return 'comic';
 if(event.kind==='reflective'||event.tone==='reflective')return 'intimate';
 return 'daily';
}
function placeCue(place){
 const text=String(place||'');
 if(/카페|뒤뜰/.test(text))return 'cup';
 if(/복도|현관|출입문/.test(text))return 'door';
 if(/교문|주차장|운동장|출근길|퇴근길/.test(text))return 'step';
 if(/교실|연구실|교무실|회의실|서점|수첩|집/.test(text))return 'paper';
 return null;
}
/* Short original sine-wave cues; no third-party sound recording. */
const CUES=Object.freeze({
 hover:[540,570,.035,.04], choice:[550,740,.10,.16],
 advance:[415,510,.07,.08], affection:[590,880,.19,.24],
 tension:[310,260,.20,.17], transition:[465,615,.12,.12],
 uiTap:[490,570,.055,.06], uiPick:[510,740,.12,.13],
 uiStart:[390,900,.24,.18], uiEnd:[630,860,.20,.15],
 cup:[920,1170,.085,.055]
});
const PHYSICAL=Object.freeze({
 paper:{seconds:.13,type:'highpass',frequency:1400,level:.065},
 step:{seconds:.16,type:'lowpass',frequency:320,level:.08},
 door:{seconds:.20,type:'lowpass',frequency:570,level:.09}
});
function physicalNote(kind,at){
 const spec=PHYSICAL[kind],sampleRate=ctx.sampleRate||44100;
 const length=Math.max(32,Math.floor(sampleRate*spec.seconds));
 const buffer=ctx.createBuffer(1,length,sampleRate),data=buffer.getChannelData(0);
 let seed=kind==='paper'?107:kind==='step'?211:509;
 for(let i=0;i<length;i++){
  seed=(Math.imul(1664525,seed)+1013904223)>>>0;
  const fade=Math.pow(1-i/length,kind==='door'?.55:1.35);
  data[i]=(seed/2147483648-1)*fade;
 }
 const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
 source.buffer=buffer;filter.type=spec.type;filter.frequency.value=spec.frequency;
 gain.gain.setValueAtTime(.0001,at);
 gain.gain.exponentialRampToValueAtTime(Math.max(.0002,spec.level*sfxVolume),at+.012);
 gain.gain.exponentialRampToValueAtTime(.0001,at+spec.seconds);
 source.connect(filter);filter.connect(gain);gain.connect(ctx.destination);
 source.start(at);source.stop(at+spec.seconds+.005);
}
function playFoley(kind){
 if(!AudioAPI||!Object.prototype.hasOwnProperty.call(FOLEY,kind)){note('transition');return}
 const clip=new AudioAPI(FOLEY[kind].url);
 if(typeof clip.canPlayType==='function'&&!clip.canPlayType('audio/ogg')){note('transition');return}
 clip.preload='none';clip.loop=false;clip.volume=Math.min(.2,sfxVolume*.4);
 const playing=clip.play();
 if(playing&&typeof playing.catch==='function')playing.catch(()=>note('transition'));
}
function note(kind){
 if(!fxEnabled||sfxVolume<=0)return;
 if(Object.prototype.hasOwnProperty.call(FOLEY,kind)){playFoley(kind);return}
 if(!ContextAPI||(!CUES[kind]&&!PHYSICAL[kind]))return;
 try{
  if(!ctx)ctx=new ContextAPI();
  if(ctx.state==='suspended')ctx.resume().catch(()=>{});
  const at=ctx.currentTime;
  if(PHYSICAL[kind]){
   if(ctx.createBuffer&&ctx.createBufferSource&&ctx.createBiquadFilter)physicalNote(kind,at);
   return;
  }
  const [from,to,seconds,level]=CUES[kind];
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
 credit:'Music by Scott Buckley — CC BY 4.0. www.scottbuckley.com.au',
 recordings:[...Object.values(AMBIENCE),...Object.values(FOLEY)].map(({name,creator,page,license})=>({name,creator,page,license}))};
}
const api=Object.freeze({VERSION,TRACKS,AMBIENCE,FOLEY,SEMESTER_SCORE,semesterScore,dayTrack,choiceTrack,sceneTrack,placeCue,ambienceFor,setAmbience,note,setTrack,setEnabled,
 isEnabled,setMusicVolume,setSfxVolume,musicLevel,sfxLevel,setEffectsEnabled,stop,credit,
 onStatus(fn){onStatus=typeof fn==='function'?fn:()=>{}}});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiarySound=api;
})(typeof window!=='undefined'?window:globalThis);
