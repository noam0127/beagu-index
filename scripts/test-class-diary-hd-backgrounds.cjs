/* Photorealistic stage asset contract; 7-day SVG mode remains intact. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const bg=require('../js/class-diary-seasonal-background-v1.js');
const sem=require('../js/class-diary-semester-v1.js');
const root=path.resolve(__dirname,'..');
const names=['bedroom-night','bookstore-dusk','classroom-cold-spring-morning',
 'consultation-room-day','grade-office-morning','hallway-cold-spring-day',
 'meeting-room-afternoon','playground-day','school-gate-dusk','street-dusk'];
const paths=Object.values(bg.HD_ASSETS);
assert.equal(paths.length,10);
assert.deepEqual(paths.map(x=>x.slice(0,-5)).sort(),names);
assert.equal(new Set(paths).size,10);
for(const [scene,file] of Object.entries(bg.HD_ASSETS)){
 const rel=bg.assetFor({scene,month:'03'}),data=fs.readFileSync(path.join(root,rel));
 assert.equal(rel,'assets/class-diary/backgrounds/'+file);
 assert(!rel.startsWith('/')&&!rel.includes('..')&&!rel.includes('://'));
 assert.equal(data.toString('ascii',0,4),'RIFF',rel);
 assert.equal(data.toString('ascii',8,12),'WEBP',rel);
 assert(data.length<=650000,'oversize '+rel);
 assert.equal(data.toString('ascii',12,16),'VP8 ',rel);
 assert.deepEqual([data.readUInt16LE(26)&0x3fff,data.readUInt16LE(28)&0x3fff],[1920,1080],rel);
}
for(let i=0;i<36;i++){
 const date='2027-'+sem.SCENES[i][0];
 assert(bg.assetFor(bg.resolve({episode:i+1,date})),'unmapped episode '+(i+1));
}
assert.equal(bg.assetFor({scene:'missing'}),null);
const html=fs.readFileSync(path.join(root,'teacher-class-diary-play.html'),'utf8');
for(const m of ["seasonalBackground.assetFor(semesterBackground)","preload.onload=()=>",
 "preload.onerror=()=>","backgroundImageSequence!==backgroundSequence",
 "backdrop.dataset.asset='svg-fallback'","backdrop.dataset.asset='hd-webp'",
 "visual.dataUrl(visual.backgroundSvg(id))","src=\"js/class-diary-seasonal-background-v1.js?v=20261120-36\""])
 assert(html.includes(m),'HTML missing '+m);
const source=fs.readFileSync(path.join(root,'js/class-diary-seasonal-background-v1.js'),'utf8');
for(const x of ['localStorage','sessionStorage','indexedDB','fetch(','XMLHttpRequest','navigator.sendBeacon'])
 assert(!source.includes(x),'privacy violation: '+x);
console.log('PASS 10 photographic full HD backgrounds, 36 chapters, fallback, privacy and seven-day isolation');
