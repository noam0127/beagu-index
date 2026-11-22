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
 const sentences=[],quoteStack=[];
 let current='';
 const end=/[.!?。！？…]/u,open={ '“':'”','‘':'’','「':'」','『':'』' };
 const close=/[”’」』"]/u;
 const flush=()=>{if(current.trim())sentences.push(current.trim());current='';};
 for(let i=0;i<chars.length;i++){
  const ch=chars[i],next=chars[i+1]||'';
  current+=ch;
  if(open[ch])quoteStack.push(open[ch]);
  else if(ch==='"'){
   if(quoteStack[quoteStack.length-1]==='"')quoteStack.pop();
   else quoteStack.push('"');
  }else if(close.test(ch)&&quoteStack[quoteStack.length-1]===ch)quoteStack.pop();
  // Keep dialogue intact through its closing quotation mark.
  if(quoteStack.length)continue;
  if(end.test(ch)){
   if(ch==='.'&&/\d/u.test(chars[i-1]||'')&&/\d/u.test(next))continue;
   // Sentence punctuation and the following quote/closing bracket form one unit.
   if(end.test(next)||/[”’」』\)\]]/u.test(next))continue;
   flush();
  }else if(close.test(ch)&&(!next||/\s/u.test(next))){
   // A quoted line without terminal punctuation is a complete dialogue unit.
   flush();
  }
 }
 flush();
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
/* Group entire sentences into pages, never splitting an utterance merely
 * because it wraps visually. A page turns only before the next sentence
 * would exceed the actual dialogue area.
 */
function paginateForHeight(sentences,maxHeight,measureHeight){
 const pages=[];let current=[];
 for(const item of sentences){
  if(current.length && measureHeight([...current,item])>maxHeight){
   pages.push(current);current=[item];
  }else current.push(item);
 }
 if(current.length)pages.push(current);
 return pages.length?pages:[[{text:'…',paragraphEnd:true}]];
}
function paginate(paragraphs,source){
 const sentences=paragraphs.flatMap((paragraph,paragraphIndex)=>{
  const parts=splitSentences(paragraph);
  return parts.map((text,index)=>({text,paragraphIndex,
   paragraphStart:index===0,paragraphEnd:index===parts.length-1}));
 });
 if(!sentences.length)sentences.push({text:'…',paragraphEnd:true});
 const text=source || $('#chapterText');
 const reader=text&&text.closest('.vn-dialogue,.outcome');
 if(!enabled||!reader||!reader.clientHeight||!text.clientWidth){
  const widthChars=Math.max(16,Math.floor((root.innerWidth||390)/13));
  return paginateForHeight(sentences,Math.max(96,(root.innerHeight||700)*.5),
   current=>current.reduce((height,item)=>height+Math.max(1,Math.ceil(graphemes(item.text).length/widthChars))*32,0));
 }
 const style=root.getComputedStyle(reader);
 const maxHeight=Math.max(48,reader.clientHeight
  -(parseFloat(style.paddingTop)||0)-(parseFloat(style.paddingBottom)||0)-14);
 const probe=root.document.createElement('div');
 probe.className='prose diary-literary-measure';
 // Use the same prose / paragraph styles as the actual page, offscreen.
 for(const [property,value] of Object.entries({
  position:'absolute',left:'-10000px',top:'0',display:'block',width:text.clientWidth+'px',
  height:'auto','min-height':'0','max-height':'none',flex:'none',visibility:'hidden',
  'pointer-events':'none',overflow:'visible','box-sizing':'border-box'
 }))probe.style.setProperty(property,value,'important');
 reader.append(probe);
 function measureHeight(items){
  renderPage(probe,items);
  const lines=probe.querySelectorAll('.diary-literary-line');
  const last=lines[lines.length-1];
  if(last){
   const cursor=root.document.createElement('span');
   cursor.className='diary-reading-cursor';
   cursor.textContent='▌';
   cursor.style.animation='none';
   last.append(cursor);
  }
  return probe.getBoundingClientRect().height;
 }
 try{
  return paginateForHeight(sentences,maxHeight,measureHeight);
 }finally{probe.remove();}
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
function writeSentence(row){
 if(!row)return;
 // Only the active sentence has a cursor. Earlier sentences remain intact.
 if(active)for(const cursor of active.querySelectorAll('.diary-reading-cursor'))cursor.remove();
 const text=row.getAttribute('aria-label')||row.textContent||'…';
 row.hidden=false;
 const paragraph=row.closest('.diary-literary-paragraph');
 if(paragraph)paragraph.hidden=false;
 row.classList.add('diary-literary-typing');
 row.classList.remove('diary-literary-ready','diary-literary-line-enter');
 const node=root.document.createTextNode('');
 const cursor=root.document.createElement('span');
 cursor.className='diary-reading-cursor';
 cursor.setAttribute('aria-hidden','true');
 cursor.textContent='▌';
 row.replaceChildren(node,cursor);
 row.setAttribute('aria-label',text);
 writingRow=row;writingText=text;writingNode=node;writingCursor=cursor;
 writingGraphemes=graphemes(text);
 const symbols=writingGraphemes;
 let count=0,ticks=0;
 const reducedMotion=Boolean(root.matchMedia&&root.matchMedia('(prefers-reduced-motion: reduce)').matches);
 if(reducedMotion||!root.setInterval){finishWriting();return;}
 writingTimer=root.setInterval(()=>{
  if(!writingRow||writingRow!==row){stopWriting();return;}
  const end=Math.min(symbols.length,count+2);
  node.nodeValue+=symbols.slice(count,end).join('');
  count=end;ticks++;
  if(count<symbols.length&&ticks%4===1&&/\S/u.test(symbols.slice(Math.max(0,count-2),count).join(''))){
   try{typingSound()}catch(_){}
  }
  if(count>=symbols.length)finishWriting();
 },26);
}
function renderPage(target,page){
 if(!target)return;
 const fragment=root.document.createDocumentFragment();
 let paragraph=null,lastIndex=null;
 for(const item of page){
  const entry=typeof item==='string'?{text:item}:item;
  const groupId=entry.paragraphIndex ?? Symbol('paragraph');
  if(!paragraph||groupId!==lastIndex){
   paragraph=root.document.createElement('div');
   paragraph.className='diary-literary-paragraph';
   paragraph.dataset.paragraphIndex=String(entry.paragraphIndex??'');
   fragment.append(paragraph);
   lastIndex=groupId;
  }
  const line=root.document.createElement('p');
  line.className='diary-literary-line';
  line.textContent=entry.text;
  line.setAttribute('aria-label',entry.text);
  paragraph.append(line);
 }
 target.replaceChildren(fragment);
}
function present(target){
 if(!enabled||!target)return;
 stopWriting();active=target;
 const rows=[...target.querySelectorAll('p.diary-literary-line')];
 visibleLines=rows.length?1:0;
 rows.forEach((row,index)=>{
  row.setAttribute('aria-label',row.textContent);
  row.hidden=index!==0;
 });
 for(const paragraph of target.querySelectorAll('.diary-literary-paragraph')){
  paragraph.hidden=!paragraph.querySelector('p.diary-literary-line:not([hidden])');
 }
 target.classList.remove('diary-literary-revealed','diary-text-arrive');
 if(rows[0])writeSentence(rows[0]);
}
function reveal(){
 // A tap completes typing; the next tap adds exactly one whole sentence.
 if(!enabled||!active)return false;
 if(finishWriting())return true;
 const rows=active.querySelectorAll('p.diary-literary-line');
 if(visibleLines>=rows.length)return false;
 writeSentence(rows[visibleLines++]);
 return true;
}
function isPrinting(){return Boolean(writingRow);}
const api=Object.freeze({VERSION:'literary/v5',mode,start,paginate,renderPage,present,reveal,isPrinting,setTypingSound,splitSentences,wrapParagraph,paginateForMetrics,paginateForHeight});
root.BeaguClassDiaryLiterary=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
