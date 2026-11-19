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
const STATS=['affection','trust','agency','fatigue'];
const CHAPTERS=[
{
 title:'종이 끝에서 시작된 일',
 place:'교무실 · 첫 출근의 아침',
 prose:[
  '복합기 앞에는 다른 사람의 이름이 적힌 서류들이 쌓여 있었다. 나는 맨 위의 종이를 들어 올렸다가 다시 내려놓았다. 이 학교에 온 지 겨우 몇 시간이었다.',
  '“그 종이는 아직 주인이 없어요.” {colleague}이 웃었다. 동학년 교사라고 자신을 소개한 사람이었다. 웃는 얼굴은 편했지만, 말끝에는 오래 일해 본 사람만 아는 피로가 조금 묻어 있었다.',
  '그러는 동안 교실에서는 아이들이 의자를 밀고 있었다. 내 이름을 처음 부르게 될 아이들. 그 아이들 앞에 서기 전에, 먼저 이 종이에 적힌 일의 주인을 정해야 했다.'
 ],
 choices:[
  {id:'ask',label:'담당을 함께 확인하자고 제안한다',delta:{affection:4,trust:7,agency:3,fatigue:-3},
   response:['“일단 같이 확인해요.” 내가 말했다. {colleague}은 서류를 둘로 나누더니 빈칸에 연필로 물음표를 하나 그렸다.','물음표가 있어서 다행이라고 생각했다. 아무것도 모른다는 사실을 숨기지 않아도 되었으니까.'],
   line:'“물어볼 수 있는 사람이 있다는 게, 생각보다 큰 일이네요.”'},
  {id:'carry',label:'일단 내가 해보겠다며 서류를 챙긴다',delta:{affection:1,trust:0,agency:0,fatigue:9},
   response:['나는 서류를 가방 위에 올려놓았다. 할 수 있을 것 같지는 않았지만, 할 수 없다는 말을 먼저 꺼내고 싶지 않았다.','{colleague}이 잠시 내 손을 보더니 “모르는 건 내일 물어보셔도 돼요”라고 말했다. 친절은 종종 늦게야 그 무게를 드러냈다.'],
   line:'“꼭 혼자 끝내지 않아도 됩니다.”'},
  {id:'share',label:'서류를 내려놓고 서로의 첫날 이야기를 듣는다',delta:{affection:8,trust:4,agency:1,fatigue:-2},
   response:['우리는 복합기 옆에서 잠깐 이야기를 나누었다. 어디서 왔는지, 어떤 아이들과 지냈는지. 대답보다 묻는 시간이 조금 더 길었다.','긴 이야기는 아니었다. 그렇지만 교실 문을 열 때 내 어깨가 아까보다 조금 가벼웠다.'],
   line:'“다음에는 차 한 잔 마시면서 이야기해요.”'}
 ]
},
{
 title:'말하지 않은 세 사람',
 place:'학년 협의실 · 점심시간이 지난 뒤',
 prose:[
  '학년 협의회가 끝날 무렵, 회의록에는 ‘전원 동의’라는 네 글자가 적혔다. 그런데 나는 아직 한 번도 말하지 않은 선생님들의 얼굴을 기억하고 있었다.',
  '새 학기 공동 규칙을 결정하는 일이었다. 교실의 생활을 맞추자는 취지에는 고개가 끄덕여졌다. 다만 아이들에게도 설명하지 않은 규칙을, 아이들과 함께 지킨다고 부를 수 있을까.',
  '{colleague}이 물통 뚜껑을 닫았다. “말씀하실 게 있으면 지금 하셔도 돼요.” 그 목소리가 유난히 조용해서, 나는 도리어 말을 꺼낼 수 있을 것 같았다.'
 ],
 choices:[
  {id:'reopen',label:'학생 의견을 듣고 다시 논의하자고 제안한다',delta:{affection:5,trust:8,agency:9,fatigue:2},
   response:['나는 회의록의 한 줄을 가리켰다. 결정이 늦어져도 괜찮겠느냐고 물었다. 한 선생님이 고개를 들었다.','{colleague}이 ‘다음 회의 안건’이라고 적었다. 그 한 줄 덕분에, 오늘의 동의가 내일도 같은 뜻일 필요는 없어졌다.'],
   line:'“바꾸기로 한 약속도 약속이지요.”'},
  {id:'private',label:'회의 뒤에 조용히 의견을 전한다',delta:{affection:6,trust:4,agency:4,fatigue:-1},
   response:['회의실 문이 닫힌 뒤 나는 {colleague}에게 먼저 말했다. 모두 앞에서 말할 용기는 없었다고.','{colleague}은 그 사정을 먼저 인정했다. 그리고 다음 회의에서 함께 문제를 꺼내 보자고 했다.'],
   line:'“어떤 말은 둘이서 시작해도 괜찮아요.”'},
  {id:'follow',label:'이번에는 기존 규칙을 따른다',delta:{affection:0,trust:1,agency:-3,fatigue:-4},
   response:['나는 회의록을 다시 읽고 그대로 서명했다. 정해진 일을 시작하는 데에는 편안함이 있었다.','다만 교실로 돌아가는 계단에서, 조금 전 말하지 못한 문장이 자꾸만 입안에 남았다.'],
   line:'“나중에 고쳐도 되니, 잊지만 말아요.”'}
 ]
},
{
 title:'아이들의 순서',
 place:'교실 · 세 번째 종례',
 prose:[
  '급식 줄 맨 끝에 서 있던 아이가 물었다. “왜 우리는 매번 번호대로 서야 해요?” 질문은 날카롭지 않았다. 어른이 정한 순서가 궁금한 얼굴이었다.',
  '종례 직전이었다. 칠판 앞에 서서 하루를 마무리할 준비를 하다가, 나는 분필을 내려놓았다. 줄서기는 작은 문제였다. 그러나 작은 문제에서도 누군가의 자리는 정해졌다.',
  '교실 문밖으로 {colleague}이 지나갔다. 나를 발견하고 잠깐 멈추더니, 아이들의 대화를 방해하지 않으려고 문에서 한 걸음 물러났다.'
 ],
 choices:[
  {id:'council',label:'아이들이 제안·토론·시행·재검토하게 한다',delta:{affection:5,trust:7,agency:11,fatigue:4},
   response:['아이들은 뜻밖에도 차례를 정하는 일보다, 왜 그렇게 정해야 하는지를 오래 이야기했다. 나는 반대하는 말도 칠판에 똑같은 크기로 적었다.','수업이 조금 늦어졌다. 그래도 돌아가는 아이들의 발걸음에는 자기 말이 남겨진 사람의 기분이 있었다.'],
   line:'“오늘 아이들은 줄서기보다 더 큰 걸 배웠네요.”'},
  {id:'trial',label:'일주일 동안 두 가지 방식을 시험해 본다',delta:{affection:4,trust:6,agency:7,fatigue:1},
   response:['아이들은 손을 들어 두 가지 방법을 고르고, 서로 다른 날에 적용해 보기로 했다. 누가 더 빨리 먹는지도 지켜보기로 했다.','{colleague}은 다음 날 아이들이 무엇을 발견하는지 알려 달라고 했다. 어른도 궁금해할 수 있는 문제가 생겼다.'],
   line:'“직접 해보면 생각이 달라질 수도 있겠어요.”'},
  {id:'explain',label:'지금의 순서가 정해진 이유부터 설명한다',delta:{affection:2,trust:3,agency:2,fatigue:-2},
   response:['나는 안전과 혼잡을 이야기했다. 아이들은 고개를 끄덕였지만, 모두 납득한 얼굴은 아니었다.','교실을 나가기 전에 한 아이가 다시 물었다. “그럼 나중에는 바꿀 수 있어요?” 나는 그 질문을 다음 날의 숙제로 남겼다.'],
   line:'“설명하고 나면, 다음 질문이 나오기도 하죠.”'}
 ]
},
{
 title:'문턱에 선 말',
 place:'상담실 앞 · 목요일 오후',
 prose:[
  '학생 사이에 오해가 생겼다. 누가 먼저 시작했는지는 아이들마다 달랐다. 한 보호자에게서 연락이 왔고, 나는 작은 메모장에 들은 말을 순서대로 적었다.',
  '메모장에는 아직 판단을 적지 않았다. 너무 빨리 결론을 내리면, 결론에 들어가지 못한 아이가 남는다는 것을 나는 알고 있었다.',
  '상담실 앞에 선 {colleague}이 물었다. “함께 들어갈까요?” 그 말은 해결해 주겠다는 약속이 아니었다. 혼자 들어가지는 않아도 된다는 뜻이었다.'
 ],
 choices:[
  {id:'together',label:'관련 교직원과 확인 절차를 함께 정한다',delta:{affection:6,trust:9,agency:6,fatigue:-4},
   response:['나는 함께 들어가 달라고 부탁했다. 우리는 서로 다른 이야기를 급히 하나로 만들지 않기로 했다.','대화는 생각보다 오래 걸렸지만, 문을 나설 때 누구도 쉽게 지워지지 않았다. {colleague}은 옆에서 메모장을 내밀어 주었다.'],
   line:'“누구의 말도 혼자 감당하지 않으셔도 돼요.”'},
  {id:'listen',label:'당사자들의 말을 충분히 들을 시간을 먼저 만든다',delta:{affection:4,trust:6,agency:8,fatigue:2},
   response:['나는 한 번에 모든 문제를 해결할 수 없다는 사실부터 인정했다. 아이들은 서로의 말을 곧장 받아들이지는 않았지만, 적어도 중간에 끊지는 않았다.','{colleague}이 종이를 접어 주었다. 그 안에는 앞으로 확인할 일들이 적혀 있었다.'],
   line:'“서둘러 끝내지 않아서 다행이에요.”'},
  {id:'alone',label:'먼저 혼자 대응한 뒤 필요하면 도움을 청한다',delta:{affection:1,trust:0,agency:2,fatigue:10},
   response:['나는 문손잡이를 잡고 들어갔다. 누구에게도 폐를 끼치고 싶지 않았다. 그러나 대화를 마치고 나자, 무엇을 혼자 정해선 안 되는지 분명해졌다.','복도로 나오니 {colleague}이 아직 있었다. 나는 한참 늦게 도움을 부탁했다. 그 부탁 역시 한 가지 선택이었다.'],
   line:'“이제부터는 같이 보죠.”'}
 ]
},
{
 title:'금요일의 초대',
 place:'교무실 · 불을 끄기 전',
 prose:[
  '일주일이 끝나 갈 무렵, 교무실 책상마다 저마다 다른 속도의 저녁이 도착했다. 누군가는 집으로 갈 가방을 싸고, 누군가는 남은 일을 들여다보았다.',
  '함께 식사하자는 이야기가 나왔다. 거절해도 된다는 말은 쉽게 할 수 있었다. 거절한 사람이 정말 편안할지는 그다음의 문제였다.',
  '{colleague}은 내게 선택을 맡겼다. “오늘은 어떠세요?” 무슨 뜻이냐고 되묻지 않아도 알 수 있는 조심스러운 물음이었다.'
 ],
 choices:[
  {id:'invite',label:'퇴근 뒤 짧은 산책을 제안한다',delta:{affection:9,trust:5,agency:3,fatigue:-2},
   response:['“사람들 다 모인 자리 말고, 잠깐 걸으실래요?” 묻고 나서야 내 말이 조금 특별하게 들렸다.','{colleague}은 잠깐 생각하더니 그러자고 했다. 둘은 다른 사람들에게 각자의 계획을 짧게 알리고 학교를 나섰다.'],
   line:'“저도 오늘은 조용히 걷고 싶었어요.”'},
  {id:'choice',label:'누구나 편하게 거절할 수 있도록 이야기한다',delta:{affection:5,trust:8,agency:7,fatigue:-1},
   response:['나는 모임을 좋아하지 않는 사람이 있어서가 아니라, 다른 계획도 같은 무게로 존중받으면 좋겠다고 말했다.','몇 사람이 웃으며 손을 흔들었다. {colleague}은 돌아서다 말고 “그 말, 고마웠어요”라고 했다.'],
   line:'“누군가의 퇴근도 지켜 주는 말이었어요.”'},
  {id:'rest',label:'오늘은 쉬고 싶다고 말한 뒤 집으로 간다',delta:{affection:3,trust:4,agency:4,fatigue:-7},
   response:['나는 내 계획을 부끄러워하지 않기로 했다. 집에서 저녁을 먹고 쉬겠다고 말했다. {colleague}은 당연하다는 듯 고개를 끄덕였다.','돌아가는 길에 휴대전화가 울렸다. ‘이번 주 고생 많으셨어요.’ 짧은 인사가 늦은 저녁에 도착했다.'],
   line:'“쉬는 것도 우리한테 필요한 일이니까요.”'}
 ]
},
{
 title:'교문 밖의 오후',
 place:'토요일 · 학교에서 조금 떨어진 동네',
 prose:[
  '토요일에는 출근할 일이 없었다. 나는 동네를 걷다가 작은 서점 앞에서 걸음을 멈췄다. 문 옆에는 새로 들어온 책 목록이 손글씨로 붙어 있었다.',
  '어제 헤어질 때 {colleague}이 추천했던 작가의 이름이 보였다. 학교에서 시작된 대화가 교문 밖에서도 이어질 수 있다는 사실이 신기했다.',
  '휴대전화에는 약속이 없는 오후가 그대로 남아 있었다. 나는 누군가를 만나도, 만나지 않아도 괜찮은 자유를 잠깐 누렸다.'
 ],
 choices:[
  {id:'coffee',label:'부담 없는 시간에 차를 마실지 물어본다',delta:{affection:8,trust:6,agency:2,fatigue:-3},
   response:['나는 거절해도 괜찮다는 말을 덧붙여 메시지를 보냈다. 답장은 빠르지 않았다. 그래서 오히려 내 마음도 조용해졌다.','한참 뒤 {colleague}에게서 가까운 찻집에 잠깐 들를 수 있겠다는 답이 왔다. 둘은 누가 먼저 말했는지 따지지 않고 비슷한 속도로 걸었다.'],
   line:'“학교 이야기 말고, 좋아하는 책 이야기부터 할까요?”'},
  {id:'letter',label:'짧은 감사 메시지만 보내고 각자의 시간을 지킨다',delta:{affection:5,trust:7,agency:3,fatigue:-6},
   response:['나는 ‘이번 주 함께해 주셔서 고마웠어요’라고 적었다. 학교에서 해결하지 못한 일은 굳이 붙이지 않았다.','{colleague}에게서 책 표지 한 장과 함께 ‘좋은 주말 보내세요’라는 답이 왔다. 그 정도의 거리가 오늘은 좋았다.'],
   line:'“다음 주에 뵈어요.”'},
  {id:'offline',label:'연락을 미루고 온전히 혼자 쉰다',delta:{affection:1,trust:2,agency:5,fatigue:-10},
   response:['나는 휴대전화를 뒤집어 놓고 책장을 넘겼다. 사람과 가까워지는 데에도 휴식이 필요하다고 생각했다.','토요일 오후는 아무 사건도 일어나지 않은 덕분에 오래 기억될 것 같았다.'],
   line:'“각자의 주말이 있어도, 관계는 계속되니까요.”'}
 ]
},
{
 title:'남겨 두는 문장',
 place:'일요일 밤 · 집의 작은 책상',
 prose:[
  '일요일에는 다음 날의 학교가 어렴풋이 떠올랐다. 나는 수첩을 펼쳐 첫날 복합기 앞에서 했던 말을 다시 읽었다. 그때의 나는 아직 아무것도 몰랐다.',
  '수첩 한쪽에는 아이들의 질문이 적혀 있었다. 그 옆에는 {colleague}이 했던 말들이 있었다. 어느 쪽도 다른 쪽을 대신할 수는 없었다.',
  '나는 일주일의 제목을 적기로 했다. 잘한 일을 나열하기보다, 다음 주에도 지키고 싶은 것 하나를 정해 두고 싶었다.'
 ],
 choices:[
  {id:'promise',label:'아이들의 목소리와 동료의 신뢰를 함께 지키겠다고 적는다',delta:{affection:7,trust:9,agency:9,fatigue:-2},
   response:['나는 ‘아이들 앞에서 서두르지 않기’라고 적고, 그 아래에 ‘도움을 부탁하기’라고 덧붙였다.','한 문장이 다음 학기를 바꾸지는 못할 것이다. 그러나 한 문장 때문에 내일의 말 한마디가 달라질 수는 있었다.'],
   line:'“서로의 이야기를 듣는 날이 많아졌으면 좋겠어요.”'},
  {id:'thanks',label:'함께한 동료에게 마음을 담아 감사 인사를 보낸다',delta:{affection:10,trust:7,agency:4,fatigue:-2},
   response:['나는 몇 번이나 문장을 고쳐 썼다. 좋아한다는 말보다, 함께해서 좋았다는 말이 지금의 내 마음을 더 정확하게 담을 것 같았다.','{colleague}에게서 답장이 왔다. 무척 긴 말은 아니었다. 하지만 문장 끝의 온도가 오래 남았다.'],
   line:'“저도요. 다음 주에도 같이 걸어요.”'},
  {id:'quiet',label:'무리한 약속 대신 꾸준히 해낼 작은 일 하나를 적는다',delta:{affection:3,trust:5,agency:7,fatigue:-7},
   response:['나는 수첩 맨 아래 ‘오늘의 아이를 내일도 한 사람으로 보기’라고 적었다. 누구에게도 보여 주지 않을 문장이었다.','창밖이 어두워졌다. 내일이 오기 전에 잠들 수 있다면, 그것만으로도 좋은 출발일 것 같았다.'],
   line:'“작은 약속도 오래 지키면 큰일이 되지요.”'}
 ]
}
];
const ENDINGS=Object.freeze({
 warm:{title:'나의 다정한 학급일지',heading:'서로에게 닿는 마음',
  prose:['월요일에는 말을 고르는 데 오래 걸렸다. 일요일이 되자 말하지 않아도 알 수 있는 것들이 조금 생겼다.','{colleague}과 나는 서로에게 서두르지 않기로 했다. 그것은 무심함이 아니라, 서로의 시간을 존중하며 가까워지는 방법이었다.','아이들이 내일 아침 교실에 오면 또 새로운 질문을 할 것이다. 나는 그 질문들을, 혼자가 아닌 사람의 마음으로 맞이할 수 있을 것 같았다.']},
 parallel:{title:'나의 나란한 학급일지',heading:'같은 방향을 바라보며',
  prose:['우리는 모든 일에 같은 생각을 하지 않았다. 대신 생각이 다른 날에도 서로의 말을 끝까지 들어 주었다.','{colleague}은 나와 나란히 걸었다. 가까운 거리보다 중요한 것은 방향을 잃었을 때 다시 묻는 일이었다.','학교의 일주일은 끝났지만 함께 고민할 일은 남았다. 그 사실이 이제는 두렵지만은 않았다.']},
 steady:{title:'나의 단단한 학급일지',heading:'지키기로 한 것들',
  prose:['흔들리지 않는 사람은 없었다. 다만 흔들리는 와중에도 어떤 약속은 지킬 수 있었다.','나는 내일의 교실에 아이들의 질문이 들어올 자리를 남겨 두기로 했다. {colleague}도 자기 자리에서 같은 일을 하겠다고 했다.','우리가 만든 일주일은 크고 근사하지 않았다. 그런데 이상하게도 오래 버틸 수 있을 것 같았다.']},
 tender:{title:'나의 조심스러운 학급일지',heading:'서두르지 않는 사이',
  prose:['마음이 가까워지는 날에도 우리는 서로를 다 알 수 없었다. 모른다는 사실을 인정하는 편이 더 다정할 때가 있었다.','{colleague}에게 보낼 다음 메시지를 지우고 다시 적었다. 내일 학교에서 만나도, 만나지 못해도 괜찮은 문장이었다.','창문을 닫으며 생각했다. 관계에도, 교실에도, 조금 늦게 도착해야 보이는 것이 있다고.']},
 ordinary:{title:'나의 서툰 학급일지',heading:'고쳐 쓸 수 있는 일주일',
  prose:['잘해 낸 날보다 마음에 걸리는 날이 더 오래 기억났다. 나는 수첩에서 몇 줄을 고쳤다.','{colleague}과 마음이 맞지 않았던 순간도 있었다. 그러나 그 순간 때문에 다른 장면이 사라지는 것은 아니었다.','새 학기란 원래 완성되지 않은 채 시작되는 것인지도 몰랐다. 내일의 교실에는 다시 쓸 수 있는 종이가 남아 있었다.']}
});
function validateProfile(profile){
  if(!profile||typeof profile!=='object')throw Error('PROFILE_REQUIRED');
  const age=Number(profile.age),gender=profile.gender,partner=profile.partner,mbti=profile.mbti;
  if(!Number.isInteger(age)||age<20||age>75)throw Error('ADULT_AGE_REQUIRED');
  if(!['woman','man','undisclosed'].includes(gender))throw Error('GENDER_INVALID');
  if(!['woman','man','none'].includes(partner))throw Error('PARTNER_INVALID');
  if(!MBTI.test(mbti))throw Error('MBTI_INVALID');
  return {age,gender,partner,mbti};
}
function partnerName(profile){return profile.partner==='man'?'현우 선생님':profile.partner==='woman'?'지윤 선생님':'동학년 선생님';}
function validateWorld(world,plan){
  if(!world||world.eligible!==true||!world.basic||
     !/^[A-Z0-9]{7}$/.test(String(world.basic.id||''))||
     !Array.isArray(world.publishedYears))throw Error('APPROVED_WORLD_REQUIRED');
  // The demo is an explicit, fictional-only offline world. It cannot stand in for a real school.
  const demo=world.mode==='public_fiction_demo'&&world.basic.id==='DEMO001'&&
    world.publishedYears.length===0&&world.basic.name==='가상의 초등학교';
  if(!demo&&!world.publishedYears.length)throw Error('APPROVED_WORLD_REQUIRED');
  if(world.mode==='public_fiction_demo'&&!demo)throw Error('DEMO_WORLD_INVALID');
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
    stats:{affection:35,trust:42,agency:42,fatigue:35},
    lastOutcome:null,ending:null
  };
}
function atmosphere(world,day){
  const scale=world&&world.basic?world.basic.scale:null;
  if(day===1){
    if(scale==='small')return '학교는 한눈에 들어올 듯 아담했다. 하지만 이곳에서 보내게 될 시간의 무게까지 작은 것은 아니었다.';
    if(scale==='medium')return '복도를 돌아 나오자 다시 복도가 이어졌다. 학교는 익숙한 듯하면서도 아직 지도를 펼쳐야 하는 곳 같았다.';
    if(scale==='large')return '긴 복도 너머에서 여러 교실의 소리가 겹쳐 들렸다. 많은 사람이 같은 시간표를 살지만, 하루의 무게는 저마다 달랐다.';
    return '학교의 규모는 아직 손에 잡히지 않았다. 첫날의 교실은 숫자로 헤아릴 수 없는 크기로 다가왔다.';
  }
  if(day===3){
    const kind=world&&world.categories&&world.categories.meal_place;
    if(kind&&kind.status==='APPROVED')return '점심시간의 풍경은 예전 공개 자료를 참고해 상상한 것이었다. 실제 올해의 운영 방식은 이야기와 다를 수 있다.';
  }
  if(day===6){
    const tags=world&&world.geography&&world.geography.tags||[];
    if(tags.some(t=>t.id==='admin_eup'))return '학교 주소에는 읍이라는 글자가 있었다. 나는 그 글자 뒤에 있을 평범한 누군가의 토요일을 상상했다.';
    if(tags.some(t=>t.id==='admin_myeon'))return '학교 주소에는 면이라는 글자가 있었다. 주말의 풍경을 섣불리 떠올릴 수는 없었지만, 사람들의 쉼은 어디서나 필요했다.';
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
  const atmosphereLine=atmosphere(world,state.day);
  if(atmosphereLine)p.unshift(atmosphereLine);
  /* 주인공 성별은 편견이나 결과 점수에 관여하지 않는다. 나이와 유형은 독백만 바꾼다. */
  if(state.day===1){
    p.unshift('나는 올해 '+state.profile.age+'살이었다. 학교의 첫날은 나이에 상관없이 언제나 조금 낯설었다.');
  }
  if(state.day===2){
    p.unshift(state.profile.mbti[0]==='I'?
      '생각이 모일 때까지 잠시 기다렸다. 입 밖으로 내는 말은 종이 위의 문장과 달리 지울 수 없었다.':
      '말을 건네야 생각도 제 모양을 갖출 것 같았다. 그래도 다른 사람의 말을 먼저 듣기로 했다.');
  }
  if(state.day===5){
    p.unshift(state.profile.gender==='undisclosed'?
      '내가 어떤 사람인지는 누구나 한마디로 정할 수 없는 일이었다. 오늘은 내 이름보다 내 선택이 존중받기를 바랐다.':
      '나의 성별과 나이가 해야 할 일을 미리 결정해 주지는 않았다. 나는 오늘 저녁도 스스로 선택하고 싶었다.');
  }
  if(state.day===6){
    p.unshift(state.profile.mbti[3]==='J'?
      '계획대로 흘러가는 하루가 반가울 때도 있었다. 그러나 오늘은 빈 시간 한 칸을 남겨 두고 싶었다.':
      '아무 계획 없는 오후의 속도가 좋았다. 정하지 않은 시간 속에서도 마음은 조금씩 길을 찾았다.');
  }
  /* 승인된 과거 집계의 문장도 가상 장면으로만 사용하며 최다선택 원문은 표시하지 않는다. */
  if(seed.basis==='approved_historical_aggregate')p.unshift('오래전 공개된 조사에서 떠올린 장면 하나가 문득 겹쳤다. '+seed.passage);
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
  for(const key of STATS)next.stats[key]=clamp(next.stats[key]+Number(found.delta[key]||0));
  next.history.push({day:next.day,choiceId:id});
  next.lastOutcome={id,paragraphs:found.response.map(s=>replace(s,name)),line:replace(found.line,name)};
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
      score:clamp((next.stats.affection*0.55)+(next.stats.trust*0.20)+(next.stats.agency*0.25))
    };
  }else{next.day+=1;next.phase='chapter';}
  return next;
}
function validateStory(){
  if(CHAPTERS.length!==7||DAYS.length!==7)throw Error('SEVEN_DAYS_REQUIRED');
  for(let i=0;i<7;i++){
    const chapter=CHAPTERS[i],ids=new Set();
    if(!chapter.title||!chapter.place||chapter.prose.length<3||chapter.choices.length<3)
      throw Error('CHAPTER_INCOMPLETE_'+(i+1));
    for(const c of chapter.choices){
      if(!c.id||ids.has(c.id)||!c.label||c.response.length<2||!c.line)throw Error('CHOICE_INCOMPLETE');
      ids.add(c.id);
      if(STATS.some(k=>!Number.isFinite(Number(c.delta[k]||0))))throw Error('INVALID_STAT_DELTA');
    }
  }
  return {chapters:CHAPTERS.length,choices:CHAPTERS.reduce((n,x)=>n+x.choices.length,0)};
}
const api=Object.freeze({
 VERSION,DAYS,WEEKDAYS,ENDINGS,
 validateProfile,validateStory,createGame,chapter,choose,advance,
 partnerName
});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryPlay=api;
})(typeof window!=='undefined'?window:globalThis);
