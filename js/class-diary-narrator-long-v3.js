/* The only colleague-narrated scene. Every semester episode is narrated by the player.
 * This introductory passage is authored separately for each selected colleague;
 * no string-level pronoun substitutions or other characters' private thoughts.
 */
(function(root){
 'use strict';
 const VERSION='class-diary-narrator/v3-long';
 const inNode=typeof module==='object'&&module.exports&&typeof require==='function';
 const SCENE_ENGINE=inNode?require('./class-diary-prologue-scenes-v1.js'):root.BeaguClassDiaryPrologueScenes;
 const LENSES=Object.freeze({
  woman:inNode?require('./class-diary-prologue-lens-woman-v1.js'):root.BeaguClassDiaryLensWoman,
  man:inNode?require('./class-diary-prologue-lens-man-v1.js'):root.BeaguClassDiaryLensMan,
  none:inNode?require('./class-diary-prologue-lens-none-v1.js'):root.BeaguClassDiaryLensNone,
  man2:inNode?require('./class-diary-prologue-lens-man2-v1.js'):root.BeaguClassDiaryLensMan2,
  man3:inNode?require('./class-diary-prologue-lens-man3-v1.js'):root.BeaguClassDiaryLensMan3
 });
 if(!SCENE_ENGINE||SCENE_ENGINE.validate().scenes!==12)throw Error('PROLOGUE_SPINE_REQUIRED');
 for(const key of Object.keys(LENSES))
  if(!LENSES[key]||LENSES[key].PARTNER!==key||LENSES[key].LENS.length!==12)
   throw Error('PROLOGUE_LENS_REQUIRED_'+key);
/* The new teacher enters on March 8 after an unexpected short-notice contract placement.
 * A teacher's urgent family-care leave is a fictional premise, not a fact about a real school.
 */
 const PROLOGUES=Object.freeze({
  woman:Object.freeze({
   narrator:'서지윤',
   title:'문이 열리기 전',
   place:'학년연구실',
   lines:Object.freeze([
    '3월 1일 오후, 나는 베이스기타의 가장 두꺼운 줄을 갈다가 학년 단체대화방의 알림을 읽었다. 장미반 담임이 갑작스럽게 비었고 교감이 내일 출근할 기간제교사를 찾았다고 했다. 연습용 앰프를 끄자 방 안이 조용해졌다. 삼일절 휴일에 교감의 전화를 받은 낯선 사람은 지금 어떤 일을 하다 멈췄을까. 나는 그 사람을 아직 알지 못했다.',
    '문이 열리고 낯선 선생님이 들어왔다. 손에는 학교 지도를 접은 종이가 들려 있었다. 처음 온 사람이라는 건 그런 것들을 보면 알 수 있었다.',
    '그 선생님은 전날 늦게 연락을 받고 왔다고 했다. 나는 교실 도안을 찾으려 책상 서랍을 뒤졌다. 급히 오라는 전화를 받았을 사람이 지금 어떤 마음인지 알고 싶었지만 물어보지는 않았다.',
    '“3학년이세요? 저도 같은 학년이에요. 서지윤입니다.”',
    '반갑다는 말 뒤에 무슨 말을 더해야 할지 몰라 잠시 서 있었다. 그 선생님이 학교를 어떻게 생각하는지, 어떤 교실을 꿈꾸는지 나는 아직 아무것도 알지 못했다.',
    '문이 닫히고 나서야 복합기에서 마지막 종이를 꺼냈다. 그날 아침 내가 기억한 건 그 사람의 표정보다 조심스러운 발소리였다.'
   ])
  }),
  man:Object.freeze({
   narrator:'한현우',
   title:'아침의 농담',
   place:'학년연구실',
   lines:Object.freeze([
    '삼일절 오후, 『논어』을 읽던 내게 장미반 담임이 갑작스럽게 비었다는 연락이 왔다. 교감이 새 교사에게 전화했고 내일 아침부터 교실을 맡기로 했다는 말도 들었다. 책갈피를 꽂았다. 사람이 급히 필요하다는 사정과 갑작스레 불려 오는 사람이 준비되어 있다는 말은 다르다. 나는 그 차이를 잊지 않기로 했다.',
    '그때 문이 열렸다. 처음 보는 선생님이 안으로 들어오다가 복합기 앞에 쪼그려 앉은 나를 보고 걸음을 멈췄다.',
    '“첫날부터 기계랑 싸우는 모습이네요.” 나는 웃어 보였다. 상대가 따라 웃지 않아도 괜찮았다. 사실 별로 웃길 만한 말도 아니었다.',
    '그 선생님은 갑자기 연락받고 와서 교실을 찾느라 조금 늦었다고 했다. 나는 빈 책상을 가리키고 주간 학습 유인물을 한 부 건넸다. 새 학교 첫날부터 서두를 이유는 이 사람에게 없었다.',
    '“저는 한현우예요. 같은 3학년입니다. 종이는 나중에 뽑으시고, 교실부터 보실래요?”',
    '복도까지 함께 걸었다. 그 선생님은 내가 한 말에 고개를 끄덕였다. 무슨 생각을 했는지는 몰랐다. 나는 다음에 좀 더 나은 농담을 떠올려야겠다고 생각했다.'
   ])
  }),
  none:Object.freeze({
   narrator:'윤민서',
   title:'빈자리의 이름',
   place:'학년연구실',
   lines:Object.freeze([
    '3월 1일, 나는 집에서 마파두부를 만들며 웍의 불을 낮췄다. 학년 단체대화방에는 장미반 담임이 급히 자리를 비워 교감이 기간제교사를 구했다는 메시지가 떠 있었다. 재료를 순서대로 넣을 때와 달리 학교 일에는 미리 정하지 못하는 일이 많았다. 내일 새로 오는 사람에게는 필요한 정보만 건네야 했다. 당사자의 개인적인 사정을 덧붙일 권리는 나에게 없었다.',
    '학년연구실 문이 열렸다. 처음 보는 선생님이 들어왔다. 손에 든 안내문 모서리가 조금 접혀 있었다.',
    '그 선생님은 교실이 어디 있는지 물었다. 나는 업무표의 빈칸을 손가락으로 짚었다. 갑자기 온 기간제교사에게 첫날부터 모든 업무를 넘기고 싶지는 않았다.',
    '“윤민서입니다. 같은 학년이에요. 오늘 정해지지 않는 건 오늘 정하지 않아도 됩니다.”',
    '말하고 나서야 너무 사무적으로 들렸을까 싶었다. 상대는 안내문을 접어 가방에 넣었다. 나는 그 표정만으로 마음을 짐작하지 않기로 했다.',
    '복도에서 첫 수업을 알리는 종이 울렸다. 그 선생님이 교실로 가는 동안 나는 빈 업무 칸을 지우지 않았다. 나중에 함께 결정하면 될 일이었다.'
   ])
  }),
  man2:Object.freeze({
   narrator:'차도겸',title:'실이 풀린 자리',place:'학년연구실',
   lines:Object.freeze([
    '삼일절에 집에서 실뜨기 별 모양을 만들던 중 장미반 이야기를 들었다. 교감이 기간제교사에게 연락했고 3월 2일부터 교실을 맡아 줄 사람이 왔다고 했다. 실을 한 번 잘못 걸자 별의 끝이 무너졌다. 억지로 잡아당길수록 더 얽히는 실을 풀면서 새 교사에게 내 방식부터 강요하지 않기로 했다. 그 사람이 무엇을 좋아하는지는 아직 몰랐다.',
    '화요일 아침 학년연구실에 누군가 들어왔다. 그 선생님은 안내문이 접힌 자리를 펴다가 나와 눈이 마주쳤다. 나는 실을 급히 풀었다. 누군가 내 손을 이상하게 볼까 봐서가 아니라 인사를 먼저 해야 했기 때문이다.',
    '“차도겸입니다. 같은 3학년이에요.” 복도에 서 있던 학생 둘이 나를 알아보고 손을 흔들었다. 다른 반 아이들까지 몰려오면 첫 시간을 놓칠 것 같아 교실로 돌아가라고 말했다.',
    '아이가 “선생님은 왜 이렇게 잘생겼어요?”라고 묻자 낯선 선생님의 얼굴이 잠깐 굳었다. 나는 대답 대신 아이들에게 인사하고 학년연구실 문을 닫았다. 관심을 받는 일이 언제나 반가운 것은 아니라는 말을 굳이 설명하지 않았다.',
    '처음 온 선생님이 어떤 사람인지는 알지 못했다. 다만 이름표를 바꾸는 일에도 시간이 필요하다는 걸 그 표정에서 짐작할 수 있었다. 내 눈에 보인 것만 믿기로 했다.',
    '책상으로 돌아와 실을 다시 걸었다. 처음엔 잘못 잡아 별 모양이 나오지 않았다. 서두르지 않고 처음부터 풀었다. 교실의 일도 마음대로 다시 풀 수 있다면 얼마나 좋을까 생각했다.'
   ])
  }),
  man3:Object.freeze({
   narrator:'백태오',title:'공을 받는 자리',place:'학년연구실',
   lines:Object.freeze([
    '3월 1일 오후, 동호회 배구를 마치고 체육관 문을 닫던 중 학년 단체대화방의 연락을 읽었다. 장미반에 기간제 담임이 내일부터 들어온다고 했다. 교감이 휴일에 전화할 만큼 급한 자리였다. 나는 배구 가방을 들어 올리며 갑자기 팀에 합류한 사람이 첫 경기를 어떻게 시작하면 좋을지 생각했다. 그러나 교실은 경기장이 아니고, 내일 오는 선생님에게는 스스로 속도를 고를 시간이 필요했다.',
    '아침 학년연구실의 통로를 배구 가방이 막고 있었다. 낯선 선생님이 문턱 앞에서 잠깐 멈췄다. 나는 가방을 발치로 끌어당겼다. “여기로 들어오세요.”',
    '그 선생님은 접힌 안내문을 펴고 교실을 물었다. 나는 위치를 알려 주고 첫 수업의 종이 몇 시에 울리는지 확인했다. 코트에서는 금방 위치를 바꾸지만 학교에서는 아무 자리나 바로 내줄 수 없다는 생각이 들었다.',
    '“백태오입니다. 같은 3학년이에요. 배구 좋아하세요?” 묻고 나서 바로 후회했다. 처음 만난 사람이 오늘 가장 궁금한 일이 그건 아닐 텐데. “아니요, 대답 안 하셔도 됩니다.”',
    '그 사람은 작게 웃었지만 속마음은 알 수 없었다. 나는 본인이 원하면 도움을 청할 수 있는 선생님들 이름을 알려 주었다. 도움이 된다는 이유로 내가 먼저 모든 일을 정할 필요는 없었다.',
    '교실 문 앞에서 헤어지고 나서야 공 가방을 정리했다. 공을 받으려는 사람이 있다는 이유만으로 던져서는 안 된다. 그날 내가 새로 배운 건 배구가 아니라 기다리는 방법이었다.'
   ])
  })
 });
 function prologue(profile){
  const id=profile&&profile.partner;
  const source=PROLOGUES[id];
  if(!source)throw Error('SELECTED_COLLEAGUE_REQUIRED');
  // The protagonist is named only after the colleague's prologue.
  return Object.freeze({
   perspective:'colleague',narrator:source.narrator,scene:'morning',
   title:source.title,place:source.place,
   paragraphs:Object.freeze(SCENE_ENGINE.SCENES.flatMap((shared,i)=>[
    ...shared,LENSES[id].LENS[i]
   ]).concat(SCENE_ENGINE.CODA))
  });
 }
 function validate(){
  const keys=Object.keys(PROLOGUES);
  if(keys.join(',')!=='woman,man,none,man2,man3')throw Error('FIVE_NARRATORS_REQUIRED');
  for(const key of keys){
   const scene=prologue({partner:key,name:'새봄'});
   if(scene.paragraphs.length!==52||scene.paragraphs.join('').length<9600||scene.paragraphs.some(x=>x.length<25||x.includes('{player}')))throw Error('INCOMPLETE_PROLOGUE_'+key);
  }
  return {narrators:5,perspective:'colleague',longPrologue:true};
 }
 validate();
 const api=Object.freeze({VERSION,PROLOGUES,prologue,validate});
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.BeaguClassDiaryNarrator=api;
})(typeof window!=='undefined'?window:globalThis);
