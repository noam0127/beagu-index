'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const lead=require('../js/class-diary-semester-male-art-v1.js');
const guests=require('../js/class-diary-male-photos-v1.js');
const pupil=require('../js/class-diary-student-doyun-v1.js');
const paths=[lead.SPRITE,guests.SPRITE,pupil.SPRITE];
assert.equal(paths.length,3);
assert.equal(new Set(paths).size,3);
for(const p of paths){
 assert(p.includes('transparent-v2.webp'));
 const content=fs.readFileSync(path.join(root,p));
 assert.equal(content.toString('ascii',0,4),'RIFF');
 assert.equal(content.toString('ascii',8,12),'WEBP');
 assert(content.length>2000);
}
const html=fs.readFileSync(path.join(root,'teacher-class-diary-play.html'),'utf8');
const css=fs.readFileSync(path.join(root,'styles/class-diary-actors-natural-v1.css'),'utf8');
assert(html.includes('styles/class-diary-actors-natural-v1.css?v='));
assert(html.indexOf('styles/class-diary-background-only-v1.css')<html.indexOf('styles/class-diary-actors-natural-v1.css'));
for(const id of ['scenePortrait','sceneHyunwooLive','sceneGuest','sceneDoyun']){
 assert(css.includes('#'+id+':not([hidden])'));
 assert(css.includes('#'+id+'[hidden]'));
}
assert(css.includes('background-color:transparent!important'));
assert(css.includes('prefers-reduced-motion:reduce'));
assert(html.includes('game.profile.partner'));
assert(!/id=["'](?:scenePlayer|sceneNarrator|playerPortrait)["']/.test(html),'The narrator must remain a first-person POV, never a visible actor');
const spriteNode={style:{},dataset:{}};
lead.paint(spriteNode,'tired','summer');assert.equal(spriteNode.dataset.pose,'tired');
guests.paint(spriteNode,'junseo');assert.equal(spriteNode.dataset.pose,'junseo');
assert.equal(pupil.stateFor(36),null);
for(const p of ['js/class-diary-semester-male-art-v1.js','js/class-diary-male-photos-v1.js','js/class-diary-student-doyun-v1.js']){
 const code=fs.readFileSync(path.join(root,p),'utf8');
 assert(!/localStorage|sessionStorage|indexedDB|navigator.sendBeacon|fetch\(/.test(code));
}
console.log('PASS transparent character cutouts, visible stage layers, first-person narrator and reduced motion');
