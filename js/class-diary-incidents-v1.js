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
    reply:["“안녕하세요. 오늘도 일찍 나오셨네요.” 배움터지킴이 선생님이 모자 끝을 만지며 웃었다.","나는 아이들 이름을 하나씩 불렀다. 어떤 아이는 대답 대신 손을 흔들었다."],line:"“아침에는 다들 바쁘죠. 그래도 아이들 보면 힘이 나요.”"},
   {id:'hello_children',label:'아이들이 안전하게 등교하는지 잠깐 살핀다',
    delta:{trust:6,agency:7,voice:4,boundary:3,fatigue:3},
    reply:["가방끈이 풀린 아이가 멈춰 섰다. 나는 아이를 사람들 다니지 않는 쪽으로 데리고 가서 끈을 고쳐 맸다.","“선생님, 오늘 모둠 바꿔요?” 아이가 먼저 물었다. 교실까지 걸어가는 동안 질문이 세 개쯤 더 나왔다."],line:"“이 시간엔 다들 정신없어요. 그래도 조심해서 들어가야죠.”"},
   {id:'hello_rush',label:'급한 서류가 떠올라 짧게 인사하고 교실로 간다',
    delta:{trust:3,agency:3,voice:3,boundary:5,fatigue:4},
    reply:["나는 교문 앞에서 짧게 인사하고 계단을 올랐다. 주안과 나이스 화면이 머릿속에 겹쳤다.","교실 문을 열기 직전, 뒤에서 나를 부르는 소리가 들렸다. 아까 교문 앞에 있던 아이였다. 손을 흔드는 얼굴이 밝았다."],line:"“선생님, 내일은 제가 먼저 인사할게요!”"}
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
    reply:["학교에서 조금 떨어진 허용 구역에 차를 대고 걸었다. 횡단보도 신호를 기다리는 아이들이 내 옆에 섰다.","교문에 도착하자 가방끈이 어깨에서 흘러내렸다. 한숨이 났지만 차 사이로 아이를 비켜 가게 하지 않은 건 다행이었다."],line:"“조금 늦으셨네요. 그래도 안전하게 오셔서 다행이에요.”"},
   {id:'parking_raise',label:'등교 시간 차량 동선을 함께 점검하자고 건의한다',delta:{trust:6,agency:5,voice:8,boundary:4,fatigue:5},
    reply:["등교 시간에 차들이 겹치는 지점을 간단히 적어 뒀다. 몇 대가 문제인지보다 아이들이 어디로 걷는지가 먼저 눈에 들어왔다.","{colleague}에게 보여 주자 그 사람도 고개를 끄덕였다. “안전 담당 선생님께 한번 말씀드려요.”"],line:"“시간 날 때 같이 한번 둘러봅시다.”"},
   {id:'parking_adjust',label:'오늘은 안전하게 주차하고 내일부터 출근 방법을 바꾼다',delta:{trust:3,agency:3,voice:3,boundary:7,fatigue:2},
    reply:["오늘은 조금 먼 곳에 차를 대고 걸었다. 내일은 버스 시간을 확인해 볼 생각이었다.","계단을 올라오자 종소리가 들렸다. 나는 숨을 고르면서 출석부를 꺼냈다."],line:"“주차하기 힘들었죠? 저도 아침마다 한 바퀴 돌아요.”"}
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
    reply:["나는 운동장 뒤편으로 가지 말라고 아이들에게 알렸다. 담당자에게 확인하기 전에는 바깥 활동도 잠시 미루기로 했다.","아이들은 아쉬워했지만 곧 교실에서 할 놀이를 찾기 시작했다. 한 아이가 책상 서랍에서 카드 게임을 꺼냈다."],line:"“잘하셨어요. 상황 확인되면 다시 알려드릴게요.”"},
   {id:'wildlife_share',label:'동학년과 학생들에게 안내할 내용을 정한다',delta:{trust:8,agency:5,voice:7,boundary:6,fatigue:4},
    reply:["학년연구실에서 확인된 내용을 먼저 이야기했다. 누군가는 담당자에게 전화하고, 나는 아이들 이동을 살피기로 했다.","{colleague}이 포스트잇에 연락할 사람의 이름을 적어 내게 건넸다. 우리는 그걸 보고 다시 교실로 돌아갔다."],line:"“아이들한테는 확인된 것만 이야기해요.”"},
   {id:'wildlife_listen',label:'아이들의 궁금증을 듣고 실내활동 대안을 정한다',delta:{trust:5,agency:9,voice:6,boundary:3,fatigue:4},
    reply:["“정말 뱀이 있대요?” 아이들의 질문이 이어졌다. 나는 아직 확인한 게 없다고 솔직하게 말했다.","“그럼 오늘 운동장에는 안 나가요?” 한 아이가 묻자 다른 아이가 실내놀이를 제안했다. 나는 칠판에 두 가지를 적었다."],line:"“안전부터 확인하고, 운동장은 나중에 쓰면 되겠네요.”"}
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
    reply:["“어떻게 하면 조용히 모일 수 있을까?” 아이들이 박수와 손 신호를 번갈아 해 봤다. 한 아이는 손을 너무 높이 들어 친구들이 웃었다.","투표가 끝나자 아이들은 스스로 정한 신호를 다시 연습했다. 서툴렀지만 조금씩 맞아 갔다."],line:"“아이들이 직접 고른 거라 그런지 열심이네요.”"},
   {id:'focus_clap',label:'약속의 박수를 먼저 알려 주고 함께 연습한다',delta:{trust:6,agency:5,voice:4,boundary:4,fatigue:0},
    reply:["내가 짧게 박수를 치자 몇 아이만 따라 했다. 두 번째에는 절반, 세 번째에는 거의 모두가 손뼉을 쳤다.","마지막까지 놓친 아이가 멋쩍게 웃었다. 나는 그 아이와 다시 한번 박수를 맞춰 봤다."],line:"“이제 조금 익숙해진 것 같네요.”"},
   {id:'focus_wait',label:'손을 들고 기다리는 신호부터 연습한다',delta:{trust:5,agency:6,voice:3,boundary:6,fatigue:1},
    reply:["나는 한 손을 들어 보였다. 맨 앞의 아이가 따라 했고, 옆 모둠에서도 손이 하나둘 올라왔다.","조금 오래 걸렸다. 하지만 조용해진 순간 아이들 표정을 볼 수 있었다."],line:"“기다려 주니까 아이들도 하나씩 따라오네요.”"}
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
    reply:["노래가 나오자 아이들이 서로를 보고 웃었다. 뛰어가는 아이에게는 걸어서 와도 된다고 손짓했다.","마지막 아이가 자리에 앉자 노래가 끝났다. 그 아이는 조금 뿌듯한 얼굴이었다."],line:"“천천히 해도 괜찮겠어요. 다들 잘 찾네요.”"},
   {id:'seat_song_vote',label:'노래와 어제 정한 신호 중 무엇이 편한지 물어본다',delta:{trust:6,agency:9,voice:6,boundary:3,fatigue:3},
    reply:["“어제 한 손 신호가 좋아, 오늘 노래가 좋아?” 아이들 의견이 반으로 갈렸다.","한 아이가 손을 들었다. “둘 다 써 보면 안 돼요?” 나는 그 말이 마음에 들었다."],line:"“그럼 며칠 써 보고 다시 정해요.”"},
   {id:'seat_song_simple',label:'음악 대신 짧은 말과 손 신호로 정리한다',delta:{trust:5,agency:5,voice:4,boundary:7,fatigue:0},
    reply:["손을 들고 기다리자 아이들이 조금씩 제자리로 돌아왔다. 마지막까지 색연필을 쥐고 있던 아이도 고개를 들었다.","나는 그 아이가 자리에 앉을 때까지 기다렸다. 교실이 천천히 조용해졌다."],line:"“오늘은 손 신호도 잘 통하네요.”"}
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
    reply:["모둠별로 바닥을 나눠 정리했다. 손바닥만 한 구역을 맡자 아이들도 어렵지 않게 시작했다.","몇 분 뒤 빗자루를 세워 놓고 모두 손을 씻었다. 나머지 쉬는 시간은 그대로 남았다."],line:"“아, 이렇게 하면 금방 끝나겠네요.”"},
   {id:'clean_quick',label:'오늘은 바닥과 책상 주변만 짧게 정리한다',delta:{trust:5,agency:5,voice:4,boundary:8,fatigue:1},
    reply:["“오늘은 자기 자리 주변만 치우자.” 아이들이 책상 아래를 들여다봤다.","나는 칠판 밑의 분필 가루를 닦았다. 아이들이 종이 조각을 주워 오는 동안 먼지가 조금 가라앉았다."],line:"“그 정도면 됐어요. 이제 나가서 놀아요.”"},
   {id:'clean_discuss',label:'청소 시간과 역할을 학급회의에서 정해 보기로 한다',delta:{trust:6,agency:9,voice:6,boundary:5,fatigue:3},
    reply:["급한 것만 먼저 치우고 칠판에 질문을 적었다. ‘언제, 누가 정리하면 좋을까?’","한 아이가 “모둠별로 돌아가면서요”라고 말했다. 옆에서는 “하루에 오 분만요”라는 소리가 들렸다."],line:"“다음 학급회의 때 이거 꼭 얘기해 보자.”"}
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
    reply:["정말 오늘 필요한 것만 남기고 컴퓨터를 껐다. 하던 일을 멈추는 데 생각보다 용기가 필요했다.","보안업무 담당자와 함께 불 꺼진 복도를 걸었다. 바깥 공기가 시원했다."],line:"“내일도 오셔야죠. 오늘은 들어가세요.”"},
   {id:'late_share',label:'동학년에게 일이 몰렸다고 말하고 내일 함께 나누기로 한다',delta:{trust:8,agency:5,voice:8,boundary:8,fatigue:0},
    reply:["메신저에 내일 확인할 내용만 적었다. 늦은 시간이라 답장은 받지 않기로 했다.","가방을 들고 나서자 창밖에서 지나가는 차 불빛이 보였다. 혼자 앉아 있던 방이 갑자기 넓게 느껴졌다."],line:"“내일 출근해서 같이 보면 돼요.”"},
   {id:'late_minimum',label:'꼭 필요한 출력만 마무리하고 안전하게 문을 닫는다',delta:{trust:5,agency:4,voice:4,boundary:6,fatigue:3},
    reply:["다음 날 첫 시간에 쓸 자료만 출력했다. 나머지는 파일을 닫고 내일 목록에 적었다.","문을 나서면서 보안업무 담당자에게 고맙다고 인사했다. 문이 닫히는 소리가 복도에 울렸다."],line:"“조심해서 들어가세요. 내일 뵙겠습니다.”"}
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
    reply:["“업무분장표부터 한번 볼까요? 오늘 시간 되시는 분도 확인하고요.” 조용히 말하자 몇 사람이 고개를 들었다.","옆자리 선생님이 자기 시간표를 펼쳤다. 나도 수업이 비는 시간을 손가락으로 짚었다."],line:"“맞아요. 먼저 할 수 있는 분들끼리 이야기해 봅시다.”"},
   {id:'duty_offer',label:'내가 할 수 있는 일 하나만 정해 돕겠다고 말한다',delta:{trust:6,agency:4,voice:7,boundary:7,fatigue:3},
    reply:["준비물 목록을 확인하는 일은 내가 도울 수 있다고 했다. 그다음 일까지 모두 맡겠다는 말은 하지 않았다.","상대는 고맙다고 했다. 나는 그 말에 가볍게 고개를 끄덕이고 내 교실로 돌아갔다."],line:"“목록만 봐주셔도 큰 도움이 돼요.”"},
   {id:'duty_reopen',label:'관행처럼 굳어진 역할을 학년회의에서 다시 정하자고 한다',delta:{trust:6,agency:6,voice:10,boundary:6,fatigue:5},
    reply:["“이건 다음 학년회의에서 같이 정하면 좋겠습니다.” 말하고 나니 정적이 흘렀다.","그러자 한 선생님이 “그게 낫겠네요”라며 수첩을 꺼냈다. 나는 조금 늦게 펜을 들었다."],line:"“다음 주 안건에 적어 둘게요.”"}
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
    reply:["“오늘 쉬고 싶은 분들도 계시니까, 참석은 편하게 정해요.” 내가 먼저 말했다.","운동화를 신던 선생님이 고개를 끄덕였다. 다른 선생님은 미안한 표정을 지우고 가방을 멨다."],line:"“그러죠. 다음에 시간 되시면 오세요.”"},
   {id:'sport_play',label:'시간이 괜찮아 잠깐 참여하되 끝날 시간은 정한다',delta:{trust:7,agency:4,voice:5,boundary:7,fatigue:1},
    reply:["체육관에 들어서자 공이 내 쪽으로 날아왔다. 나는 서툴게 받았고, 공은 예상 밖의 방향으로 튀었다.","한바탕 웃고 나서야 몸이 풀렸다. 정해 둔 시간이 되자 먼저 인사하고 나왔다."],line:"“오늘 재밌었어요. 다음에 또 봬요.”"},
   {id:'sport_other',label:'운동이 어려운 사람도 함께할 다른 모임을 제안한다',delta:{trust:6,agency:5,voice:8,boundary:8,fatigue:0},
    reply:["“운동 말고 점심시간에 차 마시는 것도 괜찮겠네요.” 내가 말하자 누군가 웃었다.","“그건 저도 할 수 있어요.” 멀리 앉아 있던 선생님이 손을 들었다. 분위기가 조금 풀렸다."],line:"“그럼 운동은 운동대로, 차는 차대로 하죠.”"}
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
    reply:["뒤뜰에 내려가자 {colleague}이 종이접시를 건넸다. “배고프셨죠?”","나는 빈 의자에 앉았다. 고기 굽는 소리와 웃음소리가 뒤섞였다. 오늘은 주안 얘기를 하지 않아도 됐다."],line:"“다음엔 이렇게 편할 때 또 봐요.”"},
   {id:'bbq_help',label:'준비를 조금 돕고 원하는 시간에 먼저 퇴근한다',delta:{trust:8,agency:4,voice:6,boundary:9,fatigue:-3},
    reply:["나는 빈 접시를 옮기고 집게를 씻었다. 내 앞에 서 있던 {colleague}도 옆에서 그릇을 챙겼다.","“저 이제 가 볼게요.” 인사하자 누군가 더 먹고 가라고 했지만 말투가 아쉽다는 정도였다."],line:"“와 주셔서 고마워요. 조심히 들어가세요.”"},
   {id:'bbq_rest',label:'초대해 줘서 고맙다고 인사한 뒤 집으로 간다',delta:{trust:6,agency:3,voice:6,boundary:10,fatigue:-8},
    reply:["“저는 오늘 좀 쉬려고요. 맛있게 드세요.” 나는 가방을 고쳐 메고 손을 흔들었다.","뒤에서 고기 굽는 냄새가 따라왔다. 교문을 나서자 바람이 조금 차가웠다."],line:"“네, 월요일에 봬요. 푹 쉬세요.”"}
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
    reply:["“제가 맡는 걸로 이미 정해진 건가요?” 말이 나오고 나서야 목이 조금 타는 걸 느꼈다.","맨 끝에 앉은 선생님이 회칙을 찾아보자고 했다. 모두의 시선이 잠깐 종이 쪽으로 옮겨 갔다."],line:"“일단 정해진 절차부터 확인해 봅시다.”"},
   {id:'chair_share',label:'맡는다면 연락·회계·준비를 나누는 조건을 제안한다',delta:{trust:7,agency:5,voice:8,boundary:7,fatigue:5},
    reply:["“제가 맡는다면 회비나 행사 준비는 같이 나눠 주실 수 있을까요?”","회계는 한 선생님이, 연락은 다른 선생님이 맡아 보겠다고 했다. 나는 적을 곳을 찾다가 비어 있던 종이를 꺼냈다."],line:"“그렇게 나누면 덜 부담스럽겠네요.”"},
   {id:'chair_decline',label:'정중히 거절하고 공식 업무를 먼저 마무리한다',delta:{trust:5,agency:4,voice:8,boundary:10,fatigue:-4},
    reply:["“죄송하지만 지금은 맡기가 어려울 것 같아요.” 나는 한 번 더 천천히 말했다.","누군가는 아쉽다는 얼굴이었다. 그래도 아무 말 없이 맡아 버리는 것보다는 이쪽이 나았다."],line:"“알겠습니다. 다른 방법을 생각해 봐요.”"}
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
     reply:["취합표를 두 창으로 띄우고 각자 맡은 반의 동의서를 확인했다. {colleague}이 빠진 항목에 동그라미를 쳤다.","짧은 쉬는 시간이 끝나 갈 무렵, 나는 프린터 앞에서 그 사람과 눈이 마주쳤다. 둘 다 피곤한 얼굴로 웃었다."],line:"“그거 제가 다시 한번 볼게요. 먼저 수업 들어가세요.”"},
   {id:'shared_ask',label:'막히는 부분 하나를 짚어 도움을 청한다',
     delta:{trust:9,agency:4,voice:8,boundary:8,fatigue:-5},
     reply:["“교외체험학습신청서가 처음이라서요. 이 부분만 한번 봐주실래요?” 나는 모니터를 옆으로 돌렸다.","{colleague}이 학교에서 안내한 절차를 짚어 줬다. 모르던 부분이 생각보다 빨리 풀렸다."],line:"“괜찮아요. 저도 처음엔 몇 번씩 물어봤어요.”"},
   {id:'shared_thanks',label:'도움은 고맙게 받고 내 전담시간은 수업 준비에 쓴다',
     delta:{trust:7,agency:3,voice:5,boundary:9,fatigue:-6},
     reply:["나는 고맙다고 인사하고 활동지 파일을 다시 열었다. 맞은편에서도 키보드 소리가 들렸다.","창밖 운동장에서는 아이들이 뛰어가고 있었다. 서류가 조금 줄어들자 그제야 그 소리가 들렸다."],line:"“전담시간이면 준비부터 하세요. 제가 지금 해둘게요.”"}
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
     reply:["“수정해야 할 곳을 알려 주시면 반영하겠습니다. 지금은 수업이 있어서요.” 나는 모니터 쪽으로 눈을 돌렸다.","아직 뒤에서 누군가 뭔가를 말하고 있었다. 나는 종이컵을 들고 교실로 돌아왔다."],line:"“끝나고 같이 확인하죠. 수업 먼저 다녀오세요.”"},
   {id:'hostile_ally',label:'말을 믿고 건넬 수 있는 동학년에게 따로 상의한다',
     delta:{trust:5,agency:4,voice:7,boundary:6,fatigue:5},
     reply:["복도에서 {colleague}을 만나 아까 일을 이야기했다. 그 사람은 바로 판단하지 않고 어떤 말을 들었는지부터 물었다.","이야기하는 동안 3교시 예비종이 울렸다. {colleague}이 먼저 교실 쪽을 가리켰다."],line:"“수업 끝나고 같이 확인해 봐요. 지금은 들어가셔야죠.”"},
   {id:'hostile_record',label:'업무 내용을 정리해 공식 협의에서 기준을 맞추자고 한다',
     delta:{trust:3,agency:5,voice:10,boundary:9,fatigue:8},
     reply:["파일을 다시 열어 수정해야 할 부분에 표시했다. 어제 받은 양식과 다른 곳도 따로 적었다.","다음 학년회의에서 같이 확인해 보자고 말할 문장을 머릿속으로 몇 번이나 고쳤다."],line:"“그렇게 정리해 두면 다음엔 덜 헷갈리겠어요.”"}
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
     reply:["우리는 다음 주 주안을 펴 놓고 가능한 시간을 서로 물었다. {colleague}이 내 시간표에 동그라미를 하나 쳤다.","회의가 끝나고 나서야 물 한 모금을 마셨다. 컵은 미지근했지만 목이 시원했다."],line:"“이 정도면 다음 주엔 좀 낫겠어요.”"},
   {id:'shared_speak',label:'나도 힘들었던 순간을 말하고 도움이 필요한 일을 부탁한다',
     delta:{trust:9,agency:5,voice:10,boundary:7,fatigue:-6},
     reply:["“저도 화요일엔 늦게까지 남아 있었어요.” 말을 꺼내자 옆자리 선생님이 고개를 들었다.","“그랬어요? 다음에는 얘기해 주세요.” 나는 고개를 끄덕였다. 그 말만으로도 얼굴이 조금 풀렸다."],line:"“그런 날엔 꼭 연락해요. 같이 생각해 봐요.”"},
   {id:'shared_rest',label:'급하지 않은 일은 다음 주로 미루고 회의를 제시간에 끝내자고 한다',
     delta:{trust:7,agency:4,voice:6,boundary:10,fatigue:-9},
     reply:["“오늘 꼭 정할 것만 먼저 정할까요?” 내가 말하자 몇 사람이 웃었다. 모두 시계를 보고 있었던 모양이었다.","남은 안건은 다음 주로 넘겼다. {colleague}이 내 가방을 보고 물었다. “오늘은 바로 가세요?”"],line:"“그럼 같이 나가요. 저도 퇴근하려던 참이에요.”"}
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
     reply:["“그 일은 제가 맡기로 한 적이 없어서요. 업무분장부터 확인해 보면 좋겠습니다.” 나는 자료를 천천히 펼쳤다.","한 선생님이 펜을 멈췄다. 당장 대답은 나오지 않았지만 적어도 이제는 함께 자료를 보고 있었다."],line:"“담당부터 확인하고 결정하는 게 맞겠네요.”"},
   {id:'hostile_meeting_ally',label:'다른 선생님의 의견도 묻고 업무 조정안을 함께 제안한다',
     delta:{trust:5,agency:6,voice:8,boundary:8,fatigue:6},
     reply:["나는 옆자리 선생님에게 이번 주 시간이 어떤지 물었다. 그 사람이 달력을 펼치자 다른 선생님도 말을 보탰다.","{colleague}이 내 쪽으로 메모지를 밀었다. 거기엔 ‘담당 확인’이라는 짧은 글씨가 있었다."],line:"“그럼 다음 학년회의 때 다시 한번 맞춰 봐요.”"},
   {id:'hostile_meeting_record',label:'결정 과정과 요청 사항을 정리해 관리자와 다시 협의한다',
     delta:{trust:3,agency:5,voice:9,boundary:10,fatigue:9},
     reply:["회의록에 이미 정해진 일과 아직 정하지 않은 일을 따로 적었다. 기록을 남기는 손이 조금 떨렸다.","회의가 끝나고 {colleague}이 문밖에서 나를 기다렸다. “괜찮아요?” 나는 바로 대답하지 못했다."],line:"“이 부분은 관리자하고도 한번 이야기해야겠어요.”"}
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
   const partner=state.profile.partner==='man'?'현우 선생님':
     state.profile.partner==='woman'?'지윤 선생님':'민서 선생님';
   return {...data,id:current.id,date:DATES[state.day-1],kind:data.kind,
      paragraphs:data.prose.map(p=>p.replace(/\{colleague\}/g,partner)),choices:data.choices.map(c=>({id:c.id,label:c.label})),
      result:cp(current),fictionLabel:'이 사건은 지역과 가상 교직문화 설정으로 고른 창작 장면이며 실제 발생 사실이 아닙니다.'};
 }
 const id=schedule(state,world).find(id=>!completed.some(x=>x.day===state.day&&x.id===id));
 if(!id)return null;
 const data=INCIDENTS[id];
 const partner=state.profile.partner==='man'?'현우 선생님':
   state.profile.partner==='woman'?'지윤 선생님':'민서 선생님';
 const paragraphs=data.prose.map(p=>p.replace(/\{colleague\}/g,partner));
 // Data provenance belongs outside the fictional scene; never introduce survey
 // diagnostics or risk attribution into the narrator's first-person prose.
 const fictionNote=id==='friendship_chair'?
  '허구 장면 · 실제 친목회 관행을 알려 주는 자료는 아니며 실제 사건도 아닙니다.':
  id==='wildlife'?'허구 장면 · 실제 야생동물 출현을 뜻하지 않습니다.':
  id==='gender_duty'?'허구 장면 · 교사 구성 비율로 개인의 업무를 판단하지 않습니다.':
  '허구 장면 · 실제 학교의 사건이나 교직원 언행을 재현한 것이 아닙니다.';
 return {id,day:state.day,date:DATES[state.day-1],title:data.title,place:data.place,
   kind:data.kind,paragraphs,choices:data.choices.map(c=>({id:c.id,label:c.label})),
   result:null,fictionLabel:fictionNote};
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
  result.profile.partner==='woman'?'지윤 선생님':'민서 선생님';
 const consequences=choice.reply.map(x=>x.replace(/\{colleague\}/g,name));
 if(climate==='collaborative')
   consequences.push('“이거 제가 봐 둘게요.” '+name+'이 의자를 내 옆으로 당겨 왔다. 나는 고개를 끄덕였다.');
 else if(climate==='hostile')
   consequences.push('교실로 돌아와 문을 닫고서야 어깨에 힘이 잔뜩 들어가 있었다는 걸 알았다. 한동안 창밖만 바라봤다.');
 else
   consequences.push('학년연구실 문 앞에서 한 번 더 돌아봤다. 다음에는 할 말을 미리 생각해 두어야 할 것 같았다.');
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
