/* Shared male visual style for the 36-episode story and legacy guest setup. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const lead=require('../js/class-diary-semester-male-art-v1.js');
const men=require('../js/class-diary-male-photos-v1.js');
const boy=require('../js/class-diary-student-doyun-v1.js');
assert.equal(lead.SPRITE,men.SPRITE);
assert.equal(men.SPRITE,boy.SPRITE);
assert.equal(men.SPRITE,'assets/class-diary/characters/male-cast-webtoon-v1.webp');
const sprite=fs.readFileSync(path.join(root,lead.SPRITE));
assert.equal(sprite.toString('ascii',0,4),'RIFF');
assert.equal(sprite.toString('ascii',8,12),'WEBP');
assert.equal(sprite.length,9034);
const el={style:{},dataset:{}},other={style:{},dataset:{}};
lead.paint(el,'tired','summer');
assert.equal(el.style.backgroundSize,'500% 100%');
assert.equal(el.style.backgroundPosition,'0% 0%');
assert.equal(el.dataset.expression,'tired');
for(const [person,expected] of [['junseo','25% 0%'],['dohyun','50% 0%'],['taesik','75% 0%']]){
 men.paint(other,person);assert.equal(other.style.backgroundPosition,expected);
}
const photo={style:{},dataset:{}};
const node={hidden:true,dataset:{},classList:{add(){},remove(){},toggle(){}},querySelector(){return photo},removeAttribute(){}};
assert.equal(boy.render(node,35,false,false).id,'doyun');
assert.equal(photo.style.backgroundPosition,'100% 0%');
assert.equal(photo.style.backgroundSize,'500% 100%');
const page=fs.readFileSync(path.join(root,'teacher-class-diary-play.html'),'utf8');
for(const name of ['class-diary-male-photos-v1.js','class-diary-semester-male-art-v1.js','class-diary-student-doyun-v1.js'])assert(page.includes(name+'?v=20261120-webtoon-v1'),'cache bumped '+name);
for(const code of ['js/class-diary-semester-male-art-v1.js','js/class-diary-male-photos-v1.js','js/class-diary-student-doyun-v1.js']){
 const text=fs.readFileSync(path.join(root,code),'utf8');
 for(const pattern of ['localStorage','sessionStorage','indexedDB','navigator.sendBeacon','XMLHttpRequest','fetch('])assert(!text.includes(pattern),code+' privacy');
}
console.log('PASS: all five male characters use one illustrated 5-column WebP; no realistic assets rendered');
