/* Contract: a complete Korean sentence appears per tap, accumulating until the box fills. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const api=require('../js/class-diary-literary-v1.js');
const measure=s=>[...s].length*10;
const original=[
 '아침 햇살이 들어왔다. 한 사람의 이름이 새로 적혀 있었다.',
 '그날의 대답은 쉽게 나오지 않았다. 내일 다시 묻기로 했다.',
 '복도 끝 창문이 열린 뒤 바람이 교실로 들어왔다.'
];
const rows=original.flatMap(p=>api.wrapParagraph(p,90,measure));
assert(rows.length>original.length,'Each paragraph should form multiple screen lines');
assert(rows.every(x=>measure(x.text)<=90),'No line should exceed the allowed width');
assert.deepEqual(rows.filter(x=>x.paragraphEnd).length,original.length,'Paragraph endings must remain identifiable');
assert.equal(rows.map(x=>x.text).join(' ').replace(/\s/g,''),original.join('').replace(/\s/g,''),
 'Every original character must survive wrapping, without additions or loss');
const pages=api.paginateForMetrics(original,90,5,measure);
assert(pages.length>1,'Long prose should fill pages and continue');
assert(pages.every(p=>p.length>=1&&p.length<=5),'Each page must respect available screen lines');
assert.deepEqual(pages.flat(),rows,'Pagination must preserve the complete ordered prose');
const tiny=api.wrapParagraph('가나다라마바사아자차카타파하',20,measure);
assert(tiny.every(x=>measure(x.text)<=20),'A long unbroken Korean word must still fit');
const implementation=fs.readFileSync(path.join(__dirname,'../js/class-diary-literary-v1.js'),'utf8');
for(const forbidden of ['diary-literary-echo','localStorage','sessionStorage','fetch(','sendBeacon']){
 assert(!implementation.includes(forbidden),'Literary reader must not echo, persist, or transmit data: '+forbidden);
}
const sentences=api.splitSentences('교실은 조용했다. “돌아올게요.” 그가 고개를 끄덕였다!');
assert.deepEqual(sentences,['교실은 조용했다.','“돌아올게요.”','그가 고개를 끄덕였다!'],'Split at sentence endings including quotations');
assert.deepEqual(api.splitSentences('2027.03.08 새 학기. 3.14가 보였다.'),['2027.03.08 새 학기.','3.14가 보였다.'],'Do not split decimals or date strings');
assert.deepEqual(api.splitSentences('“여기야. 괜찮아?” 그는 물었다. “응” 고개를 끄덕였다.'),
 ['“여기야. 괜찮아?”','그는 물었다.','“응”','고개를 끄덕였다.'],
 'Preserve sentences inside quotations until the closing quote, even without punctuation');
const expected=original.flatMap(api.splitSentences);
assert.deepEqual(api.paginate(original).flat().map(x=>x.text),expected,'Each tap yields one complete sentence in order');
const paragraphItems=api.paginate(original).flat();
assert.deepEqual(paragraphItems.map(item=>item.paragraphIndex),[0,0,1,1,2],
 'Two sentences in one original paragraph must stay in the same group');
assert.deepEqual(paragraphItems.map(item=>item.paragraphStart),[true,false,true,false,true],
 'Only the start of a source paragraph may start a new paragraph block');
assert.deepEqual(paragraphItems.map(item=>item.paragraphEnd),[false,true,false,true,true],
 'Only the end of a source paragraph should trigger paragraph spacing');
const scene=fs.readFileSync(path.join(__dirname,'../teacher-class-diary-play.html'),'utf8');
assert(scene.includes("literary.renderPage(target,currentPage)"),'Story reader must render original paragraph groups');
assert(scene.includes("literary.renderPage(text,page)"),'Ending pages must retain natural paragraph breaks');
assert(!scene.includes('void target.offsetWidth'),'A forced reflow must not restart a screen-wide fade');
const tidy=fs.readFileSync(path.join(__dirname,'../js/class-diary-hud-tidy-v1.js'),'utf8');
assert(!tidy.includes("reader.addEventListener('click'"),'Text click must not advance twice through nested handlers');
const style=fs.readFileSync(path.join(__dirname,'../styles/class-diary-paragraph-v1.css'),'utf8');
assert(style.includes('p.diary-literary-line:not(:first-child)::before'), 'Adjacent sentences need a normal space, not a line break');
assert(style.includes('animation:none!important'), 'The paragraph layer must suppress per-tap animation');

const packed=api.paginateForHeight(expected.map(text=>({text,paragraphEnd:true})),101,items=>items.length*33);
assert.deepEqual(packed.map(page=>page.length),[3,2],'Sentences should fill each page to capacity without adding or losing any');
assert(packed[0].length>1,'A page must retain multiple sentences rather than replacing them');
assert.equal(typeof api.setTypingSound,'function','Sound hook must respect existing SFX controls');
assert(implementation.includes("className='diary-reading-cursor'"),'A blinking cursor must appear while waiting');
assert(implementation.includes('writingTimer=root.setInterval'),'Letters should appear with a brief typewriter animation');
const motion=fs.readFileSync(path.join(__dirname,'../js/class-diary-motion-v1.js'),'utf8');
const glowCss=fs.readFileSync(path.join(__dirname,'../styles/class-diary-paragraph-v1.css'),'utf8');
assert(!motion.includes("restartAnimation(target,'diary-motion-copy')"),
 'Sentence additions must never restart an animation on the entire text area');
assert(motion.includes("restartAnimation(screens[step],'diary-motion-step')"),
 'Keep actual setup scene transitions');
assert(glowCss.includes('-webkit-tap-highlight-color: transparent'),
 'Disable browser tap highlight over the manuscript');
assert(glowCss.includes('#chapterText.diary-motion-copy') &&
 glowCss.includes('animation:none!important'),
 'Prevent stale motion-copy classes from flashing prose');
assert(scene.includes('class-diary-motion-v1.js?v=20261120-no-glow2') &&
 scene.includes('class-diary-paragraph-v1.css?v=20261120-no-glow2'),
 'The game must load the updated assets rather than cached glow styles');

console.log('PASS literary v5: punctuation, natural paragraphs, single-advance taps, no screen flicker and typing cursor');
