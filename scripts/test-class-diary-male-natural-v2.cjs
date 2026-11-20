'use strict';
const a=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const cast=require('../js/class-diary-male-natural-v2.js');
const root=path.join(__dirname,'..');
a.equal(Object.keys(cast.ASSETS).length,3);
let total=0;
for(const id of ['man','man2','man3']){
 const cfg=cast.cast(id);
 const buf=fs.readFileSync(path.join(root,cfg.src));
 a.equal(buf.toString('ascii',0,4),'RIFF');
 a.equal(buf.toString('ascii',8,12),'WEBP');
 a(buf.byteLength>40000, id+' high-resolution sprite unexpectedly tiny');
 a.equal(cast.POSES[id].length,8);
 a.equal(cfg.columns*cfg.rows,8);
 for(let i=1;i<=36;i++){
  const n=cast.poseIndex(id,i,false,null);
  a(Number.isInteger(n)&&n>=0&&n<8);
  a.equal(typeof cast.poseFor(id,i,false,null),'string');
  total++;
 }
 const node={style:{},dataset:{}};
 cast.paint(node,id,16,false,null,'spring');
 a.equal(node.dataset.maleActor,id);
 a.equal(node.dataset.maleAtlas,'v2');
 a.match(node.style.backgroundImage,/poses-v2\.webp/);
}
a.equal(cast.poseIndex('man',17,false,null),4);
a.equal(cast.poseIndex('man2',34,false,null),1);
a.equal(cast.poseIndex('man3',27,false,null),1);
a.equal(cast.poseIndex('man3',36,true,'2'),5);
const html=fs.readFileSync(path.join(root,'teacher-class-diary-play.html'),'utf8');
a(html.includes('js/class-diary-male-natural-v2.js'));
a(html.includes('styles/class-diary-male-natural-v2.css'));
a(html.includes('maleNatural.preload('));
a(html.includes('maleNatural.paint('));
const css=fs.readFileSync(path.join(root,'styles/class-diary-male-natural-v2.css'),'utf8');
a(css.includes('prefers-reduced-motion:reduce'));
for(const id of ['dogyeom','taeo'])a(css.includes(id+'-poses-v2.webp'));
const source=fs.readFileSync(require.resolve('../js/class-diary-male-natural-v2.js'),'utf8');
for(const banned of ['localStorage','sessionStorage','indexedDB','XMLHttpRequest','fetch(','sendBeacon'])a(!source.includes(banned));
console.log('PASS male cast 3 x 8 real poses; 36 x 3 episode selection '+total+'; photo assets; no persistence');
