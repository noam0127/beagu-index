/* Quick release SD scene smoke: isolated original SVG render for each adult character. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const sd=require('../js/class-diary-sd-v1.js');
const supporting=require('../js/class-diary-supporting-cast-v1.js');
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
assert.equal(supporting.VERSION,'class-diary-supporting-cast/v1');
assert.deepEqual(Object.keys(supporting.PEOPLE).sort(),['sea','suhyun','yuri']);
for(const [day,name] of [[2,'박수현'],[4,'오세아'],[5,'강유리']]){
 const guest=supporting.describe(supporting.sceneMoment(day,false));
 assert(guest&&guest.name===name, 'Each supporting woman must appear on a dedicated story day');
 assert(sd.portraitSvg(guest.id,guest.expression).includes('</svg>'));
 assert(supporting.sceneMoment(day,true)===null,'No cameo over reflection outcomes');
}
for(const event of ['hand_off','shared_meeting','hostile_meeting','procedure','week_end']){
 const guest=supporting.describe(supporting.eventMoment({id:event}));
 assert(guest&&guest.text.includes(guest.name),'Event cameo must have a named, consistent line');
 assert.equal(supporting.eventMoment({id:event,result:{line:'done'}}),null);
}
const content=fs.readFileSync(require('node:path').join(__dirname,'../js/class-diary-sd-v1.js'),'utf8');
assert(!/localStorage|sessionStorage|indexedDB|sendBeacon|fetch\(/.test(content));
const cameoSource=fs.readFileSync(require('node:path').join(__dirname,'../js/class-diary-supporting-cast-v1.js'),'utf8');
assert(!/localStorage|sessionStorage|indexedDB|sendBeacon|fetch\(/.test(cameoSource));
const html=fs.readFileSync(require('node:path').join(__dirname,'../teacher-class-diary-play.html'),'utf8');
assert(html.includes('js/class-diary-sd-v1.js?v=20261120-female-sd2'));
assert(html.includes('sd.portraitSvg(who,expression'));
assert(html.includes('src="js/class-diary-supporting-cast-v1.js"'));
assert(html.includes('styles/class-diary-supporting-cast-v1.css'));
for(const id of ['sceneGuest','sceneGuestPortrait','sceneGuestName','sceneGuestRole'])assert(html.includes('id="'+id+'"'));
assert(html.includes('renderSupportingCast(chapterGuest)'));
assert(html.includes('renderSupportingCast(eventGuest)'));
assert(html.includes('@media(max-width:620px)'));
for(const id of ['setupPortraitSuhyun','setupPortraitSea','setupPortraitYuri'])assert(html.includes(id));
console.log('PASS SD: 5 distinctive adult women, 6 expressions, 3 featured chapter cameos, 5 event cameos, non-persistent UI');
