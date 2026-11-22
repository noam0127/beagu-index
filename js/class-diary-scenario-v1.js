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
 none:{label:'담당 업무 없음',text:'이번 학기에는 담임 외 별도 업무가 배정되지 않았다. 그런데도 빈 시간은 보이지 않았다. 3월의 교실은 그런 곳이었다.',short:'업무 없는 담임'},
 general:{label:'일반 업무',text:'업무분장표에 내 이름 옆으로 자그마한 업무 하나가 적혀 있었다. 막상 해 보니 품의도 올려야 하고 안내할 것도 많았다.',short:'일반 업무 담당'},
 academic:{label:'교무 업무',text:'내 이름 옆에는 교무 업무가 적혀 있었다. 학사일정과 공문을 확인하고 나니 아침에 펼친 주안은 아직 첫 장이었다.',short:'교무 담당'},
 violence:{label:'학교폭력 관련 업무',text:'업무분장표에는 학교폭력 관련 업무가 적혀 있었다. 담당자 연락처를 따로 적어 놓았는데, 그 쪽지를 벌써 몇 번이나 꺼내 봤다.',short:'학교폭력 관련 업무 담당'}
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
   reply:["아이들 사이에 끼어 앉자 두 아이가 동시에 말을 쏟아 냈다. 나는 먼저 다친 곳이 없는지 살폈다.","쉬는 시간에 {colleague}에게 자리를 바꿔 앉혀 볼까 물었다. 그 사람은 내 말을 듣더니 종이에 교실 자리를 간단히 그렸다."],
   line:"“우선 아이들이 안 다친 게 다행이에요. 나머지는 같이 해요.”"},
  {id:'restructure',label:'아이들과 모둠 활동 방식부터 다시 정해 본다',
   delta:{affection:4,trust:5,agency:10,fatigue:5},
   reply:["“다들 어떤 때 제일 시끄러워져?” 묻자 아이들의 손이 차례로 올라갔다. 제각각 다른 답이 나왔다.","맨 뒷자리 아이가 작은 목소리로 말했다. “그럼 내일은 자리 좀 바꿔 봐요.” 나는 칠판에 그 말을 적었다."],
   line:"“그 방법 괜찮네요. 우리 반에도 물어볼까요?”"},
  {id:'endure',label:'일단 교실을 조용히 한 뒤 혼자 해결해 보려 한다',
   delta:{affection:0,trust:-3,agency:-4,fatigue:13},
   reply:["나는 아이들에게 목소리를 낮추라고 말했다. 몇 번을 반복한 뒤에야 교실이 조용해졌다.","수업이 끝나고 나니 목이 따끔거렸다. 창문을 닫으며 한숨을 쉬었는데, 복도에서 {colleague}과 눈이 마주쳤다."],
   line:"“오늘 좀 힘들었죠? 끝나고 잠깐 이야기해요.”"}
 ],
 hand_off:[
  {id:'clarify',label:'업무분장표를 보며 누가 맡을 일인지 확인한다',
   delta:{affection:3,trust:8,agency:5,fatigue:-2},
   reply:["업무분장표를 펼치자 서로 이름이 적힌 칸이 달랐다. 상대도 화면을 다시 들여다봤다.","“제가 도와드리는 건 괜찮은데 담당은 한번 확인해야겠어요.” 말을 마치자 조금 안심이 됐다."],
   line:"“담당 선생님하고 한번 같이 확인해 봐요.”"},
  {id:'offer',label:'내 일을 마친 뒤 도울 수 있는 만큼 돕겠다고 한다',
   delta:{affection:4,trust:5,agency:4,fatigue:2},
   reply:["“제 수업 준비 끝나면 잠깐 봐드릴게요.” 말을 꺼내고 나니 상대가 곧바로 고개를 끄덕였다.","부탁은 그걸로 끝났다. 돌아와서 내 책상에 놓인 활동지를 다시 펼쳤다."],
   line:"“좋아요. 바쁘신데 부탁드려서 죄송해요.”"},
  {id:'accept',label:'부탁받은 일을 일단 모두 맡겠다고 한다',
   delta:{affection:1,trust:-2,agency:-4,fatigue:12},
   reply:["나는 알겠다고 말하고 서류를 받아 들었다. 생각보다 두꺼웠다.","점심시간이 끝나 갈 때까지 파일을 옮겼다. 내 교실에서 쓰려던 활동지는 책상 구석에 그대로 놓여 있었다."],
   line:"“선생님, 혹시 그건 아직 하시는 중이에요?”"}
 ],
 lesson_break:[
  {id:'boundary',label:'전담시간에 수업 준비를 마친 뒤 도와드리겠다고 한다',
   delta:{affection:3,trust:7,agency:5,fatigue:-4},
   reply:["“지금 활동지 조금만 마무리하고요. 수업 끝나면 같이 봐드릴게요.” 상대는 미안한 듯 고개를 끄덕였다.","나는 다시 화면으로 눈을 돌렸다. 아직 고쳐야 할 문장이 두 줄 남아 있었다."],
   line:"“네, 수업 준비부터 하세요. 나중에 부탁드릴게요.”"},
  {id:'helpbrief',label:'방법을 간단히 알려드리고 수업 준비를 이어 간다',
   delta:{affection:5,trust:5,agency:3,fatigue:1},
   reply:["교실 태블릿을 켜고 연결 설정을 두어 번 눌렀다. 화면이 뜨자 상대가 “아, 이거였구나” 하고 웃었다.","자리로 돌아왔을 때 전담시간이 절반쯤 지나 있었다. 인디스쿨에 띄워 둔 모둠 자료를 다시 열었다."],
   line:"“고마워요. 나머지는 제가 해 볼게요.”"},
  {id:'dropwork',label:'내 준비를 미루고 부탁받은 일부터 마무리한다',
   delta:{affection:2,trust:1,agency:-3,fatigue:10},
   reply:["태블릿 화면이 연결됐을 때는 전담시간이 거의 끝나 있었다. 교실로 돌아갈 시간이 가까워졌다.","나는 급히 아이스크림에서 찾아 둔 활동지를 출력했다. 종이가 천천히 나오는 동안 시계만 봤다."],
   line:"“아, 수업 준비 중이셨죠? 죄송해요.”"}
 ],
 procedure:[
  {id:'process',label:'확인할 내용과 처리 절차를 담당자와 상의한다',
   delta:{affection:4,trust:9,agency:6,fatigue:-2},
   reply:["나는 확인한 내용과 아직 모르는 것을 다른 색 펜으로 적었다. {colleague}도 옆에서 날짜를 하나씩 확인했다.","메모를 정리하고 보니 보호자에게 무엇부터 말씀드려야 할지가 보였다. 나는 수화기를 잡기 전에 물을 한 모금 마셨다."],
   line:"“제가 옆에 있을게요. 확인한 것부터 말씀드려요.”"},
  {id:'consult',label:'관련 선생님들의 의견을 듣고 역할을 나눈다',
   delta:{affection:6,trust:6,agency:7,fatigue:2},
   reply:["학년 선생님들이 각자 알고 있는 이야기를 짧게 나눴다. 같은 상황을 보았어도 기억은 조금씩 달랐다.","나는 확인이 필요한 부분에 동그라미를 쳤다. {colleague}이 옆에서 “이건 제가 알아볼게요” 하고 말했다."],
   line:"“함께 들으니까 정리가 좀 되네요.”"},
  {id:'solo',label:'일단 혼자 해결하려다 필요한 절차를 뒤로 미룬다',
   delta:{affection:0,trust:-3,agency:-4,fatigue:13},
   reply:["일단 서류를 모두 가져왔다. 빨리 끝내고 싶어 차례대로 확인했지만 중간에 모르는 내용이 나왔다.","한참 망설이다 {colleague}에게 전화를 걸었다. 상대는 화를 내지 않았다. 오히려 “지금 어디세요?” 하고 물었다."],
   line:"“일단 같이 확인해요. 지금 시작해도 돼요.”"}
 ],
 week_end:[
  {id:'reassign',label:'다음 학년협의회에서 업무 조정을 제안한다',
   delta:{affection:4,trust:8,agency:6,fatigue:-4},
   reply:["“다음 학년회의 때 이 일 한번 같이 이야기하면 좋겠어요.” 나는 이번 주에 밀린 수업 준비 시간을 손가락으로 짚어 보였다.","{colleague}이 달력을 펼쳤다. “월요일 방과 후에 시간 좀 내 볼까요?” 더는 혼자 설명할 필요가 없었다."],
   line:"“다음 주엔 누가 어떤 일을 맡을지 먼저 맞춰 봐요.”"},
  {id:'sharehelp',label:'다음 주에 서로 맡아 줄 일을 동학년과 정한다',
   delta:{affection:7,trust:6,agency:5,fatigue:-1},
   reply:["두 사람은 주안을 펼쳐 놓고 서로 바쁜 날에 동그라미를 쳤다. 수요일에는 내가, 목요일에는 그 사람이 조금 여유가 있었다.","“그날 필요한 자료는 제가 미리 뽑아 둘게요.” {colleague}이 웃었다. 이상하게 그 말에 힘이 났다."],
   line:"“서로 시간 되는 날에 도와요. 그게 낫겠어요.”"},
  {id:'takeall',label:'추가로 부탁받은 일도 내가 하겠다고 한다',
   delta:{affection:1,trust:-1,agency:-5,fatigue:11},
   reply:["“제가 할게요.” 또 같은 말을 했다. {colleague}은 대답 없이 나를 바라봤다.","월요일 시간표를 보자 걱정부터 앞섰다. 무심코 손톱을 만지작거리는데 {colleague}이 내 손을 잠깐 봤다."],
   line:"“지금도 많이 바쁘시잖아요. 다음엔 같이 이야기해요.”"}
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
  reply:["“오늘은 잠깐 할게요. 다음 주는 모르겠어요.” 나는 웃으며 체육관 문을 열었다.","배구공을 한번 잘못 받아서 공이 멀리 굴러갔다. 모두 웃었다. 나도 같이 웃었다."],
   line:"“다음엔 편할 때 오세요. 오늘도 재밌었어요.”"},
 {id:'sport_decline',label:'오늘은 쉬고 싶다고 말하고 참여하지 않는다',
  delta:{affection:2,trust:5,agency:5,fatigue:-6},
  reply:["“저는 오늘 먼저 갈게요.” 예상보다 쉽게 말이 나왔다.","복도로 나서는데 운동화 소리가 뒤에서 들렸다. 누군가 손을 흔들었다. 나는 가볍게 답했다."],
   line:"“네, 푹 쉬세요. 월요일에 봬요.”"},
 {id:'sport_change',label:'무슨 운동을 할지, 참여할지는 먼저 물어보자고 한다',
  delta:{affection:4,trust:8,agency:8,fatigue:1},
  reply:["“배구 말고 다른 것도 해 보면 어때요? 걷기 좋아하시는 분도 있잖아요.”","잠깐 조용해졌다. 그러다 한 사람이 “저는 산책이면 좋아요” 하고 말했다. 얼굴 몇 개가 동시에 풀렸다."],
   line:"“그럼 다음 주에 한번 물어봐요. 희망자만 받는 걸로요.”"}
]);
const BARBECUE_CHOICES=Object.freeze([
 {id:'bbq_join',label:'일을 마친 뒤 원하는 만큼만 저녁 모임에 참여한다',
  delta:{affection:8,trust:6,agency:3,fatigue:-1},
  reply:["학교 뒤뜰에는 벌써 고기 냄새가 났다. 나는 모둠 활동지를 덮고 잠깐 내려갔다.","누군가 종이접시를 건넸다. “배고프셨죠?” 대답하기도 전에 웃음이 났다."],
   line:"“늦게 오셔도 괜찮아요. 이쪽에 앉으세요.”"},
 {id:'bbq_rest',label:'초대에 고맙다고 말하고 오늘은 집에 간다',
  delta:{affection:4,trust:7,agency:5,fatigue:-7},
  reply:["“초대해 주셔서 감사해요. 오늘은 그냥 집에 가서 쉬려고요.”","{colleague}은 고개를 끄덕였다. “그럼 월요일에 봬요.” 더 묻지 않는 목소리가 고마웠다."],
   line:"“네, 오늘 푹 쉬세요. 다음에 봬요.”"},
 {id:'bbq_help',label:'준비할 일이 있다면 부담 없이 나눠 하자고 한다',
  delta:{affection:7,trust:8,agency:6,fatigue:1},
  reply:["접시를 옮기다가 {colleague}과 손이 스쳤다. 둘 다 별일 아닌 척 웃었다.","“다음에는 준비도 조금씩 나눠서 해요.” 내가 말하자 맞은편 선생님이 고개를 끄덕였다."],
   line:"“좋죠. 다 같이 하면 금방 끝나겠네요.”"}
]);
const FORCED_CHOICES=Object.freeze([
 {id:'club_check',label:'친목회장 역할과 선출 방법부터 묻는다',
  delta:{affection:3,trust:8,agency:7,fatigue:2},
  reply:["“제가 맡아야 한다고 정해진 건가요? 선출은 어떻게 하나요?” 말하는 순간 목소리가 조금 떨렸다.","누군가 회칙을 찾아보자고 했다. 나는 그제야 손에 들고 있던 펜을 내려놓았다."],
   line:"“한번 확인해 봅시다. 바로 결정할 일은 아니네요.”"},
 {id:'club_reform',label:'원하는 사람이 맡고 역할도 나눠 보자고 제안한다',
  delta:{affection:5,trust:7,agency:9,fatigue:3},
  reply:["“원하는 분을 먼저 찾아보면 어떨까요? 일도 한 사람한테 다 맡기지 말고요.”","맨 끝에 앉은 선생님이 회계는 도울 수 있다고 했다. 다른 한 사람도 행사 준비를 나누겠다고 했다."],
   line:"“그렇게 나누면 할 만하겠는데요.”"},
 {id:'club_accept',label:'일단 회장을 맡고 행사 준비도 혼자 해 보려 한다',
  delta:{affection:0,trust:-3,agency:-6,fatigue:14},
  reply:["회비를 정리하고, 식당을 예약하고, 참석 여부를 묻는 동안 내 주안 파일은 아직 열리지도 않았다.","밖이 어두워지고 나서야 컴퓨터를 껐다. {colleague}에게서 메시지가 와 있었다. ‘아직 학교세요?’"],
   line:"“월요일엔 잠깐 이야기해요. 혼자 맡을 일은 아니잖아요.”"}
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
  "collaborative": {
    "1": "동의서 취합표를 보던 옆자리 선생님이 내 책상에 포스트잇을 붙였다. ‘여기까진 제가 했어요.’ 작은 글씨였는데 한눈에 들어왔다.",
    "2": "업무분장표 앞에서 몇 사람이 의자를 붙였다. 누가 먼저 맡을지 목소리를 높이기보다 서로 이번 주 시간표부터 펼쳐 보였다.",
    "3": "전담시간에 {colleague}이 복합기를 가리켰다. “활동지 출력하실 거면 제 것도 같이 해 주실래요?” 나는 웃으며 고개를 끄덕였다.",
    "4": "통화를 마치고 들어오니 책상 위에 미지근한 물 한 잔이 놓여 있었다. “어떻게 됐어요?” {colleague}은 바쁜 손을 멈췄다.",
    "5": "금요일이면 책상마다 일이 남았다. 나는 옆자리 선생님의 주안을 한번 봐 주었고 그 사람은 내 출력물을 챙겨 줬다. 말하지 않아도 손이 먼저 움직이곤 했다."
  },
  "deflecting": {
    "1": "학년연구실에서는 다들 화면만 바라보고 있었다. “이거 누구한테 물어봐야 해요?” 내가 묻자 잠깐 침묵이 흘렀다. 대답이 없는 것도 어쩌면 대답이었다.",
    "2": "업무분장표의 빈칸 하나를 놓고 말이 길어졌다. 누구도 섣불리 손을 들지 않았다. 한번 맡으면 내년에도 맡게 될까 봐, 모두가 눈치를 보는 듯했다.",
    "3": "전담시간에 활동지를 출력하는데 메신저 알림이 떴다. ‘이것도 오늘까지 부탁드려요.’ 문장을 읽고 나서 인쇄 버튼 위에 올려 둔 손이 멈췄다.",
    "4": "확인할 서류가 있어 물었더니 “담임이 한번 알아보세요”라는 답이 돌아왔다. 무슨 말을 더 해야 할지 몰라 잠깐 수화기만 들고 있었다.",
    "5": "퇴근 시간이 다가오자 학년연구실이 조용해졌다. 다들 자리에서 일어나지 않았다. 누군가 먼저 가면 남은 일이 자기 몫이 될까 봐 기다리는 사람들 같았다."
  },
  "hostile": {
    "1": "학년연구실에 들어서자 웃음소리가 뚝 끊겼다. “저 반은 왜 벌써 시끄러워요?” 칸막이 너머에서 들린 말에 대답하려다 그만뒀다. 교실로 돌아가는 발걸음이 무거웠다.",
    "2": "업무분장표를 내밀자 한 선생님이 의자를 밀었다. “지난번에도 제가 했잖아요. 이번엔 선생님이 하세요.” 다른 사람들은 서로 눈을 맞추지 않았다.",
    "3": "“또 이렇게 늦게 준비하세요?” 복합기 앞에서 들은 말에 나는 인쇄 버튼을 잘못 눌렀다. 출력물이 한 장 더 나왔다. 그걸 다시 집어 넣는 동안 아무 말도 하지 못했다.",
    "4": "보호자 연락에 대해 물었더니 “선생님 반 일이잖아요”라는 답이 돌아왔다. 나는 메모지를 접었다 폈다. 그날은 무엇보다 그 한마디가 오래 남았다.",
    "5": "금요일에도 학년연구실 문 앞에서 잠깐 멈췄다. 안에서는 몇 사람이 이야기하고 있었다. 문고리를 잡은 손에 괜히 힘이 들어갔다."
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
 const p=state.profile,d=state.day,novice=p.experience==='new';
 const dutyline=duty(p).text;
 const pressure=p.workCulture==='deflecting';
 const demanding=p.classTone==='demanding';
 const first={
  busy:'등교한 지 얼마 되지 않았는데 교실에서 목소리가 겹쳤다. 책상을 옮기던 아이가 울먹였고 그 옆의 아이는 자기는 안 그랬다고 말했다. 나는 두 아이 사이에 쪼그려 앉았다.',
  steady:'모둠 자리를 옮기는 동안 한 아이가 물었다. “선생님, 급식 줄도 우리가 정할 수 있어요?” 나는 잠깐 칠판을 돌아봤다. 아직 거기까지는 생각하지 못했다.'
 };
 if(d===1)return [
  '학교 정문에서 배움터지킴이 선생님을 만났다. “선생님, 안녕하세요. 오늘도 바쁘시겠어요.” “그러게요. 좋은 아침입니다.” 인사를 나누는 동안 아이들이 교문을 줄지어 통과했다.',
  '새 운동화를 신고 발끝만 내려다보는 아이가 있었다. 가방이 어깨에 걸리지 않아 자꾸 흘러내리는 아이도 있었다. 나는 그 아이의 가방끈을 고쳐 주었다.',
  '3월에는 출결 확인부터 개인정보 동의서 취합까지 작은 일이 끝없이 따라붙었다. 아이들 이름을 한 번 더 불러 보는 사이에도 해야 할 일이 떠올랐다. 나는 포스트잇 하나를 떼어 책상에 붙였다.',
  p.gradeBand==='lower'?
    '저학년 아이들이 교실 뒤쪽에 몰리자 나는 “모두 제자리” 노래를 틀 준비를 했다. 노래가 나오면 자기 자리를 찾아 앉는 연습부터 해야 했다. 집중할 때 사용할 ‘약속의 박수’도 아이들과 함께 정하기로 했다.':
    p.gradeBand==='middle'?
    '아이들과 모둠 자리를 정하고 “선생님 말씀 들을 때 어떤 신호가 좋을까?” 물었다. ‘약속의 박수’를 해 보자는 의견이 나왔다. 구호가 통하려면 아이들 목소리부터 들어야 했다.':
    '아이들은 이미 모둠별로 할 말이 많았다. “집중 신호를 우리끼리 정해 보면 어때?” 내가 제안하자 누군가는 ‘약속의 박수’를, 다른 아이는 손들기를 추천했다.',
  demanding?first.busy:first.steady,
  dutyline,
  novice?'처음 맡은 일이 많아 무엇부터 해야 할지 몰랐다. 옆 반 선생님이 바삐 지나가다 내 서류를 보고 말했다. “그거, 저도 아직 다 못 했어요.”':
  '새 학기를 몇 번이나 맞았는데도 3월은 늘 다르게 찾아왔다. 교실 문을 열며 아이들 이름을 한 번 더 마음속으로 읽었다.'
 ];
 if(d===2)return [
  p.assignmentPractice==='newcomer_first'&&novice?
   '“저경력 선생님이시니까 이번엔 학년교육과정 계획 맡아 주시죠.” 웃으면서 한 말이었지만 내 대답을 기다리는 사람은 없었다. 나는 업무분장표를 다시 펼쳤다.':
  pressure?
   '쉬는 시간에 한 선생님이 화면을 보여 줬다. “이거 제가 도저히 시간이 안 나서 그런데, 좀 맡아 주시면 안 될까요?” 그 일의 담당 칸에는 내 이름이 없었다.':
   '쉬는 시간에 옆자리 선생님이 물었다. “이번 주에 제가 시간이 좀 빠듯한데, 이거 같이 봐주실 수 있을까요?” 나는 내 시간표를 먼저 확인했다.',
  p.duty==='none'?'나는 맡은 별도 업무가 없는 상태였다. 그렇다고 다른 선생님에게 배정된 업무까지 모두 내게 오는 것이 당연한 건 아니었다.':
  p.duty==='academic'?'교무 업무를 맡은 내 책상에는 이미 학사일정 관련 자료가 쌓여 있었다. 다른 분의 업무가 추가된다면 역할부터 다시 정해야 했다.':
  p.duty==='violence'?'학교폭력 관련 업무를 맡았다는 사실만으로 모든 생활지도 문제가 내 일이 되지는 않았다. 사안별 역할과 절차가 필요했다.':
  '내 업무도 처리 중이었다. 동료를 도우면서도 그 일의 담당과 책임이 흐려져서는 안 됐다.',
  '나이스 창을 닫고 업무분장표를 다시 열었다. 이름 한 줄을 옮기는 일이 이렇게 오래 걸릴 줄은 몰랐다.'];
 if(d===3)return [
  p.informalRequests==='stereotyped'?
   (p.gender==='man'?
    '“남자 선생님이시니까 체육 물품 옮기는 건 부탁드려도 되죠?” 전담시간에 갑자기 들은 말이었다. 무거운 물품이 필요한 일인지, 왜 성별로 담당을 정하는지 먼저 묻고 싶었다.':
    p.gender==='woman'?
    '“여자 선생님이니까 행사 다과 준비 좀 부탁할게요.” 내 수업 준비가 끝났는지 묻는 사람은 없었다. 성별이 업무분장표는 아니었다.':
    '“젊은 선생님이니까 행사 준비 좀 해 주세요.” 나이부터 불리는 순간 내 이름이 잠깐 뒤로 밀렸다.') :
  novice?'전담시간에 다음 차시 모둠 활동지를 고치고 있을 때, 옆 반 선생님이 문을 열었다. “혹시 교실 태블릿 화면 연결하는 법 아세요? 자꾸 안 돼서요.”':
  '전담시간에 인디스쿨에서 모둠 자료를 찾고 있는데, 옆자리 선생님이 복합기 앞에서 난감한 얼굴로 서 있었다. “지금 수업 준비하시죠? 끝나고 잠깐 봐주실래요?”',
  '아이들이 교과전담 수업을 들으러 가자 교실이 조용해졌다. 나는 아이스크림 자료를 열었다가 유튜브 수업 영상을 다시 봤다. 영상을 멈춘 채 한참 생각하다 활동지 문장 하나를 고쳤다.',
  '쉬는 시간이 끝나기 직전, 교실 바닥에 색종이 조각들이 흩어져 있었다. 신나게 놀던 아이 하나가 내 표정을 보더니 빗자루를 집었다. “선생님, 이거 제가 치울게요.”',
  '나는 시계를 한번 봤다. 다음 교시까지는 아직 십 분이 남았다. 그 십 분을 어떻게 쓸지는 내가 정해야 했다.'];
 if(d===4)return [
  p.duty==='violence'?'학교폭력 업무 관련 협조 요청이 들어왔다. 담임이 처음 알린 내용과 보호자 연락 사항을 확인해야 했고, 혼자 판단하면 안 될 부분도 있었다.':
  p.duty==='academic'?'교무 업무로 학사일정과 나이스 처리 현황을 확인하는데, 급히 확인해 달라는 공문이 들어왔다. 책임 범위와 협조 절차를 정해야 했다.':
  p.duty==='none'?'별도 업무가 없는 대신 담임으로서 아이들의 이야기를 듣는 시간이 필요했다. 그런데 다른 부서에서 생활지도 관련 서류를 부탁했다.':
  '담임으로서 확인할 일과 담당 업무로 처리할 일이 겹쳤다. 교외체험학습신청서를 확인하는 사이 학년에서 상담 협조를 요청했다.',
  demanding?'학급에서 갈등이 생겼다는 이야기도 이어졌다. 아이들마다 들려준 말이 달랐다. 누구의 잘못인지를 서둘러 정하면 보이지 않는 사정이 생긴다.':
  '크게 다툰 사람은 없었다. 그래도 확인할 일은 쌓였다. 서류 한 장을 찾는 데에도 몇 번씩 다른 선생님께 물어봐야 했다.',
  '나는 서류를 덮고 옆자리 선생님을 돌아봤다. “이건 누구한테 먼저 확인하면 될까요?”'];
 if(d===5){
  const kind=chosenEvent(state,world).id;
  if(kind==='barbecue')return [
   '금요일 주안을 겨우 마무리할 즈음 {colleague}이 말했다. “학교 뒤뜰에서 희망자끼리 바비큐를 하기로 했어요. 시간 되면 오세요.”',
   '뒤뜰에서는 몇 사람이 의자를 꺼내고 있었다. 누군가는 마트 봉투를 들고 왔고, 누군가는 집에 가야 한다며 먼저 인사했다.',
   '학년연구실에서 서류를 붙들고 있던 한 주가 떠올랐다. 오늘은 그냥 웃으면서 저녁을 먹어도 괜찮을 것 같았다.'
  ];
  if(kind==='forced_social')return [
   '대규모 학교의 학년연구실에 남아 있는데 “올해 친목회장은 젊은 선생님이 하는 걸로 하죠”라는 말이 들렸다. 언제 결정했는지, 나한테 물은 적은 없었다.',
   '누군가 해야 할 일을 적기 시작했다. 회비 정산, 식당 예약, 참석 조사. 쓰는 사람의 펜이 좀처럼 멈추지 않았다.',
   '나는 휴대전화를 꺼내 퇴근 시간을 확인했다. 아직도 누가 준비할지를 놓고 말이 오가고 있었다.'
  ];
  if(kind==='sports')return [
   '주안을 올리자마자 교무실에 배구 모임 안내가 떴다. “오늘은 다들 나오시죠?” 참석을 확인하는 말이 묘하게 출석을 부르는 것처럼 들렸다.',
   '배구를 싫어하는 건 아니었다. 다만 오늘은 곧장 집에 가고 싶었다. 대답을 기다리는 눈길들이 나를 향했다.',
   '옆자리 선생님이 “저는 오늘 먼저 갈게요”라고 말했다. 누군가는 괜찮다고 했고, 누군가는 아쉽다는 얼굴이었다.'
  ];
  return [
   pressure?'주안 파일을 올리고도 책상 위의 일은 끝나지 않았다. 다른 선생님이 맡기 싫다던 일까지 붙어 있었다. 그 일을 혼자 감당해야 한다는 생각이 더 피곤했다.':
   '주안을 맞추고 다음 주 수업을 준비했다. 동학년 선생님들이 서로 바쁜 날을 먼저 확인하는 모습이 눈에 띄었다.',
   dutyline,
   '창밖에 노을이 걸렸다. 급히 수업 자료를 저장하고 있는데 복도에서 보안업무 담당자의 발소리가 들렸다.'
  ];
 }
 return [];
}
function previousImpact(state){
 const prev=Array.isArray(state.storyEvents)?state.storyEvents.find(e=>e.day===state.day-1):null;
 if(!prev)return '';
 const notes={
  "protect": "어제 아이들 사이에 끼어 앉던 장면이 떠올랐다. 오늘도 무턱대고 대답하기보다 말을 끝까지 들어 보려고 했다.",
  "restructure": "아이들이 직접 고친 교실 규칙이 생각났다. 어쩐지 업무분장표의 빈칸도 그 칠판과 닮아 보였다.",
  "endure": "어제 소란을 정리하고 집에 갔을 때는 목이 다 쉬어 있었다. 오늘은 같은 일을 반복하고 싶지 않았다.",
  "clarify": "어제 업무분장표를 같이 들여다봤다. 오늘은 내 시간이 얼마나 남았는지 먼저 시계를 봤다.",
  "offer": "어제 도와주겠다고 한 일은 끝났다. 오늘도 누군가 문을 열고 들어오자 이번에는 먼저 내 시간표를 펼쳤다.",
  "accept": "어제 맡은 일을 끝내느라 모둠 활동지가 그대로 남았다. 아침에 프린터 앞에서 몇 번이나 시간을 확인했다.",
  "boundary": "어제 전담시간에 수업 준비를 마친 덕분에 오늘은 조금 여유가 있었다. 종이컵에 커피를 따를 수도 있었다.",
  "helpbrief": "어제 인쇄 설정을 같이 봤던 선생님과 복도에서 마주쳤다. “어제 고마웠어요.” 그 한마디가 반가웠다.",
  "dropwork": "어제는 준비를 끝내지 못하고 교실로 돌아갔다. 오늘도 메신저가 울리자 잠깐 손을 멈췄다.",
  "process": "어제 확인한 내용을 날짜순으로 적어 놓았다. 오늘 다시 펴 보니 놓친 부분이 하나 보였다.",
  "consult": "어제 학년에서 일을 나눴다. 옆자리 선생님이 오늘은 먼저 자료를 건네주었다.",
  "solo": "어제 혼자 해결해 보려다 늦게까지 남았다. 금요일은 조금 다르게 보내고 싶었다."
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
 const colleague=state.profile.partner==='man'?'현우 선생님':state.profile.partner==='woman'?'지윤 선생님':'민서 선생님';
 const paragraphs=eventProse(state,world).map(x=>x.replace(/\{colleague\}/g,colleague));
 const climate=climateParagraph(state);
 if(climate)paragraphs.splice(Math.min(1,paragraphs.length),0,climate.replace(/\{colleague\}/g,colleague));
 const sourceFacts=schoolContextLines(state,world);
 const last=previousImpact(state);
 if(last)paragraphs.splice(1,0,last);
 if(office)sourceFacts.push(office);
 return {
  id:data.id,day:state.day,date:'2027-03-'+String(7+state.day).padStart(2,'0'),
  title:data.title,place:data.place,paragraphs,sourceFacts,kind:data.tone,
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
  reply.push('벽시계가 아홉 시를 가리켰다. 교실 형광등을 끄자 복도가 생각보다 어두웠다. 발소리가 나면 저도 모르게 돌아보게 됐다.');
  reply.push('보안업무를 맡은 분이 복도 끝에서 말했다. “선생님, 이제 마무리하고 들어가셔야죠.” 나는 한꺼번에 창을 닫았다.');
 }else if(next.day===4&&raw.id==='process'){
  reply.push('마지막 서류를 덮었을 때 창밖은 아직 밝았다. {colleague}이 먼저 가방을 메더니 나를 기다렸다.');
 }
 if(next.day===5&&raw.id==='takeall'){
  reply.push('늦은 교실에서 문득 밖을 보니 운동장이 까맣게 잠겨 있었다. “선생님, 이제 퇴근하셔야죠.” 문을 두드리는 소리에 나는 황급히 파일을 저장했다.');
 }
 const name=next.profile.partner==='man'?'현우 선생님':next.profile.partner==='woman'?'지윤 선생님':'민서 선생님';
 for(const key of ['affection','trust','agency','fatigue'])
   next.stats[key]=clamp(next.stats[key]+Number(raw.delta[key]||0));
 for(const [i,key] of ['voice','boundary'].entries())
   next.stats[key]=clamp(next.stats[key]+CULTURE_DELTAS[raw.id][i]);
 const mode=next.profile.workCulture;
 const pressure=mode==='hostile'?-4:mode==='deflecting'?-2:2;
 next.stats.support=clamp(next.stats.support+SUPPORT_SHIFTS[raw.id]+pressure);
 if(mode==='collaborative'){
   reply.push('“그거 같이 해요.” {colleague}이 의자를 옆으로 당겼다. 프린터에서는 종이가 또 한 장 나왔다.');
 }else if(mode==='hostile'){
   if(['protect','restructure','clarify','offer','boundary','helpbrief','process','consult','reassign','sharehelp','club_check','club_reform'].includes(raw.id))
     reply.push('모두의 표정이 밝지는 않았다. 그래도 {colleague}이 내 곁으로 와서 말했다. “저도 같이 확인해 드릴게요.” 나는 그제야 숨을 길게 내쉬었다.');
   else
     reply.push('교무실에서 나온 뒤에도 아까 들은 말이 자꾸 떠올랐다. 돌아서서 무슨 말을 했어야 했을까. 교실 문 앞에서 잠깐 멈춰 섰다.');
 }else{
   reply.push('나는 업무분장표를 서랍에서 꺼내 책상 위에 놓았다. 다음에는 어떤 말을 먼저 꺼내야 할지 몇 번이나 생각했다.');
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
