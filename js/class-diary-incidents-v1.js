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
   '교문에서 학교보안관 선생님이 먼저 인사를 건넸다. “안녕하세요, 선생님. 오늘도 바쁘시겠어요.” 나는 출근 가방을 고쳐 메고 고개를 숙였다.',
   '작은 가방을 멘 아이들이 하나둘 교문을 통과했다. 겨우 내내 보지 못했던 것처럼 조그만 아이들. 이렇게 작은 아이들이 어디에 숨어 있다가 매일 아침 쏟아져 나오는 걸까.',
   '교실 문을 열자 주안, 개인정보 동의서, 나이스 출결, 모둠 자리표가 눈앞에 겹쳤다. 몇 년 차 교사든 학기 초 일주일은 정신이 없었다.'
  ],
  choices:[
   {id:'hello_guard',label:'보안관 선생님께 인사하고 등교하는 아이들을 맞는다',
    delta:{trust:5,agency:5,voice:3,boundary:4,fatigue:2},
    reply:['“안녕하세요. 아침마다 고생 많으세요.” 보안관 선생님이 모자를 바로 쓰며 웃었다.','나는 아이들 이름을 하나씩 불러 주었다. 빨리 교실로 가라는 말 대신 오늘도 왔느냐는 인사를 하고 싶었다.'],line:'“이 시간이 제일 정신없지만 아이들 얼굴 보는 재미가 있죠.”'},
   {id:'hello_children',label:'아이들이 안전하게 교문을 통과하는지 함께 살핀다',
    delta:{trust:6,agency:7,voice:4,boundary:3,fatigue:3},
    reply:['가방끈이 풀린 아이가 멈춰 섰다. 나는 인도 쪽으로 데려가 가방을 고쳐 멜 시간을 주었다.','그 아이가 “선생님, 오늘 모둠 바꿔요?” 하고 물었다. 첫날부터 아이들 마음에는 궁금한 일이 많았다.'],line:'“교문 앞이 바쁠수록 천천히 보고 보내야 해요.”'},
   {id:'hello_rush',label:'급한 서류를 생각하며 인사만 하고 교실로 올라간다',
    delta:{trust:3,agency:3,voice:3,boundary:5,fatigue:4},
    reply:['나는 보안관 선생님께 손을 흔들고 계단을 서둘러 올랐다. 주안을 확인하고 나이스를 열어야 했다.','복도 끝에 다다라서야 아까 교문에 있던 작은 아이 하나가 손을 흔들었다는 걸 떠올렸다. 내일은 먼저 인사해야지.'],line:'“선생님, 아침부터 바쁘시네요. 그래도 인사는 나누고 가요.”'}
  ]
 },
 parking:{
  day:1,title:'빈자리가 없는 주차장',place:'월요일 출근길 · 학교 앞',kind:'unsettled',
  prose:[
   '교문 앞 도로에 출근 차량이 줄을 섰다. 가상 이야기 속 이 학교는 주차 공간이 넉넉하지 않았다. 아이들을 태운 차까지 겹치니 차를 돌릴 틈도 마땅치 않았다.',
   '나는 주차할 수 있는 곳을 다시 찾아야 했다. 늦게 올까 봐 조급했지만, 교문 앞 통행을 막으면서까지 자리를 차지할 수는 없었다.'
  ],
  choices:[
   {id:'parking_walk',label:'허용된 곳에 주차하고 통학로를 따라 걸어온다',delta:{trust:5,agency:5,voice:4,boundary:5,fatigue:4},
    reply:['조금 먼 곳에 차를 대고 걸었다. 횡단보도에서는 등교하는 아이들과 신호를 기다렸다.','학년연구실에 도착하니 숨이 찼다. 그래도 통학로를 막지 않은 게 다행이었다.'],line:'“주차장이 좁아도 아이들 다니는 길은 비워 둬야죠.”'},
   {id:'parking_raise',label:'등교 차량과 교직원 주차 동선의 문제를 협의하자고 제안한다',delta:{trust:6,agency:5,voice:8,boundary:4,fatigue:5},
    reply:['나는 어느 시간에 어느 구간이 막히는지 적었다. 단순히 주차 공간을 늘려 달라는 말보다 학생 안전까지 함께 이야기하고 싶었다.','학교의 동선은 한 사람의 출근 시간만 바꾼다고 해결되지 않았다.'],line:'“안전 담당 선생님하고 같이 살펴봅시다.”'},
   {id:'parking_adjust',label:'다음 날 출근 방법을 바꾸고 오늘은 교실로 서두른다',delta:{trust:3,agency:3,voice:3,boundary:7,fatigue:2},
    reply:['나는 허용된 곳에 차를 대고 빠른 걸음으로 교실에 들어왔다. 내일은 다른 방법을 찾아볼 생각이었다.','그래도 이 불편을 혼자 감수하는 것이 당연한지, 언젠가는 묻고 싶었다.'],line:'“오늘은 먼저 수업하고, 주차 문제는 따로 얘기해요.”'}
  ]
 },
 wildlife:{
  day:3,title:'운동장 뒤편의 제보',place:'수요일 점심 직전 · 학년연구실',kind:'tense',
  prose:[
   '학교 주변 길에서 뱀을 봤다는 주민 제보가 들어왔다. 이 이야기의 장면은 농촌 지역을 배경으로 한 허구이며, 실제 학교에서 일어난 일이 아니다.',
   '아이들은 다음 시간에 운동장으로 나갈 생각으로 체육복을 챙겼다. 한 아이는 “진짜 뱀이 있으면 보고 싶어요”라고 말했다.',
   '나는 확인되지 않은 말을 사실처럼 전하지 않으면서도 아이들의 출입과 이동 동선을 먼저 챙겨야 한다고 생각했다.'
  ],
  choices:[
   {id:'wildlife_route',label:'접근을 막고 담당자와 안전한 동선을 확인한다',delta:{trust:7,agency:6,voice:5,boundary:6,fatigue:3},
    reply:['나는 아이들이 제보 장소로 가지 않도록 안내했다. 학교 담당자와 상황을 확인하기 전까지 바깥활동을 조정하기로 했다.','모둠별로 교실에서 할 수 있는 협동 놀이를 골랐다.'],line:'“선생님들이 직접 잡으러 가는 건 아니에요. 안전부터 확인해요.”'},
   {id:'wildlife_share',label:'학년과 학생 안전 안내를 함께 정한다',delta:{trust:8,agency:5,voice:7,boundary:6,fatigue:4},
    reply:['동학년 선생님과 상황을 나누고 학생을 맡을 사람과 담당자에게 연락할 사람을 구분했다.','확인된 사실만 안내하기로 하니 공연한 소문도 조금 가라앉았다.'],line:'“이런 일일수록 역할을 나눠야죠.”'},
   {id:'wildlife_listen',label:'아이들의 궁금증을 듣고 실내활동 대안을 정한다',delta:{trust:5,agency:9,voice:6,boundary:3,fatigue:4},
    reply:['“나가면 위험할 수 있으니 오늘은 확인하고 결정하자.” 나는 아이들의 물음에 아는 것과 모르는 것을 나눠 답했다.','아이들은 모둠별로 대체 활동을 고르기 시작했다.'],line:'“안전하게 바꾸는 이유를 말해 주니 아이들도 이해하네요.”'}
  ]
 },
 focus:{
  day:1,title:'우리 반의 첫 번째 신호',place:'월요일 1교시 · 교실',kind:'gentle',
  prose:[
   '아직 이름도 다 익히지 못한 아이들이 모둠 자리를 찾느라 분주했다. 한 아이가 친구에게 말을 걸자 다른 아이가 일어나서 돌아봤다.',
   '나는 소리를 높이는 대신 아이들이 함께 사용할 집중 신호를 만들고 싶었다. 교사가 혼자 정하는 것도 한 방법이지만, 익숙해질 때까지 연습할 시간도 필요했다.'
  ],
  choices:[
   {id:'focus_vote',label:'약속의 박수와 손 신호를 해 보고 아이들과 고른다',delta:{trust:6,agency:9,voice:7,boundary:3,fatigue:3},
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
   '쉬는 시간이 끝났는데도 아이들이 색연필을 쥔 채 모둠 자리를 돌아다녔다. 나는 어제 정한 집중 신호를 떠올렸다.',
   '저학년 교실에서는 ‘모두 제자리’라고 부르는 노래를 틀고 각자 자기 자리에 돌아오도록 연습하기도 한다. 이 장면에서 노래는 가사 없이 언급만 하고, 실제 음원은 재생하지 않는다.',
   '앞자리 아이가 물었다. “선생님, 노래 끝나기 전에 앉으면 돼요?” 나는 앉는 속도보다 서로 부딪히지 않는 게 먼저라고 말했다.'
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
   '방과 후에 아이들을 오래 남겨 두기 어려운 날이었다. 아이들을 제시간에 보내면서 교실도 정리하려면 쉬는 시간 일부를 활용해야 했다.',
   '모둠 바닥에는 종이 조각이 떨어져 있었고, 칠판 밑에는 지우개 가루가 쌓였다. 아이들은 쉬는 시간에 놀고 싶은 마음도 컸다.',
   '나는 누가 매번 힘든 일을 맡지 않도록, 그리고 청소가 쉬는 시간 전체를 빼앗지 않도록 방법을 정해야 했다.'
  ],
  choices:[
   {id:'clean_rotate',label:'모둠별로 작은 구역을 돌아가며 짧게 정리한다',delta:{trust:6,agency:8,voice:7,boundary:6,fatigue:2},
    reply:['우리는 각 모둠이 맡을 구역을 작게 나누었다. 오래 걸리지 않도록 필요한 일만 정했다.','쉬는 시간을 전부 청소에 쓰지 않았다. 아이들 의견을 들어 구역도 다시 정할 수 있게 했다.'],line:'“하교 뒤에 남기지 않아도 교실을 함께 가꿀 수 있네요.”'},
   {id:'clean_quick',label:'오늘은 바닥과 책상 주변만 짧게 정리한다',delta:{trust:5,agency:5,voice:4,boundary:8,fatigue:1},
    reply:['아이들은 제자리 주변을 먼저 정리했다. 나는 빗자루를 들고 함께 움직였다.','완벽하지는 않아도 오늘 필요한 만큼은 깨끗해졌다.'],line:'“아이들 쉬는 시간도 남겨 줘야죠.”'},
   {id:'clean_discuss',label:'언제 어떤 청소를 할지 학급회의 안건으로 남긴다',delta:{trust:6,agency:9,voice:6,boundary:5,fatigue:3},
    reply:['우리는 우선 급한 곳만 정리한 뒤, 정리 시간을 어떻게 운영할지 의견을 적었다.','누구는 모둠별 분담을, 누구는 한 번에 짧게 하자고 했다.'],line:'“매일 하는 일이니 아이들 의견도 들어 봐요.”'}
  ]
 },
 late_guard:{
  day:2,title:'불 꺼진 학교에 남아서',place:'화요일 늦은 저녁 · 학년연구실',kind:'tense',
  prose:[
   '아이들을 모두 보내고도 주안 수정과 다음 날 활동지, 동의서 취합 확인이 남았다. 평소에는 쉬는 시간에 준비하지만 오늘은 여러 일이 한꺼번에 겹쳤다. 경력과 상관없이 학기 초 첫 주에는 이런 날이 있었다.',
   '복도에서 조명이 하나씩 꺼졌다. 낮에는 아이들 소리로 가득했던 건물이 텅 비자, 어른인 나도 조금 무서웠다. 멀리서 발걸음 소리가 들릴 때는 괜히 고개를 들었다.',
   '문을 두드리는 소리에 어깨가 움찔했다. “선생님, 이제 문 닫아야 해요.” 학교 경비를 보는 분이었다. 나는 아직 남은 화면을 바라봤다.'
  ],
  choices:[
   {id:'late_leave',label:'남은 준비를 구분하고 오늘은 바로 퇴근한다',delta:{trust:5,agency:6,voice:5,boundary:10,fatigue:-4},
    reply:['나는 오늘 꼭 끝내야 할 것과 내일 쉬는 시간에 해도 될 일을 나눴다.','컴퓨터를 끄고 경비 담당자에게 고맙다고 인사했다. 어두운 복도를 함께 지나니 마음이 놓였다.'],line:'“선생님도 이제 퇴근하세요. 내일 또 해야죠.”'},
   {id:'late_share',label:'동학년에게 업무가 몰린 상황을 알리고 다음 날 나누자고 한다',delta:{trust:8,agency:5,voice:8,boundary:8,fatigue:0},
    reply:['나는 학년 메신저에 밤늦게 답을 요구하지 않는 짧은 메모를 남겼다. 내일 출근해서 함께 확인할 내용이었다.','불 꺼진 학년연구실을 나서며 생각했다. 혼자 오래 남는 일이 성실함의 유일한 증거는 아니었다.'],line:'“내일 업무시간에 같이 보면 됩니다.”'},
   {id:'late_minimum',label:'꼭 필요한 출력만 마무리하고 안전하게 문을 닫는다',delta:{trust:5,agency:4,voice:4,boundary:6,fatigue:3},
    reply:['나는 첫 시간에 꼭 필요한 자료만 출력하고 나머지는 내일로 미뤘다.','경비 담당자에게 먼저 상황을 알리고 정해진 폐쇄 시간 전에 나왔다.'],line:'“다음엔 너무 늦기 전에 정리하고 가세요.”'}
  ]
 },
 gender_duty:{
  day:3,title:'선생님이면 다 할 수 있나요',place:'수요일 쉬는 시간 · 학년연구실',kind:'unsettled',
  prose:[
   '학년연구실에서 새 학기 행사 준비 이야기가 나왔다. 누군가 농담처럼 말했다. “젊은 선생님이 이런 건 빨리하시잖아요.” 곧이어 성별에 따라 힘쓰는 일과 꾸미는 일을 나눠 보자는 말도 들렸다.',
   '학년의 교원 구성과 2급 정교사 비율은 학교에 따라 달라도, 그 수치가 누가 어떤 일을 맡아야 하는지 정해 주지는 않는다.',
   '나는 이 말을 불편해하는 사람이 나뿐인지 살폈다. 누군가를 탓하기보다 기준을 바꾸는 말을 할 수 있을까.'
  ],
  choices:[
   {id:'duty_skills',label:'성별·나이 대신 담당 업무와 가능한 시간을 확인하자고 한다',delta:{trust:7,agency:6,voice:10,boundary:9,fatigue:2},
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
   '교직원 체육활동에 대한 이야기가 나왔다. 누군가는 배구를 즐겼고, 누군가는 운동보다 쉬는 시간을 원했다. 참석해도 되는 모임과 참석하지 않으면 눈치 보이는 모임은 같은 이름을 달고도 전혀 달랐다.',
   '한 선생님이 말했다. “운동 잘하는 선생님만 나오면 재미없잖아요. 못해도 괜찮아요.” 다른 선생님은 방과 후에 가족을 만나러 가야 했다.',
   '나는 동료들과 가까워지고 싶은 마음과 내 퇴근 시간을 지키고 싶은 마음을 함께 가지고 있었다.'
  ],
  choices:[
   {id:'sport_optin',label:'참여와 불참을 편하게 선택할 수 있도록 제안한다',delta:{trust:8,agency:4,voice:9,boundary:10,fatigue:-1},
    reply:['나는 “오늘은 쉬고 싶은 분도 계실 테니까, 참여는 편하게 정하면 좋겠어요”라고 말했다.','참가한 선생님은 즐겁게 운동했고, 다른 선생님은 눈치 보지 않고 퇴근했다.'],line:'“하고 싶은 사람이 즐겁게 하는 게 제일 좋죠.”'},
   {id:'sport_play',label:'시간이 괜찮아 잠깐 참여하되 끝날 시간은 정한다',delta:{trust:7,agency:4,voice:5,boundary:7,fatigue:1},
    reply:['나는 동료들과 잠깐 배구공을 주고받았다. 서로 서툴러서 몇 번이나 웃음이 났다.','정해 둔 시간이 되자 인사를 하고 먼저 나왔다. 즐거움과 자율성은 함께 있을 수 있었다.'],line:'“다음에도 시간 되시면 같이 해요.”'},
   {id:'sport_other',label:'체육보다 다른 방식으로 친해질 기회를 제안한다',delta:{trust:6,agency:5,voice:8,boundary:8,fatigue:0},
    reply:['“운동 말고 점심시간에 차 한 잔 하는 것도 좋겠어요.” 다른 선생님이 고개를 끄덕였다.','서로 친해지는 길은 운동장 하나로 정해져 있지 않았다.'],line:'“맞아요. 운동은 좋아하는 사람끼리 하면 되죠.”'}
  ]
 },
 barbecue:{
  day:5,title:'학교 뒤뜰의 저녁',place:'금요일 방과 후 · 학교 뒤뜰',kind:'bright',
  prose:[
   '금요일 주안을 맞추고 나니, 동학년 선생님이 손짓했다. “뒤뜰에 잠깐 들르실래요? 오늘은 고기 좀 구우려고요.”',
   '선생님들이 각자 준비한 음식을 조금씩 꺼냈다. 누군가는 불을 보고, 누군가는 접시를 놓았다. 참여하지 못하는 사람에게 이유를 묻지 않는 분위기였다.',
   '이번 주의 서류와 회의가 잠시 잊혔다. 나는 이 즐거움이 마음 편히 거절할 수 있기 때문에 더 오래 남는다는 생각을 했다.'
  ],
  choices:[
   {id:'bbq_join',label:'잠깐 함께 먹고 이번 주 고생한 이야기를 나눈다',delta:{trust:8,agency:4,voice:5,boundary:8,fatigue:-5},
    reply:['“이번 주 진짜 정신없었죠.” 누군가 한마디 하자 웃음이 터졌다.','학교 이야기는 길지 않았다. 누가 더 힘들었는지 겨루지 않아도 되는 시간이 편했다.'],line:'“다음에도 이렇게 편할 때만 모여요.”'},
   {id:'bbq_help',label:'준비를 조금 돕고 원하는 시간에 먼저 퇴근한다',delta:{trust:8,agency:4,voice:6,boundary:9,fatigue:-3},
    reply:['나는 접시를 나누고 뒷정리를 조금 도왔다. 돌아갈 시간이 되자 편하게 인사했다.','아무도 더 있다 가라고 붙잡지 않았다. 그래서 다음에도 오고 싶어졌다.'],line:'“오늘 와 줘서 고마워요. 조심히 가세요.”'},
   {id:'bbq_rest',label:'감사히 인사하고 오늘은 쉬러 가기로 한다',delta:{trust:6,agency:3,voice:6,boundary:10,fatigue:-8},
    reply:['“오늘은 집에 가서 쉬려고요. 즐겁게 보내세요.” 나는 가볍게 인사했다.','돌아서는데 뒤에서 “다음에 편할 때 오세요”라는 말이 들렸다. 그 말이 오래 따뜻했다.'],line:'“다음에 시간 맞으면 같이 해요.”'}
  ]
 },
 friendship_chair:{
  day:5,title:'친목회장이 된다는 말',place:'금요일 방과 후 · 학년연구실',kind:'tense',
  prose:[
   '업무를 정리하던 금요일, 친목회 운영 이야기가 나왔다. 많은 교직원이 있는 가상의 학교였다. 누군가 말했다. “이번에는 저경력 선생님이 친목회장 맡으면 되겠네요.”',
   '회계와 모임 연락, 음식 주문, 요구사항 조정까지 해야 한다는 설명이 이어졌다. 본래 업무분장표에 없던 일이었다. 하지만 아무도 먼저 거절하지 않는 분위기에서 한 사람의 이름이 적히기 시작했다.',
   '나는 친해지는 일이 어째서 또 하나의 업무가 되는지 생각했다. 함께하는 모임이 좋아도, 운영을 한 사람에게 떠넘기면 그 사람의 금요일은 길어질 수밖에 없었다.'
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
   '쉬는 시간 종이 울리자마자 나는 학년연구실로 들어갔다. 아침에 걷은 개인정보 동의서가 제대로 들어왔는지 확인하고, 3교시 모둠 활동지를 손봐야 했다. 물 한 잔 마실 틈도 없었다.',
   '옆자리 선생님이 내 책상 위 서류를 보더니 자기 주안 파일을 열었다. “저희 반도 동의서 아직 다 못 걷었어요. 취합표 같이 맞출까요?” 누구 하나가 특별히 여유로운 것도 아니었다.',
   '할 일은 그대로였다. 그런데 둘이서 종이를 나눠 보니 오늘을 버틸 만하겠다는 생각이 들었다. 함께 일한다는 게 거창한 일은 아니었다.'
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
   '쉬는 시간이 되자 급히 학년연구실로 들어왔다. 주안과 동의서 취합표를 한꺼번에 확인하던 참이었다. 그때 누군가 내가 올린 파일을 보고 말했다. “이런 건 미리 해 놓으셔야죠.”',
   '어제 알려 준 양식과 다른 부분이 있었다. 수정할 수 있는 일이었지만 말투 때문에 마음이 먼저 움츠러들었다. 한 선생님은 아무 말 없이 자기 컴퓨터만 바라봤다.',
   '수업 시작까지 몇 분 남지 않았다. 실수를 고치는 일과 다른 사람의 면박까지 감당하는 일은 같지 않았다. 이곳에서는 어려운 일이 생겨도 편하게 물어볼 수 있을까.'
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
   '학년회의 마지막 안건은 다음 주 행사 준비였다. 주안을 맞추고 보호자 연락까지 마친 선생님들은 모두 피곤해 보였다. 누군가 말했다. “이번 주 좀 버거웠어요.”',
   '아무도 그 선생님에게 요령이 없다고 하지 않았다. 다른 사람도 자기가 놓친 일을 말하기 시작했다. 회의록에는 잘한 일보다 도울 일이 더 많이 적혔다.',
   '내게도 버거운 일이 있었다. 이 학교에서는 잘 못 하고 있다는 고백이 곧 흠이 되지는 않을 것 같았다.'
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
   '학년회의에서 행사 준비 이야기가 나오자 한 선생님이 내 이름을 말했다. 내가 맡기로 했다는 일이었다. 하지만 그런 이야기를 나눈 기억이 없었다.',
   '“다들 바쁜 건 똑같아요.” 누군가 덧붙였다. 말은 맞았지만 그 말로 누가 어떤 일을 맡아야 하는지가 정해지는 건 아니었다. 회의실이 조용해졌다.',
   '같은 교직원인데도 서로를 믿지 못하면 일이 두 배로 힘들어졌다. 나는 아이들 앞에서는 경청을 말하면서 정작 이 자리에서는 내 말 한마디가 왜 이렇게 어려운지 생각했다.'
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
   2:[w.grade==='lower'?'seat_song':null,'break_clean',w.fictionalCulture==='collaborative'?'shared_break':'hostile_break','late_guard'],
   3:[w.locale==='rural'?'wildlife':null,'gender_duty'],
   4:[w.fictionalCulture==='collaborative'?'shared_meeting':'hostile_meeting','sport'],
   5:[w.fictionalCulture==='deflecting'&&w.scale==='large'?'friendship_chair':
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
 result.incidentEvents=Array.isArray(result.incidentEvents)?result.incidentEvents:[];
 result.incidentEvents.push({day:state.day,id:current.id,choiceId:id});
 const name=result.profile.partner==='man'?'현우 선생님':
  result.profile.partner==='woman'?'지윤 선생님':'동학년 선생님';
 result.incidentReflection={day:state.day,id:current.id,
   paragraphs:choice.reply.map(x=>x.replace(/\{colleague\}/g,name)),
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
