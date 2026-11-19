/* Class Diary: full-screen, line-at-a-time prose for 7-day and 36-episode stories.
 * One Enter/tap reveals exactly one new line. Previous lines retain their
 * original size, weight and opacity; no echo, shrinking or auto-typing.
 * Presentation only; no network or persistence.
 */
(function(root){
'use strict';
let enabled=false;
let active=null;
let visibleLines=0;
const $=selector=>root.document&&root.document.querySelector(selector);
function mode(on,semester=on){
 enabled=Boolean(on);
 if(root.document){
  root.document.body.classList.toggle('is-literary-mode',enabled);
  root.document.body.classList.toggle('is-semester-mode',enabled&&Boolean(semester));
 }
 if(!enabled)start();
}
function start(){active=null;visibleLines=0;}
function graphemes(s){
 if(root.Intl&&root.Intl.Segmenter)
  return [...new root.Intl.Segmenter('ko',{granularity:'grapheme'}).segment(String(s))].map(v=>v.segment);
 return Array.from(String(s));
}
/* Wrap by measured font width so both mobile and desktop show genuine lines.
 * Break at spaces where possible, but preserve every character of long words.
 */
function wrapParagraph(text,maxWidth,measure){
 const words=String(text||'').trim().split(/\s+/u).filter(Boolean);
 if(!words.length)return [{text:'…',paragraphEnd:true}];
 const lines=[];
 let current='';
 const push=()=>{if(current){lines.push({text:current,paragraphEnd:false});current='';}};
 for(const word of words){
  const together=current?current+' '+word:word;
  if(measure(together)<=maxWidth){current=together;continue;}
  push();
  if(measure(word)<=maxWidth){current=word;continue;}
  for(const symbol of graphemes(word)){
   if(current&&measure(current+symbol)>maxWidth)push();
   current+=symbol;
  }
 }
 push();
 if(lines.length)lines[lines.length-1].paragraphEnd=true;
 return lines;
}
function paginateForMetrics(paragraphs,maxWidth,maxLines,measure){
 const all=[];
 for(const text of paragraphs){
  const wrapped=wrapParagraph(text,maxWidth,measure);
  all.push(...wrapped);
 }
 if(!all.length)all.push({text:'…',paragraphEnd:true});
 const cap=Math.max(1,Math.floor(maxLines));
 const pages=[];
 for(let at=0;at<all.length;at+=cap)pages.push(all.slice(at,at+cap));
 return pages;
}
function paginate(paragraphs){
 if(!enabled||!root.document)return [paragraphs];
 const slot=$('#vnDialogueSlot');
 const text=$('#chapterText');
 const styles=text?root.getComputedStyle(text):null;
 const fontSize=parseFloat(styles&&styles.fontSize)||18;
 const lineHeight=parseFloat(styles&&styles.lineHeight)||fontSize*1.7;
 const width=Math.max(180,(slot&&slot.clientWidth)||root.innerWidth*.88);
 const height=Math.max(190,(slot&&slot.clientHeight)||root.innerHeight*.72);
 const maxWidth=Math.max(110,width-40);
 const maxLines=Math.max(3,Math.min(32,Math.floor((height-22)/(lineHeight+3))));
 const canvas=root.document.createElement('canvas');
 const context=canvas.getContext&&canvas.getContext('2d');
 if(context)context.font=[styles?.fontWeight||'500',styles?.fontSize||'18px',styles?.fontFamily||'serif'].join(' ');
 const spacing=parseFloat(styles?.letterSpacing)||0;
 const measure=str=>context
  ? context.measureText(str).width + Math.max(0,graphemes(str).length-1)*spacing
  :graphemes(str).length*fontSize*.95;
 return paginateForMetrics(paragraphs,maxWidth,maxLines,measure);
}
function present(target){
 if(!enabled||!target)return;
 active=target;
 const rows=[...target.querySelectorAll('p')];
 visibleLines=rows.length?1:0;
 rows.forEach((row,index)=>{
  row.classList.add('diary-literary-line');
  row.hidden=index!==0;
 });
 target.classList.remove('diary-literary-revealed','diary-text-arrive');
 if(rows[0])rows[0].classList.add('diary-literary-line-enter');
 const reader=target.closest('.vn-dialogue,.outcome');
 if(reader)reader.scrollTop=0;
}
function reveal(){
 if(!enabled||!active)return false;
 const rows=active.querySelectorAll('p.diary-literary-line');
 if(visibleLines>=rows.length)return false;
 const line=rows[visibleLines++];
 line.hidden=false;
 line.classList.add('diary-literary-line-enter');
 return true;
}
function isPrinting(){return Boolean(active&&visibleLines<active.querySelectorAll('p.diary-literary-line').length);}
const api=Object.freeze({VERSION:'literary/v2',mode,start,paginate,present,reveal,isPrinting,wrapParagraph,paginateForMetrics});
root.BeaguClassDiaryLiterary=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
