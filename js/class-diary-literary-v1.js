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
let writingTimer=null;
let writingRow=null;
let writingText='';
let writingNode=null;
let writingCursor=null;
let writingGraphemes=[];
let typingSound=()=>{};
function stopWriting(){
 if(writingTimer!==null){clearInterval(writingTimer);writingTimer=null;}
 writingRow=null;writingText='';writingNode=null;writingCursor=null;writingGraphemes=[];
}
function setTypingSound(callback){typingSound=typeof callback==='function'?callback:()=>{};}
const $=selector=>root.document&&root.document.querySelector(selector);
function mode(on,semester=on){
 enabled=Boolean(on);
 if(root.document){
  root.document.body.classList.toggle('is-literary-mode',enabled);
  root.document.body.classList.toggle('is-semester-mode',enabled&&Boolean(semester));
 }
 if(!enabled)start();
}
function start(){stopWriting();active=null;visibleLines=0;}
function graphemes(s){
 if(root.Intl&&root.Intl.Segmenter)
  return [...new root.Intl.Segmenter('ko',{granularity:'grapheme'}).segment(String(s))].map(v=>v.segment);
 return Array.from(String(s));
}
/* Keep the punctuation and its closing quotes with each complete sentence. */
function splitSentences(paragraph){
 const chars=Array.from(String(paragraph||'').replace(/\s+/gu,' ').trim());
 const sentences=[];let current='';
 const ending=/[.!?。！？]/u,closer=/[”’"』」\)\]]/u;
 for(let i=0;i<chars.length;i++){
  const ch=chars[i];current+=ch;
  if(!ending.test(ch))continue;
  // A period inside a decimal, date or numbered version is not a sentence break.
  if(ch==='.'&&/\d/.test(chars[i-1]||'')&&/\d/.test(chars[i+1]||''))continue;
  while(i+1<chars.length&&(ending.test(chars[i+1])||closer.test(chars[i+1])))
   current+=chars[++i];
  const phrase=current.trim();
  if(phrase)sentences.push(phrase);
  current='';
 }
 if(current.trim())sentences.push(current.trim());
 return sentences;
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
/* One complete sentence per tap; never reveal a wrapped line or a whole paragraph. */
function paginate(paragraphs){
 const pages=[];
 for(const paragraph of paragraphs){
  for(const sentence of splitSentences(paragraph)){
   pages.push([{text:sentence,paragraphEnd:true}]);
  }
 }
 return pages.length?pages:[[{text:'…',paragraphEnd:true}]];
}
function finishWriting(){
 if(!writingRow)return false;
 if(writingTimer!==null){clearInterval(writingTimer);writingTimer=null;}
 if(writingNode)writingNode.nodeValue=writingText;
 writingRow.classList.remove('diary-literary-typing');
 writingRow.classList.add('diary-literary-ready');
 writingRow=null;writingText='';writingNode=null;writingCursor=null;writingGraphemes=[];
 return true;
}
function present(target){
 if(!enabled||!target)return;
 stopWriting();active=target;
 const rows=[...target.querySelectorAll('p')];
 visibleLines=rows.length?1:0;
 rows.forEach((row,index)=>{
  row.classList.add('diary-literary-line');
  row.hidden=index!==0;
 });
 target.classList.remove('diary-literary-revealed','diary-text-arrive');
 if(!rows.length)return;
 const row=rows[0],text=row.textContent||'…';
 row.classList.add('diary-literary-typing');
 row.classList.remove('diary-literary-ready','diary-literary-line-enter');
 const textNode=root.document.createTextNode('');
 const cursor=root.document.createElement('span');
 cursor.className='diary-reading-cursor';
 cursor.setAttribute('aria-hidden','true');
 cursor.textContent='▌';
 row.replaceChildren(textNode,cursor);
 row.setAttribute('aria-label',text);
 writingRow=row;writingText=text;writingNode=textNode;writingCursor=cursor;
 writingGraphemes=graphemes(text);
 const symbols=writingGraphemes;
 let count=0,ticks=0;
 const reducedMotion=Boolean(root.matchMedia&&root.matchMedia('(prefers-reduced-motion: reduce)').matches);
 if(reducedMotion||!root.setInterval){finishWriting();return;}
 // Two graphemes at a time produces a short, soft letter-rustle, not a long typing delay.
 writingTimer=root.setInterval(()=>{
  if(!writingRow||writingRow!==row){stopWriting();return;}
  const end=Math.min(symbols.length,count+2);
  textNode.nodeValue+=symbols.slice(count,end).join('');
  count=end;ticks++;
  if(count<symbols.length&&ticks%4===1&&/\S/u.test(symbols.slice(Math.max(0,count-2),count).join(''))){
   try{typingSound()}catch(_){}
  }
  if(count>=symbols.length)finishWriting();
 },26);
}
function reveal(){
 // One touch completes the current sentence; the next touch reveals the next sentence.
 if(!enabled||!active)return false;
 return finishWriting();
}
function isPrinting(){return Boolean(writingRow);}
const api=Object.freeze({VERSION:'literary/v3',mode,start,paginate,present,reveal,isPrinting,setTypingSound,splitSentences,wrapParagraph,paginateForMetrics});
root.BeaguClassDiaryLiterary=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
