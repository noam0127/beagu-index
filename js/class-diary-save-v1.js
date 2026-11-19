/* Opt-in save and resume for the 36-episode Class Diary.
 * Replay verified choices; never persist world data, session tokens, guest codes,
 * private survey facts, complete game objects or unapproved browser data.
 */
(function(root){
'use strict';
const API='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/class-diary-save-v1';
const VERSION=1;
const $=id=>document.getElementById(id);
const keyFor=(scope,school)=>'beagu-class-diary-checkpoint-v2:'+scope+':'+school;
const plainProfile=p=>({name:p.name,experience:p.experience,gender:p.gender,mbti:p.mbti,partner:p.partner});
function validSnapshot(p){
 if(!p||p.version!==1||p.mode!=='semester'||!p.profile||!Array.isArray(p.history))return false;
 const f=p.profile;
 if(!/^[가-힣]{2,8}$/.test(f.name||'')||!['new','mid','senior'].includes(f.experience)||!['woman','man','undisclosed'].includes(f.gender)||!/^[IE][NS][FT][PJ]$/.test(f.mbti||'')||!['woman','man','none'].includes(f.partner))return false;
 if(!['semester_chapter','semester_reflection','semester_ending'].includes(p.phase)||!Number.isInteger(p.episode)||p.episode<1||p.episode>36||!Number.isInteger(p.page)||p.page<0||p.page>100)return false;
 if(p.history.length!==(p.phase==='semester_chapter'?p.episode-1:p.episode))return false;
 if(p.phase==='semester_ending'&&p.episode!==36)return false;
 return p.history.every((c,i)=>c&&c.episode===i+1&&Number.isInteger(c.choice)&&c.choice>=0&&c.choice<=2);
}
function mount(options){
 const {state,restore}=options;
 const context=()=>{const s=state();return {scope:s.isDemo?'demo':s.isGuest?'guest':'level2',schoolId:s.isGuest||s.isDemo?'fictional':s.schoolId||'',game:s.game,mode:s.mode,session:s.session||'',ticket:s.ticket||'',grant:s.grant||'',page:s.page||0}};
 const localKey=()=>{const c=context();return keyFor(c.scope,c.schoolId)};
 const read=()=>{try{const v=JSON.parse(localStorage.getItem(localKey())||'null');return v&&v.version===VERSION&&validSnapshot(v.snapshot)&&/^[0-9a-f]{64}$/.test(v.recoveryKey)?v:null}catch{return null}};
 const showMessage=(message)=>{const node=$('diarySaveStatus');if(node){node.textContent=message;node.hidden=false;}};
 const bytes=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 const snapshot=()=>{const c=context();if(c.mode!=='semester'||!c.game)return null;
  const g=c.game;
  return {version:VERSION,mode:'semester',profile:plainProfile(g.profile),history:(g.history||[]).map(h=>({episode:h.episode,choice:Number(h.choice)})),episode:g.episode,phase:g.phase,page:Math.max(0,Math.min(100,Math.floor(c.page)))};
 };
 const row=document.querySelector('#vnBottom .vn-control-row');
 const wrap=document.createElement('div');wrap.className='diary-save-actions';wrap.id='diarySaveActions';
 function make(label,action){const b=document.createElement('button');b.type='button';b.className='diary-save-action';b.textContent=label;b.setAttribute('aria-label',label);b.addEventListener('click',action);return b}
 const saveButton=make('저장하기',save);
 const continueButton=make('이어하기',continuePlay);
 wrap.append(saveButton,continueButton);row.insertBefore(wrap,$('vnMore'));
 const status=document.createElement('div');status.id='diarySaveStatus';status.className='diary-save-status';status.hidden=true;status.setAttribute('role','status');status.setAttribute('aria-live','polite');$('vnBottom').append(status);
 const openContinue=make('저장한 이야기 이어하기',continuePlay);openContinue.classList.add('diary-opening-continue');openContinue.hidden=true;
 const opening=$('opening');opening.querySelector('.diary-opening-body').append(openContinue);
 const cover=document.createElement('div');cover.className='diary-save-overlay';cover.hidden=true;
 const dialog=document.createElement('section');dialog.className='diary-save-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','diarySaveDialogTitle');
 const title=document.createElement('h2');title.id='diarySaveDialogTitle';title.textContent='이야기를 간직하기';
 const note=document.createElement('p');note.textContent='이 기기에 저장한 이야기는 이어서 읽을 수 있습니다. 서버 복구키는 다른 기기에서도 불러올 때 사용하며, 다른 사람에게 알려 주지 마세요.';
 const input=document.createElement('input');input.id='diaryRecoveryKey';input.type='text';input.maxLength=64;input.autocomplete='off';input.autocapitalize='off';input.spellcheck=false;input.placeholder='64자리 복구키 입력 또는 복사';
 input.setAttribute('aria-label','이야기 복구키');
 const buttons=document.createElement('div');buttons.className='diary-save-dialog-actions';
 const load=make('복구키로 이어하기',()=>{void loadCloud(input.value.trim())});
 const copy=make('복구키 복사',()=>{if(!/^[0-9a-f]{64}$/.test(input.value))return;navigator.clipboard?.writeText(input.value).then(()=>showMessage('복구키를 복사했습니다. 안전하게 보관해 주세요.')).catch(()=>showMessage('복사할 수 없어요. 복구키를 직접 복사해 주세요.'))});
 const clear=make('저장 삭제',deleteSave);
 const close=make('닫기',closeDialog);
 buttons.append(load,copy,clear,close);dialog.append(title,note,input,buttons);cover.append(dialog);document.body.append(cover);
 function closeDialog(){cover.hidden=true}
 function openDialog(recoveryKey='',message=''){input.value=recoveryKey;note.textContent=message||'64자리 복구키를 붙여넣으면 다른 기기에서 저장한 이야기를 불러올 수 있습니다. 복구키를 다른 사람과 공유하지 마세요.';cover.hidden=false;input.focus()}
 cover.addEventListener('click',e=>{if(e.target===cover)closeDialog()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!cover.hidden){e.stopImmediatePropagation();closeDialog()}},true);
 function refresh(){openContinue.hidden=!read();}
 async function call(action,recoveryKey,snap){
  const c=context();const headers={'Content-Type':'application/json'};
  if(c.session)headers['X-Beagu-Session']=c.session;
  if(c.ticket)headers['X-Class-Diary-Guest-Ticket']=c.ticket;
  if(c.grant)headers['X-Class-Diary-Save-Grant']=c.grant;
  const body={action,recoveryKey,...(snap?{scope:c.scope,schoolId:c.schoolId,snapshot:snap}:{})};
  const response=await fetch(API,{method:'POST',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',headers,body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'NETWORK_ERROR');
  return data;
 }
 async function save(){
  const snap=snapshot();if(!snap||!validSnapshot(snap)){showMessage('36화 본편을 시작한 뒤 저장해 주세요.');return;}
  const c=context();
  let old=read(),recoveryKey=old?.recoveryKey||bytes();
  const entry={version:VERSION,snapshot:snap,scope:c.scope,schoolId:c.schoolId,recoveryKey,cloud:false,savedAt:new Date().toISOString()};
  try{localStorage.setItem(localKey(),JSON.stringify(entry))}catch{showMessage('브라우저의 저장 공간을 사용할 수 없습니다.');return}
  refresh();showMessage('이 기기에 저장했습니다.');
  if(c.scope==='demo'){showMessage('이 기기에 저장했습니다. 공개 체험은 서버에 저장되지 않습니다.');return;}
  saveButton.disabled=true;
  try{
   await call('save',recoveryKey,snap);entry.cloud=true;
   localStorage.setItem(localKey(),JSON.stringify(entry));
   showMessage('저장 완료 · 서버에서도 90일간 보관합니다.');
   openDialog(recoveryKey,'서버 저장이 완료됐습니다. 복구키를 복사해 안전하게 보관하세요. 이 키를 가진 사람은 기록을 볼 수 있으니 공유하지 마세요.');
  }catch(err){showMessage('이 기기에는 저장했습니다. 서버 연결은 확인되지 않았습니다.');}
  finally{saveButton.disabled=false}
 }
 function apply(saved,source){const c=context();if(!saved||!validSnapshot(saved.snapshot))throw Error('INVALID_SNAPSHOT');
  if(saved.scope!==c.scope&&!(c.scope==='demo'&&saved.scope==='guest'))throw Error('DIFFERENT_ACCESS');
  if(saved.schoolId!==c.schoolId)throw Error('DIFFERENT_SCHOOL');
  if(c.game&&!window.confirm('현재 읽고 있는 장면 대신 저장한 이야기로 돌아갈까요?'))return;
  restore(saved.snapshot);
  if(source==='cloud')try{localStorage.setItem(localKey(),JSON.stringify({...saved,cloud:true,savedAt:new Date().toISOString()}))}catch{}
  closeDialog();refresh();
  showMessage('저장한 장면부터 이어서 읽습니다.');
 }
 function continuePlay(){
  const saved=read();
  if(saved){try{apply(saved,'local')}catch{openDialog();showMessage('저장한 기록을 확인하지 못했습니다. 복구키로 다시 시도해 주세요.')}return}
  openDialog();
 }
 async function loadCloud(secret){
  if(!/^[0-9a-f]{64}$/.test(secret)){showMessage('복구키는 숫자와 a~f로 이루어진 64자리입니다.');return}
  load.disabled=true;
  try{const result=await call('load',secret);apply({version:VERSION,snapshot:result.snapshot,scope:result.scope,schoolId:result.schoolId,recoveryKey:secret},'cloud')}
  catch{showMessage('저장 정보를 찾지 못했거나 현재 학교·입장 방식과 다릅니다.')}
  finally{load.disabled=false}
 }
 async function deleteSave(){
  const saved=read();if(!saved){showMessage('이 기기에 저장된 기록이 없습니다.');return}
  if(!window.confirm('이 기기와 서버의 저장 기록을 삭제할까요?'))return;
  try{if(saved.cloud)await call('delete',saved.recoveryKey)}catch{showMessage('서버 삭제가 실패했습니다. 네트워크를 확인해 주세요.');return}
  try{localStorage.removeItem(localKey())}catch{}
  closeDialog();refresh();showMessage('저장 기록을 삭제했습니다.');
 }
 refresh();
 return Object.freeze({refresh,save,continuePlay});
}
root.BeaguClassDiarySave=Object.freeze({mount,validSnapshot});
})(typeof window!=='undefined'?window:globalThis);
