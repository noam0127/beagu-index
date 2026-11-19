/* 『나의 OO한 학급일지』 여러 사건이 이어지는 일주일.
 * 사실: 검증된 공식 배경 정보 / 허구: 등장인물, 일화, 관행, 선택 결과.
 * 게임 기록을 기기나 서버에 저장하지 않는다.
 */
(function(root){
'use strict';
const VERSION='class-diary-incidents/v1';
const cp=o=>JSON.parse(JSON.stringify(o));
const limit=n=>Math.max(0,Math.min(100,Math.round(n)));
const DATES=['2027-03-08','2027-03-09','2027-03-10','2027-03-11','2027-03-12','2027-03-13','2027-03-14'];
const INCIDENTS=Object.freeze({
 arrival:{
  day:1,title:'교문에서 만난 작은 사람들',place:'월요일 아침 · 교문 앞',kind:'gentle',
  prose:[
  "교문 앞에서 배움터지킴이 선생님이 먼저 손을 들어 보였다. 나는 출근 가방을 고쳐 메고 인사했다. 이른 아침인데도 교문에는 벌써 아이들이 몰려 있었다.",
  "가방끈이 자꾸 흘러내리는 아이가 있었다. 신발 끈을 묶느라 쪼그려 앉은 아이도 있었다. 누군가 나를 보자 멀리서부터 뛰어왔다.",
  "교실에 올라가면 주안도 확인해야 하고 나이스 출결도 열어야 한다. 그런데 지금은 그 아이의 이름을 먼저 불러 주고 싶었다."
],
  choices:[
   {id:'hello_guard',label:'배움터지킴이 선생님께 인사하고 아이들을 맞는다',
    delta:{trust:5,agency:5,voice:3,boundary:4,fatigue:2},
    reply:['“안녕하세요. 아침마다 고생 많으세요.” 보안관 선생님이 모자를 바로 쓰며 웃었다.','나는 아이들 이름을 하나씩 불러 주었다. 빨리 교실로 가라는 말 대신 오늘도 왔느냐는 인사를 하고 싶었다.'],line:'“이 시간이 제일 정신없지만 아이들 얼굴 보는 재미가 있죠.”'},
   {id:'hello_children',label:'아이들이 안전하게 등교하는지 잠깐 살핀다',
    delta:{trust:6,agency:7,voice:4,boundary:3,fatigue:3},
    reply:['가방끈이 풀린 아이가 멈춰 섰다. 나는 인도 쪽으로 데려가 가방을 고쳐 멜 시간을 주었다.','그 아이가 “선생님, 오늘 모둠 바꿔요?” 하고 물었다. 첫날부터 아이들 마음에는 궁금한 일이 많았다.'],line:'“교문 앞이 바쁠수록 천천히 보고 보내야 해요.”'},
   {id:'hello_rush',label:'급한 서류가 떠올라 짧게 인사하고 교실로 간다',
    delta:{trust:3,agency:3,voice:3,boundary:5,fatigue:4},
    reply:['나는 보안관 선생님께 손을 흔들고 계단을 서둘러 올랐다. 주안을 확인하고 나이스를 열어야 했다.','복도 끝에 다다라서야 아까 교문에 있던 작은 아이 하나가 손을 흔들었다는 걸 떠올렸다. 내일은 먼저 인사해야지.'],line:'“선생님, 아침부터 바쁘시네요. 그래도 인사는 나누고 가요.”'}
  ]
 },
 parking:{
  day:1,title:'빈자리가 없는 주차장',place:'월요일 출근길 · 학교 앞',kind:'unsettled',
  prose:[
  "교문 앞 도로에 차가 길게 늘어섰다. 아이들을 내려 주는 차와 출근하는 차가 좁은 길에서 서로 비켜 가고 있었다.",
  "주차장에는 빈자리가 없었다. 나는 핸들 위에 손을 올린 채 잠시 망설였다. 등교하는 아이가 차 사이를 지나가는 게 보였다."
],
  choices:[
   {id:'parking_walk',label:'허용된 곳에 주차하고 통학로를 따라 걸어온다',delta:{trust:5,agency:5,voice:4,boundary:5,fatigue:4},
    reply:['조금 먼 곳에 차를 대고 걸었다. 횡단보도에서는 등교하는 아이들과 신호를 기다렸다.','학년연구실에 도착하니 숨이 찼다. 그래도 통학로를 막지 않은 게 다행이었다.'],line:'“주차장이 좁아도 아이들 다니는 길은 비워 둬야죠.”'},
   {id:'parking_raise',label:'등교 시간 차량 동선을 함께 점검하자고 건의한다',delta:{trust:6,agency:5,voice:8,boundary:4,fatigue:5},
    reply:['나는 어느 시간에 어느 구간이 막히는지 적었다. 단순히 주차 공간을 늘려 달라는 말보다 학생 안전까지 함께 이야기하고 싶었다.','학교의 동선은 한 사람의 출근 시간만 바꾼다고 해결되지 않았다.'],line:'“안전 담당 선생님하고 같이 살펴봅시다.”'},
   {id:'parking_adjust',label:'오늘은 안전하게 주차하고 내일부터 출근 방법을 바꾼다',delta:{trust:3,agency:3,voice:3,boundary:7,fatigue:2},
    reply:['나는 허용된 곳에 차를 대고 빠른 걸음으로 교실에 들어왔다. 내일은 다른 방법을 찾아볼 생각이었다.','그래도 이 불편을 혼자 감수하는 것이 당연한지, 언젠가는 묻고 싶었다.'],line:'“오늘은 먼저 수업하고, 주차 문제는 따로 얘기해요.”'}
  ]
 },
 wildlife:{
  day:3,title:'운동장 뒤편의 제보',place:'수요일 점심 직전 · 학년연구실',kind:'tense',
  prose:[
  "운동장 뒤편 길에서 뱀을 봤다는 제보가 들어왔다. 학년연구실에서 이야기를 듣는 동안 아이들은 체육복을 챙겨 운동장으로 나갈 준비를 하고 있었다.",
  "“선생님, 진짜 뱀이 있어요?” 한 아이가 눈을 반짝였다. 나는 무슨 말을 먼저 해야 할지 잠깐 생각했다.",
  "직접 확인한 건 없었다. 그래도 아이들이 가까이 가지 않도록 안내하고 담당자에게 먼저 확인해야 할 것 같았다."
],
  choices:[
   {id:'wildlife_route',label:'접근을 막고 담당자와 안전한 동선을 확인한다',delta:{trust:7,agency:6,voice:5,boundary:6,fatigue:3},
    reply:['나는 아이들이 제보 장소로 가지 않도록 안내했다. 학교 담당자와 상황을 확인하기 전까지 바깥활동을 조정하기로 했다.','모둠별로 교실에서 할 수 있는 협동 놀이를 골랐다.'],line:'“선생님들이 직접 잡으러 가는 건 아니에요. 안전부터 확인해요.”'},
   {id:'wildlife_share',label:'동학년과 학생들에게 안내할 내용을 정한다',delta:{trust:8,agency:5,voice:7,boundary:6,fatigue:4},
    reply:['동학년 선생님과 상황을 나누고 학생을 맡을 사람과 담당자에게 연락할 사람을 구분했다.','확인된 사실만 안내하기로 하니 공연한 소문도 조금 가라앉았다.'],line:'“이런 일일수록 역할을 나눠야죠.”'},
   {id:'wildlife_listen',label:'아이들의 궁금증을 듣고 실내활동 대안을 정한다',delta:{trust:5,agency:9,voice:6,boundary:3,fatigue:4},
    reply:['“나가면 위험할 수 있으니 오늘은 확인하고 결정하자.” 나는 아이들의 물음에 아는 것과 모르는 것을 나눠 답했다.','아이들은 모둠별로 대체 활동을 고르기 시작했다.'],line:'“안전하게 바꾸는 이유를 말해 주니 아이들도 이해하네요.”'}
  ]
 },
 focus:{
  day:1,title:'우리 반의 첫 번째 신호',place:'월요일 1교시 · 교실',kind:'gentle',
  prose:[
  "모둠 자리를 바꾸는 동안 의자가 바닥을 긁었다. 아이들의 목소리가 그 위로 겹쳤다. 이름을 부르면 하나가 돌아봤고, 나머지 아이들은 여전히 친구를 바라봤다.",
  "나는 손을 들어 보였다. 맨 앞자리 아이만 따라 했다. 둘이서 잠깐 우스운 자세로 서 있다가 함께 웃었다. 이왕이면 우리 반만의 신호를 정해 보기로 했다."
],
  choices:[
   {id:'focus_vote',label:'박수와 손 신호를 직접 해 보고 아이들과 하나를 정한다',delta:{trust:6,agency:9,voice:7,boundary:3,fatigue:3},
    reply:['“우리 반은 어떻게 모이면 좋을까?” 아이들이 박수와 손 신호를 직접 해 봤다.','우리는 먼저 일주일 동안 써 보고, 잘 안 되면 학급회의에서 바꾸기로 했다.'],line:'“집중 신호도 아이들과 같이 정하면 더 잘 지킬 수 있겠어요.”'},
   {id:'focus_clap',label:'약속의 박수를 먼저 알려 주고 함께 연습한다',delta:{trust:6,agency:5,voice:4,boundary:4,fatigue:0},
    reply:['나는 짧은 박수를 치고 아이들이 따라 치도록 했다. 처음에는 맞지 않았지만 몇 번 지나자 박수 소리가 하나로 모였다.','놓친 아이를 혼내기보다 다시 연습했다.'],line:'“딱 이 정도면 수업 시작할 때 편하겠어요.”'},
   {id:'focus_wait',label:'손을 들고 기다리는 신호부터 연습한다',delta:{trust:5,agency:6,voice:3,boundary:6,fatigue:1},
    reply:['손을 든 아이부터 옆 친구에게 조용히 신호를 알려 주었다.','모두의 눈이 나를 향할 때까지 기다렸다. 아이들과 약속을 만들 시간이 조금 필요했다.'],line:'“우리 반에 맞는 신호인지는 써 보면서 바꾸면 돼요.”'}
  ]
 },
 seat_song:{
  day:2,title:'모두 제자리',place:'화요일 2교시 시작 · 저학년 교실',kind:'bright',
  prose:[
  "쉬는 시간 종이 울렸는데도 아이들은 아직 색연필을 들고 돌아다녔다. 창가에서 그림을 마저 그리던 아이는 내가 부르는 줄도 몰랐다.",
  "노래를 틀면 아이들이 제자리로 돌아오곤 한다는 이야기가 떠올랐다. 어제 함께 정한 집중 신호도 있었다. 오늘은 어떤 쪽이 나을까.",
  "“선생님, 노래 끝날 때까지 앉으면 돼요?” 앞자리 아이가 물었다. 나는 급하게 뛰지 말고 천천히 걸어오라고 했다."
],
  choices:[
   {id:'seat_song_use',label:'노래에 맞춰 천천히 제자리로 돌아오는 연습을 한다',delta:{trust:6,agency:6,voice:5,boundary:5,fatigue:1},
    reply:['아이들은 첫 소절을 듣고 웃었다. 뛰지 않고 걸어서 자기 자리에 앉는 연습을 여러 번 했다.','몇 아이는 더 시간이 필요했다. 서두르지 않도록 기다렸다.'],line:'“노래가 끝났다고 아이들을 재촉하지 않아도 되겠어요.”'},
   {id:'seat_song_vote',label:'노래와 어제 정한 신호 중 무엇이 편한지 물어본다',delta:{trust:6,agency:9,voice:6,boundary:3,fatigue:3},
    reply:['우리는 두 방법을 번갈아 써 보기로 했다. 모둠마다 어떤 신호가 더 잘 들리는지도 달랐다.','한 아이가 손을 들고 “우리도 바꿀 수 있어요?” 하고 물었다. 나는 고개를 끄덕였다.'],line:'“아이들 목소리가 있는 약속이면 좋죠.”'},
   {id:'seat_song_simple',label:'음악 대신 짧은 말과 손 신호로 정리한다',delta:{trust:5,agency:5,voice:4,boundary:7,fatigue:0},
    reply:['나는 손을 들고 잠깐 기다렸다. 아이들이 하나둘 제자리로 돌아왔다.','서로 부딪히지 않고 앉을 수 있는지 확인하며 천천히 진행했다.'],line:'“노래를 안 써도 우리 반에 맞으면 괜찮죠.”'}
  ]
 },
 break_clean:{
  day:2,title:'쉬는 시간의 빗자루',place:'화요일 3교시 뒤 · 교실',kind:'gentle',
  prose:[
  "쉬는 시간이 끝날 무렵 교실 바닥에는 색종이 조각들이 흩어져 있었다. 칠판 밑에는 분필 가루가 뽀얗게 쌓였다.",
  "아이들은 운동장에 내려가고 싶어 했다. 나는 빗자루를 들었다가 내려놓았다. 짧게 함께 정리하고 쉬는 시간을 남길 수는 없을까.",
  "한 아이가 내 손을 쳐다봤다. “선생님, 저희가 할까요?” 그 말에 다른 아이들도 고개를 돌렸다."
],
  choices:[
   {id:'clean_rotate',label:'모둠별로 작은 구역을 돌아가며 짧게 정리한다',delta:{trust:6,agency:8,voice:7,boundary:6,fatigue:2},
    reply:['우리는 각 모둠이 맡을 구역을 작게 나누었다. 오래 걸리지 않도록 필요한 일만 정했다.','쉬는 시간을 전부 청소에 쓰지 않았다. 아이들 의견을 들어 구역도 다시 정할 수 있게 했다.'],line:'“하교 뒤에 남기지 않아도 교실을 함께 가꿀 수 있네요.”'},
   {id:'clean_quick',label:'오늘은 바닥과 책상 주변만 짧게 정리한다',delta:{trust:5,agency:5,voice:4,boundary:8,fatigue:1},
    reply:['아이들은 제자리 주변을 먼저 정리했다. 나는 빗자루를 들고 함께 움직였다.','완벽하지는 않아도 오늘 필요한 만큼은 깨끗해졌다.'],line:'“아이들 쉬는 시간도 남겨 줘야죠.”'},
   {id:'clean_discuss',label:'청소 시간과 역할을 학급회의에서 정해 보기로 한다',delta:{trust:6,agency:9,voice:6,boundary:5,fatigue:3},
    reply:['우리는 우선 급한 곳만 정리한 뒤, 정리 시간을 어떻게 운영할지 의견을 적었다.','누구는 모둠별 분담을, 누구는 한 번에 짧게 하자고 했다.'],line:'“매일 하는 일이니 아이들 의견도 들어 봐요.”'}
  ]
 },
 late_guard:{
  day:2,title:'불 꺼진 학교에 남아서',place:'화요일 늦은 저녁 · 학년연구실',kind:'tense',
  prose:[
  "아이들이 돌아간 뒤에도 학년연구실은 환했다. 주안 수정, 활동지 출력, 동의서 확인까지. 파일을 하나 닫으면 다른 파일이 기다리고 있었다.",
  "복도 조명이 하나씩 꺼졌다. 낮에는 발 디딜 틈 없던 복도가 빈 채로 이어져 있었다. 프린터 소리가 유난히 크게 들렸다.",
  "똑똑, 문을 두드리는 소리에 고개를 들었다. 보안업무를 맡은 분이 서 있었다. “선생님, 이제 마무리하셔야 해요.”"
],
  choices:[
   {id:'late_leave',label:'남은 준비를 구분하고 오늘은 바로 퇴근한다',delta:{trust:5,agency:6,voice:5,boundary:10,fatigue:-4},
    reply:['나는 오늘 꼭 끝내야 할 것과 내일 쉬는 시간에 해도 될 일을 나눴다.','컴퓨터를 끄고 경비 담당자에게 고맙다고 인사했다. 어두운 복도를 함께 지나니 마음이 놓였다.'],line:'“선생님도 이제 퇴근하세요. 내일 또 해야죠.”'},
   {id:'late_share',label:'동학년에게 일이 몰렸다고 말하고 내일 함께 나누기로 한다',delta:{trust:8,agency:5,voice:8,boundary:8,fatigue:0},
    reply:['나는 학년 메신저에 밤늦게 답을 요구하지 않는 짧은 메모를 남겼다. 내일 출근해서 함께 확인할 내용이었다.','불 꺼진 학년연구실을 나서며 생각했다. 혼자 오래 남는 일이 성실함의 유일한 증거는 아니었다.'],line:'“내일 업무시간에 같이 보면 됩니다.”'},
   {id:'late_minimum',label:'꼭 필요한 출력만 마무리하고 안전하게 문을 닫는다',delta:{trust:5,agency:4,voice:4,boundary:6,fatigue:3},
    reply:['나는 첫 시간에 꼭 필요한 자료만 출력하고 나머지는 내일로 미뤘다.','경비 담당자에게 먼저 상황을 알리고 정해진 폐쇄 시간 전에 나왔다.'],line:'“다음엔 너무 늦기 전에 정리하고 가세요.”'}
  ]
 },
 gender_duty:{
  day:3,title:'선생님이면 다 할 수 있나요',place:'수요일 쉬는 시간 · 학년연구실',kind:'unsettled',
  prose:[
  "학년연구실에서 행사 준비 이야기가 오갔다. 누군가 웃으며 말했다. “젊은 선생님들은 이런 거 금방 하시잖아요.”",
  "이어 무거운 물건은 남자 선생님들이, 다과는 여자 선생님들이 맡으면 되겠다는 말이 나왔다. 나도 모르게 손에 든 펜을 내려놓았다.",
  "회의실이 잠깐 조용해졌다. 다른 선생님들도 그 말을 들었을 텐데 아무도 먼저 입을 열지 않았다."
],
  choices:[
   {id:'duty_skills',label:'나이와 성별보다 담당 업무와 가능한 시간을 보자고 한다',delta:{trust:7,agency:6,voice:10,boundary:9,fatigue:2},
    reply:['“그 일은 업무분장표에서 담당을 먼저 보고, 할 수 있는 시간을 같이 맞추면 어떨까요?” 내가 말했다.','동학년 선생님들이 서로 이번 주 시간표를 보여 주었다. 생각보다 나눌 방법이 많았다.'],line:'“누가 젊다고 무조건 맡을 일은 아니죠.”'},
   {id:'duty_offer',label:'내가 할 수 있는 일 하나만 정해 돕겠다고 말한다',delta:{trust:6,agency:4,voice:7,boundary:7,fatigue:3},
    reply:['나는 준비물 목록을 확인하는 일은 도울 수 있다고 말했다. 대신 다른 준비까지 모두 맡겠다고 하지는 않았다.','도움은 구체적일수록 서로에게 부담을 덜 남겼다.'],line:'“할 수 있는 걸 분명히 말해 주셔서 좋네요.”'},
   {id:'duty_reopen',label:'관행처럼 굳어진 역할을 학년회의에서 다시 정하자고 한다',delta:{trust:6,agency:6,voice:10,boundary:6,fatigue:5},
    reply:['바로 결론을 내리는 대신 학년회의 안건으로 올렸다. 누가 무엇을 잘하는지보다 일이 어떻게 배정되는지를 먼저 확인하기로 했다.','회의가 하나 늘었지만 다음에는 같은 농담으로 누군가 일을 맡지 않길 바랐다.'],line:'“이번에 한번 정해 놓으면 다음 학기에도 편하겠어요.”'}
  ]
 },
 sport:{
  day:4,title:'목요일 오후의 체육관',place:'목요일 방과 후 · 학년연구실',kind:'bright',
  prose:[
  "목요일 방과 후, 체육관에서 배구를 하자는 이야기가 나왔다. 한 선생님은 벌써 운동화를 갈아 신었고 다른 선생님은 가족에게 전화를 걸고 있었다.",
  "“못하셔도 돼요. 그냥 나오세요.” 누군가 웃으며 말했다. 나는 그 말을 들으며 잠깐 망설였다.",
  "같이 놀고 싶은 마음도 있었다. 하지만 오늘은 퇴근해서 쉬고 싶기도 했다. {colleague}이 내 쪽을 보며 물었다. “선생님은요?”"
],
  choices:[
   {id:'sport_optin',label:'체육 모임은 원하는 사람만 참여하자고 말한다',delta:{trust:8,agency:4,voice:9,boundary:10,fatigue:-1},
    reply:['나는 “오늘은 쉬고 싶은 분도 계실 테니까, 참여는 편하게 정하면 좋겠어요”라고 말했다.','참가한 선생님은 즐겁게 운동했고, 다른 선생님은 눈치 보지 않고 퇴근했다.'],line:'“하고 싶은 사람이 즐겁게 하는 게 제일 좋죠.”'},
   {id:'sport_play',label:'시간이 괜찮아 잠깐 참여하되 끝날 시간은 정한다',delta:{trust:7,agency:4,voice:5,boundary:7,fatigue:1},
    reply:['나는 동료들과 잠깐 배구공을 주고받았다. 서로 서툴러서 몇 번이나 웃음이 났다.','정해 둔 시간이 되자 인사를 하고 먼저 나왔다. 즐거움과 자율성은 함께 있을 수 있었다.'],line:'“다음에도 시간 되시면 같이 해요.”'},
   {id:'sport_other',label:'운동이 어려운 사람도 함께할 다른 모임을 제안한다',delta:{trust:6,agency:5,voice:8,boundary:8,fatigue:0},
    reply:['“운동 말고 점심시간에 차 한 잔 하는 것도 좋겠어요.” 다른 선생님이 고개를 끄덕였다.','서로 친해지는 길은 운동장 하나로 정해져 있지 않았다.'],line:'“맞아요. 운동은 좋아하는 사람끼리 하면 되죠.”'}
  ]
 },
 barbecue:{
  day:5,title:'학교 뒤뜰의 저녁',place:'금요일 방과 후 · 학교 뒤뜰',kind:'bright',
  prose:[
  "금요일 주안을 맞추고 나니 뒤뜰에서 고기 냄새가 났다. 누군가는 종이접시를 놓고 누군가는 집에서 가져온 반찬을 꺼냈다.",
  "“시간 되시면 잠깐 들렀다 가세요.” {colleague}이 손짓했다. 나는 아직 정리하지 못한 책상을 돌아봤다.",
  "이번 주에는 누군가와 제대로 웃을 틈도 없었다. 그렇다고 오늘 꼭 모여야 하는 건 아니었다. 나는 천천히 가방 지퍼를 닫았다."
],
  choices:[
   {id:'bbq_join',label:'잠깐 함께 먹고 이번 주 고생한 이야기를 나눈다',delta:{trust:8,agency:4,voice:5,boundary:8,fatigue:-5},
    reply:['“이번 주 진짜 정신없었죠.” 누군가 한마디 하자 웃음이 터졌다.','학교 이야기는 길지 않았다. 누가 더 힘들었는지 겨루지 않아도 되는 시간이 편했다.'],line:'“다음에도 이렇게 편할 때만 모여요.”'},
   {id:'bbq_help',label:'준비를 조금 돕고 원하는 시간에 먼저 퇴근한다',delta:{trust:8,agency:4,voice:6,boundary:9,fatigue:-3},
    reply:['나는 접시를 나누고 뒷정리를 조금 도왔다. 돌아갈 시간이 되자 편하게 인사했다.','아무도 더 있다 가라고 붙잡지 않았다. 그래서 다음에도 오고 싶어졌다.'],line:'“오늘 와 줘서 고마워요. 조심히 가세요.”'},
   {id:'bbq_rest',label:'초대해 줘서 고맙다고 인사한 뒤 집으로 간다',delta:{trust:6,agency:3,voice:6,boundary:10,fatigue:-8},
    reply:['“오늘은 집에 가서 쉬려고요. 즐겁게 보내세요.” 나는 가볍게 인사했다.','돌아서는데 뒤에서 “다음에 편할 때 오세요”라는 말이 들렸다. 그 말이 오래 따뜻했다.'],line:'“다음에 시간 맞으면 같이 해요.”'}
  ]
 },
 friendship_chair:{
  day:5,title:'친목회장이 된다는 말',place:'금요일 방과 후 · 학년연구실',kind:'tense',
  prose:[
  "금요일 오후, 학년연구실에서 친목회장 이야기가 나왔다. 누군가 내 이름을 불렀다. “이번에는 선생님이 맡으시면 어떨까요?”",
  "회비 정산과 모임 연락, 식당 예약까지 해야 한다는 설명이 이어졌다. 아무도 먼저 맡겠다고 나서지 않았다. 종이 위의 빈칸이 나를 향해 있는 것 같았다.",
  "나는 잠깐 입술을 깨물었다. 함께 밥 먹자는 이야기에서 시작했는데 어느새 퇴근 뒤에 해야 할 일이 늘고 있었다."
],
  choices:[
   {id:'chair_rule',label:'친목회장 선출 절차와 자발적 참여 여부부터 확인한다',delta:{trust:6,agency:5,voice:10,boundary:10,fatigue:3},
    reply:['“저한테 물어보시기 전에 어떻게 뽑는지부터 같이 정하면 좋겠어요.” 내가 말했다.','잠깐 정적이 흘렀다. 그러자 한 선생님이 모임 운영을 정말 원하는 사람이 있는지 먼저 물어보자고 했다.'],line:'“친목이 의무가 되면 즐겁기 어렵죠.”'},
   {id:'chair_share',label:'맡는다면 연락·회계·준비를 나누는 조건을 제안한다',delta:{trust:7,agency:5,voice:8,boundary:7,fatigue:5},
    reply:['나는 혼자서는 맡기 어렵다고 말했다. 준비와 회계, 연락을 나눌 수 있다면 생각해 보겠다고 했다.','한 선생님이 회계를, 다른 선생님이 행사 준비를 돕겠다고 했다. 당장 모든 문제가 해결된 것은 아니었지만 말할 자리가 생겼다.'],line:'“한 사람이 계속 고생하는 모임은 바꿔야죠.”'},
   {id:'chair_decline',label:'정중히 거절하고 공식 업무를 먼저 마무리한다',delta:{trust:5,agency:4,voice:8,boundary:10,fatigue:-4},
    reply:['“지금 맡은 업무와 수업 준비만으로도 벅차서요. 제가 회장을 맡기는 어렵습니다.”','내 말이 모두를 편하게 하지는 못했다. 그래도 동의하지 않은 일을 맡는 것보다 분명히 말하는 쪽을 택했다.'],line:'“괜찮아요. 맡을 사람을 다시 찾아봐야죠.”'}
  ]
 },
 shared_break:{
  day:2,title:'내 교실만 힘든 게 아니었구나',place:'화요일 2교시 뒤 · 학년연구실',kind:'gentle',
  prose:[
  "쉬는 시간 종이 울리자마자 학년연구실로 뛰어왔다. 동의서 취합표를 확인하고 3교시에 쓸 모둠 활동지를 고쳐야 했다. 책상 위에는 아직 따지 못한 생수병이 놓여 있었다.",
  "옆자리 선생님이 내 서류를 보더니 자기 파일을 열었다. “저희 반도 아직 못 받은 게 있어요. 취합표 같이 볼까요?”",
  "우리는 의자를 조금 붙였다. 화면 한쪽에서 다른 사람의 커서가 움직였다. 아주 사소한 일이었는데 긴장이 조금 풀렸다."
],
  choices:[
   {id:'shared_pair',label:'서류 취합과 수업 자료를 서로 확인해 주기로 한다',
     delta:{trust:10,agency:5,voice:5,boundary:7,fatigue:-7},
     reply:['우리는 한 사람은 동의서 취합표를 확인하고, 다른 사람은 모둠 활동 자료를 살폈다. 각자의 담당을 바꾸지 않고 필요한 부분만 도왔다.','짧은 쉬는 시간이었는데도 한숨 돌릴 수 있었다.'],line:'“우리가 조금씩 나눠 하면 되죠. 혼자 다 하지 마세요.”'},
   {id:'shared_ask',label:'막히는 부분 하나를 짚어 도움을 청한다',
     delta:{trust:9,agency:4,voice:8,boundary:8,fatigue:-5},
     reply:['“교외체험학습신청서 확인은 제가 처음이라 그런데, 어디부터 보면 될까요?” 나는 어려운 부분만 물었다.','동료가 학교에서 정한 절차를 알려 줬다. 그다음 일은 내가 할 수 있었다.'],line:'“이런 건 물어보셔도 돼요. 저도 처음엔 그랬어요.”'},
   {id:'shared_thanks',label:'도움은 고맙게 받고 내 전담시간은 수업 준비에 쓴다',
     delta:{trust:7,agency:3,voice:5,boundary:9,fatigue:-6},
     reply:['나는 고맙다고 인사하고 다음 교시에 쓸 자료부터 꺼냈다. 함께 도와준다는 말이 내 시간을 모두 내어 주라는 뜻은 아니었다.','동료도 자기 수업을 준비했다. 서로 바쁜 시간을 건드리지 않는 것 역시 도움이었다.'],line:'“전담시간에는 수업 준비하세요. 급한 건 제가 먼저 볼게요.”'}
  ]
 },
 hostile_break:{
  day:2,title:'학년연구실의 차가운 말',place:'화요일 2교시 뒤 · 학년연구실',kind:'tense',
  prose:[
  "쉬는 시간이 되자 학년연구실로 들어왔다. 주안과 동의서 취합표를 확인하던 중 누군가 내 화면을 보고 말했다. “이런 건 미리 해 놓으셨어야죠.”",
  "어제 받았던 양식과 달라진 부분이 있었다. 수정하면 되는 일이었다. 그런데 이상하게 마우스를 잡은 손에 힘이 들어갔다.",
  "다음 수업까지 몇 분 남지 않았다. 나는 대답을 골라 보다가 결국 화면으로 눈을 돌렸다."
],
  choices:[
   {id:'hostile_confirm',label:'수정할 내용과 기준을 확인하고 수업 뒤에 마무리한다',
     delta:{trust:2,agency:4,voice:8,boundary:8,fatigue:7},
     reply:['“어느 부분을 수정하면 되는지 정확히 알려 주시면 반영하겠습니다. 지금은 수업이 있어서 끝나고 확인할게요.” 나는 짧게 답했다.','상대가 바로 부드러워진 것은 아니었다. 그래도 수업 시간에까지 그 말을 붙들고 있지는 않기로 했다.'],line:'“수정할 부분을 확인했으니 수업 끝나고 봐도 됩니다.”'},
   {id:'hostile_ally',label:'말을 믿고 건넬 수 있는 동학년에게 따로 상의한다',
     delta:{trust:5,agency:4,voice:7,boundary:6,fatigue:5},
     reply:['나는 복도에서 {colleague}에게 상황을 설명했다. 그 사람은 처음부터 대신 해결해 주겠다고 하지 않고, 어떤 말이 오갔는지 물었다.','누구나 나와 같은 편일 필요는 없었다. 그래도 내 말을 온전히 들어 주는 동료가 한 명 있다는 사실이 컸다.'],line:'“같이 기준을 확인해 봐요. 선생님 혼자 잘못한 일은 아닐 수도 있잖아요.”'},
   {id:'hostile_record',label:'업무 내용을 정리해 공식 협의에서 기준을 맞추자고 한다',
     delta:{trust:3,agency:5,voice:10,boundary:9,fatigue:8},
     reply:['나는 파일 버전과 수정 요청 내용을 정리했다. 개인적인 말다툼으로 남기기보다 학년회의에서 양식을 통일하자고 제안할 생각이었다.','회의가 한 번 더 필요해질 수 있었다. 그러나 매번 다른 기준으로 지적받는 일을 줄일 길이기도 했다.'],line:'“누가 잘못했느냐보다 다음에는 어떻게 할지 정해야죠.”'}
  ]
 },
 shared_meeting:{
  day:4,title:'힘들다는 말을 할 수 있는 자리',place:'목요일 방과 후 · 학년회의',kind:'gentle',
  prose:[
  "목요일 학년회의가 끝날 무렵 누군가 작게 말했다. “이번 주는 좀 힘드네요.”",
  "잠깐 정적이 흘렀다. 그러자 다른 선생님도 웃으며 말했다. “저도요. 어제는 주안 올리다 깜빡 잠들 뻔했어요.”",
  "나도 모르게 웃음이 나왔다. 웃고 나서야 내게도 아직 끝내지 못한 일이 있다는 걸 털어놓고 싶어졌다."
],
  choices:[
   {id:'shared_roles',label:'다음 주 준비와 보호자 안내 역할을 나눠 정한다',
     delta:{trust:11,agency:5,voice:7,boundary:8,fatigue:-8},
     reply:['우리는 할 일을 적고 맡을 수 있는 시간을 확인했다. 자기 반 아이들과 보낼 시간이 부족한 선생님에게는 다른 업무를 덜어 주기로 했다.','일이 줄어든 건 아니었다. 다만 일을 혼자 지고 서 있는 사람이 줄었다.'],line:'“각자 하나씩만 해도 생각보다 많이 해결되겠어요.”'},
   {id:'shared_speak',label:'나도 힘들었던 순간을 말하고 도움이 필요한 일을 부탁한다',
     delta:{trust:9,agency:5,voice:10,boundary:7,fatigue:-6},
     reply:['나는 늦은 학교 복도에서 문을 닫으려던 경비 담당자와 마주친 이야기를 꺼냈다. 끝까지 남아야 한다는 생각이 당연했던 건 아니라고 말했다.','여러 선생님이 고개를 끄덕였다. 그 이야기를 하고 나니 혼자서만 못 버티는 것 같던 마음이 조금 가벼워졌다.'],line:'“다음에는 꼭 얘기해요. 혼자 그렇게 오래 남지 말고요.”'},
   {id:'shared_rest',label:'급하지 않은 일은 다음 주로 미루고 회의를 제시간에 끝내자고 한다',
     delta:{trust:7,agency:4,voice:6,boundary:10,fatigue:-9},
     reply:['우리는 오늘 결론이 필요한 것만 정했다. 나머지는 다음 학년회의에 다시 보기로 했다.','회의가 끝난 뒤 {colleague}이 “오늘은 좀 일찍 가세요”라며 웃었다. 그 말이 고마웠다.'],line:'“쉬어야 내일도 아이들 앞에 서죠.”'}
  ]
 },
 hostile_meeting:{
  day:4,title:'회의실에 남은 침묵',place:'목요일 방과 후 · 학년회의',kind:'tense',
  prose:[
  "학년회의에서 다음 주 행사 이야기가 나오자 누군가 내 이름을 불렀다. 내가 준비하기로 정했다는 일이었다. 하지만 나는 처음 듣는 이야기였다.",
  "“다들 바쁜 건 똑같잖아요.” 한 선생님이 덧붙였다. 나는 업무분장표에 적힌 내 이름을 다시 봤다. 그 일은 없었다.",
  "회의실이 조용해졌다. {colleague}이 나를 한번 돌아봤다. 내 목소리가 떨리지 않았으면 좋겠다고 생각했다."
],
  choices:[
   {id:'hostile_meeting_check',label:'업무분장표를 확인하고 합의되지 않은 일임을 차분하게 설명한다',
     delta:{trust:2,agency:6,voice:10,boundary:10,fatigue:8},
     reply:['“그 일은 제가 맡기로 정한 적이 없습니다. 업무분장과 일정부터 같이 확인해 보면 좋겠습니다.”','회의실의 분위기가 곧바로 좋아지지는 않았다. 하지만 적어도 내 동의 없이 일이 정해지는 건 막았다.'],line:'“담당과 협조 범위는 확인하고 정합시다.”'},
   {id:'hostile_meeting_ally',label:'다른 선생님의 의견도 묻고 업무 조정안을 함께 제안한다',
     delta:{trust:5,agency:6,voice:8,boundary:8,fatigue:6},
     reply:['나는 다른 선생님들에게 지금 맡은 일과 가능한 시간을 물었다. {colleague}도 자기 업무를 꺼내 놓았다.','한 사람의 문제가 아니라 정해지지 않은 업무를 모두가 피하고 있다는 사실이 드러났다. 그때부터 논의가 조금 달라졌다.'],line:'“다 같이 바쁘다면, 다 같이 나눌 방법을 정해야죠.”'},
   {id:'hostile_meeting_record',label:'결정 과정과 요청 사항을 정리해 관리자와 다시 협의한다',
     delta:{trust:3,agency:5,voice:9,boundary:10,fatigue:9},
     reply:['나는 회의에서 정해진 것과 아직 협의가 필요한 것을 구분해 기록했다. 공식 담당자에게 확인해야 할 부분도 적었다.','오늘 안에 갈등이 해결되지는 않았다. 하지만 누군가를 탓하는 말보다 책임을 확인하는 절차가 필요했다.'],line:'“이건 개인적으로 떠안을 문제가 아니라 학교에서 조정할 일입니다.”'}
  ]
 }

});
function accepted(world,key){
 const entry=world&&world.numbers&&world.numbers[key];
 return entry&&entry.status==='APPROVED'&&Number.isInteger(entry.referenceYear)&&
   typeof entry.value==='number'&&Number.isFinite(entry.value)&&entry.value>=0?entry:null;
}
function setting(state,world){
 const tags=Array.isArray(world?.geography?.tags)?world.geography.tags:[];
 const rural=tags.some(t=>t&&['rural','admin_eup','admin_myeon','mountain'].includes(t.id)&&
   ['official_geospatial','official_address'].includes(t.source));
 const urban=tags.some(t=>t&&['urban_core','admin_dong','metropolitan_administration'].includes(t.id)&&
   ['official_geospatial','official_address','official_sido'].includes(t.source));
 const count=accepted(world,'students');
 const scale=count?(count.value>600?'large':count.value<=150?'small':'medium'):
   world?.mode==='public_fiction_demo'?(state.profile.fictionalSchoolSize||'medium'):null;
 const locale=world?.mode==='public_fiction_demo'?(state.profile.storyRegion||'other'):
   rural?'rural':urban?'urban':'other';
 return {locale,scale,grade:state.profile.gradeBand||'upper',
   fictionalCulture:state.profile.workCulture||'collaborative',
   realOfficialCount:count?{value:count.value,year:count.referenceYear}:null};
}
function schedule(state,world){
 const w=setting(state,world),d=state.day;
 const days={
   1:[w.locale==='urban'?'parking':null,'arrival','focus'],
   2:[w.grade==='lower'?'seat_song':null,'break_clean',w.fictionalCulture==='collaborative'?'shared_break':w.fictionalCulture==='hostile'?'hostile_break':null,'late_guard'],
   3:[w.locale==='rural'?'wildlife':null,'gender_duty'],
   4:[w.fictionalCulture==='collaborative'?'shared_meeting':w.fictionalCulture==='hostile'?'hostile_meeting':null,'sport'],
   5:[['deflecting','hostile'].includes(w.fictionalCulture)&&w.scale==='large'?'friendship_chair':
       w.fictionalCulture==='collaborative'?'barbecue':null]
 };
 return (days[d]||[]).filter(Boolean);
}
function next(state,world){
 if(!state||state.phase!=='chapter'||!Number.isInteger(state.day))return null;
 const completed=Array.isArray(state.incidentEvents)?state.incidentEvents:[];
 const current=state.incidentReflection;
 if(current&&current.day===state.day){
   const data=INCIDENTS[current.id];
   if(!data)return null;
   return {...data,id:current.id,date:DATES[state.day-1],kind:data.kind,
      paragraphs:data.prose.slice(),choices:data.choices.map(c=>({id:c.id,label:c.label})),
      result:cp(current),fictionLabel:'이 사건은 지역과 가상 교직문화 설정으로 고른 창작 장면이며 실제 발생 사실이 아닙니다.'};
 }
 const id=schedule(state,world).find(id=>!completed.some(x=>x.day===state.day&&x.id===id));
 if(!id)return null;
 const data=INCIDENTS[id];
 const paragraphs=data.prose.slice();
 const scale=setting(state,world);
 if(id==='parking')paragraphs.unshift('도심의 통학로와 주차장을 배경으로 한 가상 사건이다.');
 if(id==='wildlife')paragraphs.unshift('읍·면 또는 농촌 지형 정보를 소재로 만든 가상 사건이며, 실제 야생동물 출현을 뜻하지 않는다.');
 if(id==='friendship_chair'&&scale.scale==='large'&&scale.realOfficialCount)
  paragraphs.unshift(scale.realOfficialCount.year+'년 공개 승인 학생 수는 '+scale.realOfficialCount.value+'명이다. 그러나 학교의 실제 친목회 관행을 알려 주는 자료는 아니며, 아래의 강요 상황은 창작이다.');
 if(id==='gender_duty'&&world?.mode!=='public_fiction_demo'){
  const male=accepted(world,'male_teacher_ratio'),junior=accepted(world,'junior_teacher_ratio');
  const values=[];
  if(male&&male.value<=100)values.push(male.referenceYear+'년 남교사 비율 '+male.value+'%');
  if(junior&&junior.value<=100)values.push(junior.referenceYear+'년 2급 정교사 비율 '+junior.value+'%');
  if(values.length)paragraphs.unshift('학교의 공개 검증된 공식 배경 자료에는 '+values.join(', ')+'가 기록돼 있다. 다만 이 수치가 실제 선생님의 성격이나 비공식 업무 배정을 설명하지는 않는다. 아래 사건은 가상의 상황이다.');
 }
 return {id,day:state.day,date:DATES[state.day-1],title:data.title,place:data.place,
   kind:data.kind,paragraphs,choices:data.choices.map(c=>({id:c.id,label:c.label})),
   result:null,fictionLabel:'이 사건은 지역과 가상 교직문화 설정으로 고른 창작 장면이며 실제 발생 사실이 아닙니다.'};
}
function choose(state,world,id){
 const current=next(state,world);
 if(!current||current.result)throw Error('INCIDENT_CHOICE_PHASE_REQUIRED');
 const choice=INCIDENTS[current.id].choices.find(c=>c.id===id);
 if(!choice)throw Error('INCIDENT_CHOICE_INVALID');
 const result=cp(state);
 for(const [k,v] of Object.entries(choice.delta)){
   if(!Object.prototype.hasOwnProperty.call(result.stats,k))throw Error('UNEXPECTED_STAT');
   result.stats[k]=limit(result.stats[k]+v);
 }
 /* 같은 교실·행사 사건도 교직원 간 지원 여부에 따라 소진의 정도가 달라진다.
  * 이 수치는 체험판 가상 설정의 영향이며 특정 학교의 실제 평가가 아니다. */
 const climate=result.profile.workCulture;
 const impact=climate==='collaborative'?
   {trust:3,fatigue:-3,support:4}:
   climate==='hostile'?{trust:-4,fatigue:4,support:-5}:
   {trust:-2,fatigue:3,support:-3};
 for(const [key,delta] of Object.entries(impact)){
   if(Object.prototype.hasOwnProperty.call(result.stats,key))
     result.stats[key]=limit(result.stats[key]+delta);
 }
 /* 같은 일이어도 도움을 받는 문화인지, 서로 탓하는 문화인지에 따라
    교사가 느끼는 피로와 지지 경험은 달라진다. 가상 게임 지표일 뿐 실제 학교 평가가 아니다. */
 if(['shared_break','shared_meeting','barbecue'].includes(current.id)){
   result.stats.support=limit(result.stats.support+7);
   result.stats.fatigue=limit(result.stats.fatigue-3);
 }
 if(['hostile_break','hostile_meeting','friendship_chair'].includes(current.id)){
   result.stats.support=limit(result.stats.support-7);
   result.stats.fatigue=limit(result.stats.fatigue+5);
 }
 result.incidentEvents=Array.isArray(result.incidentEvents)?result.incidentEvents:[];
 result.incidentEvents.push({day:state.day,id:current.id,choiceId:id});
 const name=result.profile.partner==='man'?'현우 선생님':
  result.profile.partner==='woman'?'지윤 선생님':'동학년 선생님';
 const consequences=choice.reply.map(x=>x.replace(/\{colleague\}/g,name));
 if(climate==='collaborative')
   consequences.push('“다음 준비는 제가 나눠 할게요.” 동료가 먼저 자리를 당겼다. 일이 줄지 않아도 혼자서 버티는 학교는 아니었다.');
 else if(climate==='hostile')
   consequences.push('일보다 서로의 말을 견디는 시간이 더 길었다. 동료를 경계하는 분위기를 혼자 바꿀 수는 없었다.');
 else
   consequences.push('책임을 나누어야 할 때에도 서로 눈치를 보는 분위기가 남았다. 부탁과 떠넘김은 다르다는 생각이 들었다.');
 result.incidentReflection={day:state.day,id:current.id,
   paragraphs:consequences,
   line:choice.line.replace(/\{colleague\}/g,name)};
 return result;
}
function continueStory(state){
 if(!state||state.phase!=='chapter'||!state.incidentReflection||
     state.incidentReflection.day!==state.day)throw Error('INCIDENT_CONTINUE_INVALID');
 const nextState=cp(state);nextState.incidentReflection=null;return nextState;
}
function validate(){
 const ids=Object.keys(INCIDENTS),seen=new Set();
 for(const id of ids){
   const event=INCIDENTS[id];
   if(!event||!Number.isInteger(event.day)||event.day<1||event.day>5||
      !event.title||event.prose.length<2||event.choices.length<3)throw Error('INCIDENT_INVALID_'+id);
   for(const c of event.choices){
     if(!c.id||seen.has(c.id)||!c.label||c.reply.length<2||!c.line)
       throw Error('INCIDENT_CHOICE_INVALID_'+id);
     seen.add(c.id);
   }
 }
 return {events:ids.length,choices:seen.size};
}
const api=Object.freeze({VERSION,INCIDENTS,setting,schedule,next,choose,continueStory,validate});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryIncidents=api;
})(typeof window!=='undefined'?window:globalThis);
