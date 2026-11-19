/* 4단계 연출 감독: 다음 날에 전날의 선택이 남도록 하는 순수 서사 변환기.
 * 브라우저 저장·점수 전송·개별 교사 데이터 사용 금지.
 */
(function(root){
'use strict';
const VERSION='class-diary-director/v1';
const BRIDGES=Object.freeze({
  2:{
    ask:'전날 주안과 동의서 취합 담당을 학년 업무표로 확인했다. 오늘 교직원전체회의에서도 모르는 건 물어봐도 된다는 생각이 힘이 됐다.',
    carry:'전날 혼자 챙긴 주안 출력물과 동의서가 아직 책상 위에 남아 있었다. 나이스 출결도 마무리해야 하는데 회의에서 의견을 꺼내려니 괜히 부담스러웠다.',
    share:'복합기 앞에서 학기 초가 다들 정신없다는 이야기를 나눴다. 오늘 교직원전체회의에서도 {colleague}과 눈이 마주치자 조금 덜 긴장됐다.'
  },
  3:{
    reopen:'어제 교직원전체회의에서 학급별로 정할 부분을 남겨 두자고 말했다. 오늘 아이들과 학급회의를 하려니 그 말을 지킬 차례가 된 것 같았다.',
    private:'어제는 학년연구실에서 {colleague}에게만 의견을 말했다. 오늘 우리 반 아이들에게는 먼저 자기 생각을 말할 기회를 주고 싶었다.',
    follow:'어제 공통 생활 규칙을 그대로 따르기로 했다. 오늘 아이가 급식 줄서기를 묻자, 그때 못 꺼낸 말이 다시 떠올랐다.'
  },
  4:{
    council:'어제 학급회의에서 나온 급식 줄서기 의견이 칠판 한쪽에 남아 있었다. 오늘도 아이들 말을 확인하기 전에 답부터 정하지 않으려고 했다.',
    trial:'어제 아이들과 정한 두 가지 줄서기 방법을 번갈아 써 보기로 했다. 아이들 사이의 오해도 직접 확인하지 않고 결론 낼 수는 없었다.',
    explain:'어제는 왜 번호대로 줄을 서는지 먼저 설명했다. 아이들 질문이 끝나지 않았듯, 오늘 생긴 일에도 답을 서두르지 않기로 했다.'
  },
  5:{
    together:'어제 보호자 연락을 받은 뒤 동학년 선생님과 사실관계를 함께 확인했다. 오늘 학년연구실로 돌아오니 같은 책상에서 일한다는 게 조금 든든했다.',
    listen:'어제 아이들 말을 하나씩 들었다. 오늘 주안을 맞추며 {colleague}과 이야기를 나누는데, 서로의 말을 끝까지 듣는 일이 교실 밖에서도 중요했다.',
    alone:'어제 보호자와 통화한 뒤에야 {colleague}에게 도움을 청했다. 피곤한 채로 다음 주 주안을 펼쳤지만, 이제는 혼자 붙들고 있지 않아도 된다는 걸 알았다.'
  },
  6:{
    invite:'어제 주안과 에듀파인 품의를 마무리하고 {colleague}과 교문 밖을 함께 걸었다. 그 짧은 산책이 자꾸 생각났다.',
    choice:'어제 저녁 모임은 각자 선택하자고 말했다. 주말이 되자 그 말이 나에게도 필요하다는 생각이 들었다.',
    rest:'어제는 다음 주 주안만 정리하고 바로 퇴근했다. 주말 아침에는 업무용 메시지를 확인하지 않고도 마음 편히 하루를 시작했다.'
  },
  7:{
    coffee:'어제 카페에서는 전담시간이나 주안 이야기가 아니라 좋아하는 책 이야기를 더 많이 했다. 동학년이라는 말 밖의 얼굴을 하나 더 알게 됐다.',
    letter:'어제 한 주 고마웠다는 메시지를 보냈다. 일요일 저녁 수첩을 펼치니 평일 학년연구실에서 받았던 배려가 생각났다.',
    offline:'어제는 연락도 검색도 미뤘다. 수업 준비는 평일 쉬는 시간에 그때그때 해 두었으니, 일요일까지 교사 역할을 붙들고 있을 필요는 없었다.'
  }
});
const RELATIONSHIPS=Object.freeze({
  woman:{name:'지윤 선생님',initial:'윤',style:'차분하게 귀 기울이는 동학년 동료',caption:'주변을 먼저 살피지만 자기 생각도 분명히 말하는 사람'},
  man:{name:'현우 선생님',initial:'우',style:'사소한 농담으로 긴장을 덜어 주는 동학년 동료',caption:'농담 뒤에 중요한 이야기를 그냥 흘려보내지 않는 사람'},
  none:{name:'동학년 선생님',initial:'동',style:'서로의 일을 존중하는 동학년 동료',caption:'연애를 전제로 하지 않고 함께 성장하는 관계'}
});
const VISUAL=Object.freeze([
  {id:'morning',label:'아침의 교무실',theme:'dawn'},
  {id:'meeting',label:'방과 후 교직원전체회의',theme:'paper'},
  {id:'classroom',label:'모둠 활동이 한창인 교실',theme:'class'},
  {id:'hallway',label:'보호자 상담을 앞둔 복도',theme:'haze'},
  {id:'evening',label:'주안을 마무리하는 금요일 학년연구실',theme:'dusk'},
  {id:'weekend',label:'토요일의 거리',theme:'rest'},
  {id:'night',label:'일요일의 책상',theme:'night'}
]);
function prevChoice(state){
  if(!state||!Array.isArray(state.history)||state.day<2)return null;
  const record=state.history.find(x=>x&&x.day===state.day-1);
  return record&&typeof record.choiceId==='string'?record.choiceId:null;
}
function dynamicLine(state){
  if(!state||!state.stats||!state.profile)return '';
  if(state.day===1)return '낯선 사람과 가까워지는 데에는 저마다 다른 속도가 있다.';
  const partner=state.profile.partner;
  if(partner==='none'){
    if(state.stats.trust>=63)return '일을 함께 해결한 사람과는 말이 길어지지 않아도 어색하지 않았다. 그 신뢰를 연애라고 부를 이유는 없었다.';
    return '나란히 일하는 사람에게도 지켜 주고 싶은 거리가 있었다. 나는 그 거리부터 존중하기로 했다.';
  }
  if(state.stats.affection>=62&&state.stats.trust>=62)return '그 사람의 발걸음 소리가 익숙해졌다. 익숙함이 허락을 대신할 수는 없다는 사실도 함께 기억했다.';
  if(state.stats.affection>=52)return '괜히 더 물어보고 싶은 이야기가 생겼다. 그렇지만 지금은 질문 하나를 아껴 두기로 했다.';
  if(state.stats.trust<50)return '우리는 아직 서로의 말을 더 들어야 했다. 가까워지는 일에는 답을 재촉하지 않는 태도가 필요했다.';
  return '그 사람과 나 사이에는 말을 건넬 수 있을 만큼의 거리가 생겨 있었다.';
}
function worldDetail(world,day){
  if(!world||!world.basic)return null;
  if(day===1){
    const n=world.numbers&&world.numbers.students;
    if(n&&n.status==='APPROVED'&&Number.isFinite(Number(n.value))&&n.referenceYear)
      return {label:'학교 규모',value:n.referenceYear+'년 기준 학생 '+Number(n.value).toLocaleString('ko-KR')+'명',source:'approved_official_fact'};
    return world.basic.scale?{label:'학교 규모',value:({small:'소규모',medium:'중규모',large:'대규모'})[world.basic.scale],source:'approved_school_world'}:null;
  }
  if(day===3){
    const c=world.numbers&&world.numbers.classes;
    if(c&&c.status==='APPROVED'&&Number.isFinite(Number(c.value))&&c.referenceYear)
      return {label:'학교 규모',value:c.referenceYear+'년 기준 '+Number(c.value)+'학급',source:'approved_official_fact'};
  }
  if(day===6){
    const tags=world.geography&&world.geography.tags;
    if(Array.isArray(tags)){
      const t=tags.find(x=>x.source==='official_address'&&['admin_eup','admin_myeon','admin_dong'].includes(x.id));
      if(t)return {label:'행정 구역',value:t.label+' · 주소에서 확인',source:'official_address'};
    }
  }
  return null;
}
function decorateChapter(state,world,base){
  if(!state||!base||!Array.isArray(base.paragraphs)||state.phase!=='chapter')throw Error('VALID_CHAPTER_REQUIRED');
  if(state.day!==base.day||state.schoolId!==world.basic.id)throw Error('WRONG_STORY_STATE');
  const copy={...base,paragraphs:base.paragraphs.slice(),choices:base.choices.map(c=>({...c}))};
  const previous=prevChoice(state);
  const callback=previous&&BRIDGES[state.day]&&BRIDGES[state.day][previous];
  const colleague=(RELATIONSHIPS[state.profile.partner]||RELATIONSHIPS.none).name;
  if(callback)copy.paragraphs.splice(1,0,callback.replace(/\{colleague\}/g,colleague));
  const relationship=dynamicLine(state);
  if(relationship)copy.paragraphs.push(relationship);
  const profile=RELATIONSHIPS[state.profile.partner]||RELATIONSHIPS.none;
  return {
    ...copy,directionVersion:VERSION,character:{...profile},
    visual:{...VISUAL[state.day-1]},
    worldDetail:worldDetail(world,state.day),
    callbackFrom:callback?previous:null,
    relationshipCue:relationship
  };
}
function decorateOutcome(state){
  if(!state||state.phase!=='reflection'||!state.lastOutcome)throw Error('REFLECTION_REQUIRED');
  const base=state.lastOutcome;
  const lowEnergy=state.stats.fatigue>=65;
  const trust=state.stats.trust;
  const text=lowEnergy?
    '몸이 무거웠다. 잘하려는 마음만으로는 쉬어야 할 시간을 대신할 수 없었다.':
    trust>=65?'다음 날의 고민을 혼자 하지 않아도 된다는 사실이 조금 든든했다.':
    '그날의 선택은 아직 끝난 일이 아니었다. 나는 다음에 할 말을 천천히 골랐다.';
  return {paragraphs:base.paragraphs.concat(text),line:base.line,
    cue:lowEnergy?'휴식이 필요한 때':trust>=65?'쌓여 가는 신뢰':'다음 날을 위한 여백'};
}
function decorateEnding(state){
  if(!state||state.phase!=='ending'||!state.ending)throw Error('ENDING_REQUIRED');
  const choices=state.history.map(x=>x.choiceId);
  const contributed=choices.includes('council')?
    '학급회의에서 아이들이 고른 약속이 수첩에 남았다. 월요일에는 그 약속이 실제로 잘 지켜지는지 물어봐야겠다.':'아이들 질문에 바로 답부터 했던 순간도 있었다. 다음 학급회의에는 아이들이 먼저 말할 자리를 남겨 두기로 했다.';
  const energy=state.stats.fatigue>=60?
    '피로가 쌓인 일주일이었다. 마음을 다했다는 이유로 나를 끝까지 소모해서는 안 된다고 생각했다.':
    '쉬어야 할 때를 잊지 않은 덕분에, 내일 다시 시작할 힘이 남아 있었다.';
  const support=Number(state.stats.support);
  const workplace=state.profile.workCulture;
  const relationship=workplace==='hostile'?
    (support>=35?
      '같은 교직원끼리 서로를 경계하는 학교에서 한 사람의 편이 생긴다는 것은 큰 일이었다. 그렇다고 동료 몇 사람의 선의만으로 학교의 문제가 해결되는 것은 아니었다.':
      '서로를 향한 말이 날카로웠던 한 주였다. 내가 부족해서 힘든 것이 아니었다. 서로 적대하는 문화를 바꾸려면 개인의 인내가 아니라 학교의 책임과 대화할 구조가 필요했다.') :
    workplace==='collaborative'?
      '교직원들은 여전히 바빴다. 다만 어려운 일이 생기면 서로의 책상으로 다가갔다. 힘든 하루에도 버틸 만한 이유가 남는 학교는, 그렇게 함께 만드는 학교였다.':
      '일을 떠넘기는 말보다 담당을 확인하고 나누는 말을 더 많이 듣는 학교가 되었으면 했다. 작은 협의 하나가 그 시작일 수 있었다.';
  return {...state.ending,paragraphs:state.ending.paragraphs.concat(contributed,energy,relationship),directorVersion:VERSION};
}
const api=Object.freeze({
 VERSION,BRIDGES,VISUAL,RELATIONSHIPS,
 decorateChapter,decorateOutcome,decorateEnding,worldDetail
});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryDirector=api;
})(typeof window!=='undefined'?window:globalThis);
