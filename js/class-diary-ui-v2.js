/* Class Diary UI v2 — player controls and temporary dialogue log.
 * Everything is in memory; does not use storage, cookies, APIs or analytics. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const stage=$('sceneArt'),next=$('vnMore'),choices=$('choiceSection');
if(!stage||!next||!choices||!$('vnHud'))return;
const playing=()=>document.body.classList.contains('is-playing');
const logs=[],maxLogs=180;
let lastKey='',autoTimer=null,activePanel='',lastFocus=null;
const build=(tag,cls,label)=>{const node=document.createElement(tag);node.className=cls;if(label!==undefined)node.textContent=label;return node};
const wrap=build('div','diary-toolbar');
function action(id,icon,label,description){
 const button=build('button','');
 button.type='button';button.id=id;button.title=description||label;button.setAttribute('aria-label',description||label);
 button.append(build('span','diary-tool-icon',icon),build('span','diary-tool-name',label));
 wrap.append(button);return button;
}
const auto=action('diaryAuto','▷','자동','대사를 일정한 간격으로 자동 진행');
const skip=action('diarySkip','≫','넘기기','현재 대사를 선택지 또는 다음 장면까지 빠르게 넘기기');
const log=action('diaryLog','▤','기록','이번 플레이에서 읽은 대사 기록');
auto.setAttribute('aria-pressed','false');
const row=stage.querySelector('.vn-control-row');
row.insertBefore(wrap,next);
const settings=build('button','diary-settings-button','⚙');
settings.type='button';settings.id='diarySettings';settings.title='게임 설정';
settings.setAttribute('aria-label','게임 설정');
stage.querySelector('.vn-top-actions').append(settings);
const stats=build('div','diary-quickstats');
stats.setAttribute('aria-label','현재 호감도와 피로도');
const love=build('span',''),fatigue=build('span','');
stats.append(love,fatigue);
$('vnOverlay').append(stats);
const dayTrack=build('div','diary-day-progress');
dayTrack.setAttribute('aria-label','7일 중 현재 진행 날짜');
for(let i=0;i<7;i++){const segment=build('span','');segment.setAttribute('aria-hidden','true');dayTrack.append(segment)}
$('vnHeaderSlot').append(dayTrack);
function refreshStatus(){
 love.replaceChildren(build('span','','♥ 동료 호감'),build('b','', $('statAffection').textContent||'—'));
 fatigue.replaceChildren(build('span','','◷ 피로도'),build('b','', $('statFatigue').textContent||'—'));
 const match=($('chapterDay').textContent||'').match(/^\s*([1-7])\s*\/\s*7/);
 const day=match?Number(match[1]):1;
 [...dayTrack.children].forEach((s,i)=>s.className=i+1===day?'current':i+1<day?'complete':'');
 dayTrack.setAttribute('aria-label','7일 중 '+day+'일째');
}
for(const id of ['statAffection','statFatigue','chapterDay']){
 new MutationObserver(refreshStatus).observe($(id),{childList:true,characterData:true,subtree:true});
}
refreshStatus();
const scrim=build('div','diary-panel-scrim');
scrim.id='diaryPanelScrim';scrim.hidden=true;
const panel=build('section','diary-panel');
panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','diaryPanelTitle');
const header=build('div','diary-panel-head');
const heading=build('h2','','대사 기록');heading.id='diaryPanelTitle';
const close=build('button','diary-panel-close','×');close.type='button';close.setAttribute('aria-label','창 닫기');
header.append(heading,close);
const content=build('div','diary-panel-content');
panel.append(header,content);scrim.append(panel);document.body.append(scrim);
function record(text,kind){
 if(!playing()||!text)return;
 const day=$('chapterDay').textContent.trim()||'이야기';
 const speaker=$('characterName').textContent.trim()||'장면';
 const key=[day,kind,speaker,text].join('|');
 if(key===lastKey)return;
 lastKey=key;
 logs.push({day,kind,speaker,text});
 if(logs.length>maxLogs)logs.shift();
}
function capture(){
 if(!playing())return;
 const isOutcome=!$('outcome').hidden;
 const source=$(isOutcome?'outcomeText':'chapterText');
 const text=source?.textContent?.trim();
 if(text)record(text,isOutcome?'선택 결과':'대사');
}
const watched=$('vnDialogueSlot');
new MutationObserver(()=>{if(playing())capture()}).observe(watched,{subtree:true,childList:true,characterData:true});
next.addEventListener('click',capture,true);
$('choiceButtons').addEventListener('click',event=>{
 const button=event.target.closest('.choice');if(button){capture();record(button.textContent.trim(),'나의 선택')}
},true);
function stopAuto(){
 if(autoTimer!==null){clearInterval(autoTimer);autoTimer=null}
 auto.setAttribute('aria-pressed','false');
 auto.querySelector('.diary-tool-icon').textContent='▷';
}
function startAuto(){
 if(!playing()||!scrim.hidden||!choices.hidden)return;
 stopAuto();
 auto.setAttribute('aria-pressed','true');auto.querySelector('.diary-tool-icon').textContent='Ⅱ';
 autoTimer=setInterval(()=>{
  if(!playing()||!scrim.hidden||!choices.hidden||next.hidden||document.hidden){stopAuto();return}
  next.click();
 },3200);
}
auto.addEventListener('click',()=>{if(autoTimer!==null)stopAuto();else startAuto()});
skip.addEventListener('click',()=>{
 stopAuto();
 if(!playing()||!scrim.hidden)return;
 let safety=0;
 while(safety++<100&&!next.hidden&&choices.hidden&&$('nextBtn').hidden){
  next.click();
 }
});
function populateLog(){
 content.replaceChildren(build('p','diary-panel-note','읽은 대사와 나의 선택은 이 화면을 열어 둔 동안에만 보입니다. 새로고침하거나 페이지를 떠나면 사라집니다.'));
 if(!logs.length){content.append(build('p','diary-log-empty','아직 표시할 대사가 없습니다.'));return}
 const fragment=document.createDocumentFragment();
 for(const line of logs){
  const item=build('article','diary-log-entry');
  item.append(build('small','',line.day+' · '+line.kind+(line.kind==='나의 선택'?'':' · '+line.speaker)),build('p','',line.text));
  fragment.append(item);
 }
 content.append(fragment);
 content.scrollTop=content.scrollHeight;
}
function labeledSlider(label,id,target){
 const wrap=build('div','diary-panel-setting');
 const caption=build('label','',label);caption.setAttribute('for',id);
 const input=document.createElement('input');input.id=id;input.type='range';input.min='0';input.max='100';input.step='1';
 input.value=$(target).value;
 input.addEventListener('input',()=>{const original=$(target);original.value=input.value;original.dispatchEvent(new Event('input',{bubbles:true}))});
 wrap.append(caption,input);
 return wrap;
}
function populateSettings(){
 content.replaceChildren(build('p','diary-panel-note','음악과 효과음은 이 브라우저에서만 조절됩니다. 설정은 저장되지 않습니다.'));
 const music=build('button','','배경음악 켜기/끄기');music.type='button';
 music.addEventListener('click',()=>{ $('musicBtn').click();music.textContent=$('musicBtn').getAttribute('aria-pressed')==='true'?'배경음악 끄기':'배경음악 켜기' });
 const musicWrap=labeledSlider('배경음악 크기','diaryMusicVolume','musicVolume');
 musicWrap.append(music);
 music.textContent=$('musicBtn').getAttribute('aria-pressed')==='true'?'배경음악 끄기':'배경음악 켜기';
 const effects=build('button','', '효과음 켜기/끄기');effects.type='button';
 effects.addEventListener('click',()=>{ $('effectsBtn').click();effects.textContent=$('effectsBtn').getAttribute('aria-pressed')==='true'?'효과음 끄기':'효과음 켜기'});
 const effectsWrap=labeledSlider('효과음 크기','diaryEffectsVolume','sfxVolume');
 effectsWrap.append(effects);
 effects.textContent=$('effectsBtn').getAttribute('aria-pressed')==='true'?'효과음 끄기':'효과음 켜기';
 content.append(musicWrap,effectsWrap,build('hr','diary-panel-rule'),build('p','diary-panel-note','대화·선택·진행 결과는 서버나 기기에 저장되지 않습니다. 설정을 닫으면 이야기로 돌아갑니다.'));
}
function openPanel(kind){
 if(!playing())return;
 stopAuto();capture();
 activePanel=kind;lastFocus=document.activeElement;
 heading.textContent=kind==='log'?'이번 플레이의 대사 기록':'게임 설정';
 if(kind==='log')populateLog();else populateSettings();
 scrim.hidden=false;document.body.classList.add('diary-panel-open');close.focus();
}
function closePanel(){
 if(scrim.hidden)return;
 scrim.hidden=true;document.body.classList.remove('diary-panel-open');
 activePanel='';
 if(lastFocus&&typeof lastFocus.focus==='function'&&lastFocus.isConnected)lastFocus.focus();
}
log.addEventListener('click',()=>openPanel('log'));
settings.addEventListener('click',()=>openPanel('settings'));
close.addEventListener('click',closePanel);
scrim.addEventListener('click',e=>{if(e.target===scrim)closePanel()});
document.addEventListener('keydown',e=>{
 if(scrim.hidden)return;
 if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closePanel();return}
 if(e.key!=='Tab')return;
 const items=[...panel.querySelectorAll('button,input,[href],[tabindex]:not([tabindex="-1"])')].filter(x=>!x.disabled&&!x.hidden);
 if(!items.length)return;
 const first=items[0],last=items[items.length-1];
 if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
 else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
},true);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAuto()});
$('resetBtn').addEventListener('click',()=>{stopAuto();closePanel();logs.length=0;lastKey=''},true);
$('againBtn').addEventListener('click',()=>{stopAuto();closePanel();logs.length=0;lastKey=''},true);
$('vnReset').addEventListener('click',()=>{stopAuto();closePanel();logs.length=0;lastKey=''},true);
const resetObserver=new MutationObserver(()=>{if(!playing()){stopAuto();closePanel()}});
resetObserver.observe($('novel'),{attributes:true,attributeFilter:['hidden']});
})();
