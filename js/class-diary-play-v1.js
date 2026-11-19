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
  ask:'할 일을 명확히 나누는 데 시간이 들었지만, 다음번에 같은 일이 생겨도 담당을 확인할 수 있었다.',
  carry:'일은 빨리 시작할 수 있었다. 대신 다음에도 혼자 맡아 달라는 부탁을 받을지 모른다는 걱정이 남았다.',
  share:'학기 초의 부담을 나눠 말하니 마음이 가벼워졌다. 업무분장표는 다음 쉬는 시간에 확인해야 했다.',
  reopen:'아이들 의견을 들을 길을 만들었다. 회의를 다시 열어야 한다는 부담도 함께 생겼다.',
  private:'학년에서 의견을 모으기 쉬웠다. 다만 공식 회의 안건으로 이어지려면 다시 누군가 말해야 했다.',
  follow:'공통 기준을 빠르게 적용할 수 있었다. 반에서 다른 의견이 나오면 고칠 방법을 다시 찾아야 했다.',
  council:'학급회의에서 아이들의 발언권이 커졌다. 대신 수업 시간이 밀렸고 결정한 규칙을 재검토할 책임도 생겼다.',
  trial:'급하게 정답을 고르지 않고 시험해 보기로 했다. 다음 주에 결과를 꼭 다시 확인해야 했다.',
  explain:'안전하게 이동할 이유를 설명했다. 아이들이 규칙 자체를 고칠 수 있는지는 아직 남은 질문이었다.',
  together:'상담 내용을 함께 확인해 부담을 나눴다. 다만 여러 사람이 관여하는 만큼 기록과 전달은 신중해야 했다.',
  listen:'서두르지 않고 당사자 말을 들었다. 연락과 확인에 쓸 시간은 더 필요해졌다.',
  alone:'먼저 연락한 덕분에 지체되지는 않았다. 혼자 책임지려던 일은 결국 학년에서 다시 상의해야 했다.',
  invite:'동료에게 가까워질 기회를 만들었다. 상대방이 편하게 거절할 수 있는지도 살펴야 했다.',
  choice:'함께하고 싶은 사람과 쉬고 싶은 사람의 선택을 똑같이 존중했다. 모임은 조금 작아졌다.',
  rest:'주말의 시간을 지키기로 했다. 급하지 않은 업무 이야기는 월요일에 다시 꺼내면 됐다.',
  coffee:'학교 밖에서 새로운 대화를 나눴다. 근무 관계와 사적인 관계를 구분하는 배려도 필요했다.',
  letter:'고마움은 전하고 각자의 주말도 지켰다. 이어질 이야기는 다음 만남에 남겨 두었다.',
  offline:'쉬는 시간을 온전히 되찾았다. 그동안 못 나눈 이야기는 월요일에 해도 늦지 않았다.',
  promise:'아이들 발언권을 지키겠다는 약속을 적었다. 실제로 지키려면 다음 주에도 시간을 내야 한다.',
  thanks:'함께한 동료의 도움을 기억했다. 고마움을 나누면서도 자기 할 일을 상대에게 떠넘기지는 않기로 했다.',
  quiet:'휴식을 선택했다. 월요일 교실에서 아이들의 말을 다시 들을 힘도 그만큼 남았다.'
});
const CHAPTER_MOMENTS=Object.freeze(["복합기에서 갓 나온 주안에는 아직 따뜻한 종이 냄새가 났다. 나는 동의서를 놓아 둔 자리를 정리하고, 아이들이 교실로 들어오기 전까지 남은 시간을 세어 보았다. 서류를 챙기는 일이 아이들을 맞을 시간을 다 가져가게 하고 싶지는 않았다.","회의가 끝나자 의자들이 한꺼번에 바닥을 긁었다. 모두 같은 방향으로 걸어 나갔지만, 돌아갈 교실은 저마다 달랐다. 아이들이 실제로 살아갈 약속을 만드는 일이니, 문서 한 줄로 서둘러 마칠 수는 없었다.","칠판 앞에 선 아이는 반장도 아니었고 목소리가 가장 큰 아이도 아니었다. 그 아이가 꺼낸 질문 하나에 다른 아이들이 자기 경험을 보태기 시작했다. 나는 대답을 주는 대신 질문을 조금 더 오래 남겨 두었다.","책상에 놓인 메모에는 아이의 말과 어른의 말이 서로 다른 줄에 적혀 있었다. 나는 누가 먼저 이야기했는지보다, 무엇을 직접 확인했는지가 중요하다고 생각했다. 아직 모르는 일을 모른다고 말할 용기가 필요했다.","학년연구실 창밖으로 운동장 그림자가 길어졌다. 책상을 나란히 쓰는 동료도 저마다 퇴근 뒤에 돌아갈 삶이 있을 것이다. 함께 일한 마음을 나누는 것과 함께 있어야 한다고 요구하는 것은 다른 일이었다.","서점에서 책장을 넘기는 동안, 교실에서는 도무지 끝나지 않던 시간이 느릿하게 흘렀다. 답장을 보내지 않아도, 무언가를 준비하지 않아도 되는 오후였다. 휴식이 밀린 숙제가 되지는 않았으면 했다.","수첩 한쪽에는 내가 미처 듣지 못한 아이의 말이 남아 있었다. 지난 일주일을 다시 살 수는 없지만 다음 주 같은 장면에서 조금 다른 선택을 할 수는 있다. 마지막 장을 덮기 전에 그 사실만은 적어 두고 싶었다."]);
const CHOICE_ECHO=Object.freeze({"ask":"내일 같은 일이 생기면 먼저 업무분장표를 꺼내 볼 것이다. 누가 할 일인지 묻는 것이 서로를 믿지 못해서는 아니었다.","carry":"교실 불을 끄고 나서야 가방 속에 구겨 넣은 동의서 목록이 떠올랐다. 누군가와 나눌 수 있었던 일을 왜 그렇게 오래 쥐고 있었을까.","share":"복합기 앞에서 나눈 농담은 짧았지만, 그날 오후 누군가에게 물어볼 용기를 남겨 주었다.","reopen":"내일 교실에서는 아이들의 말을 듣고, 모레에는 그 말을 실제 약속으로 옮겨야 했다. 발언 하나가 일을 만들어 냈다.","private":"복도를 지나며 아까 입 밖으로 내지 못한 문장을 마음속으로 다시 읽었다. 다음 학년협의회에서는 조금 더 일찍 말해 볼 생각이었다.","follow":"규칙을 따르는 일이 편한 만큼, 그 규칙에 대해 묻는 아이에게 답할 책임도 남았다.","council":"몇몇 아이는 말하지 못한 채 종이만 만지작거렸다. 다음 학급회의에는 그 아이들에게도 말을 꺼낼 방법을 마련해야겠다.","trial":"해 보기로 한 일은 꼭 다시 돌아보아야 했다. 그렇지 않으면 작은 실험도 어느새 고정된 규칙이 되어 버릴 테니까.","explain":"질문했던 아이가 고개를 끄덕이기는 했지만, 그 눈빛에는 아직 ‘그래서 바꿀 수 있나요?’라는 말이 남아 있었다.","together":"상담이 끝난 뒤 서로 메모를 맞춰 보았다. 같은 이야기를 들어도 놓친 부분이 있었다. 그래서 함께 확인하는 일이 필요했다.","listen":"종례를 마친 뒤에도 아이들이 내게 들려준 말이 떠올랐다. 그 말들이 어느 쪽을 탓하는 증거가 되지 않도록 조심해야 했다.","alone":"전화를 끊은 뒤 한동안 수화기를 쥐고 있었다. 다음 연락부터는 확인할 사항을 정리한 뒤 전하기로 했다.","invite":"상대가 웃으며 고개를 끄덕였을 때 마음이 놓였다. 그 미소를 당연한 대답으로 여기지 않겠다고 생각했다.","choice":"한 선생님은 웃으며 먼저 떠났고 다른 선생님은 밥집으로 향했다. 누군가의 선택이 다른 누군가의 눈치를 만들지 않는 저녁이었다.","rest":"서류를 잠가 두고 교문을 나오자 바람 냄새가 달라졌다. 오늘 일은 오늘의 자리에 두기로 했다.","coffee":"두 사람 사이에 잠깐 말이 끊겼다. 불편한 침묵은 아니었다. 학교 밖의 대화에는 서둘러 다음 안건을 정할 필요가 없었다.","letter":"휴대전화를 내려놓자 다시 책 속 문장이 눈에 들어왔다. 고맙다는 마음을 전한 뒤에도 각자의 시간은 넉넉히 남아 있었다.","offline":"메시지 알림을 확인하지 않은 오후가 이상할 만큼 평온했다. 내일 교실에서 다시 만나도 늦지 않았다.","promise":"나는 월요일 주안 여백에 학급회의에서 다시 물을 질문을 하나 적었다. 계획표에도 아이들이 말할 자리는 필요했다.","thanks":"보내기 버튼을 누른 뒤에는 답장을 기다리느라 휴대전화를 붙들고 있지 않았다. 마음을 전하는 일은 요구하는 일이 아니었다.","quiet":"탁상등을 끄자 수첩의 마지막 줄도 어둠 속으로 물러났다. 내일은 아직 오지 않았다."});
const CHAPTERS=[
{
 title:'주안부터 챙기는 월요일',
 place:'학년연구실 · 3월 둘째 주 월요일 아침',
 prose:[
  '월요일 아침부터 학년연구실 복합기가 쉬지 않고 돌아갔다. 한쪽에는 주안이, 다른 쪽에는 아직 걷지 못한 개인정보 수집·이용 동의서 목록이 놓여 있었다. 학기 초 둘째 주인데도 책상 위 서류는 좀처럼 줄지 않았다.',
  '나이스에 들어가 출결을 확인하려는 순간, {colleague}이 종이컵을 내려놓았다. “우리 학년 주안, 이번 주 것도 올리셨죠? 그리고 반별 동의서 취합한 건 담당 선생님한테 확인해 보세요.”',
  '창에는 나이스가 열려 있었고, 옆 탭에는 학급 물품 품의를 올리려고 접속한 K-에듀파인이 남아 있었다. 수업 준비를 하러 왔는데 하루가 서류부터 시작되는 것 같았다. 복합기 앞에서 내가 할 일과 학년이 함께 할 일을 가려야 했다.'
 ],
 choices:[
  {id:'ask',label:'주안과 동의서를 누가 맡을지 학년 선생님들과 확인한다',delta:{affection:4,trust:7,agency:3,fatigue:-3},
   response:['“이번 주 주안은 같이 맞추는 거죠? 동의서는 어디까지 취합하나요?” 나는 학년 업무표를 펼쳤다. {colleague}이 취합해야 할 서류와 담당자에게 넘길 서류를 짚어 주었다.','내 이름 앞에 적힌 일과 아닌 일을 구분하자 책상이 조금 넓어진 느낌이었다.'],
   line:'“모르는 건 학년에서 같이 확인해요. 학기 초에는 다들 정신없어요.”'},
  {id:'carry',label:'일단 내가 챙겨 보겠다고 말하고 서류를 가져온다',delta:{affection:1,trust:0,agency:0,fatigue:9},
   response:['나는 주안 출력물과 동의서 파일을 끌어안았다. 나이스 출결도 아직 끝나지 않았는데, 괜히 해 보겠다고 한 건 아닐까 싶었다.','{colleague}이 복합기 옆에서 말했다. “혼자 다 하실 필요는 없어요. 학년에서 같이 맞추면 되죠.”'],
   line:'“일단 1교시부터 무사히 하고, 전담시간에 같이 봐요.”'},
  {id:'share',label:'학기 초라 정신없다며 동료와 잠깐 이야기한다',delta:{affection:8,trust:4,agency:1,fatigue:-2},
   response:['“저만 이렇게 정신없는 거 아니죠?” 내가 묻자 {colleague}이 웃었다. “저도 동의서 세다가 주안 올리는 걸 깜빡했어요.”','별것 아닌 대화였는데도 웃음이 났다. 우리 학년에서 내 자리가 조금씩 생기는 기분이었다.'],
   line:'“오늘 전담시간 겹치면 학년연구실에서 커피 한 잔 해요.”'}
 ]
},
{
 title:'회의록에는 전원 동의',
 place:'교직원전체회의 · 화요일 방과 후',
 prose:[
  '교직원전체회의가 길어졌다. 새 학기 업무분장 안내와 안전교육 일정이 지나가고, 학년별 생활지도 방식에 대한 안건이 나왔다. 회의록에는 어느새 ‘전원 동의’가 적혀 있었다.',
  '회의 전에 학년연구실에서 정리한 의견은 조금 달랐다. 급식 이동이나 복도 생활의 기본 원칙은 필요하지만, 반에서 정할 수 있는 것까지 한꺼번에 못 박을 이유는 없었다.',
  '{colleague}이 내 쪽으로 몸을 기울였다. “아까 학년회의 때 말씀하신 거 있잖아요. 지금 이야기해도 될 것 같은데요?” 교직원전체회의에서 처음 의견을 내는 일은 생각보다 긴장됐다.'
 ],
 choices:[
  {id:'reopen',label:'반마다 아이들과 정할 수 있는 규칙은 남겨 두자고 말한다',delta:{affection:5,trust:8,agency:9,fatigue:2},
   response:['“공통으로 지킬 기준은 두되, 줄서기 같은 건 학급회의에서 정해 보면 어떨까요?” 내가 말하자 몇몇 선생님이 고개를 들었다.','{colleague}이 회의록에 ‘학급별 협의 후 재논의’라고 덧붙였다. 전원 동의라는 네 글자 옆에 작은 빈틈이 생겼다.'],
   line:'“학급회의에서 정해 보고, 다음 학년회의 때 같이 나눠요.”'},
  {id:'private',label:'회의가 끝난 뒤 동학년 선생님에게 생각을 말한다',delta:{affection:6,trust:4,agency:4,fatigue:-1},
   response:['회의가 끝나고 학년연구실로 돌아와 {colleague}에게 조용히 말했다. 다 같이 있는 자리에서는 말이 잘 나오지 않았다고.','{colleague}은 의자를 당겨 앉았다. “그럼 다음 학년회의 안건으로 올려 볼까요?”'],
   line:'“교직원전체회의에서 못 한 얘기도 학년에서부터 시작하면 되죠.”'},
  {id:'follow',label:'일단 공통 규칙을 따르고 아이들 반응을 살핀다',delta:{affection:0,trust:1,agency:-3,fatigue:-4},
   response:['나는 회의록에 적힌 내용을 다시 읽었다. 다음 날 아침부터 적용하면 되는 일이라 마음은 편했다.','그런데 교실로 돌아오는 복도에서 생각이 걸렸다. 아이들이 왜 그렇게 해야 하는지 묻는다면 뭐라고 답할까.'],
   line:'“우리 반에서 의견이 나오면, 그때 다시 이야기해 봐요.”'}
 ]
},
{
 title:'전담시간이 끝나면',
 place:'3학년 교실 · 수요일 4교시 무렵',
 prose:[
  '3교시는 영어 전담이었다. 아이들이 영어실로 이동하자 학년연구실에 잠깐 여유가 생겼다. 선생님들이 말하는 꿀 같은 전담시간. 나는 컴퓨터로 아이스크림에서 모둠 활동 자료를 골랐고, 휴대전화로 인디스쿨에 올라온 수업 아이디어도 살폈다. 쉬는 시간에 봐 둔 유튜브 활동 영상에서 쓸 만한 장면을 떠올려 바로 다음 교시 준비물에 적어 두었다.',
  '4교시가 시작되고 아이들이 모둠 자리에 둘러앉았다. 그러다 한 아이가 손을 들었다. “선생님, 급식실 갈 때 왜 매번 번호대로 줄 서요? 모둠별로 가면 안 돼요?”',
  '나는 칠판에 적힌 오늘 할 일을 바라보았다. 주안대로라면 다른 활동을 할 차례였다. 하지만 아이들이 교실의 작은 규칙을 바꾸고 싶다고 말하는 순간은 지금이었다. 문밖으로 지나가던 {colleague}도 발소리를 낮췄다.'
 ],
 choices:[
  {id:'council',label:'급식 줄서는 방법을 학급회의 안건으로 올린다',delta:{affection:5,trust:7,agency:11,fatigue:4},
   response:['“그럼 안건으로 올려 볼까?” 모둠마다 의견이 나왔다. 출석번호순, 모둠별, 매일 돌아가며 서기. 나는 찬성 의견뿐 아니라 걱정되는 점도 칠판에 적었다.','수업은 조금 밀렸지만 아이들은 결정한 방법을 며칠 써 보고 다시 이야기하기로 했다.'],
   line:'“오늘 학급회의, 아이들 의견이 꽤 구체적이었네요.”'},
  {id:'trial',label:'두 가지 방법을 며칠씩 써 보고 다시 정한다',delta:{affection:4,trust:6,agency:7,fatigue:1},
   response:['모둠별로 한 번, 번호순으로 한 번. 아이들은 서로 다른 방법을 써 보고 편한 점과 불편한 점을 말해 보기로 했다.','{colleague}이 쉬는 시간에 교실을 들여다보았다. “우리 반에도 물어봐야겠어요.”'],
   line:'“바로 정답 내리지 않고 써 보는 것도 좋네요.”'},
  {id:'explain',label:'지금 규칙을 쓰는 이유를 먼저 설명한다',delta:{affection:2,trust:3,agency:2,fatigue:-2},
   response:['나는 복도에서 안전하게 이동해야 하는 이유와 급식실이 붐비는 시간을 설명했다. 아이들은 고개를 끄덕였다.','그래도 질문한 아이는 포기하지 않았다. “그럼 모둠별로 서도 안전하면 바꿀 수 있어요?” 그 말을 내일의 학급회의 안건으로 적어 두었다.'],
   line:'“아이들한테 이유를 말해 주고, 바꿀 수 있는 것도 알려 주면 좋겠어요.”'}
 ]
},
{
 title:'교외체험학습신청서가 도착한 날',
 place:'교무실 앞 상담 공간 · 목요일 오후',
 prose:[
  '오전에는 한 보호자가 보낸 교외체험학습신청서를 확인했다. 학교장 허가 교외체험학습 신청서는 학교에서 안내한 절차대로 처리해야 했다. 나이스 출결도 확인하려는데, 다른 보호자에게서 아이들 사이의 일로 전화가 왔다.',
  '쉬는 시간에 생긴 오해였다. 아이들마다 이야기가 달랐다. 나는 누구 말이 맞는지 서둘러 정하지 않고, 들은 내용과 확인할 내용을 따로 적었다. 곁의 컴퓨터에는 오전부터 열어 둔 나이스 화면이 그대로 있었다.',
  '학년연구실에서 돌아오던 {colleague}이 내 표정을 보더니 조용히 물었다. “무슨 일 있어요? 같이 확인할까요?” 혼자 해결해 주겠다는 말보다 함께 살피자는 말이 더 든든했다.'
 ],
 choices:[
  {id:'together',label:'동학년 선생님과 확인할 사실과 상담 절차를 정리한다',delta:{affection:6,trust:9,agency:6,fatigue:-4},
   response:['나는 {colleague}에게 상황을 설명했다. 우리는 아이들 진술을 섞어 쓰지 않고, 필요한 경우 학교에서 정해 둔 절차에 따라 확인하기로 했다.','보호자에게는 지금 확인된 내용과 앞으로 살펴볼 내용을 구분해 안내했다. 일을 함께한다는 건 책임을 미루는 일이 아니었다.'],
   line:'“담임이 다 혼자 해결하려고 하지 않아도 돼요. 학년에서 같이 보죠.”'},
  {id:'listen',label:'아이들 말을 따로 듣고 확인할 내용을 정리한다',delta:{affection:4,trust:6,agency:8,fatigue:2},
   response:['나는 아이들을 차례로 만나 각자가 기억하는 일을 들었다. 아이들은 처음엔 자기 말만 했지만, 조금 지나자 상대방이 느꼈을 마음을 이야기하기 시작했다.','{colleague}이 확인할 내용을 따로 정리해 주었다. 급한 답보다 정확한 확인이 먼저였다.'],
   line:'“학부모님께도 아직 확인 중이라고 정확히 말씀드리면 돼요.”'},
  {id:'alone',label:'우선 보호자와 통화하고 나중에 학년과 상의한다',delta:{affection:1,trust:0,agency:2,fatigue:10},
   response:['나는 전화기를 들었다. 한참 설명하고 나서야 확인하지 않은 일을 단정해 말하면 안 된다는 생각이 들었다.','통화를 마친 뒤 {colleague}에게 상황을 알렸다. 그제야 학년에서 상의할 문제를 혼자 끌어안고 있었다는 걸 깨달았다.'],
   line:'“다음 연락은 같이 정리해요. 담임이 혼자 감당할 일은 아니에요.”'}
 ]
},
{
 title:'금요일의 주안',
 place:'학년연구실 · 금요일 방과 후',
 prose:[
  '금요일 오후, 학년연구실 책상 위에는 다음 주 주안 초안과 교실에서 쓸 준비물이 올라와 있었다. 나는 K-에듀파인에서 학급 물품 품의가 결재됐는지 확인하고, 주안에 빠진 준비물은 없는지 다시 살폈다.',
  '교무실에서는 퇴근하고 같이 밥을 먹자는 이야기가 나왔다. 동학년 선생님들이 고개를 들었다. 누구는 반가운 눈치였고, 누구는 얼른 집에 가고 싶어 보였다.',
  '{colleague}이 내게 물었다. “주안은 거의 끝났어요? 오늘 저녁은 어떠세요?” 같은 말이었는데 업무를 묻는 부분보다 뒤의 한 문장에 마음이 조금 더 갔다.'
 ],
 choices:[
  {id:'invite',label:'퇴근길에 잠깐 같이 걸을지 물어본다',delta:{affection:9,trust:5,agency:3,fatigue:-2},
   response:['“저녁 모임 말고 잠깐 걸을래요?” 내가 묻자 {colleague}이 놀란 듯 웃었다.','서로 할 일을 정리한 뒤 교문을 나섰다. 오늘은 주안도, 에듀파인도 아닌 다른 이야기를 해 보고 싶었다.'],
   line:'“좋아요. 학교 얘기는 잠깐 내려놓고 걸어요.”'},
  {id:'choice',label:'저녁 모임은 참석하고 싶은 사람만 가면 좋겠다고 말한다',delta:{affection:5,trust:8,agency:7,fatigue:-1},
   response:['나는 모임에 못 가는 사람도 부담 갖지 않았으면 좋겠다고 말했다. 몇몇 선생님은 집에 일이 있다고 편하게 인사했다.','{colleague}이 가방을 메면서 작은 목소리로 말했다. “그렇게 말해 줘서 고마워요.”'],
   line:'“함께하는 것도 좋지만, 안 가도 괜찮은 분위기가 더 좋죠.”'},
  {id:'rest',label:'다음 주 준비를 여기까지 마치고 퇴근한다',delta:{affection:3,trust:4,agency:4,fatigue:-7},
   response:['나는 다음 주 주안만 마무리하고 컴퓨터를 껐다. 주말에 할 일을 조금 덜 남기려고 했는데, 오늘은 여기까지면 충분했다.','집에 가는 길에 {colleague}에게서 메시지가 왔다. ‘이번 주 진짜 고생 많으셨어요.’'],
   line:'“다음 주에 또 봐요. 주말에는 푹 쉬세요.”'}
 ]
},
{
 title:'학교 밖의 토요일',
 place:'토요일 오후 · 동네 서점과 카페',
 prose:[
  '토요일 오후, 휴대전화에는 업무 알림 대신 친구의 안부가 와 있었다. 금요일 쉬는 시간에 수업 자료를 그때그때 준비해 둔 덕분에, 오늘은 컴퓨터를 켜야 할 이유가 없었다. 나는 가벼운 옷을 입고 동네 서점으로 나섰다.',
  '서점으로 걸어가는 길에 {colleague}이 추천한 책 제목이 떠올랐다. 전담시간에 나눴던 짧은 대화가 주말까지 따라왔다. 교실에서는 서로 바쁜 동학년 교사인데, 학교 밖에서도 이렇게 생각이 날 줄은 몰랐다.',
  '손에는 별다른 일정이 없었다. 만나자고 연락해도 좋고, 혼자 카페에서 책을 읽어도 좋은 오후였다.'
 ],
 choices:[
  {id:'coffee',label:'괜찮다면 카페에서 잠깐 만날지 물어본다',delta:{affection:8,trust:6,agency:2,fatigue:-3},
   response:['“혹시 오늘 시간 괜찮으세요? 어려우시면 다음에요.” 메시지를 보내고 휴대전화를 내려놓았다.','조금 뒤 {colleague}에게서 답장이 왔다. 가까운 카페에서 잠깐 볼 수 있겠다고 했다. 만나는 시간을 서로 편한 쪽으로 정했다.'],
   line:'“오늘은 주안 얘기 말고 책 얘기부터 해요.”'},
  {id:'letter',label:'이번 주 고마웠다고 짧게 연락하고 각자 쉰다',delta:{affection:5,trust:7,agency:3,fatigue:-6},
   response:['나는 ‘이번 주에 많이 도와주셔서 고마웠어요’라고 적었다. 학년연구실에서 미처 못 했던 인사였다.','{colleague}은 웃는 표시와 함께 ‘주말 잘 보내세요’라고 답했다. 학교 밖에서까지 누군가에게 업무를 묻지 않아도 되는 순간이었다.'],
   line:'“월요일에 봐요. 푹 쉬세요.”'},
  {id:'offline',label:'연락하지 않고 혼자 조용히 주말을 보낸다',delta:{affection:1,trust:2,agency:5,fatigue:-10},
   response:['책을 읽다가 창밖을 한참 바라보았다. 오늘만큼은 수업 자료를 검색할 필요도, 내일 쓸 활동지를 고칠 필요도 없었다.','학교 생각 없이 보낸 몇 시간이 생각보다 길었다. 아무 일도 없어서 좋은 토요일이었다.'],
   line:'“주말까지 선생님일 필요는 없으니까요.”'}
 ]
},
{
 title:'일요일 밤의 빈 페이지',
 place:'일요일 밤 · 집의 작은 책상',
 prose:[
  '일요일 저녁에는 노트북 대신 수첩을 펼쳤다. 다음 주 주안은 금요일 학년연구실에서 이미 맞췄고, 교실에서 쓸 활동 자료도 평일 쉬는 시간마다 조금씩 준비해 두었다. 오늘은 업무를 다시 시작하는 밤이 아니라 한 주를 돌아보는 밤이었다.',
  '수첩에는 아이들이 모둠별로 나눈 의견이 남아 있었다. 급식 줄서기 질문, 작은 다툼, 그리고 학년연구실에서 {colleague}과 주고받은 말들. 평일에 나이스와 에듀파인에서 처리했던 일보다 사람들의 얼굴이 먼저 떠올랐다.',
  '나는 이번 주의 제목을 적으려다 펜을 멈췄다. 주안에는 적히지 않는 것들까지 교실의 하루였다. 다음 주에도 잊지 않고 싶은 일 하나를 정하기로 했다.'
 ],
 choices:[
  {id:'promise',label:'아이들의 의견을 다시 묻고 학년과 의논하기로 적는다',delta:{affection:7,trust:9,agency:9,fatigue:-2},
   response:['나는 수첩에 ‘학급회의에서 나온 의견 다시 확인하기’라고 적고, 그 아래에는 ‘학년 선생님에게 도움 청하기’라고 덧붙였다.','월요일 시간표의 맨 앞에는 수업이 있지만, 그 수업을 지탱하는 사람들은 시간표 밖에도 있었다.'],
   line:'“다음 주 학년회의 때 아이들 이야기 또 들려주세요.”'},
  {id:'thanks',label:'이번 주 함께한 동료에게 고맙다고 연락한다',delta:{affection:10,trust:7,agency:4,fatigue:-2},
   response:['나는 메시지를 몇 번 고쳐 썼다. “이번 주에 덕분에 정말 많이 배웠어요.” 그 말이면 충분했다.','{colleague}에게서 답장이 왔다. 주안 파일을 보내 달라는 말도, 내일 준비물을 챙기라는 말도 아닌 짧은 인사였다.'],
   line:'“저도 즐거웠어요. 다음 주에도 같이 잘해 봐요.”'},
  {id:'quiet',label:'다음 주 일은 내일 생각하고 일찍 쉰다',delta:{affection:3,trust:5,agency:7,fatigue:-7},
   response:['나는 수첩 맨 아래 ‘아이들 말 한 번 더 듣기’라고 썼다. 그리고 덮었다. 주안은 이미 금요일에 정리했으니 일요일 밤에 다시 열 필요는 없었다.','내일의 출결도, 수업도, 아이들 표정도 지금 다 알 수는 없었다. 오늘은 잘 쉬는 것으로 월요일을 준비했다.'],
   line:'“전담시간에 커피 한 잔 할 여유도 남겨 두세요.”'}
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
 warm:{title:'나의 소중한 학급일지',heading:'잊지 않고 싶은 사람들',
  prose:[
   '월요일에 주안과 동의서 앞에서 막막해하던 내가, 일요일 밤에는 수첩을 한 장 더 펼치고 있었다. 한 주 동안 대단한 일을 한 것은 아니었다. 그렇지만 놓치고 싶지 않은 얼굴이 몇 생겼다.',
   '{colleague}과의 대화도 그중 하나였다. 내 말을 다 알아들은 척하지 않고 끝까지 들어 준 사람. 나 역시 그 사람에게 그렇게 하고 싶었다.',
   '아이들은 내일도 복도에서 뛰고, 모둠별로 다투고, 자기 이야기를 해 달라며 손을 들 것이다. 그 평범한 하루가 어느새 소중해졌다.'
  ]},
 parallel:{title:'나의 든든한 학급일지',heading:'혼자 하지 않아도 되는 일',
  prose:[
   '새 학기에는 선생님 혼자 해결해야 한다고 생각한 일이 많았다. 주안을 맞추고, 동의서를 걷고, 보호자 연락을 받는 동안에도 그랬다.',
   '그런데 같은 문제를 다른 선생님과 나눠 생각하는 데 익숙해졌다. {colleague}이 내 편이어서가 아니라, 서로 틀릴 수도 있다는 전제로 이야기를 해 주었기 때문이다.',
   '아이들의 말도 마찬가지였다. 누구 하나의 목소리만으로 돌아가지 않는 교실. 내일의 일이 여전히 많겠지만, 오늘은 왠지 든든했다.'
  ]},
 steady:{title:'나의 단단한 학급일지',heading:'흔들려도 다시 고를 수 있는 것',
  prose:[
   '회의가 길어질 때도 있었고, 아이들과 정한 규칙이 생각처럼 지켜지지 않을 수도 있었다. 그렇다고 처음 마음먹은 이유까지 지워지는 것은 아니었다.',
   '나는 쉬운 결론을 미루고, 학급회의에서 아이들이 직접 이야기할 자리를 만들었다. {colleague}과 다른 생각을 한 날에도 내 의견을 조심스럽게 전했다.',
   '단단하다는 건 흔들리지 않는다는 뜻이 아니었다. 흔들린 뒤에도 무엇을 지키고 싶은지 다시 정할 수 있다는 뜻이었다.'
  ]},
 tender:{title:'나의 다정한 학급일지',heading:'조심스럽게 건넨 한마디',
  prose:[
   '학년연구실에서 마주칠 때마다 먼저 무슨 말을 할지 생각하게 되었다. 처음에는 주안 얘기밖에 할 줄 몰랐는데, 어느새 하루가 어땠는지 묻게 되었다.',
   '{colleague}에게 마음이 기울었다고 해서 서둘러 이름 붙일 필요는 없었다. 조금씩 알아 가는 시간을 아끼고 싶었다.',
   '아이들이 자기 말을 할 수 있도록 기다려 주듯, 서로에게도 그럴 수 있으면 좋겠다. 그 마음 하나가 일요일 밤을 따뜻하게 밝혔다.'
  ]},
 ordinary:{title:'나의 솔직한 학급일지',heading:'잘하지 못한 날도 내 일주일',
  prose:[
   '이번 주에는 말을 아낀 날도 있었고, 혼자 처리하겠다고 했다가 늦게 도움을 청한 날도 있었다. 잘한 일을 세어 보자니 잘못한 일이 먼저 떠올랐다.',
   '그래도 수첩을 덮지는 않았다. {colleague}과 서먹했던 순간도, 아이들에게 바로 답해 버린 순간도 지울 필요가 없었다. 내일 다시 물어보면 되니까.',
   '완벽한 담임이 되었다고 적을 수는 없다. 대신 오늘의 내가 어떤 사람인지 솔직하게 적었다. 그 정도면 다음 주를 시작할 수 있을 것 같았다.'
  ]}
});
function validateProfile(profile){
  if(!profile||typeof profile!=='object')throw Error('PROFILE_REQUIRED');
  const age=Number(profile.age),gender=profile.gender,partner=profile.partner,mbti=profile.mbti;
   const name=profile.name===undefined?'다온':String(profile.name).trim().replace(/\s+/g,'');
   if(!/^[가-힣]{2,8}$/.test(name))throw Error('NAME_INVALID');
  if(!Number.isInteger(age)||age<20||age>75)throw Error('ADULT_AGE_REQUIRED');
  if(!['woman','man','undisclosed'].includes(gender))throw Error('GENDER_INVALID');
  if(!['woman','man','none'].includes(partner))throw Error('PARTNER_INVALID');
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
  return {name,age,gender,partner,mbti,experience,duty,classTone,workCulture,
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
function partnerName(profile){return profile.partner==='man'?'현우 선생님':profile.partner==='woman'?'지윤 선생님':'동학년 선생님';}
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
   p.push(replace(CHAPTER_MOMENTS[state.day-1],colleague));
  const atmosphereLine=atmosphere(world,state.day);
  if(atmosphereLine)p.unshift(atmosphereLine);
  /* 주인공 성별은 편견이나 결과 점수에 관여하지 않는다. 나이와 유형은 독백만 바꾼다. */
  if(state.day===1){
    p.unshift('나는 올해 '+state.profile.age+'살이었다. '+
      (state.profile.experience==='new'?'아직 교단에서 배우는 일이 더 많았다.':
       state.profile.experience==='senior'?'여러 번 새 학기를 맞았지만 익숙해지지 않는 순간도 있었다.':
       '경력이 쌓여도 학기 초는 늘 새로웠다.')+
      ' 3월 둘째 주 월요일도 어쩐지 조금 낯설었다.');
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
