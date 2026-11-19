/* Class Diary literary narration: an original fullscreen, text-over-scene treatment.
 * Presentation only; never stores or transmits personal data or choices.
 */
(function(root){
'use strict';
let semester=false;
let current=null;
let pending=0;
let printing=false;
let prior='';
const reduce=()=>typeof root.matchMedia==='function'&&root.matchMedia('(prefers-reduced-motion: reduce)').matches;
const durationPerCharacter=14;
function cancel(){
 if(pending)root.clearTimeout(pending);
 pending=0;
 if(current)current.classList.add('diary-literary-revealed');
 current=null;printing=false;
}
function mode(on){
 semester=!!on;
 if(root.document)root.document.body.classList.toggle('is-semester-mode',semester);
 if(!semester){cancel();prior='';}
}
function start(){
 cancel();
 prior='';
 const doc=root.document;
 if(!doc)return;
 for(const node of doc.querySelectorAll('.diary-literary-echo'))node.remove();
}
function graphemes(str){
 if(root.Intl&&root.Intl.Segmenter){
  const seg=new root.Intl.Segmenter('ko',{granularity:'grapheme'});
  return Array.from(seg.segment(str),x=>x.segment);
 }
 return Array.from(str);
}
function present(target){
 if(!semester||!target)return;
 cancel();
 const doc=target.ownerDocument;
 const paragraphs=[...target.querySelectorAll('p')];
 if(!paragraphs.length)return;
 const reader=target.closest('.vn-dialogue,.outcome');
 if(!reader)return;
 let echo=reader.querySelector('.diary-literary-echo');
 if(!echo){echo=doc.createElement('p');echo.className='diary-literary-echo';echo.setAttribute('aria-hidden','true');reader.insertBefore(echo,target);}
 echo.textContent=prior.slice(-90);
 echo.hidden=!prior;
 let index=0;
 const accelerated=reduce();
 for(const p of paragraphs){
  const text=p.textContent||'';
  const characters=graphemes(text);
  p.setAttribute('aria-label',text);
  const wrapper=doc.createElement('span');
  wrapper.className='diary-literary-text';
  wrapper.setAttribute('aria-hidden','true');
  const fragment=doc.createDocumentFragment();
  if(accelerated){wrapper.textContent=text}
  else for(const letter of characters){
    const char=doc.createElement('span');
    char.className='diary-literary-char';
    char.textContent=letter;
    char.style.setProperty('--diary-delay',(index*durationPerCharacter)+'ms');
    fragment.append(char);
    index++;
    if(/[.!?。！？…]/u.test(letter))index+=5;
  }
  if(!accelerated)wrapper.append(fragment);
  p.replaceChildren(wrapper);
 }
 prior=paragraphs[paragraphs.length-1].getAttribute('aria-label')||'';
 current=target;
 target.classList.remove('diary-literary-revealed');
 if(accelerated){target.classList.add('diary-literary-revealed');current=null;printing=false;return;}
 printing=true;
 pending=root.setTimeout(()=>{
   pending=0;printing=false;
   if(current===target){target.classList.add('diary-literary-revealed');current=null;}
 },index*durationPerCharacter+180);
}
function reveal(){
 if(!semester||!printing||!current)return false;
 cancel();
 return true;
}
function isPrinting(){return printing;}
root.BeaguClassDiaryLiterary=Object.freeze({VERSION:'literary/v1',mode,start,present,reveal,isPrinting});
})(typeof window!=='undefined'?window:globalThis);
