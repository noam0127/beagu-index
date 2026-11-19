/* Quick release SD scene smoke: isolated original SVG render for each adult character. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const sd=require('../js/class-diary-sd-v1.js');
assert.equal(sd.VERSION,'class-diary-sd/v1');
assert.deepEqual(sd.EXPRESSIONS,['neutral','smile','worried','flustered','tired','shy']);
const signatures=new Set();
for(const who of ['woman','man','none','suhyun','sea','yuri']){
 const neutral=sd.portraitSvg(who,'neutral');
 assert.match(neutral,/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
 assert(neutral.endsWith('</svg>'));
 assert(!/<script|<image|foreignObject|<text/.test(neutral));
 signatures.add(neutral);
 for(const expression of sd.EXPRESSIONS){
  const svg=sd.portraitSvg(who,expression);
  assert(svg.length>900,'SD figure is empty');
  assert(svg!==''&&svg.endsWith('</svg>'));
  if(expression!=='neutral')assert.notEqual(svg,neutral,'Expression must visibly change');
 }
}
assert.equal(signatures.size,6,'All six SD figures must be distinct');
const content=fs.readFileSync(require('node:path').join(__dirname,'../js/class-diary-sd-v1.js'),'utf8');
assert(!/localStorage|sessionStorage|indexedDB|sendBeacon|fetch\(/.test(content));
const html=fs.readFileSync(require('node:path').join(__dirname,'../teacher-class-diary-play.html'),'utf8');
assert(html.includes('js/class-diary-sd-v1.js?v=20261120-female-sd2'));
assert(html.includes('sd.portraitSvg(who,expression'));
assert(html.includes('@media(max-width:620px)'));
for(const id of ['setupPortraitSuhyun','setupPortraitSea','setupPortraitYuri'])assert(html.includes(id));
console.log('PASS SD quick-release: 6 distinct adult characters, 6 expressions, scene UI linked, no persistence');
