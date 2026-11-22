/* Keep both existing scene-turn actions in the same bounded bottom toolbar.
 * This moves nodes only: existing listeners, chapter state, save and session logic
 * remain untouched. No new network requests or persistence.
 */
(function(){
 'use strict';
 const row=document.querySelector('#vnBottom .vn-control-row');
 const next=document.getElementById('nextBtn');
 const more=document.getElementById('vnMore');
 if(!row||!next||!more)return;
 more.classList.add('diary-inline-turn');
 next.classList.add('diary-inline-turn');
 row.append(next);
 // Preserve access to the action even if the UI controller changes visibility.
 next.setAttribute('title','다음 장면');
 more.setAttribute('title','다음 문장');
 const ending=document.getElementById('ending');
 if(ending&&!ending.querySelector('.diary-ending-home')){
  const home=document.createElement('a');
  home.className='diary-ending-home';
  home.href='/';
  home.textContent='⌂ 배구지수 홈';
  home.setAttribute('aria-label','배구지수 홈으로 돌아가기');
  ending.prepend(home);
 }
})();
