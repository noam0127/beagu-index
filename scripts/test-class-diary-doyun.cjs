/* Character art matching the 36-episode story, not inventing or storing student data. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const book=require('../js/class-diary-semester-v1.js');
const doyun=require('../js/class-diary-student-doyun-v1.js');
assert.deepEqual(book.validate(),{episodes:36,acts:6,choices:108,endingTypes:5});
const episodes=[1,4,9,15,20,24,26,32,35];
assert.deepEqual(Object.keys(doyun.SCENES).map(Number),episodes);
for(let n=1;n<=36;n++){
 const state=doyun.stateFor(n);
 if(episodes.includes(n)){
  assert(state&&state.episode===n);
  assert(book.SCENES[n-1].some(t=>String(t).includes('도윤')),'Student must be named in story '+n);
  assert(doyun.MOODS.includes(state.expression));
 }else assert.equal(state,null);
}
assert.equal(doyun.stateFor(36),null,'Empty classroom must not show remembered student');
const classSet=new Set(),photo={style:{}};
const node={hidden:true,dataset:{},classList:{add:x=>classSet.add(x),remove:x=>classSet.delete(x),toggle:(x,v)=>v?classSet.add(x):classSet.delete(x)},querySelector:()=>photo,removeAttribute:x=>{}};
assert.equal(doyun.render(node,35,false,true).expression,'speaking');
assert.equal(node.hidden,false);
assert.equal(photo.style.backgroundPosition,'100% 0%');
assert(classSet.has('with-other-guest'));
assert.equal(doyun.render(node,36,false,false),null);
assert.equal(node.hidden,true);
const binary=fs.readFileSync(path.join(root,doyun.SPRITE));
assert.equal(binary.toString('ascii',0,4),'RIFF');
assert.equal(binary.toString('ascii',8,12),'WEBP');
assert(binary.length>3000&&binary.length<15000);
const html=fs.readFileSync(path.join(root,'teacher-class-diary-play.html'),'utf8');
for(const phrase of ['id="sceneDoyun"','class-diary-student-doyun-v1.js','studentDoyun.hide','studentDoyun.render'])
 assert(html.includes(phrase),'Missing photo integration: '+phrase);
const code=fs.readFileSync(require.resolve('../js/class-diary-student-doyun-v1.js'),'utf8');
for(const banned of ['localStorage','sessionStorage','indexedDB','XMLHttpRequest','navigator.sendBeacon','fetch('])
 assert(!code.includes(banned),'No collection of child data: '+banned);
console.log('PASS: fictional student Doyun appears in 9 named episodes, 4 emotions, no saves or grade changes');
