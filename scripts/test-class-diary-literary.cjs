/* Contract: one complete Korean sentence per tap; retain measuring helpers for layout. */
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
assert.deepEqual(api.paginate(original).flat().map(x=>x.text),original.flatMap(api.splitSentences),'Each tap yields one complete sentence in order');
assert.equal(typeof api.setTypingSound,'function','Sound hook must respect existing SFX controls');
assert(implementation.includes("className='diary-reading-cursor'"),'A blinking cursor must appear while waiting');
assert(implementation.includes('writingTimer=root.setInterval'),'Letters should appear with a brief typewriter animation');
console.log('PASS literary v3: sentence splitting, pause cursor, typewriter and original line layout helpers');
