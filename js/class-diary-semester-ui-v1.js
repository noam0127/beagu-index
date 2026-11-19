/* Semester-only presentation. The 7-day preview and all score/route logic stay untouched.
 * Never save, transmit or persist individual game state.
 */
(function(root){
 'use strict';
 const d=root.document;
 const $=id=>d.getElementById(id);
 if(!$('semesterStart')||!$('openingStart')||!$('opening'))return;
 const actNames=['낯선 이름들','우리 반이라는 말','좋은 사람의 기준','소문이 지나간 자리','서로의 편이 된다는 것','여름방학 전날'];
 const opening=$('opening'),setup=$('setup');
 const metrics=opening.querySelector('.diary-opening-stat');
 const days=opening.querySelector('.diary-opening-days');
 const heading=$('openingTitle'),summary=opening.querySelector('.diary-opening-body>p');
 const stamp=setup.querySelector('.setup-player-stamp small');
 const review=setup.querySelector('.setup-review-quote');
 const setupIntro=setup.querySelector('.setup-head>p');
 const storyNote=setup.querySelector('.setup-story-note p');
 const original={
  heading:heading.textContent,summary:summary.textContent,
  metrics:metrics?metrics.textContent:'',days:days?days.textContent:'',
  stamp:stamp?.textContent||'',review:review?.textContent||''
 };
 function replaceText(root,items,tag){
  if(!root)return;
  root.replaceChildren();
  for(const entry of items){
   const el=d.createElement('div'); const strong=d.createElement('strong'),small=d.createElement('small');
   strong.textContent=entry[0];small.textContent=entry[1];el.append(strong,small);root.append(el);
  }
 }
 function mode(kind){
  const semester=kind==='semester';
  d.body.dataset.diaryStory=semester?'semester':'week';
  heading.textContent=semester?'한 학기, 서른여섯 장면':original.heading;
  summary.textContent=semester?'3월의 찬바람에서 7월의 방학식까지. 교실에서 내린 작은 결정들이 한 학기를 건너 다시 돌아옵니다.':original.summary;
  replaceText(metrics,semester?[['36화','2027년 3월–7월'],['6부','계절과 함께 변하는 이야기'],['108개','36번의 결정 · 선택지 3개씩']]:
   [['7일','3월 8일–14일'],['3명','서로 다른 동료 이야기'],['5개','서로 다른 결말']]);
  // Preserve the six-part infographic already authored in main.
  // The seven-day preview remains a distinct, explicit choice.
  if(days)days.hidden=!semester;
  if(stamp)stamp.textContent=semester?'나만의 학급일지 · 한 학기':'나만의 학급일지 · 7일';
  if(review)review.textContent=semester?'“3월에 나눈 말을, 7월의 우리는 어떻게 기억할까.”':original.review;
  if(setupIntro)setupIntro.textContent=semester?'2027년 3월부터 7월까지, 한 학기를 함께 보낼 선생님의 이야기입니다.':'2027년 3월 8일, 낯선 새 학기. 당신은 어떤 선생님으로 일주일을 시작할까요?';
  if(storyNote)storyNote.textContent=semester?'2027년 3월–7월 · 6부 36화 · 선택지 108개':'2027년 3월 8일–14일 · 7일의 이야기 · 21개 기본 선택';
  const finish=d.getElementById('diarySemesterFinish');
  if(finish)finish.hidden=!semester;
 }
 const openingStart=$('openingStart'),semesterStart=$('semesterStart');
 // The inline story engine already handles mode selection. This only updates visible copy.
 openingStart.addEventListener('click',()=>mode('week'));
 semesterStart.addEventListener('click',()=>mode('semester'));
 // The full semester is the primary edition; the original 7-day version remains opt-in.
 mode('semester');
 const ending=$('ending');
 if(ending){
  const finish=d.createElement('p');finish.id='diarySemesterFinish';finish.className='diary-semester-finish';finish.textContent='2027년 3월–7월 · 여섯 부 · 총 36화 완결';finish.hidden=true;
  $('endingHeading')?.insertAdjacentElement('afterend',finish);
  const observe=new MutationObserver(()=>{if(!ending.hidden)finish.hidden=d.body.dataset.diaryStory!=='semester'});
  observe.observe(ending,{attributes:true,attributeFilter:['hidden']});
 }
})(typeof window!=='undefined'?window:globalThis);
