/* Four-page setup: paper turn effect only, no persistent state or network. */
(function(root){
 'use strict';
 const doc=root.document;if(!doc)return;
 let active=null,timer=0;
 function reduced(){return root.matchMedia&&root.matchMedia('(prefers-reduced-motion: reduce)').matches;}
 function clear(){
  root.clearTimeout(timer);
  if(active){active.remove();active=null;}
 }
 function turn(setup,from,to,label){
  clear();
  if(!setup||setup.hidden||from===to||reduced())return;
  const sheet=doc.createElement('div');
  sheet.className='diary-paper-turn-sheet';
  sheet.dataset.direction=to<from?'back':'next';
  sheet.setAttribute('aria-hidden','true');
  const caption=doc.createElement('span');
  caption.className='diary-paper-turn-title';
  caption.textContent=label||'나의 OO한 학급일지';
  sheet.append(caption);
  setup.append(sheet);
  active=sheet;
  const dispose=()=>{if(active===sheet)clear();else sheet.remove();};
  sheet.addEventListener('animationend',dispose,{once:true});
  timer=root.setTimeout(dispose,700);
  const next=setup.querySelector('[data-setup-screen="'+to+'"]');
  if(next){
   next.classList.remove('diary-paper-new-page');
   void next.offsetWidth;
   next.classList.add('diary-paper-new-page');
   next.addEventListener('animationend',()=>next.classList.remove('diary-paper-new-page'),{once:true});
  }
 }
 root.BeaguClassDiarySetupBook=Object.freeze({turn,clear});
})(typeof window!=='undefined'?window:globalThis);
