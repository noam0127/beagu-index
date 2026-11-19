/* 배구지수 학급일지 시나리오 분기 v1.
 * 교직문화·학급 상황·업무분장은 플레이어가 선택한 허구의 상황.
 * 개별학교 배구지수/민감정보로 학생 행동이나 직원의 언행을 추정하지 않는다.
 * 기록은 메모리에서만 유지되며 저장·업로드하지 않는다.
 */
(function(root){
'use strict';
const VERSION='class-diary-scenario/v1';
const clamp=n=>Math.max(0,Math.min(100,Math.round(n)));
const copy=x=>JSON.parse(JSON.stringify(x));
const DUTIES=Object.freeze({
 none:{label:'담당 업무 없음',text:'이번 학기에는 담임 외 별도 업무가 배정되지 않았다. 그래도 교실에서 할 일은 하루에도 몇 번씩 생겼다.',short:'업무 없는 담임'},
 general:{label:'일반 업무',text:'학년 업무표에는 내 이름 옆에 교육활동 관련 작은 업무 하나가 붙어 있었다. 소소해 보여도 품의와 안내는 적지 않았다.',short:'일반 업무 담당'},
 academic:{label:'교무 업무',text:'업무분장표에서 내 이름 옆에 교무가 보였다. 학사일정, 학적과 공문 협조까지 적혀 있어 주안보다 먼저 숨이 턱 막혔다.',short:'교무 담당'},
 violence:{label:'학교폭력 관련 업무',text:'업무분장표에 학교폭력 관련 업무가 적혀 있었다. 사안이 생기면 정해진 절차와 관리자 지원이 필요할 일이었다.',short:'학교폭력 관련 업무 담당'}
});
const EVENTS=Object.freeze({
 1:{id:'first_day',tone:'unsettled',title:'첫날부터 종이와 목소리',
  place:'월요일 아침 · 교실과 학년연구실'},
 2:{id:'hand_off',tone:'tense',title:'그 일은 누가 맡나요?',
  place:'화요일 쉬는 시간 · 학년연구실'},
 3:{id:'lesson_break',tone:'gentle',title:'전담시간에 걸려 온 부탁',
  place:'수요일 3교시 · 학년연구실'},
 4:{id:'procedure',tone:'tense',title:'확인할 순서가 있다',
  place:'목요일 오후 · 교무실'},
 5:{id:'week_end',tone:'reflective',title:'금요일의 마지막 업무',
  place:'금요일 방과 후 · 학년연구실'}
});
const CHOICES=Object.freeze({
 first_day:[
  {id:'protect',label:'먼저 아이들 안전을 확인하고 동학년과 지도 방법을 의논한다',
   delta:{affection:2,trust:7,agency:8,fatigue:4},
   reply:['나는 모둠을 잠깐 멈추고 아이들이 다치지 않았는지부터 확인했다. 누구를 혼내기보다 왜 소란이 커졌는지 살펴야 했다.','쉬는 시간에는 동학년 선생님과 자리배치와 수업 지원을 상의했다. 한 사람의 인내만으로 교실이 나아지는 것은 아니었다.'],
   line:'“오늘은 우선 안전부터요. 학년에서 같이 방법을 찾아봐요.”'},
  {id:'restructure',label:'아이들과 모둠 활동 방식부터 다시 정해 본다',
   delta:{affection:4,trust:5,agency:10,fatigue:5},
   reply:['나는 아이들에게 어떤 순간에 서로 말이 겹치는지 물었다. 모둠마다 이유가 달랐다. 한 아이가 조용히 손을 들었다.','우리는 한 번에 완벽한 규칙을 정하려 하지 않고, 내일 고쳐 볼 방법 하나를 정했다.'],
   line:'“우리 반에서 바꿀 수 있는 것부터 해 보면 좋겠네요.”'},
  {id:'endure',label:'일단 교실을 조용히 한 뒤 혼자 해결해 보려 한다',
   delta:{affection:0,trust:-3,agency:-4,fatigue:13},
   reply:['나는 일단 교실을 조용히 만드는 데 힘을 썼다. 수업은 이어졌지만 아이들이 왜 그렇게 행동했는지 들을 시간은 없었다.','쉬는 시간이 되자 목이 잠겼다. 나 혼자 붙들면 된다는 생각이 오히려 나를 더 지치게 했다.'],
   line:'“힘들면 이야기해요. 혼자 다 버텨야 할 이유는 없잖아요.”'}
 ],
 hand_off:[
  {id:'clarify',label:'업무분장표를 보며 누가 맡을 일인지 확인한다',
   delta:{affection:3,trust:8,agency:5,fatigue:-2},
   reply:['나는 업무분장표를 다시 열었다. 실제로 내 업무인지, 도움을 요청받은 것인지부터 가려 보기로 했다.','부탁한 선생님도 표를 살폈다. 표에 없는 일이라면 누가 결정해야 하는지도 확인할 수 있었다.'],
   line:'“이건 일단 담당과 관리자한테 같이 확인해 봐요.”'},
  {id:'offer',label:'내 일을 마친 뒤 도울 수 있는 만큼 돕겠다고 한다',
   delta:{affection:4,trust:5,agency:4,fatigue:2},
   reply:['“제가 지금 하는 일부터 마무리하고 도울 수 있는 부분은 볼게요.” 생각보다 어렵지 않은 문장이었다.','다른 사람을 돕는 일과 내 몫이 아닌 일을 떠맡는 일은 같지 않았다.'],
   line:'“업무는 서로 도울 수 있지만, 담당을 바꾸는 건 따로 이야기해야죠.”'},
  {id:'accept',label:'부탁받은 일을 일단 모두 맡겠다고 한다',
   delta:{affection:1,trust:-2,agency:-4,fatigue:12},
   reply:['나는 알겠다고 했다. 부탁이 끝나는 순간 또 다른 일이 붙었다. 내가 빨리 대답해서인지 상대방은 더 묻지 않았다.','다음 수업 준비를 할 시간이 줄어들었다. 이 학교가 어떤 방식으로 일을 나누는지 처음으로 궁금해졌다.'],
   line:'“이런 일이 반복되면 업무분장을 다시 이야기해야 해요.”'}
 ],
 lesson_break:[
  {id:'boundary',label:'전담시간에 수업 준비를 마친 뒤 도와드리겠다고 한다',
   delta:{affection:3,trust:7,agency:5,fatigue:-4},
   reply:['“다음 시간 활동지 마무리하는 중이라서요. 끝나고 잠깐 같이 봐도 될까요?”','상대는 고개를 끄덕였다. 전담시간에 아이들만 교실을 비우는 게 아니라, 교사에게도 준비할 시간이 생겨야 했다.'],
   line:'“선생님 전담시간 소중하죠. 자료부터 마무리하세요.”'},
  {id:'helpbrief',label:'방법을 간단히 알려드리고 수업 준비를 이어 간다',
   delta:{affection:5,trust:5,agency:3,fatigue:1},
   reply:['나는 공용 태블릿의 화면 공유 설정을 함께 살펴봤다. 기기 담당자에게 확인할 부분을 알려드리고 내 자리로 돌아왔다.','인디스쿨에 저장해 둔 모둠 자료를 열어 보니 전담시간이 벌써 절반쯤 지났다.'],
   line:'“고마워요. 나머지는 제가 해 볼게요.”'},
  {id:'dropwork',label:'내 준비를 미루고 부탁받은 일부터 마무리한다',
   delta:{affection:2,trust:1,agency:-3,fatigue:10},
   reply:['교실 태블릿의 화면 연결이 겨우 끝났을 즈음 다음 시간 예비종이 울렸다. 나는 급히 아이스크림에서 찾은 자료를 출력했다.','교실로 돌아오면서 생각했다. 잠깐의 부탁을 거절하지 못하면 준비할 시간을 잃는 건 내 몫이었다.'],
   line:'“미안해요. 수업 준비하시던 중이었죠?”'}
 ],
 procedure:[
  {id:'process',label:'확인할 내용과 처리 절차를 담당자와 상의한다',
   delta:{affection:4,trust:9,agency:6,fatigue:-2},
   reply:['나는 확인된 사실과 아직 확인되지 않은 내용을 나누어 적었다. 업무와 관련된 교직원, 관리자의 역할도 먼저 확인했다.','나 혼자 판단하고 처리하는 것보다 훨씬 느려 보였다. 하지만 누군가를 지키는 일에는 그 순서가 필요했다.'],
   line:'“규정대로 가되, 아이와 선생님 모두 보호받게 하죠.”'},
  {id:'consult',label:'관련 선생님들의 의견을 듣고 역할을 나눈다',
   delta:{affection:6,trust:6,agency:7,fatigue:2},
   reply:['나는 선생님들 이야기를 먼저 들었다. 각자가 놓인 자리와 알고 있는 정보가 달랐다.','상의가 끝난 뒤 해야 할 일과 해서는 안 될 일을 따로 적었다. 공동의 책임은 누구도 책임지지 않는다는 말이 아니었다.'],
   line:'“혼자 결정하지 않아 줘서 고마워요.”'},
  {id:'solo',label:'일단 혼자 해결하려다 필요한 절차를 뒤로 미룬다',
   delta:{affection:0,trust:-3,agency:-4,fatigue:13},
   reply:['빨리 끝내고 싶어 나는 혼자 자료를 모았다. 그러나 확인되지 않은 내용과 직접 처리할 수 없는 일이 뒤섞였다.','결국 도움을 요청해야 했다. 늦게라도 다시 절차를 따르는 것이 맞았다.'],
   line:'“지금이라도 함께 정리해요. 혼자 감당할 문제는 아니에요.”'}
 ],
 week_end:[
  {id:'reassign',label:'다음 학년협의회에서 업무 조정을 제안한다',
   delta:{affection:4,trust:8,agency:6,fatigue:-4},
   reply:['나는 이번 주에 수업 준비가 밀린 시간을 기록해 두었다. 누가 얼마나 힘들었는지를 탓하려는 게 아니라 조정할 근거가 필요했다.','월요일 학년회의에서는 이 일을 함께 살펴보기로 했다. 교직문화는 누군가의 부탁 한 번으로도, 그것을 고치는 회의 한 번으로도 달라질 수 있었다.'],
   line:'“다음 주에는 우리 학년 일이 한 사람에게 몰리지 않게 해 봐요.”'},
  {id:'sharehelp',label:'다음 주에 서로 맡아 줄 일을 동학년과 정한다',
   delta:{affection:7,trust:6,agency:5,fatigue:-1},
   reply:['우리는 주안을 펼쳐 놓고 누가 어떤 날 바쁜지 살폈다. 전담시간이 겹치는 날에는 필요한 자료를 같이 확인하기로 했다.','도움이 다정한 말로 끝나지 않고 실제 시간표에 적히는 순간이었다.'],
   line:'“할 수 있는 만큼 나눠 하죠. 혼자 다 하실 필요 없어요.”'},
  {id:'takeall',label:'추가로 부탁받은 일도 내가 하겠다고 한다',
   delta:{affection:1,trust:-1,agency:-5,fatigue:11},
   reply:['나는 이번 주처럼 다음 주도 하면 된다고 말했다. {colleague}이 한참 말이 없었다.','월요일 수업을 생각하자 마음이 가라앉았다. 한 사람이 무리해야 돌아가는 학교가 괜찮은 학교일 리 없었다.'],
   line:'“일을 잘하는 사람에게 일이 더 몰리는 건 해결책이 아니죠.”'}
 ]
});

/* 배구지수 2026년 공식 설문 Q01/Q05/Q08/Q13/Q36/Q37에서 가져온 "주제"일 뿐,
   해당 학교의 답변이나 특정 교사의 실제 행위를 재현하는 정보가 아니다. */
const SURVEY_THEMES=Object.freeze({
 sports:['2026:Q01','2026:Q37'],newcomer:['2026:Q08'],
 informal:['2026:Q13'],habit:['2026:Q05','2026:Q27'],
 social:['2026:Q01','2026:Q36']
});
const SPORTS_CHOICES=Object.freeze([
 {id:'sport_join',label:'오늘은 참여하되 다음 모임은 그때 결정하기로 한다',
  delta:{affection:6,trust:3,agency:2,fatigue:2},
  reply:['“오늘은 저도 한 게임 할게요. 그런데 다음번에는 못 올 수도 있어요.” 말하고 나니 마음이 조금 편해졌다.','배구공을 한 번 받아 보니 웃음이 났다. 좋은 모임이라면 참석하지 않는 사람도 편해야 했다.'],
  line:'“맞아요. 오고 싶은 사람끼리 즐겁게 해요.”'},
 {id:'sport_decline',label:'오늘은 쉬고 싶다고 말하고 참여하지 않는다',
  delta:{affection:2,trust:5,agency:5,fatigue:-6},
  reply:['“저 오늘은 먼저 갈게요.” 조심스레 말했지만 더 긴 이유를 댈 필요는 없었다.','스포츠활동이 없는 금요일도 내게는 괜찮은 금요일이었다.'],
  line:'“그럼 다음에 봐요. 푹 쉬세요.”'},
 {id:'sport_change',label:'무슨 운동을 할지, 참여할지는 먼저 물어보자고 한다',
  delta:{affection:4,trust:8,agency:8,fatigue:1},
  reply:['“배구 말고 다른 운동을 좋아하는 분도 있잖아요. 희망자부터 받으면 어떨까요?”','잠깐의 침묵 뒤 누군가 걷기를 좋아한다고 말했다. 마음에 드는 종목도, 쉬고 싶은 마음도 함께 존중받았으면 했다.'],
  line:'“다음에는 종목부터 희망조사를 해 봅시다.”'}
]);
const BARBECUE_CHOICES=Object.freeze([
 {id:'bbq_join',label:'일을 마친 뒤 원하는 만큼만 저녁 모임에 참여한다',
  delta:{affection:8,trust:6,agency:3,fatigue:-1},
  reply:['학교 뒤뜰에서 고기 굽는 소리가 났다. 나는 준비해 둔 모둠 활동지를 덮고 늦게 합류했다.','아무도 왜 이제 왔느냐고 묻지 않았다. 종이접시를 건네는 손이 먼저 보였다.'],
  line:'“늦게 오셔도 괜찮아요. 같이 한 입 드세요.”'},
 {id:'bbq_rest',label:'초대에 고맙다고 말하고 오늘은 집에 간다',
  delta:{affection:4,trust:7,agency:5,fatigue:-7},
  reply:['“초대해 주셔서 고마워요. 오늘은 먼저 쉬어야 할 것 같아요.”','{colleague}은 퇴근길에 손을 흔들었다. 참여하지 않았다고 사이가 멀어지는 분위기는 아니었다.'],
  line:'“다음에 마음 내키면 오세요. 주말 잘 보내요.”'},
 {id:'bbq_help',label:'준비할 일이 있다면 부담 없이 나눠 하자고 한다',
  delta:{affection:7,trust:8,agency:6,fatigue:1},
  reply:['나는 준비물을 옮기면서 “다음에는 희망자끼리 조금씩 준비해요”라고 말했다.','서로의 일을 편하게 나누니 뒷정리도 오래 걸리지 않았다. 좋은 친목은 한 사람의 희생으로 굴러가지 않았다.'],
  line:'“그렇죠. 맛있게 먹는 일까지 업무가 되면 안 되죠.”'}
]);
const FORCED_CHOICES=Object.freeze([
 {id:'club_check',label:'친목회장 역할과 선출 방법부터 묻는다',
  delta:{affection:3,trust:8,agency:7,fatigue:2},
  reply:['“제가 하게 된 이유와 회장 역할을 먼저 확인해도 될까요?” 말을 끝내자 마음이 쿵 내려앉았다.','회비 정산, 행사 예약, 참석 조사, 뒷정리까지. 업무분장표에 없는 일이 이렇게 길 줄은 몰랐다.'],
  line:'“이건 우리끼리 다시 의논해야겠네요. 그냥 맡길 일은 아니죠.”'},
 {id:'club_reform',label:'원하는 사람이 맡고 역할도 나눠 보자고 제안한다',
  delta:{affection:5,trust:7,agency:9,fatigue:3},
  reply:['나는 “친목회장은 희망자를 먼저 받고, 일도 나누면 좋겠습니다”라고 말했다.','누군가는 귀찮은 일을 다시 의논하느냐는 얼굴이었다. 그래도 말하지 않으면 내년에도 같은 일이 반복될 것 같았다.'],
  line:'“한 사람이 다 준비하는 건 오래가기 어려워요.”'},
 {id:'club_accept',label:'일단 회장을 맡고 행사 준비도 혼자 해 보려 한다',
  delta:{affection:0,trust:-3,agency:-6,fatigue:14},
  reply:['정식 업무 하나를 더 맡은 것도 아닌데 주안 뒤에 또 해야 할 일이 줄을 섰다. 회비 확인, 고기 주문, 참석 조사, 장소 정리.','어두워진 학년연구실에서 일정표를 수정하다가 야간 당직 선생님의 목소리를 들었다. “선생님, 이제 문 잠가야 해요. 얼른 퇴근하세요.”'],
  line:'“이렇게 혼자 다 맡으시면 버티기 힘들어요. 다음 주엔 꼭 이야기해요.”'}
]);
const SPECIAL_CHOICES=Object.freeze({sports:SPORTS_CHOICES,barbecue:BARBECUE_CHOICES,forced_social:FORCED_CHOICES});

const CULTURE_DELTAS=Object.freeze({
 protect:[7,7],restructure:[10,5],endure:[-6,-8],
 clarify:[6,10],offer:[5,5],accept:[-5,-10],
 boundary:[3,10],helpbrief:[3,5],dropwork:[-5,-8],
 process:[7,9],consult:[5,6],solo:[-8,-10],
 reassign:[9,10],sharehelp:[6,6],takeall:[-5,-12],
 sport_join:[3,3],sport_decline:[6,10],sport_change:[10,9],
 bbq_join:[4,4],bbq_rest:[5,10],bbq_help:[7,7],
 club_check:[8,9],club_reform:[10,8],club_accept:[-8,-12]
});
function duty(p){return DUTIES[p.duty]||DUTIES.general;}
function acceptedOfficialFact(world,key){
 const item=world&&world.numbers&&world.numbers[key];
 if(!item||item.status!=='APPROVED'||!Number.isInteger(Number(item.referenceYear))||
    item.value===null||item.value===undefined||!Number.isFinite(Number(item.value))||
    Number(item.value)<0||(['junior_teacher_ratio','male_teacher_ratio'].includes(key)&&Number(item.value)>100))return null;
 return {key,year:Number(item.referenceYear),value:Number(item.value)};
}
function officialFacts(world){
 const defs=[
  ['students','학생 수','명'],['classes','학급 수','학급'],['teachers','교원 수','명'],
  ['students_per_class','학급당 학생 수','명'],['admin_employees','행정직원 수','명'],
  ['junior_teacher_ratio','2정교사 비율','%'],['male_teacher_ratio','남교사 비율','%'],
  ['teacher_support_spaces','교직원 지원공간','개']
 ];
 return defs.map(([key,label,unit])=>{
   const data=acceptedOfficialFact(world,key);
   return data?{key,label,value:data.value,unit,referenceYear:data.year,source:'approved_official_fact'}:null;
 }).filter(Boolean);
}
function officialContext(world,day){
 const facts=officialFacts(world);
 const keys=day===1?['students','classes','teachers']:day===3?['students_per_class','classes']:
   day===5?['admin_employees','teacher_support_spaces','junior_teacher_ratio']:[];
 const found=facts.filter(x=>keys.includes(x.key)).slice(0,2);
 if(world.mode==='public_fiction_demo'||!found.length)return null;
 return '확인된 학교 상세정보: '+found.map(x=>x.referenceYear+'년 '+x.label+' '+x.value+x.unit).join(', ')+
  '. 이 수치는 배경 정보일 뿐 학급 소란이나 교직문화를 증명하지 않는다.';
}
function schoolSize(state,world){
 if(world&&world.mode==='public_fiction_demo')return state.profile.fictionalSchoolSize||'medium';
 return world&&world.basic&&['small','medium','large'].includes(world.basic.scale)?world.basic.scale:null;
}
function chosenEvent(state,world){
 if(state.day!==5)return EVENTS[state.day];
 const p=state.profile,scale=schoolSize(state,world);
 if(['deflecting','hostile'].includes(p.workCulture)&&scale==='large')
   return {id:'forced_social',title:'친목회장은 누가 하기로 했나요?',tone:'tense',place:'금요일 방과 후 · 학년연구실'};
 if(p.sportsCulture==='pressured')
   return {id:'sports',title:'오늘 배구, 빠지면 안 되죠?',tone:'tense',place:'금요일 방과 후 · 교무실'};
 if(p.workCulture==='collaborative'&&p.sportsCulture==='optional')
   return {id:'barbecue',title:'뒤뜰에서 고기 구울까요?',tone:'happy',place:'금요일 방과 후 · 학교 뒤뜰'};
 return EVENTS[5];
}
function schoolContextLines(state,world){
 if(!world||world.mode==='public_fiction_demo'||world.eligible!==true)return [];
 const lines=[];
 const get=(key)=>acceptedOfficialFact(world,key);
 const name=world.basic&&world.basic.sido;
 if(state.day===1&&typeof name==='string'&&name.trim()&&name.length<40)
   lines.push('학교 주소에 적힌 지역은 '+name.trim()+'이었다. 하지만 그 지역에서 살아가는 아이들의 하루까지 지명 하나로 알 수 있는 건 아니었다.');
 const students=get('students'),classes=get('classes'),junior=get('junior_teacher_ratio'),male=get('male_teacher_ratio');
 if(state.day===1&&students)
   lines.push(students.year+'년 학생 수 '+students.value+'명. 아이들을 일일이 알아 가기에는 숫자보다 시간이 더 필요했다.');
 if(state.day===2&&junior&&junior.value<=100)
   lines.push('공개된 '+junior.year+'년 2정교사 비율은 '+junior.value+'%였다. 그 비율이 신규교사에게 어려운 일이 몰린다는 증거는 아니었다. 배정 기준은 직접 물어야 알 수 있었다.');
 if(state.day===3&&classes)
   lines.push('공개된 '+classes.year+'년 학급 수는 '+classes.value+'학급이었다. 교사의 전담시간은 그 숫자만으로 설명할 수 없었다.');
 if(state.day===5&&male&&male.value<=100)
   lines.push('공개된 '+male.year+'년 남교사 비율은 '+male.value+'%였다. 그 숫자만으로 누가 배구를 하거나 친목회장을 맡을지는 알 수 없었다.');
 return lines;
}
/* 교직원 간 관계는 교사의 선천적 성격이 아니라 협력·적대·업무 경계의 경험으로 나타낸다. */
const STAFF_MOOD=Object.freeze({
 collaborative:{
  1:'학년연구실에서 “우리 학년 동의서 아직 다 못 걷었죠? 제가 확인한 것 공유할게요”라는 말이 나왔다. 복합기 앞에서 함께 일하니 종이 더미가 조금 작아 보였다.',
  2:'담당 업무가 겹치자 “업무분장표 같이 펼쳐 봅시다” 하고 누군가 의자를 끌어당겼다. 부탁을 거절해도 관계가 틀어지지 않는다는 것이 마음을 놓이게 했다.',
  3:'전담시간에 동료가 “모둠 자료 필요하면 제가 출력해 드릴까요?” 하고 물었다. 나도 시간이 날 때 도와줄 수 있었다. 그런 작은 교환이 일주일을 버티게 했다.',
  4:'보호자 연락을 마치고 학년연구실 문을 열자 동료가 따뜻한 물 한 잔을 내밀었다. “확인할 내용은 같이 정리해요.” 문제가 사라진 것은 아니지만 혼자 버티지는 않아도 됐다.',
  5:'금요일이면 책상마다 아직 해야 할 일이 있었다. 그런데 옆자리 선생님이 내 주안을 한번 봐 주고, 나는 그 선생님의 활동지를 함께 맞췄다. 함께하는 학교라면 힘든 일주일도 견딜 만했다.'
 },
 deflecting:{
  1:'학년연구실에서는 다들 바빴다. 부탁을 할 때마다 “제가 하는 건 아니어서요”라는 답이 돌아왔다. 미운 마음보다 답답함이 먼저 생겼다.',
  2:'업무분장표의 빈칸 하나를 두고 누가 맡을지 정하지 못했다. 서로 싫어서라기보다, 한 번 떠맡으면 다음에도 내 일이 될까 봐 누구도 쉽게 손을 들지 않았다.',
  3:'전담시간에 모둠 활동지를 뽑으려는데 다른 업무가 먼저 넘어왔다. 나는 수업 준비도 업무라는 사실을 누군가에게 설명해야 했다.',
  4:'상담 처리에 필요한 자료를 묻자 “일단 담임이 해 보세요”라는 답이 나왔다. 담당을 확인하는 데 시간이 더 걸렸다.',
  5:'학년연구실에서는 남은 일을 보면서 서로 눈치를 봤다. 동료를 돕는 마음과 내 몫을 지켜야 하는 마음이 자꾸 부딪혔다.'
 },
 hostile:{
  1:'학년연구실 문을 열자 웃던 목소리가 끊겼다. “저 반은 왜 벌써 시끄러워요?” 칸막이 너머로 들리는 말에 교실로 돌아가기 전부터 마음이 무거워졌다. 문제가 생길 때 의논할 사람이 없는 분위기가 더 무서웠다.',
  2:'업무분장표를 펴자 한 선생님이 말했다. “지난번에도 제가 했잖아요. 이번에는 알아서 하세요.” 다른 선생님은 그 말을 듣고도 모니터만 바라봤다. 갈등은 일이 많다는 사실보다 말할 사람이 없을 때 더 커졌다.',
  3:'전담시간에 학년연구실 복합기를 쓰려 하자 “또 그렇게 늦게 준비하세요?”라는 말이 들렸다. 수업을 준비하는 속도마저 평가받는 기분이었다. 멀쩡한 커피도 삼키기 힘들었다.',
  4:'보호자 연락 문제를 상의하자 서로 상대 학년의 탓을 했다. “그건 선생님 반 일이잖아요.” 어떤 말은 문제를 해결하기보다 사람 하나를 홀로 남겨 두었다.',
  5:'금요일까지 이어진 신경전 때문에 학년연구실에 들어서는 것부터 힘이 들었다. 아이들과 있는 교실보다 어른들이 모인 방에서 더 긴장한 자신을 발견했다. 일 자체보다 서로 적대하는 분위기가 사람을 지치게 했다.'
 }
});
const SUPPORT_SHIFTS=Object.freeze({
 protect:5,restructure:4,endure:-7,clarify:5,offer:3,accept:-6,
 boundary:5,helpbrief:2,dropwork:-6,process:7,consult:6,solo:-7,
 reassign:8,sharehelp:8,takeall:-7,
 sport_join:3,sport_decline:5,sport_change:7,
 bbq_join:7,bbq_rest:6,bbq_help:8,
 club_check:5,club_reform:7,club_accept:-8
});
function climateParagraph(state){
 const mode=state&&state.profile&&state.profile.workCulture;
 return ((STAFF_MOOD[mode]||STAFF_MOOD.collaborative)[state.day])||'';
}
function eventProse(state,world){
 const p=state.profile,d=state.day,young=p.age<=32,novice=p.experience==='new';
 const dutyline=duty(p).text;
 const pressure=p.workCulture==='deflecting';
 const demanding=p.classTone==='demanding';
 const first={
  busy:'등교한 지 얼마 되지 않았는데 교실 앞에서 아이들 목소리가 겹쳤다. 모둠 책상을 밀던 아이와 그 옆의 아이가 서로 자기 말을 먼저 들어 달라고 했다. 누군가의 말이 다른 누군가에게 밀려나고 있었다.',
  steady:'아이들이 새 학기 모둠 자리를 찾아 앉는 동안 한 아이가 급식실 이동 순서를 물었다. 큰 소란은 없었지만 담임이 정할 일과 아이들이 정할 일을 가려야 했다.'
 };
 if(d===1)return [
  '학교 정문에서 배움터지킴이 선생님을 만났다. “선생님, 안녕하세요. 오늘도 바쁘시겠어요.” “그러게요. 좋은 아침입니다.” 인사를 나누는 동안 아이들이 교문을 줄지어 통과했다.',
  '새 운동화를 신은 아이, 가방이 어깨보다 커 보이는 아이, 손을 흔들고 뛰어가는 아이까지. 저렇게 작은 아이들이 방학 동안 어디에 숨어 있다가 한꺼번에 나타났을까. 몇 년을 가르쳐도 3월 아침에는 그런 생각이 들었다.',
  '경력이 많든 적든 학기 초에는 도무지 정신을 차릴 틈이 없었다. 출결 확인, 개인정보 동의서 취합, 모둠 자리, 새로 온 아이 이름 외우기까지. 교실 문을 열기도 전에 해야 할 일이 줄지어 기다렸다.',
  p.gradeBand==='lower'?
    '저학년 아이들이 교실 뒤쪽에 몰리자 나는 “모두 제자리” 노래를 틀 준비를 했다. 노래가 나오면 자기 자리를 찾아 앉는 연습부터 해야 했다. 집중할 때 사용할 ‘약속의 박수’도 아이들과 함께 정하기로 했다.':
    p.gradeBand==='middle'?
    '아이들과 모둠 자리를 정하고 “선생님 말씀 들을 때 어떤 신호가 좋을까?” 물었다. ‘약속의 박수’를 해 보자는 의견이 나왔다. 구호가 통하려면 아이들 목소리부터 들어야 했다.':
    '아이들은 이미 모둠별로 할 말이 많았다. “집중 신호를 우리끼리 정해 보면 어때?” 내가 제안하자 누군가는 ‘약속의 박수’를, 다른 아이는 손들기를 추천했다.',
  demanding?first.busy:first.steady,
  dutyline,
  novice?'처음 맡은 일들이 한꺼번에 몰려왔다. 하지만 오늘의 바쁨은 신규라서만 겪는 일이 아니었다. 옆 반 경력 선생님도 똑같이 동의서와 수업 자료를 들고 뛰고 있었다.':
  '몇 번의 새 학기를 보냈어도 학기 초가 익숙해지지는 않았다. 새 학교의 업무를 누가 어떻게 나누는지, 아이들에게 어떤 말이 통하는지 다시 배워야 했다.'
 ];
 if(d===2)return [
  p.assignmentPractice==='newcomer_first'&&novice?
   '“신규 선생님이니까 학년교육과정 계획 좀 맡아 주세요.” 학년연구실에서 업무분장표를 다 펼치기도 전에 나온 말이었다. 이번 일의 담당 기준이 무엇인지 묻고 싶었다.':
  pressure?
   '쉬는 시간, 한 선생님이 업무분장표에 적힌 일을 가리키며 말을 꺼냈다. “이건 제가 하기 좀 그래서요. 선생님이 해 주시면 안 돼요?” 내 이름은 그 일의 담당 칸에 없었다.':
   '쉬는 시간, 다른 선생님이 도움을 청했다. “이번 주에 제가 일정이 겹쳐서 그런데 잠깐 같이 봐주실 수 있을까요?” 부탁과 업무분장을 바꾸는 일은 달랐다.',
  p.duty==='none'?'나는 맡은 별도 업무가 없는 상태였다. 그렇다고 다른 선생님에게 배정된 업무까지 모두 내게 오는 것이 당연한 건 아니었다.':
  p.duty==='academic'?'교무 업무를 맡은 내 책상에는 이미 학사일정 관련 자료가 쌓여 있었다. 다른 분의 업무가 추가된다면 역할부터 다시 정해야 했다.':
  p.duty==='violence'?'학교폭력 관련 업무를 맡았다는 사실만으로 모든 생활지도 문제가 내 일이 되지는 않았다. 사안별 역할과 절차가 필요했다.':
  '내 업무도 처리 중이었다. 동료를 도우면서도 그 일의 담당과 책임이 흐려져서는 안 됐다.',
  '나이스 창을 닫으며 생각했다. 일의 무게는 담당자가 정해졌다는 이유만으로 가벼워지지 않았다.'];
 if(d===3)return [
  p.informalRequests==='stereotyped'?
   (p.gender==='man'?
    '“남자 선생님이시니까 체육 물품 옮기는 건 부탁드려도 되죠?” 전담시간에 갑자기 들은 말이었다. 무거운 물품이 필요한 일인지, 왜 성별로 담당을 정하는지 먼저 묻고 싶었다.':
    p.gender==='woman'?
    '“여자 선생님이니까 행사 다과 준비 좀 부탁할게요.” 내 수업 준비가 끝났는지 묻는 사람은 없었다. 성별이 업무분장표는 아니었다.':
    '“젊은 선생님이니까 행사 준비 좀 해 주세요.” 나이부터 불리는 순간 내 이름이 잠깐 뒤로 밀렸다.') :
  young?'전담시간에 다음 차시 모둠 활동지를 고치고 있을 때, 경력이 오래된 한 선생님이 들어왔다. “혹시 차 내비게이션 업데이트하는 방법 알아요? 제가 이건 잘 몰라서요.”':
  '전담시간에 인디스쿨에서 모둠 활동을 살펴보고 있는데, 옆자리 선생님이 복합기 인쇄 설정을 물었다. “지금 바쁘시면 나중에 알려주셔도 돼요.”',
  '아이들은 교과전담 수업을 들으러 이동했다. 나는 쉬는 시간을 쪼개 아이스크림 자료와 유튜브 수업 영상을 보고 다음 시간을 준비했다. 이 시간은 잠깐 숨 돌리면서도 바로 다음 수업을 챙기는 귀한 틈이었다.',
  '아이들을 방과 후까지 남겨 청소시키기는 어려워 쉬는 시간에 교실을 정리해야 했다. 그러나 쉬는 시간은 아이들의 쉼이기도 했다. 짧고 안전하게 모두가 자기 주변을 정리할 수 있을지 생각했다.',
  '도움을 청한 사람의 나이나 경력이 문제는 아니었다. 부탁을 받은 내가 언제까지 어디까지 할 수 있는지 말할 수 있는지가 중요했다.'];
 if(d===4)return [
  p.duty==='violence'?'학교폭력 업무 관련 협조 요청이 들어왔다. 담임이 처음 알린 내용과 보호자 연락 사항을 확인해야 했고, 혼자 판단하면 안 될 부분도 있었다.':
  p.duty==='academic'?'교무 업무로 학사일정과 나이스 처리 현황을 확인하는데, 급히 확인해 달라는 공문이 들어왔다. 책임 범위와 협조 절차를 정해야 했다.':
  p.duty==='none'?'별도 업무가 없는 대신 담임으로서 아이들의 이야기를 듣는 시간이 필요했다. 그런데 다른 부서에서 생활지도 관련 서류를 부탁했다.':
  '담임으로서 확인할 일과 담당 업무로 처리할 일이 겹쳤다. 교외체험학습신청서를 확인하는 사이 학년에서 상담 협조를 요청했다.',
  demanding?'학급에서 갈등이 생겼다는 이야기도 이어졌다. 아이들마다 들려준 말이 달랐다. 누구의 잘못인지를 서둘러 정하면 보이지 않는 사정이 생긴다.':
  '큰 갈등은 아니었지만 확인할 일이 쌓였다. 학교 안에서 역할이 분명하다면 작은 일이 불필요한 부담으로 커지지 않을 수도 있었다.',
  '무엇보다 이 문제는 특정 교사 혼자만 잘한다고 해결될 일이 아니었다.'];
 if(d===5){
  const kind=chosenEvent(state,world).id;
  if(kind==='barbecue')return [
   '금요일 주안을 겨우 마무리할 즈음 {colleague}이 말했다. “학교 뒤뜰에서 희망자끼리 바비큐를 하기로 했어요. 시간 되면 오세요.”',
   '학교에서 허락받은 곳을 함께 준비하자는 이야기였다. 누가 빠져도 따로 이유를 묻지 않았다. 얼굴을 마주하고 웃고 싶은 사람이 모인다는 게 반가웠다.',
   '나는 이번 주 내내 자꾸 바빴던 날들을 떠올렸다. 좋은 친목은 다음번에도 나오라고 눈치를 주지 않고, 누군가의 준비와 희생을 당연하게 여기지 않는 관계였다.'
  ];
  if(kind==='forced_social')return [
   '대규모 학교의 학년연구실에 남아 있는데 “올해 친목회장은 젊은 선생님이 하는 걸로 하죠”라는 말이 들렸다. 언제 결정했는지, 나한테 물은 적은 없었다.',
   '친목회장이라는 직함 하나 아래 회비 걷기, 식당 예약, 행사 준비, 단체 대화방 공지, 참석 조사까지 줄줄이 달렸다. 교무 업무가 있든 없든, 수업 준비 시간을 따로 주는 사람은 없었다.',
   '뒤뜰에서는 즐겁게 모일 수도 있는 교직원 친목이, 여기서는 누군가의 퇴근을 붙잡는 또 하나의 일이 됐다. 학생 수가 많아서가 아니라 역할을 정하는 방식이 문제였다.'
  ];
  if(kind==='sports')return [
   '주안을 올리자마자 교무실에 배구 모임 안내가 떴다. “오늘은 다들 나오시죠?” 참석을 확인하는 말이 묘하게 출석을 부르는 것처럼 들렸다.',
   '나는 체육활동 자체를 싫어하지 않았다. 하지만 땀이 나도록 공을 받아 내는 즐거움과 참석하지 않으면 눈치를 보는 일은 다른 문제였다.',
   '배구를 좋아하는 사람도, 걷기나 피클볼이 좋은 사람도, 오늘은 쉬고 싶은 사람도 있었다. 각자의 선택이 똑같이 존중될 수 있을까.'
  ];
  return [
   pressure?'주안 파일을 올리고도 책상 위의 일은 끝나지 않았다. 다른 선생님이 맡기 싫다던 일까지 붙어 있었다. 그 일을 혼자 감당해야 한다는 생각이 더 피곤했다.':
   '주안을 맞추고 다음 주 수업을 준비했다. 동학년 선생님들이 서로 바쁜 날을 먼저 확인하는 모습이 눈에 띄었다.',
   dutyline,
   '창밖이 어두워지는 걸 보고서야 시간을 확인했다. 수업 준비를 조금만 더 하려는데 복도 끝에서 야간 당직 선생님의 발소리가 들렸다.'
  ];
 }
 return [];
}
function previousImpact(state){
 const prev=Array.isArray(state.storyEvents)?state.storyEvents.find(e=>e.day===state.day-1):null;
 if(!prev)return '';
 const notes={
 protect:'어제 교실에서 아이들 안전을 먼저 살피고 동학년과 지원을 의논했다. 오늘은 부탁을 받을 때에도 혼자 떠안지 않겠다는 생각이 들었다.',
 restructure:'아이들과 함께 교실 규칙을 정한 일이 떠올랐다. 교직원의 일도 당사자의 목소리를 듣고 정해야 하지 않을까.',
 endure:'어제 아이들 사이의 소란을 혼자 감당한 피로가 남았다. 다른 사람의 업무까지 받는다면 이번 주가 더 길어질 것 같았다.',
 clarify:'어제 업무분장표에서 역할을 확인했다. 오늘 전담시간에도 내 수업 준비를 먼저 챙기고 싶었다.',
 offer:'도울 수 있는 일과 내 담당을 구분했던 어제가 떠올랐다. 잠깐의 부탁 앞에서도 지킬 선은 있었다.',
 accept:'어제 부탁받은 업무까지 처리하느라 모둠 활동지를 다 준비하지 못했다. 전담시간을 놓칠 수 없었다.',
 boundary:'전담시간에 수업을 준비해 둔 덕분에 오늘은 차분히 사실관계를 살펴볼 수 있었다.',
 helpbrief:'어제 부탁을 조금 도와주고 수업 준비로 돌아왔다. 도움을 주는 일과 떠맡는 일 사이의 차이가 조금 분명해졌다.',
 dropwork:'어제는 수업 준비가 밀렸다. 오늘도 급한 요청이 들어왔지만 순서를 확인해야 한다는 생각이 들었다.',
 process:'어제 확인된 사실과 정해진 절차를 구분해 기록했다. 다음 주에는 이렇게 함께 의논할 수 있는 시간이 필요했다.',
 consult:'어제 동학년의 이야기를 들으며 각자의 일을 나눴다. 금요일의 협의도 조금은 덜 막막했다.',
 solo:'어제 뒤늦게 도움을 청했다. 금요일에는 같은 일이 반복되지 않도록 업무 경계를 먼저 이야기하고 싶었다.'
 };
 return notes[prev.choiceId]||'';
}
function scene(state,world){
 if(!state||state.phase!=='chapter'||state.day<1||state.day>5)return null;
 const prev=Array.isArray(state.storyEvents)?state.storyEvents:[];
 const completed=prev.some(x=>x.day===state.day);
 const reflecting=state.storyReflection&&state.storyReflection.day===state.day;
 if(completed&&!reflecting)return null;
 const data=chosenEvent(state,world);
 const office=officialContext(world,state.day);
 const colleague=state.profile.partner==='man'?'현우 선생님':state.profile.partner==='woman'?'지윤 선생님':'동학년 선생님';
 const paragraphs=eventProse(state,world).map(x=>x.replace(/\{colleague\}/g,colleague));
 const climate=climateParagraph(state);
 if(climate)paragraphs.splice(Math.min(1,paragraphs.length),0,climate);
 paragraphs.push(...schoolContextLines(state,world));
 const last=previousImpact(state);
 if(last)paragraphs.splice(1,0,last);
 if(office)paragraphs.push(office);
 return {
  id:data.id,day:state.day,date:'2027-03-'+String(7+state.day).padStart(2,'0'),
  title:data.title,place:data.place,paragraphs,kind:data.tone,
  source:'fictional_scenario',fictionLabel:'가상 시나리오 · 실제 학교에서 발생한 일이라는 뜻이 아닙니다.',
  surveyThemes:data.id==='barbecue'||data.id==='forced_social'?SURVEY_THEMES.social:
   data.id==='sports'?SURVEY_THEMES.sports:
   state.day===2?SURVEY_THEMES.newcomer:state.day===3?SURVEY_THEMES.informal:SURVEY_THEMES.habit,
  choices:(SPECIAL_CHOICES[data.id]||CHOICES[data.id]).map(c=>({id:c.id,label:c.label})),
  result:reflecting?copy(state.storyReflection):null
 };
}
function choose(state,id,world){
 const current=scene(state,world||{mode:'public_fiction_demo',numbers:{},basic:{scale:state.profile.fictionalSchoolSize}});
 if(!current||current.result)throw Error('SCENARIO_CHOICE_PHASE_REQUIRED');
 const raw=(SPECIAL_CHOICES[current.id]||CHOICES[current.id]).find(c=>c.id===id);
 if(!raw)throw Error('SCENARIO_CHOICE_INVALID');
 const next=copy(state),reply=copy(raw.reply);
 if(next.day===4&&raw.id==='solo'){
  reply.push('시계가 아홉 시를 향하는데도 교실 형광등이 켜져 있었다. 복도로 나가자 교실 문들이 까맣게 닫혀 있었다. 선생님이라도 이렇게 늦은 학교는 조금 무서웠다.');
  reply.push('야간 당직 선생님이 손전등을 들고 복도 끝에서 말했다. “선생님, 이제 문 잠글 시간이에요. 남은 건 내일 하시고 얼른 들어가세요.”');
 }else if(next.day===4&&raw.id==='process'){
  reply.push('동학년 선생님과 역할을 나누고 나니 수업 준비를 마친 뒤에도 해가 남아 있었다. 무리하지 않고 퇴근하는 금요일을 맞을 수 있을 것 같았다.');
 }
 if(next.day===5&&raw.id==='takeall'){
  reply.push('밤이 된 교실에서는 복도 소리 하나에도 고개가 돌아갔다. 아이들이 없어진 학교가 낯설었다. 야간 당직 선생님이 “선생님, 이제 퇴근하셔야죠” 하고 문을 두드렸다.');
 }
 if(next.day===3&&next.profile.age>32){
   for(let i=0;i<reply.length;i++)reply[i]=reply[i]
     .replace(/내비게이션 업데이트/g,'복합기 인쇄 설정')
     .replace(/내비게이션 화면에서 업데이트 안내/g,'복합기 설정 화면에서 인쇄 안내');
 }
 const name=next.profile.partner==='man'?'현우 선생님':next.profile.partner==='woman'?'지윤 선생님':'동학년 선생님';
 for(const key of ['affection','trust','agency','fatigue'])
   next.stats[key]=clamp(next.stats[key]+Number(raw.delta[key]||0));
 for(const [i,key] of ['voice','boundary'].entries())
   next.stats[key]=clamp(next.stats[key]+CULTURE_DELTAS[raw.id][i]);
 const mode=next.profile.workCulture;
 const pressure=mode==='hostile'?-4:mode==='deflecting'?-2:2;
 next.stats.support=clamp(next.stats.support+SUPPORT_SHIFTS[raw.id]+pressure);
 if(mode==='collaborative'){
   reply.push('“이건 같이 해요.” {colleague}이 짧게 말하고 내 옆에 앉았다. 해야 할 일은 그대로였지만 혼자 떠안지는 않아도 됐다.');
 }else if(mode==='hostile'){
   if(['protect','restructure','clarify','offer','boundary','helpbrief','process','consult','reassign','sharehelp','club_check','club_reform'].includes(raw.id))
     reply.push('모두가 반가운 표정은 아니었다. 그래도 {colleague}이 한 걸음 다가와 “저도 그 문제 같이 확인해 드릴게요”라고 말했다. 적대적인 분위기 속에서도 손을 내미는 사람이 있다는 것이 중요했다.');
   else
     reply.push('교무실에서는 서로의 탓이라는 말이 돌아다녔다. 수업 준비에 쓴 시간보다 그 말을 견딘 시간이 더 길게 느껴졌다. 그렇다고 이 분위기의 책임이 내게 있는 것은 아니었다.');
 }else{
   reply.push('업무를 나누는 기준을 다시 의논할 수 있으면 좋겠다고 생각했다. 서로 바쁜 사정을 알면서도 일이 한쪽에 몰리지 않게 하는 일은 필요했다.');
 }
 next.storyEvents=Array.isArray(next.storyEvents)?next.storyEvents:[];
 next.storyEvents.push({day:next.day,eventId:current.id,choiceId:raw.id});
 next.storyReflection={day:next.day,paragraphs:reply.map(x=>x.replace(/\{colleague\}/g,name)),
   line:raw.line.replace(/\{colleague\}/g,name)};
 return next;
}
function continueStory(state){
 if(!state||state.phase!=='chapter'||!state.storyReflection||
  state.storyReflection.day!==state.day)throw Error('SCENARIO_CONTINUE_INVALID');
 const next=copy(state);next.storyReflection=null;return next;
}
const api=Object.freeze({VERSION,DUTIES,EVENTS,CHOICES,SURVEY_THEMES,SPECIAL_CHOICES,STAFF_MOOD,SUPPORT_SHIFTS,officialFacts,scene,choose,continueStory});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryScenario=api;
})(typeof window!=='undefined'?window:globalThis);
