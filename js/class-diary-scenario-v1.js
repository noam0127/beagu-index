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
  {id:'protect',label:'아이들 안전을 먼저 살피고 학년과 수업 지원을 상의한다',
   delta:{affection:2,trust:7,agency:8,fatigue:4},
   reply:['나는 모둠을 잠깐 멈추고 아이들이 다치지 않았는지부터 확인했다. 누구를 혼내기보다 왜 소란이 커졌는지 살펴야 했다.','쉬는 시간에는 동학년 선생님과 자리배치와 수업 지원을 상의했다. 한 사람의 인내만으로 교실이 나아지는 것은 아니었다.'],
   line:'“오늘은 우선 안전부터요. 학년에서 같이 방법을 찾아봐요.”'},
  {id:'restructure',label:'모둠 활동과 교실 규칙을 아이들과 다시 짜 본다',
   delta:{affection:4,trust:5,agency:10,fatigue:5},
   reply:['나는 아이들에게 어떤 순간에 서로 말이 겹치는지 물었다. 모둠마다 이유가 달랐다. 한 아이가 조용히 손을 들었다.','우리는 한 번에 완벽한 규칙을 정하려 하지 않고, 내일 고쳐 볼 방법 하나를 정했다.'],
   line:'“우리 반에서 바꿀 수 있는 것부터 해 보면 좋겠네요.”'},
  {id:'endure',label:'혼자 수습하고 다음 수업부터는 조용히 시켜 본다',
   delta:{affection:0,trust:-3,agency:-4,fatigue:13},
   reply:['나는 일단 교실을 조용히 만드는 데 힘을 썼다. 수업은 이어졌지만 아이들이 왜 그렇게 행동했는지 들을 시간은 없었다.','쉬는 시간이 되자 목이 잠겼다. 나 혼자 붙들면 된다는 생각이 오히려 나를 더 지치게 했다.'],
   line:'“힘들면 이야기해요. 혼자 다 버텨야 할 이유는 없잖아요.”'}
 ],
 hand_off:[
  {id:'clarify',label:'업무분장표와 담당 범위를 함께 확인한다',
   delta:{affection:3,trust:8,agency:5,fatigue:-2},
   reply:['나는 업무분장표를 다시 열었다. 실제로 내 업무인지, 도움을 요청받은 것인지부터 가려 보기로 했다.','부탁한 선생님도 표를 살폈다. 표에 없는 일이라면 누가 결정해야 하는지도 확인할 수 있었다.'],
   line:'“이건 일단 담당과 관리자한테 같이 확인해 봐요.”'},
  {id:'offer',label:'일정이 허락하는 범위에서만 협조하겠다고 말한다',
   delta:{affection:4,trust:5,agency:4,fatigue:2},
   reply:['“제가 지금 하는 일부터 마무리하고 도울 수 있는 부분은 볼게요.” 생각보다 어렵지 않은 문장이었다.','다른 사람을 돕는 일과 내 몫이 아닌 일을 떠맡는 일은 같지 않았다.'],
   line:'“업무는 서로 도울 수 있지만, 담당을 바꾸는 건 따로 이야기해야죠.”'},
  {id:'accept',label:'부탁받은 일을 모두 내가 처리하겠다고 한다',
   delta:{affection:1,trust:-2,agency:-4,fatigue:12},
   reply:['나는 알겠다고 했다. 부탁이 끝나는 순간 또 다른 일이 붙었다. 내가 빨리 대답해서인지 상대방은 더 묻지 않았다.','다음 수업 준비를 할 시간이 줄어들었다. 이 학교가 어떤 방식으로 일을 나누는지 처음으로 궁금해졌다.'],
   line:'“이런 일이 반복되면 업무분장을 다시 이야기해야 해요.”'}
 ],
 lesson_break:[
  {id:'boundary',label:'전담시간에는 수업을 준비해야 한다고 정중히 말한다',
   delta:{affection:3,trust:7,agency:5,fatigue:-4},
   reply:['“죄송하지만 다음 시간 활동지를 고치는 중이라서요. 쉬는 시간 끝나고 잠깐 봐 드릴게요.”','상대는 고개를 끄덕였다. 전담시간에 아이들만 교실을 비우는 게 아니라, 교사에게도 준비할 시간이 생겨야 했다.'],
   line:'“선생님 전담시간 소중하죠. 자료부터 마무리하세요.”'},
  {id:'helpbrief',label:'할 수 있는 부분만 짧게 도와주고 수업 준비로 돌아온다',
   delta:{affection:5,trust:5,agency:3,fatigue:1},
   reply:['나는 내비게이션 화면에서 업데이트 안내를 찾아드렸다. 설치에는 시간이 더 걸릴 것 같아 방법을 알려드리고 내 자리에 돌아왔다.','인디스쿨에 저장해 둔 모둠 자료를 열어 보니 전담시간이 벌써 절반쯤 지났다.'],
   line:'“고마워요. 나머지는 제가 해 볼게요.”'},
  {id:'dropwork',label:'수업 준비를 미루고 부탁을 끝까지 처리해 준다',
   delta:{affection:2,trust:1,agency:-3,fatigue:10},
   reply:['내비게이션 업데이트가 끝날 즈음 다음 시간 예비종이 울렸다. 나는 급히 아이스크림에서 찾은 자료를 출력했다.','교실로 돌아오면서 생각했다. 잠깐의 부탁을 거절하지 못하면 준비할 시간을 잃는 건 내 몫이었다.'],
   line:'“미안해요. 수업 준비하시던 중이었죠?”'}
 ],
 procedure:[
  {id:'process',label:'사실 확인과 지원 절차를 담당자들과 함께 정한다',
   delta:{affection:4,trust:9,agency:6,fatigue:-2},
   reply:['나는 확인된 사실과 아직 확인되지 않은 내용을 나누어 적었다. 업무와 관련된 교직원, 관리자의 역할도 먼저 확인했다.','나 혼자 판단하고 처리하는 것보다 훨씬 느려 보였다. 하지만 누군가를 지키는 일에는 그 순서가 필요했다.'],
   line:'“규정대로 가되, 아이와 선생님 모두 보호받게 하죠.”'},
  {id:'consult',label:'담임과 동학년의 의견을 듣고 대응 범위를 조율한다',
   delta:{affection:6,trust:6,agency:7,fatigue:2},
   reply:['나는 선생님들 이야기를 먼저 들었다. 각자가 놓인 자리와 알고 있는 정보가 달랐다.','상의가 끝난 뒤 해야 할 일과 해서는 안 될 일을 따로 적었다. 공동의 책임은 누구도 책임지지 않는다는 말이 아니었다.'],
   line:'“혼자 결정하지 않아 줘서 고마워요.”'},
  {id:'solo',label:'정해진 절차를 미루고 우선 혼자 처리하려 한다',
   delta:{affection:0,trust:-3,agency:-4,fatigue:13},
   reply:['빨리 끝내고 싶어 나는 혼자 자료를 모았다. 그러나 확인되지 않은 내용과 직접 처리할 수 없는 일이 뒤섞였다.','결국 도움을 요청해야 했다. 늦게라도 다시 절차를 따르는 것이 맞았다.'],
   line:'“지금이라도 함께 정리해요. 혼자 감당할 문제는 아니에요.”'}
 ],
 week_end:[
  {id:'reassign',label:'다음 학년회의에서 업무 조정을 정식으로 제안한다',
   delta:{affection:4,trust:8,agency:6,fatigue:-4},
   reply:['나는 이번 주에 수업 준비가 밀린 시간을 기록해 두었다. 누가 얼마나 힘들었는지를 탓하려는 게 아니라 조정할 근거가 필요했다.','월요일 학년회의에서는 이 일을 함께 살펴보기로 했다. 교직문화는 누군가의 부탁 한 번으로도, 그것을 고치는 회의 한 번으로도 달라질 수 있었다.'],
   line:'“다음 주에는 우리 학년 일이 한 사람에게 몰리지 않게 해 봐요.”'},
  {id:'sharehelp',label:'동학년과 다음 주에 서로 도울 방법을 정한다',
   delta:{affection:7,trust:6,agency:5,fatigue:-1},
   reply:['우리는 주안을 펼쳐 놓고 누가 어떤 날 바쁜지 살폈다. 전담시간이 겹치는 날에는 필요한 자료를 같이 확인하기로 했다.','도움이 다정한 말로 끝나지 않고 실제 시간표에 적히는 순간이었다.'],
   line:'“할 수 있는 만큼 나눠 하죠. 혼자 다 하실 필요 없어요.”'},
  {id:'takeall',label:'돌아오는 부탁도 내가 다 맡겠다고 한다',
   delta:{affection:1,trust:-1,agency:-5,fatigue:11},
   reply:['나는 이번 주처럼 다음 주도 하면 된다고 말했다. {colleague}이 한참 말이 없었다.','월요일 수업을 생각하자 마음이 가라앉았다. 한 사람이 무리해야 돌아가는 학교가 괜찮은 학교일 리 없었다.'],
   line:'“일을 잘하는 사람에게 일이 더 몰리는 건 해결책이 아니죠.”'}
 ]
});
const CULTURE_DELTAS=Object.freeze({
 protect:[7,7],restructure:[10,5],endure:[-6,-8],
 clarify:[6,10],offer:[5,5],accept:[-5,-10],
 boundary:[3,10],helpbrief:[3,5],dropwork:[-5,-8],
 process:[7,9],consult:[5,6],solo:[-8,-10],
 reassign:[9,10],sharehelp:[6,6],takeall:[-5,-12]
});
function duty(p){return DUTIES[p.duty]||DUTIES.general;}
function acceptedOfficialFact(world,key){
 const item=world&&world.numbers&&world.numbers[key];
 if(!item||item.status!=='APPROVED'||!Number.isInteger(Number(item.referenceYear))||
    item.value===null||item.value===undefined||!Number.isFinite(Number(item.value))||
    Number(item.value)<0)return null;
 return {key,year:Number(item.referenceYear),value:Number(item.value)};
}
function officialFacts(world){
 const defs=[
  ['students','학생 수','명'],['classes','학급 수','학급'],['teachers','교원 수','명'],
  ['students_per_class','학급당 학생 수','명'],['admin_employees','행정직원 수','명'],
  ['junior_teacher_ratio','2정교사 비율','%'],['teacher_support_spaces','교직원 지원공간','개']
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
  pressure?
   '쉬는 시간, 한 선생님이 업무분장표에 적힌 일을 가리키며 말을 꺼냈다. “이건 제가 하기 좀 그래서요. 선생님이 해 주시면 안 돼요?” 내 이름은 그 일의 담당 칸에 없었다.':
   '쉬는 시간, 다른 선생님이 도움을 청했다. “이번 주에 제가 일정이 겹쳐서 그런데 잠깐 같이 봐주실 수 있을까요?” 부탁과 업무분장을 바꾸는 일은 달랐다.',
  p.duty==='none'?'나는 맡은 별도 업무가 없는 상태였다. 그렇다고 다른 선생님에게 배정된 업무까지 모두 내게 오는 것이 당연한 건 아니었다.':
  p.duty==='academic'?'교무 업무를 맡은 내 책상에는 이미 학사일정 관련 자료가 쌓여 있었다. 다른 분의 업무가 추가된다면 역할부터 다시 정해야 했다.':
  p.duty==='violence'?'학교폭력 관련 업무를 맡았다는 사실만으로 모든 생활지도 문제가 내 일이 되지는 않았다. 사안별 역할과 절차가 필요했다.':
  '내 업무도 처리 중이었다. 동료를 도우면서도 그 일의 담당과 책임이 흐려져서는 안 됐다.',
  '나이스 창을 닫으며 생각했다. 일의 무게는 담당자가 정해졌다는 이유만으로 가벼워지지 않았다.'];
 if(d===3)return [
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
 if(d===5)return [
  pressure?'주안 파일을 올리고도 책상 위의 일은 끝나지 않았다. 맡지 않은 업무를 부탁받은 기록까지 한 줄씩 남았다. 힘든 이유가 내 능력 부족인지, 일의 분배 방식인지 묻고 싶었다.':
  '주안을 맞추고 다음 주 수업을 준비했다. 동학년 선생님들이 서로 바쁜 날을 먼저 확인하는 모습이 눈에 띄었다. 도움을 청하기 편한 분위기가 시간을 아껴 주었다.',
  dutyline,
  '나는 학교의 근무 난이도가 교사 개인의 인내심만으로 정해지지 않는다고 생각했다. 업무분장과 회의 문화, 실제 도움이 되는 지원이 하루의 모양을 바꾼다.'];
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
 const data=EVENTS[state.day];
 const office=officialContext(world,state.day);
 const paragraphs=eventProse(state,world);
 const last=previousImpact(state);
 if(last)paragraphs.splice(1,0,last);
 if(office)paragraphs.push(office);
 return {
  id:data.id,day:state.day,date:'2027-03-'+String(7+state.day).padStart(2,'0'),
  title:data.title,place:data.place,paragraphs,kind:data.tone,
  source:'fictional_scenario',fictionLabel:'가상 시나리오 · 실제 학교에서 발생한 일이라는 뜻이 아닙니다.',
  choices:CHOICES[data.id].map(c=>({id:c.id,label:c.label})),
  result:reflecting?copy(state.storyReflection):null
 };
}
function choose(state,id){
 const current=scene(state,{mode:'public_fiction_demo',numbers:{}}); // Choices independent of school source facts.
 if(!current||current.result)throw Error('SCENARIO_CHOICE_PHASE_REQUIRED');
 const raw=CHOICES[current.id].find(c=>c.id===id);
 if(!raw)throw Error('SCENARIO_CHOICE_INVALID');
 const next=copy(state),reply=copy(raw.reply);
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
const api=Object.freeze({VERSION,DUTIES,EVENTS,CHOICES,officialFacts,scene,choose,continueStory});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryScenario=api;
})(typeof window!=='undefined'?window:globalThis);
