/* v1.1.0 Stage24 — opt-in, verified Lv3 2026 official school facts.
 * Separate from 2026 survey responses and existing Lv0–Lv2 school cards.
 * Never persists Lv3 bearer, school-facts response or source evidence.
 */
(()=>{
'use strict';
const client=typeof supabaseClient!=='undefined'?supabaseClient:window.supabaseClient;
if(!client?.auth||!window.BeaguLv3Session?.create)return;
const code=()=>{try{return sessionStorage.getItem('beagu-level-session-v1')||''}catch{return ''}};
const session=window.BeaguLv3Session.create({client,levelToken:code});
const entries=new Set();
let epoch=0;
const mk=(tag,cls,value)=>{
 const element=document.createElement(tag);
 if(cls)element.className=cls;
 if(value!==undefined)element.textContent=String(value);
 return element;
};
const formatted=(value,unit='',digits=0)=>{
 if(value===null||value===undefined||value==='')return '2026년 공식 수치 확인 전';
 const number=Number(value);
 return Number.isFinite(number)&&number>=0
  ?number.toLocaleString('ko-KR',{maximumFractionDigits:digits})+unit
  :'2026년 공식 수치 확인 전';
};
function reset({remove=false}={}){
 epoch++;session.reset();
 for(const item of entries){
  item.content.replaceChildren();
  item.button.disabled=false;
  item.status.textContent='Lv3 계정 인증 후 검증된 2026 기본정보를 확인할 수 있습니다.';
  if(remove)item.wrapper.remove();
 }
 if(remove)entries.clear();
}
const field=(host,label,value)=>{
 const line=mk('div','beagu-lv3-fact');
 line.append(mk('dt','',label),mk('dd','',value));
 host.append(line);
};
function draw(result,schoolId,host){
 host.replaceChildren();
 if(result.status==='not_verified'||!result.school){
  host.append(mk('p','beagu-lv3-empty',
   '이 학교의 검증·승인된 2026년 최신 기본정보가 아직 없습니다. 이전 연도 값으로 대체하지 않습니다.'));
  return;
 }
 const item=result.school;
 if(item.school_id!==schoolId||Number(item.reference_year)!==2026)
  throw Error('UNVERIFIED_SOURCE');
 const title=mk('p','beagu-lv3-title',String(item.school_name||'학교')+' · 2026년 공식 기본정보');
 const date=mk('p','beagu-lv3-source-date',
  '학교 기본정보 기준일: '+String(item.neis_as_of||'확인 전'));
 const details=mk('dl','beagu-lv3-facts');
 field(details,'주소',String(item.address||'2026년 주소 확인 전'));
 field(details,'교육지원청',String(item.support_office||'2026년 자료 확인 전'));
 field(details,'학생 수',formatted(item.student_count,'명'));
 field(details,'2급 정교사 비율',formatted(item.junior_teacher_ratio,'%',2));
 field(details,'남교사 비율',formatted(item.male_teacher_ratio,'%',2));
 field(details,'공동주택 평균 공시가격',formatted(item.housing_price_won,'원'));
 field(details,'학생·교원 자료 기준일',String(item.student_reference_date||'공식 수치 확인 전'));
 field(details,'공시가격 기준일',String(item.housing_reference_date||'공식 수치 확인 전'));
 host.append(title,date,details,mk('p','beagu-lv3-note',
  '2026 공식 출처가 검증된 항목만 표시합니다. 2025년 배구지수와 과거 학교정보는 위의 기존 영역에서 따로 확인하세요.'));
}
async function load(entry){
 if(entry.busy||entry.getTier()<2||!entry.wrapper.isConnected)return;
 const task=++epoch;
 entry.busy=true;
 entry.button.disabled=true;
 entry.content.replaceChildren();
 entry.status.textContent='계정·추천·원기기와 Lv3 공개 권한을 확인하는 중입니다.';
 try{
  const {data,error}=await client.auth.getSession();
  if(task!==epoch)return;
  if(error||!data?.session?.access_token){
   entry.status.textContent='챌린지에서 정식 계정으로 로그인한 후 다시 시도해주세요.';
   return;
  }
  const user=data.session.user;
  if(!user?.email_confirmed_at||user.is_anonymous===true){
   entry.status.textContent='이메일 인증을 마친 계정으로 로그인한 후 이용할 수 있습니다.';
   return;
  }
  // Never trust the browser for authorization. Stage19 must issue and verify
  // a server-backed short-lived token before stage22 will return any facts.
  if(!await session.issue())throw Error('LV3_NOT_AVAILABLE');
  if(task!==epoch)return;
  entry.status.textContent='2026년 검증 자료를 안전하게 조회하는 중입니다.';
  const result=await session.schoolFacts(entry.schoolId);
  if(task!==epoch||!entry.wrapper.isConnected||entry.getTier()<2)return;
  draw(result,entry.schoolId,entry.content);
  entry.status.textContent=result.status==='verified'
   ?'Lv3 서버 인증 및 학교별 공식자료 승인 확인 완료'
   :'Lv3 인증 완료 · 해당 학교의 공식자료 승인 대기';
 }catch(_){
  if(task===epoch){
   entry.content.replaceChildren();
   entry.status.textContent='Lv3 확인 또는 자료 조회에 실패했습니다. 인증·추천 상태를 확인한 뒤 다시 시도해주세요.';
  }
 }finally{
  entry.busy=false;
  if(task===epoch)entry.button.disabled=false;
 }
}
function attachCard(card,school,getTier){
 const schoolId=String(school?.school_id||'');
 if(!card||!/^[A-Z0-9]{7}$/.test(schoolId)||
    typeof getTier!=='function'||getTier()<2)return;
 const wrapper=mk('details','beagu-lv3-school-panel');
 wrapper.dataset.schoolId=schoolId;
 const summary=mk('summary','beagu-lv3-school-summary','Lv3 · 2026 최신 학교 기본정보');
 const body=mk('div','beagu-lv3-school-body');
 const status=mk('p','beagu-lv3-status',
  'Lv3 계정 인증 후 검증된 2026 기본정보를 확인할 수 있습니다.');
 status.setAttribute('role','status');
 const button=mk('button','beagu-lv3-fetch-button','Lv3 인증 후 기본정보 확인');
 button.type='button';
 const link=mk('a','beagu-lv3-account-link','회원가입·로그인');
 link.href='challenge.html';
 link.setAttribute('aria-label','챌린지에서 Lv3 정식 계정 가입 또는 로그인');
 const content=mk('div','beagu-lv3-school-result');
 const entry={wrapper,schoolId,getTier,status,button,content,busy:false};
 button.addEventListener('click',()=>{void load(entry)});
 body.append(status,button,link,content);
 wrapper.append(summary,body);
 card.append(wrapper);
 entries.add(entry);
}
client.auth.onAuthStateChange?.(event=>{
 if(['SIGNED_OUT','USER_DELETED','SIGNED_IN','TOKEN_REFRESHED'].includes(event))
  reset();
});
window.addEventListener('beagu:level-state-updated',event=>{
 const newTier=Number(event?.detail?.level);
 if(!Number.isFinite(newTier)||newTier<2)reset({remove:true});
});
window.addEventListener('pagehide',()=>reset());
document.addEventListener('visibilitychange',()=>{
 if(document.hidden)reset();
});
Object.defineProperty(window,'BeaguLv3SchoolFacts',{
 value:Object.freeze({attachCard,clear:()=>reset({remove:true}),reset}),
 enumerable:false,writable:false,configurable:false
});
})();