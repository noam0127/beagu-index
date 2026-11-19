/* The only colleague-narrated scene. Every semester episode is narrated by the player.
 * This introductory passage is authored separately for each selected colleague;
 * no string-level pronoun substitutions or other characters' private thoughts.
 */
(function(root){
 'use strict';
 const VERSION='class-diary-narrator/v2';
/* The new teacher enters on March 8 after an unexpected short-notice contract placement.
 * A teacher's urgent family-care leave is a fictional premise, not a fact about a real school.
 */
 const PROLOGUES=Object.freeze({
  woman:Object.freeze({
   narrator:'서지윤',
   title:'문이 열리기 전',
   place:'학년연구실',
   lines:Object.freeze([
    '첫 주가 막 끝났을 때, 담임 선생님 한 분이 갑작스러운 가족 돌봄 사정으로 휴직하게 됐다는 연락을 받았다. 사정의 자세한 내용은 묻지 않았다. 남겨진 아이들의 하루를 준비하는 일이 먼저였다. 월요일부터 급히 계약한 기간제교사가 온다고 했다.',
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
    '지난 금요일 저녁, 갑작스러운 가족 돌봄 휴직으로 비게 된 3학년 담임 자리를 월요일부터 기간제교사가 맡는다는 연락이 왔다. 나도 처음에는 일주일쯤 적응할 시간이 있을 거라 생각했다. 월요일 아침에는 유인물을 챙길 틈도 없이 복합기와 씨름하고 있었다.',
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
    '나는 학년 업무표를 한 번 더 살폈다. 지난 금요일까지 채워져 있던 담임의 이름이 빈칸으로 남았다. 갑작스러운 가족 돌봄 휴직으로 생긴 공백을 월요일부터 기간제교사가 맡기로 했다는 연락을 받은 뒤였다. 나는 새로 온 선생님에게 건넬 유인물부터 챙겼다.',
    '학년연구실 문이 열렸다. 처음 보는 선생님이 들어왔다. 손에 든 안내문 모서리가 조금 접혀 있었다.',
    '그 선생님은 교실이 어디 있는지 물었다. 나는 업무표의 빈칸을 손가락으로 짚었다. 갑자기 온 기간제교사에게 첫날부터 모든 업무를 넘기고 싶지는 않았다.',
    '“윤민서입니다. 같은 학년이에요. 오늘 정해지지 않는 건 오늘 정하지 않아도 됩니다.”',
    '말하고 나서야 너무 사무적으로 들렸을까 싶었다. 상대는 안내문을 접어 가방에 넣었다. 나는 그 표정만으로 마음을 짐작하지 않기로 했다.',
    '복도에서 첫 수업을 알리는 종이 울렸다. 그 선생님이 교실로 가는 동안 나는 빈 업무 칸을 지우지 않았다. 나중에 함께 결정하면 될 일이었다.'
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
   paragraphs:Object.freeze(source.lines.slice())
  });
 }
 function validate(){
  const keys=Object.keys(PROLOGUES);
  if(keys.join(',')!=='woman,man,none')throw Error('THREE_NARRATORS_REQUIRED');
  for(const key of keys){
   const scene=prologue({partner:key,name:'새봄'});
   if(scene.paragraphs.length<5||scene.paragraphs.some(x=>x.length<25||x.includes('{player}')))throw Error('INCOMPLETE_PROLOGUE_'+key);
  }
  return {narrators:3,perspective:'colleague'};
 }
 validate();
 const api=Object.freeze({VERSION,PROLOGUES,prologue,validate});
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.BeaguClassDiaryNarrator=api;
})(typeof window!=='undefined'?window:globalThis);
