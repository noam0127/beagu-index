/* Regression: male characters use the Korean-drama-style photographic cutouts with transparent backgrounds. 
 * This file retains its previous path so the existing CI workflow and test links keep working. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const lead=require('../js/class-diary-semester-male-art-v1.js');
const colleagues=require('../js/class-diary-male-photos-v1.js');
const boy=require('../js/class-diary-student-doyun-v1.js');
assert.equal(lead.SPRITE,'assets/class-diary/characters/hyunwoo-six-transparent-v2.webp');
assert.equal(colleagues.SPRITE,'assets/class-diary/characters/male-supporting-transparent-v2.webp');
assert.equal(boy.SPRITE,'assets/class-diary/characters/doyun-four-transparent-v2.webp');
assert.equal(new Set([lead.SPRITE,colleagues.SPRITE,boy.SPRITE]).size,3);
for(const source of [lead.SPRITE,colleagues.SPRITE,boy.SPRITE]){
 const file=fs.readFileSync(path.join(root,source));
 assert.equal(file.toString('ascii',0,4),'RIFF');
 assert.equal(file.toString('ascii',8,12),'WEBP');
 assert(file.length>3000 && file.length<20000);
}
const node={style:{},dataset:{}};
lead.paint(node,'shy','summer');
assert.equal(node.style.backgroundSize,'300% 200%');
assert.equal(node.style.backgroundPosition,'100% 100%');
assert.equal(node.dataset.expression,'shy');
for(const [who,position] of [['junseo','0% 0%'],['dohyun','50% 0%'],['taesik','100% 0%']]){
 colleagues.paint(node,who);
 assert.equal(node.style.backgroundPosition,position);
 assert.equal(node.style.backgroundSize,'300% auto');
}
const photo={style:{}};
const student={
 hidden:true,dataset:{},
 classList:{add(){},remove(){},toggle(){}},
 querySelector(){return photo;},
 removeAttribute(){}
};
assert.equal(boy.render(student,35,false,true).id,'doyun');
assert.equal(photo.style.backgroundPosition,'100% 100%');
assert.equal(photo.style.backgroundSize,'200% 200%');
assert.equal(boy.render(student,36,false,false),null);
const html=fs.readFileSync(path.join(root,'teacher-class-diary-play.html'),'utf8');
for(const script of ['class-diary-male-photos-v1.js','class-diary-semester-male-art-v1.js','class-diary-student-doyun-v1.js']){
 assert(html.includes(script+'?v=20261120-alpha-1'),'Versioned photo module not linked: '+script);
}
assert(!html.includes('class-diary-male-webtoon-v1.css'),'Webtoon CSS must not load');
assert(html.includes('renderSupportingCast(')&&html.includes('studentDoyun.render('));
for(const file of ['js/class-diary-semester-male-art-v1.js','js/class-diary-male-photos-v1.js','js/class-diary-student-doyun-v1.js']){
 const src=fs.readFileSync(path.join(root,file),'utf8');
 for(const pattern of ['localStorage','sessionStorage','indexedDB','XMLHttpRequest','navigator.sendBeacon','fetch('])
  assert(!src.includes(pattern),'Private data collection forbidden: '+file);
}
console.log('PASS: transparent Korean-drama male actors + six/four expressions + original guests + privacy');
