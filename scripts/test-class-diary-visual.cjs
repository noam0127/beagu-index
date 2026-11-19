/* Stage 5: text-free independent backgrounds and consistent original adult portraits. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const visual=require('../js/class-diary-visual-v1.js');
assert.equal(visual.VERSION,'class-diary-visual/v1');
for(const scene of ['morning','meeting','classroom','hallway','evening','weekend','night','gate','cafe','consultation']){
 const image=visual.backgroundSvg(scene);
 assert(image.startsWith('<svg'));
 assert(image.endsWith('</svg>'));
 assert(!/<text(?:\\s|>)|<foreignObject|<image(?:\\s|>)|<a\\s/.test(image),'No text or external images in scene art');
 assert(visual.dataUrl(image).startsWith('data:image/svg+xml'));
}
for(const partner of ['woman','man','none']){
 const baseline=visual.portraitSvg(partner,'neutral');
 assert(baseline.startsWith('<svg'));
 assert(visual.portraitSvg(partner,'happy').includes('</svg>'));
 assert(visual.portraitSvg(partner,'worried').includes('</svg>'));
 assert(!/<text|<foreignObject/.test(baseline));
 assert(visual.CAST[partner].age>=20);
}
assert.notEqual(visual.portraitSvg('woman','neutral'),visual.portraitSvg('man','neutral'));
assert.notEqual(visual.portraitSvg('woman','neutral'),visual.portraitSvg('woman','happy'));
assert.equal(visual.sceneForEvent({place:'교문 앞'},1),'gate');
assert.equal(visual.sceneForEvent({place:'동네 카페'},6),'cafe');
assert.equal(visual.sceneForEvent({place:'일요일 밤 집'},7),'night');
assert.equal(visual.sceneForEvent({place:'복도'},2),'hallway');
const content=fs.readFileSync(require('node:path').join(__dirname,'../js/class-diary-visual-v1.js'),'utf8');
assert(!/localStorage|sessionStorage|indexedDB|fetch\(|sendBeacon/.test(content));
console.log('PASS: 10 text-free school scene variants, adult portraits, separate renderable layers, no persistence');
