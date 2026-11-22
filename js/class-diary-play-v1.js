/* 『나의 OO한 학급일지』 3단계: 2027.03.08~03.14, 7일간의 분기형 한국어 소설.
 * 모든 등장인물과 사건은 허구. 승인된 과거 조사 집계는 분위기 소재일 뿐 사실 진술이 아님.
 * 이 모듈은 네트워크/저장소/API를 사용하지 않으며 모든 전이는 순수 함수로 수행한다.
 */
(function (root) {
'use strict';
const VERSION='class-diary-play/v1';
const MBTI=/^[IE][NS][TF][JP]$/;
const DAYS=['2027-03-08','2027-03-09','2027-03-10','2027-03-11','2027-03-12','2027-03-13','2027-03-14'];
const WEEKDAYS=['월요일','화요일','수요일','목요일','금요일','토요일','일요일'];
const clamp=n=>Math.max(0,Math.min(100,Math.round(n)));
const copy=o=>JSON.parse(JSON.stringify(o));
const replace=(s,name)=>String(s).replace(/\{colleague\}/g,name);
/* 이 수치는 실제 학교의 배구지수나 교원 개인에 대한 평가가 아닌, 가상 이야기 속 선택의 결과다. */
const STATS=['affection','trust','agency','fatigue','voice','boundary'];
const CULTURE_DELTAS=Object.freeze({
  ask:[5,8],carry:[-5,-11],share:[3,4],
  reopen:[10,0],private:[4,3],follow:[-4,7],
  council:[6,-3],trial:[4,2],explain:[0,5],
  together:[7,8],listen:[5,0],alone:[-5,-10],
  invite:[1,4],choice:[8,9],rest:[4,10],
  coffee:[0,4],letter:[2,8],offline:[2,10],
  promise:[9,5],thanks:[5,5],quiet:[4,10]
});
const CULTURE_TRADEOFFS=Object.freeze({
  "ask": "옆에서 같이 보니 생각보다 간단한 일이었다. 종이를 나누고 나서야 내 책상 위가 보였다.",
  "carry": "내가 할게요, 하고 말한 지 한 시간도 안 돼서 그 말을 조금 후회했다. 그래도 이제 와서 도움을 청하기가 괜히 머쓱했다.",
  "share": "커피 한 모금 마실 틈도 없이 종이컵을 들어 올렸다. 마주 보고 웃을 사람이 있다는 건 꽤 다행스러운 일이었다.",
  "reopen": "회의가 끝난 뒤에도 내가 한 말이 귀에 남았다. 이제는 아이들 앞에서도 그렇게 말할 차례였다.",
  "private": "오늘 못 한 말을 복도에서는 쉽게 꺼냈다. {colleague}은 기다렸다는 듯 내 쪽으로 고개를 돌렸다.",
  "follow": "아이들 앞에 섰을 때 설명이 막힐까 봐 걱정됐다. 정해진 일이라고 말하는 건 어렵지 않았다.",
  "council": "종이 울린 뒤에도 칠판에는 아이들이 정한 약속이 남았다. 지우개를 들었다가 그대로 내려놓았다.",
  "trial": "아이들은 벌써 내일이 기다려지는 모양이었다. 한 번 더 해 보자고, 누군가 손을 번쩍 들었다.",
  "explain": "설명은 끝났지만 아이의 질문은 남았다. 그 아이는 칠판을 보는 대신 내 얼굴을 바라보고 있었다.",
  "together": "메모 두 장을 나란히 놓았다. 내가 놓친 말을 {colleague}이 짚어 주었다.",
  "listen": "아이들 말을 받아 적다 보니 메모지가 모자랐다. 마지막 아이가 말을 마칠 때까지 새 종이를 꺼냈다.",
  "alone": "통화를 마치고서야 손에 힘이 들어가 있다는 걸 알았다. 책상 위에서 펜이 굴러 떨어졌다.",
  "invite": "교문까지 걷는 동안 별말도 하지 않았다. 그런데 헤어지자는 말은 둘 다 먼저 꺼내지 않았다.",
  "choice": "퇴근하는 사람과 저녁을 먹으러 가는 사람이 서로 손을 흔들었다. 그걸로 충분한 금요일이었다.",
  "rest": "컴퓨터를 끄자 창에 비친 내 얼굴이 잠깐 선명해졌다. 그제야 주말이 시작된 것 같았다.",
  "coffee": "카페 문이 열릴 때마다 얼굴을 들었다. 기다린다는 건 생각보다 사소한 동작들로 이루어졌다.",
  "letter": "보내기 버튼을 누르고 휴대전화를 가방에 넣었다. 몇 발자국 걷다가 다시 꺼내 보고 싶은 마음을 참았다.",
  "offline": "읽던 책의 책갈피를 옮겼다. 해가 조금 기울었다. 오늘은 그걸로 됐다.",
  "promise": "수첩 모서리를 손끝으로 문질렀다. 아이들이 했던 말이 작은 글씨로 거기 남아 있었다.",
  "thanks": "답장이 왔을 때 괜히 책상 위의 물건을 정리했다. 별말 아닌데도 금방 답하기가 어려웠다.",
  "quiet": "등불을 끄고서도 잠깐 눈을 뜨고 있었다. 문득 월요일 아침의 복합기 소리가 떠올라 피식 웃었다."
});
const CHAPTER_MOMENTS=Object.freeze([
  "첫 시간 종이 울리기 전에 교실 문을 열었다. 가방을 멘 아이가 나를 보고 웃었다. 아침 내내 붙들고 있던 서류가 잠깐 생각나지 않았다.",
  "회의실 문을 열자 복도의 찬 공기가 들어왔다. {colleague}이 내 걸음에 맞춰 천천히 걸었다. 지금은 아무 말도 하지 않아도 괜찮을 것 같았다.",
  "칠판에 적힌 이름들이 조금씩 지워져 갔다. 아이 하나가 자기 의견이 남아 있는지 확인하러 돌아왔다. 나는 그 부분만 지우지 않았다.",
  "복도 끝에서 아이들 웃음소리가 들렸다. 메모지 위에는 그 애들의 말이 서로 다른 글씨로 적혀 있었다. 나는 확인할 부분에만 밑줄을 그었다.",
  "교실 창에 햇살이 비스듬히 걸렸다. {colleague}은 먼저 퇴근할 준비를 하면서 내 쪽을 돌아봤다. 나는 아직 가방 지퍼를 닫지 못했다.",
  "서점에서 책을 골라 들자 휴대전화 화면이 잠깐 켜졌다. 아무 알림도 없었다. 이상하게 마음이 가벼웠다가, 또 조금 심심해졌다.",
  "수첩을 덮자 표지에 손바닥 자국이 남았다. 이 일주일을 딱 한 문장으로 적을 수 있다면 무엇이라고 쓸까. 나는 빈칸을 그대로 두었다."
]);
const CHOICE_ECHO=Object.freeze({
  "ask": "돌아보니 업무분장표보다 먼저 기억나는 건 옆으로 끌려오던 의자 소리였다.",
  "carry": "동의서 파일을 책상 구석에 내려놓았다. 하루가 끝났는데도 종이는 줄지 않았다.",
  "share": "낮에 들었던 웃음소리가 다시 생각났다. 소리까지 기억나는 웃음은 오랜만이었다.",
  "reopen": "회의에서 한 말을 다시 떠올렸다. 말끝이 조금 떨렸던 것 같다. 다음에는 덜 떨릴까.",
  "private": "계단 앞에서 {colleague}과 나눈 대화가 생각났다. 사람들 앞에서 못 했던 말인데 이상하게 그 사람 앞에서는 나왔다.",
  "follow": "아이가 왜냐고 물었을 때 바로 대답하지 못했다. 귀가한 뒤에도 그 표정이 떠올랐다.",
  "council": "칠판 한 귀퉁이에 아이들이 적은 말이 남았다. 내일 첫 시간에 다시 읽어 보기로 했다.",
  "trial": "아이들은 두 방법을 시험해 볼 날짜까지 정했다. 다들 조금 들떠 있었다.",
  "explain": "설명을 들은 아이가 내일은 자기 생각을 말해도 되느냐고 물었다. 나는 고개를 끄덕였다.",
  "together": "서로 쓴 메모를 바꿔 읽었다. 내가 듣지 못한 말이 거기 있었다.",
  "listen": "마지막 아이가 나가고 나서도 의자에 한동안 앉아 있었다. 오늘은 말을 많이 한 날이 아니라 들은 날이었다.",
  "alone": "끊어진 통화 화면을 한참 바라봤다. 정작 내가 확인해야 할 것들은 아직 종이에 남아 있었다.",
  "invite": "같이 걷자고 한 말을 취소하고 싶을 만큼 떨렸다. 그런데 상대가 웃었다. 그걸로 조금 나아졌다.",
  "choice": "“월요일에 봬요.” 여러 목소리가 흩어졌다. 금요일 복도에는 발자국 소리만 남았다.",
  "rest": "엘리베이터 거울에 비친 얼굴이 생각보다 피곤해 보였다. 집에 가서 일찍 자야겠다.",
  "coffee": "만날 시간을 정하고 나니 서점 안 시계가 더디게 가는 것 같았다.",
  "letter": "짧은 답장을 읽고 화면을 껐다. 카페에서 나와도 입가의 웃음이 가시지 않았다.",
  "offline": "페이지를 넘기는 소리가 또렷했다. 누군가를 기다리지 않는 오후도 좋았다.",
  "promise": "내일 아이들에게 묻고 싶은 말이 생겼다. 잊을까 봐 수첩에 동그라미를 쳤다.",
  "thanks": "문자를 보내고 나서야 내 문장이 너무 짧았나 싶었다. 다시 보낼 말은 찾지 못했다.",
  "quiet": "수첩을 침대 머리맡에 놓았다. 내일은 내일의 이야기가 있을 것이다."
});
const CHAPTERS=[
{
 title:'복합기 앞에서 시작된 월요일',
 place:'학년연구실 · 3월 둘째 주 월요일 아침',
 prose:[
  '학년연구실 복합기에서 종이가 삐뚤게 나왔다. 주안을 반듯하게 다시 넣고 나니 1교시까지 십 분이 남았다. 아직 제출하지 않은 개인정보 수집·이용 동의서가 책상 한쪽에 쌓여 있었다.',
  '나이스 출결을 확인하려는데 {colleague}이 옆으로 다가왔다. “선생님, 그거 다 혼자 하시는 거예요?” 그 사람은 종이컵을 내 앞에 놓고는 내 책상을 한번 둘러봤다.',
  '화면에는 K-에듀파인 품의 창까지 열려 있었다. 수업 자료를 찾으려던 참이었는데, 정작 아이들 얼굴은 아직 한 번도 못 봤다. 나는 컵을 손으로 감싸 쥐었다. 온기가 조금 남아 있었다.'
 ],
 choices:[
  {id:'ask',label:'주안과 동의서를 누가 맡을지 학년 선생님들과 확인한다',delta:{affection:4,trust:7,agency:3,fatigue:-3},
   response:['“주안은 같이 확인하는 거 맞죠? 동의서도 취합할 분이 따로 계시고요?” 내가 업무분장표를 펼치자 {colleague}이 의자를 끌어왔다.','서로 화면을 가리키며 할 일을 나누는 동안 어느새 종이컵의 커피가 식었다. 그래도 마음은 아까보다 가벼웠다.'],
   line:'“맞아요. 그건 제가 취합할게요. 선생님은 1교시 준비부터 하세요.”'},
  {id:'carry',label:'일단 내가 챙겨 보겠다고 말하고 서류를 가져온다',delta:{affection:1,trust:0,agency:0,fatigue:9},
   response:['“제가 한번 해 볼게요.” 말하고 나서야 손에 든 서류가 꽤 두껍다는 걸 알았다.','{colleague}은 내 손에 들린 종이를 한참 보더니 절반쯤 들어 올렸다. “이건 제가 가져갈까요?” 나는 괜찮다고 말하려다 입을 다물었다.'],
   line:'“정 힘들면 얘기해요. 1교시는 코앞이잖아요.”'},
  {id:'share',label:'학기 초라 정신없다며 동료와 잠깐 이야기한다',delta:{affection:8,trust:4,agency:1,fatigue:-2},
   response:['“저만 아직 3월 첫날 같아요?” 내가 묻자 {colleague}이 웃었다. “저는 아까 주안 올린 줄 알고 컴퓨터까지 껐어요.”','둘 다 잠깐 웃었다. 복합기는 여전히 종이를 뱉어 내고 있었지만 아까만큼 시끄럽게 느껴지지 않았다.'],
   line:'“수업 끝나고 커피 한 잔 해요. 이번엔 따뜻할 때 마시게요.”'}
 ]
},
{
 title:'전원 동의라는 네 글자',
 place:'교직원전체회의 · 화요일 방과 후',
 prose:[
  '교직원전체회의가 끝날 무렵, 회의실 공기는 조금씩 무거워졌다. 누군가는 시계를 봤고 누군가는 펜 뚜껑을 열었다 닫았다 했다. 새 학기 생활지도 안건에서 이야기가 길어졌다.',
  '복도 이동과 급식 줄서기까지 학교 전체의 기준을 맞추자는 의견이 나왔다. 학년연구실에서 나눈 생각은 조금 달랐다. 학년회의 때 {colleague}도 반마다 아이들 의견을 들어 보자고 하지 않았던가.',
  '회의록 화면에 ‘전원 동의’라는 글자가 먼저 올라왔다. 나는 손을 들까 말까 망설였다. 옆에 앉은 {colleague}이 내 쪽으로 몸을 조금 기울였다. “아까 하시려던 말씀 있잖아요.”'
 ],
 choices:[
  {id:'reopen',label:'반마다 아이들과 정할 수 있는 규칙은 남겨 두자고 말한다',delta:{affection:5,trust:8,agency:9,fatigue:2},
   response:['“학교 전체가 지킬 건 같이 정하되, 줄서는 방법 같은 건 반에서 정해 봐도 되지 않을까요?”','잠깐 조용해졌다. 맨 앞줄의 선생님이 고개를 끄덕였다. {colleague}은 회의록에 ‘학급별 협의’라는 말을 덧붙였다. 내가 하고 싶었던 말이 글자로 남았다.'],
   line:'“우리 반에서도 한번 해 봐요. 다음 학년회의 때 얘기 들려주세요.”'},
  {id:'private',label:'회의가 끝난 뒤 동학년 선생님에게 생각을 말한다',delta:{affection:6,trust:4,agency:4,fatigue:-1},
   response:['회의가 끝나고 나서야 말이 나왔다. “아까 그 안건요. 사실 조금 걸렸어요.”','{colleague}이 학년연구실 문을 잡은 채 돌아봤다. “그럴 것 같았어요. 다음 학년회의 때 우리끼리 먼저 이야기해 볼까요?”'],
   line:'“지금 말해 주셔도 괜찮아요. 저는 듣고 싶었거든요.”'},
  {id:'follow',label:'일단 공통 규칙을 따르고 아이들 반응을 살핀다',delta:{affection:0,trust:1,agency:-3,fatigue:-4},
   response:['나는 말없이 회의 자료를 덮었다. 정해진 대로 하면 당장은 편할 터였다.','교실로 돌아오는 복도에서 아이 하나가 물었다. “선생님, 우리 반도 꼭 그렇게 해야 해요?” 나는 바로 대답하지 못했다.'],
   line:'“내일 아이들이 뭐라고 하는지 보고, 그때 다시 얘기해요.”'}
 ]
},
{
 title:'급식 줄은 왜 번호순이에요?',
 place:'3학년 교실 · 수요일 4교시',
 prose:[
  '3교시 영어 전담시간에 학년연구실에서 겨우 숨을 돌렸다. 아이스크림에서 찾은 모둠 자료를 고치고, 인디스쿨에 올라온 활동지를 살폈다. 어젯밤 유튜브에서 본 영상도 수업에 쓸 만한 부분만 적어 뒀다.',
  '4교시가 시작되자 교실이 다시 웅성거렸다. 모둠에 앉아 있던 아이가 손을 들었다. “선생님, 급식실 갈 때 꼭 번호대로 서야 해요?” 이어서 다른 아이가 말했다. “모둠끼리 가면 안 돼요?”',
  '칠판에는 오늘 해야 할 활동이 적혀 있었다. 곧 종도 울릴 것이다. 그래도 아이가 손을 들고 있는 동안에는 그 질문이 교실 한가운데 놓여 있었다. 문밖으로 지나가던 {colleague}이 열린 문틈으로 잠깐 들여다봤다.'
 ],
 choices:[
  {id:'council',label:'급식 줄서는 방법을 학급회의 안건으로 올린다',delta:{affection:5,trust:7,agency:11,fatigue:4},
   response:['“그럼 어떻게 하면 좋을까? 불편한 점도 같이 이야기해 보자.” 아이들이 모둠마다 고개를 맞댔다.','칠판에는 번호순, 모둠별, 하루씩 돌아가며 서기까지 세 가지 의견이 적혔다. 한 아이가 작은 목소리로 덧붙였다. “늦게 걷는 친구도 기다려 주면 좋겠어요.” 나는 그 말에도 동그라미를 쳤다.'],
   line:'“옆 반에서도 들리더라고요. 아이들, 생각보다 진지하던데요?”'},
  {id:'trial',label:'두 가지 방법을 며칠씩 써 보고 다시 정한다',delta:{affection:4,trust:6,agency:7,fatigue:1},
   response:['“바로 정하지 말고 둘 다 해 볼까?” 아이들 얼굴이 환해졌다. 누군가는 달력에 날짜를 적었다.','쉬는 시간에 들른 {colleague}이 칠판을 보고 물었다. “이거 우리 반도 해 봐도 돼요?”'],
   line:'“어떤 게 좋은지 말로만 듣는 것보다 해 보는 게 빠르겠네요.”'},
  {id:'explain',label:'지금 규칙을 쓰는 이유를 먼저 설명한다',delta:{affection:2,trust:3,agency:2,fatigue:-2},
   response:['“급식실 복도가 좁아서 한 줄로 이동하기로 했어. 뛰다가 부딪히면 위험하니까.”','질문했던 아이가 잠시 생각하더니 다시 물었다. “그럼 모둠별로 한 줄씩 서면요?” 나는 분필을 내려놓았다. 아직 이야기가 끝나지 않은 모양이었다.'],
   line:'“그 질문, 우리 반에서도 나왔어요. 아이들한테 물어볼까요?”'}
 ]
},
{
 title:'전화가 끊긴 다음',
 place:'교무실 옆 상담 공간 · 목요일 오후',
 prose:[
  '오전에는 학교장 허가 교외체험학습신청서가 올라왔다. 학년연구실에서 나이스 출결을 확인하고 있었는데 보호자에게 전화가 걸려 왔다. 쉬는 시간에 아이들 사이에서 있었던 일이었다.',
  '말이 엇갈렸다. 누구는 먼저 밀었다고 했고 누구는 가방에 걸려 넘어졌다고 했다. 나는 메모지를 펼쳐 들은 말과 확인한 말을 따로 적었다. 펜 끝이 같은 자리를 두 번 눌렀다.',
  '통화를 마치자 책상 옆에 서 있던 {colleague}이 조용히 물었다. “많이 놀라셨죠?” 그 짧은 말에 이상하게 목이 메었다. “아뇨, 아직 확인할 게 남았어요.” 나는 그렇게 답했다.'
 ],
 choices:[
  {id:'together',label:'동학년 선생님과 확인할 사실과 상담 절차를 정리한다',delta:{affection:6,trust:9,agency:6,fatigue:-4},
   response:['내 메모를 보던 {colleague}이 빈 종이를 한 장 가져왔다. “여기엔 확인된 것만 적어요. 나머지는 같이 알아보죠.”','우리는 아이들이 한 말을 섞어 쓰지 않고 필요한 절차를 찾아봤다. 보호자에게 다시 연락할 시간도 정했다.'],
   line:'“제가 옆에 있을게요. 혼자 통화하지 않으셔도 돼요.”'},
  {id:'listen',label:'아이들 말을 따로 듣고 확인할 내용을 정리한다',delta:{affection:4,trust:6,agency:8,fatigue:2},
   response:['아이들을 한 명씩 불렀다. 처음에는 서로 잘못했다고 말하던 아이들이 시간이 지나자 그때 무서웠다는 말을 꺼냈다.','나는 중간에 말을 끊지 않았다. 들은 이야기를 적고 다시 확인할 부분에 조그맣게 별표를 했다. {colleague}은 옆에서 조용히 기다려 주었다.'],
   line:'“지금까지 확인된 것만 말씀드리면 돼요. 제가 메모도 같이 볼게요.”'},
  {id:'alone',label:'우선 보호자와 통화하고 나중에 학년과 상의한다',delta:{affection:1,trust:0,agency:2,fatigue:10},
   response:['나는 서둘러 다시 전화를 걸었다. 설명을 마칠 무렵에야 아직 확인하지 못한 이야기가 있다는 게 떠올랐다.','통화가 끝난 뒤에야 {colleague}을 찾아갔다. 그는 내 말을 끝까지 듣고는 의자를 옆으로 당겨 주었다.'],
   line:'“일단 앉아요. 어디까지 확인했는지부터 같이 봐요.”'}
 ]
},
{
 title:'금요일, 교문 밖에서',
 place:'학년연구실 · 금요일 방과 후',
 prose:[
  '금요일 오후의 학년연구실에는 종이 넘기는 소리만 남았다. 다음 주 주안을 확인하고 K-에듀파인에 올린 물품 품의가 결재됐는지 살폈다. 이제 컴퓨터만 끄면 퇴근할 수 있었다.',
  '교무실에서는 저녁을 같이 먹자는 이야기가 돌았다. 누군가는 벌써 식당을 검색했고, 누군가는 가방에 넣어 둔 차 열쇠를 만지작거렸다.',
  '{colleague}이 내 책상에 기대 섰다. “주안 다 끝나셨어요?” 나는 고개를 끄덕였다. “그럼 오늘 저녁은요?” 아무렇지 않게 묻는 것 같았는데, 대답하기까지 조금 시간이 걸렸다.'
 ],
 choices:[
  {id:'invite',label:'퇴근길에 잠깐 같이 걸을지 물어본다',delta:{affection:9,trust:5,agency:3,fatigue:-2},
   response:['“저녁 모임 말고요, 교문까지만 같이 걸으실래요?” {colleague}이 가방 지퍼를 닫다 말고 나를 봤다.','“교문까지만요?” 웃음기가 섞인 목소리였다. 우리는 나란히 계단을 내려갔다. 교문을 지나고도 둘 다 발걸음을 멈추지 않았다.'],
   line:'“조금만 더 걸을까요? 아직 날이 밝네요.”'},
  {id:'choice',label:'저녁 모임은 참석하고 싶은 사람만 가면 좋겠다고 말한다',delta:{affection:5,trust:8,agency:7,fatigue:-1},
   response:['“오늘 바쁘신 분들도 계시니까, 가실 수 있는 분들끼리 가면 좋겠어요.”','모임에 가지 않기로 한 선생님이 먼저 손을 흔들었다. {colleague}도 내 쪽을 돌아보며 웃었다.'],
   line:'“그 말 해 주셔서 고마워요. 저도 오늘은 쉬고 싶었거든요.”'},
  {id:'rest',label:'다음 주 준비를 여기까지 마치고 퇴근한다',delta:{affection:3,trust:4,agency:4,fatigue:-7},
   response:['나는 마지막 파일의 이름을 확인하고 컴퓨터를 껐다. 갑자기 조용해진 모니터에 내 얼굴이 비쳤다.','계단을 내려가는데 휴대전화가 울렸다. {colleague}의 메시지였다. ‘오늘도 고생 많으셨어요. 주말 잘 보내세요.’ 나도 모르게 웃음이 났다.'],
   line:'“월요일에 봬요. 이번 주 정말 수고 많으셨어요.”'}
 ]
},
{
 title:'학교 밖의 토요일',
 place:'토요일 오후 · 동네 서점과 카페',
 prose:[
  '토요일에는 알람보다 먼저 눈을 떴다. 다시 잠들어도 됐지만 괜히 창문을 열었다. 금요일에 정리해 둔 주안 덕분에 오늘은 수업 준비를 할 일이 없었다.',
  '오후에는 동네 서점에 들렀다. 새 책 냄새가 났다. 책 한 권을 꺼내는데 {colleague}이 며칠 전 추천했던 제목이 눈에 들어왔다. 책 표지를 만지다가 그 사람의 웃음이 생각났다.',
  '나는 서점 옆 카페의 빈자리를 들여다봤다. 누군가를 불러도 좋고 혼자 앉아 있어도 좋을 날이었다. 한참을 망설이다 휴대전화를 꺼냈다.'
 ],
 choices:[
  {id:'coffee',label:'괜찮다면 카페에서 잠깐 만날지 물어본다',delta:{affection:8,trust:6,agency:2,fatigue:-3},
   response:['‘혹시 오늘 시간 괜찮으세요? 저 서점 앞인데요.’ 쓰고 나니 너무 갑작스러운 것 같아 ‘바쁘시면 다음에요’라는 말을 덧붙였다.','잠시 뒤 답장이 왔다. ‘저 지금 근처예요.’ 나는 휴대전화를 한 번 더 읽고서야 책을 내려놓았다.'],
   line:'“오늘은 학교 얘기 안 하는 걸로 해요. 선생님, 무슨 책 좋아하세요?”'},
  {id:'letter',label:'이번 주 고마웠다고 짧게 연락하고 각자 쉰다',delta:{affection:5,trust:7,agency:3,fatigue:-6},
   response:['‘이번 주에 많이 도와주셔서 고마웠어요.’ 문장을 몇 번이나 고쳤다. 결국 처음 쓴 말을 그대로 보냈다.','{colleague}의 답장은 길지 않았다. ‘저도요. 주말 잘 보내세요.’ 이상하게 짧은 그 말이 오래 눈에 남았다.'],
   line:'“월요일에 봬요. 주말엔 푹 쉬세요.”'},
  {id:'offline',label:'연락하지 않고 혼자 조용히 주말을 보낸다',delta:{affection:1,trust:2,agency:5,fatigue:-10},
   response:['휴대전화를 가방 안쪽에 넣고 책을 펼쳤다. 한 페이지를 읽고 나서야 다시 첫 문장으로 돌아갔다.','누구를 기다리지 않아도 되는 오후였다. 카페 창으로 지나가는 사람들이 보였고, 커피는 천천히 식었다.'],
   line:'“다음에 만나면 읽은 책부터 얘기해야겠어요.”'}
 ]
},
{
 title:'일요일 밤의 수첩',
 place:'일요일 밤 · 집의 작은 책상',
 prose:[
  '일요일 밤에는 책상 위의 수첩을 펼쳤다. 다음 주 주안은 금요일 학년연구실에서 이미 맞췄다. 오늘은 나이스나 에듀파인에 접속할 생각이 없었다.',
  '수첩 한쪽에는 아이들이 학급회의에서 낸 의견이 적혀 있었다. ‘모둠별로 줄서기’, ‘천천히 걷는 친구 기다리기’. 그 아래에는 {colleague}과 나눈 말 몇 개를 적었다 지운 흔적이 있었다.',
  '일주일이 길었다고 생각했는데, 막상 돌아보니 기억나는 건 뜻밖에 짧은 순간들이었다. 누군가 내 앞에 커피를 내려놓던 일, 아이가 조심스럽게 손을 들던 일. 나는 수첩의 마지막 칸을 비워 두었다.'
 ],
 choices:[
  {id:'promise',label:'아이들의 의견을 다시 묻고 학년과 의논하기로 적는다',delta:{affection:7,trust:9,agency:9,fatigue:-2},
   response:['‘월요일, 아이들한테 줄서기 다시 물어보기.’ 수첩에 적었다. 덧붙일 말이 떠올라 펜을 다시 들었다. ‘학년 선생님들께도 이야기하기.’','글씨가 조금 삐뚤었다. 그래도 이 정도면 내일 교실에 가져갈 수 있을 것 같았다.'],
   line:'“다음 학년회의 때 그 이야기 들려주세요. 저도 궁금해요.”'},
  {id:'thanks',label:'이번 주 함께한 동료에게 고맙다고 연락한다',delta:{affection:10,trust:7,agency:4,fatigue:-2},
   response:['‘이번 주에 고마웠어요.’ 쓰고 지웠다. ‘같이 있어서 좋았어요.’ 그 말은 조금 부끄러워 다시 지웠다.','결국 짧게 보냈다. ‘이번 주 정말 고마웠어요.’ 답장은 생각보다 금방 왔다.'],
   line:'“저도요. 월요일에 봬요.”'},
  {id:'quiet',label:'다음 주 일은 내일 생각하고 일찍 쉰다',delta:{affection:3,trust:5,agency:7,fatigue:-7},
   response:['수첩을 덮고 탁상등을 껐다. 내일 일은 내일의 책상에서 하면 될 것이다.','침대에 누우니 아이들의 목소리가 한순간 귓가를 스쳤다. 피곤한 줄도 모르고 나는 조금 웃었다.'],
   line:'“월요일엔 무슨 일이 기다리고 있을까요.”'}
 ]
}
];
/* 교사의 삶을 말하는 제목은 한국어에서 자연스럽게 쓰는 관형형만 사용한다.
 * 감정을 영어로 이름 붙인 뒤 번역하지 않고, 일주일의 장면에서 제목을 고른다.
 * 5개 제목은 모두 '나의 ○○한 학급일지' 꼴로 정확히 읽힌다.
 */
const ENDING_WORDS=Object.freeze({
 warm:'소중한',
 parallel:'든든한',
 steady:'단단한',
 tender:'다정한',
 ordinary:'솔직한'
});
const ENDINGS=Object.freeze({
 warm:{title:'나의 소중한 학급일지',heading:'남겨 두고 싶은 얼굴들',prose:[
  '한 주가 지나고 책상 위에 남은 건 주안 파일보다도 몇 사람의 얼굴이었다. 월요일 아침 종이컵을 건네던 손, 아이가 머뭇거리다 내민 질문, 복도 끝에서 나를 기다리던 사람.',
  '나는 수첩에 {colleague}의 이름을 쓰려다가 그만뒀다. 굳이 적지 않아도 잊지 않을 것 같았다.',
  '창밖에서는 늦은 버스가 지나갔다. 내일도 별다를 것 없는 교실이겠지만, 이상하게 그게 조금 기다려졌다.'
 ]},
 parallel:{title:'나의 든든한 학급일지',heading:'옆자리의 온기',prose:[
  '학년연구실에는 늘 누군가 먼저 도착해 있었다. 내가 늦게 켠 컴퓨터 옆에 종이컵이 놓여 있던 날도 있었다.',
  '어렵다고 말하면 {colleague}은 대단한 조언부터 하지 않았다. “어디까지 했어요?” 그렇게 묻고는 의자를 옆으로 당겨 왔다. 나는 그 말이 좋았다.',
  '일요일 밤, 월요일 시간표를 바라봤다. 여전히 할 일은 많았다. 하지만 복도 저편에 내 이야기를 들어 줄 사람이 있다는 걸 알았다.'
 ]},
 steady:{title:'나의 단단한 학급일지',heading:'지우지 않은 글씨',prose:[
  '칠판에는 아이들이 정한 규칙을 썼다가 지운 자국이 희미하게 남아 있었다. 하루 만에 잘된 건 거의 없었다. 어떤 아이는 여전히 순서를 헷갈렸고, 어떤 아이는 말할 차례를 놓쳤다.',
  '그럴 때마다 다시 물었다. “어제 정한 거, 오늘도 괜찮아?” {colleague}은 가끔 문밖에서 그 광경을 바라보다 웃었다.',
  '흔들리지 않은 날은 없었다. 다만 돌아와야 할 자리를 이제 조금 알 것 같았다.'
 ]},
 tender:{title:'나의 다정한 학급일지',heading:'이름을 부르기까지',prose:[
  '처음에는 주안이나 수업 자료가 아니면 무슨 말을 해야 할지 몰랐다. 어느 날부터는 그 사람의 얼굴을 보고도 먼저 업무 이야기를 꺼내지 않았다.',
  '{colleague}이 웃는 날에는 나도 이유 없이 웃었다. 가끔은 그 사람이 나를 어떻게 생각하는지 궁금했다. 답을 알 수 없어서 더 오래 생각했다.',
  '일요일 밤에 휴대전화 화면이 켜졌다. 특별한 말은 없었다. 그래도 나는 그 한 줄을 두 번 읽었다.'
 ]},
 ordinary:{title:'나의 솔직한 학급일지',heading:'서툴러도 지나가는 하루',prose:[
  '이번 주에는 대답을 너무 빨리 한 날도 있었고, 괜찮다고 말해 놓고 혼자 후회한 날도 있었다. 돌아보면 잘한 일보다 떠오르는 장면이 더 많았다.',
  '{colleague}과 어색하게 헤어진 날도 생각났다. 무슨 말을 더 했으면 좋았을까. 생각해 봐도 그때의 나는 그 정도밖에 하지 못했을 것이다.',
  '수첩을 덮었다. 내일은 또 다른 아이가 손을 들겠지. 이번에는 잠깐 기다렸다가 말을 들어 봐야겠다.'
 ]}
});
function validateProfile(profile){
  if(!profile||typeof profile!=='object')throw Error('PROFILE_REQUIRED');
  const gender=profile.gender,partner=profile.partner,mbti=profile.mbti;
   const name=profile.name===undefined?'다온':String(profile.name).trim().replace(/\s+/g,'');
   if(!/^[가-힣]{2,8}$/.test(name))throw Error('NAME_INVALID');
  if(!['woman','man','undisclosed'].includes(gender))throw Error('GENDER_INVALID');
  if(!['woman','man','none','man2','man3'].includes(partner))throw Error('PARTNER_INVALID');
  if(!MBTI.test(mbti))throw Error('MBTI_INVALID');
  /* 직무·학급·교직문화는 체험을 위해 사용자가 고르는 가상 조건이며 학교 실태 추정값이 아니다. */
  const experience=profile.experience||'mid';
  const duty=profile.duty||'general';
  const classTone=profile.classTone||'steady';
  const workCulture=profile.workCulture||'collaborative';
  if(!['new','mid','senior'].includes(experience))throw Error('EXPERIENCE_INVALID');
  if(!['none','general','academic','violence'].includes(duty))throw Error('DUTY_INVALID');
  if(!['steady','demanding'].includes(classTone))throw Error('CLASS_SCENARIO_INVALID');
  if(!['collaborative','deflecting','hostile'].includes(workCulture))throw Error('CULTURE_SCENARIO_INVALID');
  const sportsCulture=profile.sportsCulture||'optional';
  const assignmentPractice=profile.assignmentPractice||'balanced';
  const informalRequests=profile.informalRequests||'respectful';
  const gradeBand=profile.gradeBand||'middle';
  const fictionalSchoolSize=profile.fictionalSchoolSize||'medium';
  const storyRegion=profile.storyRegion||'other';
  if(!['optional','pressured','none'].includes(sportsCulture))throw Error('SPORTS_SCENARIO_INVALID');
  if(!['balanced','newcomer_first'].includes(assignmentPractice))throw Error('ASSIGNMENT_SCENARIO_INVALID');
  if(!['respectful','stereotyped'].includes(informalRequests))throw Error('INFORMAL_REQUESTS_INVALID');
  if(!['lower','middle','upper'].includes(gradeBand))throw Error('GRADE_BAND_INVALID');
  if(!['small','medium','large'].includes(fictionalSchoolSize))throw Error('FICTIONAL_SCALE_INVALID');
  if(!['rural','urban','other'].includes(storyRegion))throw Error('REGION_SCENARIO_INVALID');
  return {name,gender,partner,mbti,experience,duty,classTone,workCulture,
    storyCueSource:profile.storyCueSource==='approved_historical_aggregate'?
      'approved_historical_aggregate':'fictional_general',
    sportsCulture,assignmentPractice,informalRequests,gradeBand,fictionalSchoolSize,storyRegion};
}
/**
 * Derive only non-personal physical school context from approved information.
 * Work culture, assigned duty, personality and teachers' behaviour cannot be
 * inferred from school demographics or survey scores. Those remain fiction.
 */
function inferredProfile(world,player,plan){
 const demo=world&&world.mode==='public_fiction_demo';
 const stats=!demo&&world&&world.numbers||{};
 const students=stats.students;
 const accepted=students&&students.status==='APPROVED'&&Number.isInteger(students.referenceYear)&&
   Number.isFinite(students.value)&&students.value>=0;
 const size=accepted?(students.value<=150?'small':students.value<=600?'medium':'large'):'medium';
 const tags=!demo&&world&&world.geography&&Array.isArray(world.geography.tags)?world.geography.tags:[];
 const verified=tags.filter(t=>t&&(['official_address','official_geospatial'].includes(t.source)));
 const rural=verified.some(t=>['admin_eup','admin_myeon','rural'].includes(t.id));
 const urban=verified.some(t=>['admin_dong','urban_core'].includes(t.id));
 const region=rural?'rural':urban?'urban':'other';
 const experience=player.experience||'mid';
 if(!['new','mid','senior'].includes(experience))throw Error('EXPERIENCE_INVALID');
 // Historical signals are validated through the existing Lv2 gated API.
 // Public fiction demos never use school-specific historical cues.
 const cues=!demo&&plan&&plan.schoolId===world?.basic?.id&&
   plan.fictionalContext&&plan.fictionalContext.boundary==='fictional_story_only'?
   plan.fictionalContext:null;
 return {
  ...player,
  /* Fixed fictional third-grade class; not an inference from the school's grade distribution */
  gradeBand:'middle',
  experience,
  duty:'general',classTone:'steady',
  // Work relations are fictional premises influenced by corroborated
  // historical aggregated responses, never actual allegations.
  workCulture:cues&&cues.cooperationCue==='coordination_story'?'deflecting':'collaborative',
  sportsCulture:cues&&cues.socialCue==='choice_pressure_story'?'pressured':'optional',
  assignmentPractice:cues&&cues.assignmentCue==='newcomer_assignment_story'?'newcomer_first':'balanced',
  informalRequests:'respectful',
  storyCueSource:cues&&cues.source==='approved_historical_aggregate'?
    'approved_historical_aggregate':'fictional_general',
  fictionalSchoolSize:size,storyRegion:region
 };
}
function playerAddress(state){
 const p=state&&state.profile||{},name=typeof p.name==='string'&&p.name?' '+p.name:' 다온';
 const full=name.trim();
 if(state&&state.day>=3&&state.stats&&state.stats.affection>=60&&state.stats.trust>=58){
  return (full.length>2?full.slice(-2):full)+' 쌤';
 }
 return full+' 선생님';
}
function partnerName(profile){return profile.partner==='man'?'현우 선생님':profile.partner==='man3'?'태오 선생님':profile.partner==='man2'?'도겸 선생님':profile.partner==='woman'?'지윤 선생님':'민서 선생님';}
function validateWorld(world,plan){
  if(!world||world.eligible!==true||!world.basic||
     !/^[A-Z0-9]{7}$/.test(String(world.basic.id||''))||
     !Array.isArray(world.publishedYears))throw Error('APPROVED_WORLD_REQUIRED');
  // The demo is an explicit, fictional-only offline world. It cannot stand in for a real school.
  const demo=world.mode==='public_fiction_demo'&&world.basic.id==='DEMO001'&&
    world.publishedYears.length===0&&world.basic.name==='가상의 초등학교';
  if(world.mode==='public_fiction_demo'&&!demo)throw Error('DEMO_WORLD_INVALID');
  if(!demo&&!world.publishedYears.length)throw Error('APPROVED_WORLD_REQUIRED');
  if(!plan||plan.schoolId!==world.basic.id||!Array.isArray(plan.scenes)||plan.scenes.length!==7||
     !plan.scenes.every((s,i)=>s.day===i+1&&
       (demo?s.basis==='fictional_general':
         ['fictional_general','approved_historical_aggregate'].includes(s.basis))))
    throw Error('VERIFIED_SCENE_PLAN_REQUIRED');
}
function createGame(world,plan,inputProfile){
  validateWorld(world,plan);
  const profile=validateProfile(inputProfile);
  const name=String(world.basic.name||'선택한 학교').slice(0,80);
  return {
    version:VERSION,schoolId:world.basic.id,schoolName:name,
    profile,day:1,phase:'chapter',history:[],
    stats:{affection:35,trust:42,agency:42,fatigue:35,voice:45,boundary:48,
      support:profile.workCulture==='collaborative'?67:profile.workCulture==='hostile'?24:42},
    lastOutcome:null,ending:null
  };
}
function atmosphere(world,day){
  const scale=world&&world.basic?world.basic.scale:null;
  if(day===1){
    if(scale==='small')return '교문에서 학년연구실까지 금방이었다. 복도를 한 번만 꺾으면 내 교실이 보였다.';
    if(scale==='medium')return '계단을 올랐다가 복도 끝에서 다시 방향을 틀었다. 아직은 학년연구실까지 가는 길도 낯설었다.';
    if(scale==='large')return '교실이 이어진 긴 복도에서 종소리가 울렸다. 여러 반에서 한꺼번에 아이들 목소리가 터져 나왔다.';
    return '새 학교 복도에서 길을 한 번 잘못 들었다. 문마다 비슷하게 생긴 이름표가 붙어 있었다.';
  }
  if(day===3){
    const kind=world&&world.categories&&world.categories.meal_place;
    if(kind&&kind.status==='APPROVED')return '급식실로 내려가는 아이들의 발소리가 복도를 가득 메웠다. 나는 문을 열어 두고 마지막 모둠을 기다렸다.';
  }
  if(day===6){
    const tags=world&&world.geography&&world.geography.tags||[];
    if(tags.some(t=>t.id==='admin_eup'))return '학교에서 나오던 버스가 지나갔다. 토요일 오후의 거리는 평일보다 조금 한산했다.';
    if(tags.some(t=>t.id==='admin_myeon'))return '멀리서 버스가 한 대 들어왔다. 정류장에 서 있던 사람들 사이로 토요일의 바람이 지나갔다.';
  }
  return null;
}
function chapter(state,world,plan){
  if(state.phase!=='chapter')throw Error('CHAPTER_PHASE_REQUIRED');
  validateWorld(world,plan);
  if(state.schoolId!==world.basic.id)throw Error('WRONG_SCHOOL');
  const book=CHAPTERS[state.day-1],seed=plan.scenes[state.day-1];
  const colleague=partnerName(state.profile);
  const p=book.prose.map(s=>replace(s,colleague));
   p.push(replace(CHAPTER_MOMENTS[state.day-1],colleague));
  const atmosphereLine=atmosphere(world,state.day);
  if(atmosphereLine)p.unshift(atmosphereLine);
  /* 주인공의 선택은 편견이나 나이 수치가 아닌 경험과 장면의 맥락에서 전개한다. */
  if(state.day===1){
    p.unshift(
      (state.profile.experience==='new'?'아직 교단에서 배우는 일이 더 많았다.':
       state.profile.experience==='senior'?'여러 번 새 학기를 맞았지만 익숙해지지 않는 순간도 있었다.':
       '경력이 쌓여도 학기 초는 늘 새로웠다.')+
      ' 3월 둘째 주 월요일도 어쩐지 조금 낯설었다.');
  }
  if(state.day===2){
    p.unshift(state.profile.mbti[0]==='I'?
      '입 밖으로 나오려던 말을 삼키고 잠깐 숨을 골랐다. 회의실에서는 누군가 종이를 넘기고 있었다.':
      '옆자리의 펜 소리가 자꾸 신경 쓰였다. 나는 손을 들까 말까 하다가 자료를 한번 더 읽었다.');
  }
  if(state.day===5){
    p.unshift(state.profile.gender==='undisclosed'?
      '누군가 내 이름을 불렀다. 오늘 저녁에 올 거냐는 물음이었다. 나는 가방 지퍼를 만지작거렸다.':
      '퇴근 시간이 다가왔는데도 학년연구실은 환했다. 나는 마지막 파일을 저장하고 의자를 밀었다.');
  }
  if(state.day===6){
    p.unshift(state.profile.mbti[3]==='J'?
      '오늘 할 일을 적은 칸은 비어 있었다. 나는 그 빈칸을 그대로 두고 집을 나섰다.':
      '토요일 오후인데도 시계를 몇 번이나 봤다. 약속은 없었다. 그래도 발걸음이 빨라졌다.');
  }
  /* 승인된 과거 집계의 문장도 가상 장면으로만 사용하며 최다선택 원문은 표시하지 않는다. */
  if(seed.basis==='approved_historical_aggregate')p.unshift(replace(seed.passage,colleague));
  return {
    day:state.day,date:DAYS[state.day-1],weekday:WEEKDAYS[state.day-1],
    title:book.title,place:book.place,paragraphs:p,partner:colleague,
    source:seed.basis==='approved_historical_aggregate'?'historical_fiction':'fiction',
    choices:book.choices.map(c=>({id:c.id,label:c.label}))
  };
}
function choose(state,id){
  if(!state||state.version!==VERSION||state.phase!=='chapter')throw Error('CHOICE_PHASE_REQUIRED');
  const choices=CHAPTERS[state.day-1].choices;
  const found=choices.find(x=>x.id===id);
  if(!found)throw Error('CHOICE_INVALID');
  const next=copy(state),name=partnerName(next.profile);
  for(const key of STATS){
    const delta=key==='voice'?CULTURE_DELTAS[id][0]:
      key==='boundary'?CULTURE_DELTAS[id][1]:Number(found.delta[key]||0);
    next.stats[key]=clamp(next.stats[key]+delta);
  }
  next.history.push({day:next.day,choiceId:id});
  next.lastOutcome={id,paragraphs:found.response.map(s=>replace(s,name)).concat(CULTURE_TRADEOFFS[id],CHOICE_ECHO[id]),
    line:replace(found.line,name)};
  next.phase='reflection';
  return next;
}
function endingFor(state){
  const a=state.stats.affection,t=state.stats.trust,c=state.stats.agency;
  if(state.profile.partner!=='none'&&a>=75&&t>=72&&c>=59)return 'warm';
  if(t>=67&&c>=64)return 'parallel';
  if(c>=67)return 'steady';
  if(state.profile.partner!=='none'&&a>=61)return 'tender';
  return 'ordinary';
}
function advance(state){
  if(!state||state.version!==VERSION||state.phase!=='reflection')throw Error('ADVANCE_PHASE_REQUIRED');
  const next=copy(state);
  next.lastOutcome=null;
  if(next.day===7){
    next.phase='ending';
    const key=endingFor(next),ending=ENDINGS[key];
    next.ending={
      id:key,title:ending.title,heading:ending.heading,
      paragraphs:ending.prose.map(s=>replace(s,partnerName(next.profile))),
      /* 이 점수는 학급과 교직원의 실제 평가 점수가 아니다. */
      affection:next.stats.affection,
      /* 호감도보다 학생의 자리·발언권·업무 경계를 함께 존중한 선택에 비중을 둔다. */
      score:clamp(next.stats.affection*.10+next.stats.trust*.15+
        next.stats.agency*.25+next.stats.voice*.25+next.stats.boundary*.25)
    };
  }else{next.day+=1;next.phase='chapter';}
  return next;
}
function validateEndings(){
  const words=Object.values(ENDING_WORDS);
  if(new Set(words).size!==5||Object.keys(ENDINGS).length!==5)
    throw Error('FIVE_DISTINCT_ENDINGS_REQUIRED');
  for(const [key,word] of Object.entries(ENDING_WORDS)){
    const ending=ENDINGS[key];
    if(!ending||ending.title!=='나의 '+word+' 학급일지'||
       !word.endsWith('한')||ending.prose.length<3)
      throw Error('UNNATURAL_ENDING_TITLE_'+key);
  }
  return words;
}
function validateStory(){
  validateEndings();
  if(CHAPTERS.length!==7||DAYS.length!==7)throw Error('SEVEN_DAYS_REQUIRED');
  for(let i=0;i<7;i++){
    const chapter=CHAPTERS[i],ids=new Set();
    if(!chapter.title||!chapter.place||chapter.prose.length<3||chapter.choices.length<3)
      throw Error('CHAPTER_INCOMPLETE_'+(i+1));
    for(const c of chapter.choices){
      if(!c.id||ids.has(c.id)||!c.label||c.response.length<2||!c.line)throw Error('CHOICE_INCOMPLETE');
      ids.add(c.id);
      if(STATS.some(k=>!Number.isFinite(Number(c.delta[k]||0))))throw Error('INVALID_STAT_DELTA');
      if(!CULTURE_DELTAS[c.id]||CULTURE_DELTAS[c.id].length!==2||
         CULTURE_DELTAS[c.id].some(x=>!Number.isFinite(x))||
         !CULTURE_TRADEOFFS[c.id])throw Error('CULTURE_CONSEQUENCE_MISSING');
    }
  }
  return {chapters:CHAPTERS.length,choices:CHAPTERS.reduce((n,x)=>n+x.choices.length,0)};
}
const api=Object.freeze({
 VERSION,DAYS,WEEKDAYS,ENDINGS,ENDING_WORDS,
 validateProfile,validateStory,validateEndings,inferredProfile,playerAddress,createGame,chapter,choose,advance,
 partnerName
});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryPlay=api;
})(typeof window!=='undefined'?window:globalThis);
