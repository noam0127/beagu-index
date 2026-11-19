/* The only colleague-narrated scene. Every semester episode is narrated by the player.
 * This introductory passage is authored separately for each selected colleague;
 * no string-level pronoun substitutions or other characters' private thoughts.
 */
(function(root){
 'use strict';
 const VERSION='class-diary-narrator/v1';
 const PROLOGUES=Object.freeze({
  woman:Object.freeze({
   narrator:'서지윤',
   title:'문이 열리기 전',
   place:'학년연구실',
   lines:Object.freeze([
    '복합기에서 종이가 나오는 소리를 들으며 나는 출석부의 빈칸을 다시 살폈다. 새 학기의 첫날에는 모든 물건이 제자리를 찾기 전까지 조금씩 삐걱거렸다.',
    '문이 열리고 낯선 선생님이 들어왔다. 손에는 학교 지도를 접은 종이가 들려 있었다. 처음 온 사람이라는 건 그런 것들을 보면 알 수 있었다.',
    '{player}은 인사를 하고 복도 쪽을 한 번 돌아봤다. 나는 어느 교실로 가는지 물으려다가 책상 위의 서류를 먼저 치웠다.',
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
    '출근한 지 십 분도 안 됐는데 복합기가 멈췄다. 나는 뚜껑을 열고 종이를 잡아당겼다. 찢어지는 소리만 났다.',
    '그때 문이 열렸다. 처음 보는 선생님이 안으로 들어오다가 복합기 앞에 쪼그려 앉은 나를 보고 걸음을 멈췄다.',
    '“첫날부터 기계랑 싸우는 모습이네요.” 나는 웃어 보였다. 상대가 따라 웃지 않아도 괜찮았다. 사실 별로 웃길 만한 말도 아니었다.',
    '{player}은 인사를 하고 서류가 놓인 자리를 물었다. 나는 일어나서 빈 책상을 가리켰다. 고장 난 복합기는 일단 그대로 뒀다.',
    '“저는 한현우예요. 같은 3학년입니다. 종이는 나중에 뽑으시고, 교실부터 보실래요?”',
    '복도까지 함께 걸었다. 그 선생님은 내가 한 말에 고개를 끄덕였다. 무슨 생각을 했는지는 몰랐다. 나는 다음에 좀 더 나은 농담을 떠올려야겠다고 생각했다.'
   ])
  }),
  none:Object.freeze({
   narrator:'윤민서',
   title:'빈자리의 이름',
   place:'학년연구실',
   lines:Object.freeze([
    '나는 학년 업무표를 한 번 더 출력했다. 종이 왼쪽 끝의 이름이 자꾸 어긋나 있었다. 별것 아니라고 넘기기에는 새로 온 선생님 몫의 칸이었다.',
    '학년연구실 문이 열렸다. 처음 보는 선생님이 들어왔다. 손에 든 안내문 모서리가 조금 접혀 있었다.',
    '{player}이 이름을 말했고, 나는 업무표에서 그 이름을 찾아 손가락으로 짚었다. 누가 무엇을 맡을지는 아직 정해지지 않은 부분이 많았다.',
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
  const name=String(profile.name||'새봄').trim();
  const player=/^[가-힣]{2,8}$/.test(name)?name:'새봄';
  return Object.freeze({
   perspective:'colleague',narrator:source.narrator,scene:'morning',
   title:source.title,place:source.place,
   paragraphs:Object.freeze(source.lines.map(line=>line.replace(/\{player\}/g,player+' 선생님')))
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
