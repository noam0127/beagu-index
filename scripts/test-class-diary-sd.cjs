/* Quick release SD scene smoke: isolated original SVG render for each adult character. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const sd=require('../js/class-diary-sd-v1.js');
const supporting=require('../js/class-diary-supporting-cast-v1.js');
const female=require('../js/class-diary-female-semester-v1.js');
const semester=require('../js/class-diary-semester-v1.js');
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
for(const id of ['sea','suhyun','yuri'])assert(supporting.PEOPLE[id],'Missing existing supporting woman '+id);
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

assert.equal(female.VERSION,'class-diary-female-semester/v1');
assert.equal(female.EPISODE_MOODS.length,36);
assert.deepEqual(female.SEASONS, {
 'cold-spring':'추운 초봄',spring:'봄','late-spring':'늦봄','early-summer':'초여름',summer:'한여름'
});
assert.equal(female.seasonForDate('2027-03-08'),'cold-spring');
assert.equal(female.seasonForDate('2027-04-01'),'spring');
assert.equal(female.seasonForDate('2027-05-31'),'late-spring');
assert.equal(female.seasonForDate('2027-06-02'),'early-summer');
assert.equal(female.seasonForDate('2027-07-16'),'summer');
assert.equal(female.seasonForDate('2028-03-08'),null,'Only fictional semester dates are supported');
for(const actor of ['woman','none','suhyun','sea','yuri']){
 const original=sd.portraitSvg(actor,'neutral');
 assert.equal(sd.portraitSvg(actor,'neutral',null),original,'Seven-day SD visual must be unchanged');
 const cold=sd.portraitSvg(actor,'neutral','cold-spring');
 const summer=sd.portraitSvg(actor,'neutral','summer');
 assert.notEqual(cold,summer,'Female wardrobe should change with season: '+actor);
 for(const variant of [cold,summer]){
  assert(variant.startsWith('<svg')&&variant.endsWith('</svg>'));
  assert(!/<script|<image|foreignObject|<text/.test(variant));
 }
}
for(const partner of ['woman','none','man']){
 for(let ep=1;ep<=36;ep++){
  const art=female.artFor({episode:ep,partner,scenes:semester.SCENES});
  assert(['cold-spring','spring','late-spring','early-summer','summer'].includes(art.season));
  assert(sd.EXPRESSIONS.includes(art.expression),'Mood must use an existing expression');
  if(partner==='none')assert(art.expression!=='shy','Friendship must not use romantic shy cue');
  if(art.guest){
   assert(female.WOMEN[art.guest.id],'Female cameo ID must be supported');
   assert.notEqual(art.guest.id,partner,'Cannot show the same cast member twice');
   assert(sd.portraitSvg(art.guest.id,art.guest.expression,art.season).endsWith('</svg>'));
  }
  const reflection=female.artFor({episode:ep,partner,scenes:semester.SCENES,reflection:true,choiceId:'2'});
  assert.equal(reflection.guest,null,'No unrelated guest in choice reflection');
 }
}
for(const [episode,id] of [[2,'yuri'],[5,'suhyun'],[13,'suhyun'],[21,'sea'],[22,'suhyun'],[29,'sea'],[31,'suhyun']]){
 assert.equal(female.guestFor(episode,'woman',false).id,id,'Specific episode cameo identity');
}
assert.equal(female.guestFor(17,'woman',false).id,'none','Jiyoon route shows Minseo at the staff-room incident');
assert.equal(female.guestFor(17,'none',false).id,'woman','Minseo route shows Jiyoon at the staff-room incident');

const content=fs.readFileSync(require('node:path').join(__dirname,'../js/class-diary-sd-v1.js'),'utf8');
assert(!/localStorage|sessionStorage|indexedDB|sendBeacon|fetch\(/.test(content));
const cameoSource=fs.readFileSync(require('node:path').join(__dirname,'../js/class-diary-supporting-cast-v1.js'),'utf8');
assert(!/localStorage|sessionStorage|indexedDB|sendBeacon|fetch\(/.test(cameoSource));
const html=fs.readFileSync(require('node:path').join(__dirname,'../teacher-class-diary-play.html'),'utf8');
assert(html.includes('src="js/class-diary-female-semester-v1.js?v=20261120"'));
assert(html.includes('renderSupportingCast(semesterArt.guest,semesterArt.season)'));
assert(html.includes('femaleSemester.artFor({'));
assert(html.includes('js/class-diary-sd-v1.js?v=20261120-female-sd3'));
assert(html.includes('sd.portraitSvg(who,expression'));
assert(html.includes('src="js/class-diary-supporting-cast-v1.js"'));
assert(html.includes('styles/class-diary-supporting-cast-v1.css'));
for(const id of ['sceneGuest','sceneGuestPortrait','sceneGuestName','sceneGuestRole'])assert(html.includes('id="'+id+'"'));
assert(html.includes('renderSupportingCast(chapterGuest)'));
assert(html.includes('renderSupportingCast(eventGuest)'));
assert(html.includes('@media(max-width:620px)'));
for(const id of ['setupPortraitSuhyun','setupPortraitSea','setupPortraitYuri'])assert(html.includes(id));
console.log('PASS SD: 5 distinctive adult women, 6 expressions, 3 featured chapter cameos, 5 event cameos, non-persistent UI');
