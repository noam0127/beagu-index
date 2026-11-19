/* Regression: five high-detail original female portraits and six expressions each.
 * This checks actual encoded WebP bytes, privacy, game integration, and legacy fallbacks.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const context={window:{}};
const jsFiles=[
 'class-diary-hq-jiyoon-v1.js',
 'class-diary-hq-minseo-v1.js',
 'class-diary-hq-suhyun-v1.js',
 'class-diary-hq-sea-v1.js',
 'class-diary-hq-yuri-v1.js',
 'class-diary-female-hq-emotions-v1.js',
 'class-diary-female-hq-v1.js'
];
for(const name of jsFiles){
 const source=fs.readFileSync(path.join(root,'js',name),'utf8');
 assert(source.length>200,'Empty source '+name);
 assert(!/localStorage|sessionStorage|indexedDB|navigator\.sendBeacon|XMLHttpRequest|fetch\(/.test(source),'No tracking or network '+name);
 new vm.Script(source,{filename:name}).runInNewContext(context);
}
const art=context.window.BeaguClassDiaryFemaleHQ;
assert(art&&art.VERSION==='class-diary-female-hq/v1');
const ids=['woman','none','suhyun','sea','yuri'];
const moods=['neutral','smile','worried','flustered','tired','shy'];
assert.equal(art.validate().characters,5);
assert.equal(art.validate().expressions,30);
function webpBytes(src){
 assert(src&&src.startsWith('data:image/webp;base64,'),'WebP data URL required');
 const bytes=Buffer.from(src.slice('data:image/webp;base64,'.length),'base64');
 assert.equal(bytes.toString('ascii',0,4),'RIFF');
 assert.equal(bytes.toString('ascii',8,12),'WEBP');
 return bytes;
}
const photoHashes=new Set();
const emotionHashes=new Set();
for(const id of ids){
 const photoRef=art.portrait(id);
 const photo=webpBytes(photoRef);
 assert(photo.length>8000&&photo.length<150000,'Original photo-style WebP compressed and intact: '+id);
 photoHashes.add(crypto.createHash('sha256').update(photo).digest('hex'));
 for(const mood of moods){
  const face=webpBytes(art.face(id,mood));
  assert(face.length>1000&&face.length<15000,'Expression payload '+id+' '+mood);
  emotionHashes.add(crypto.createHash('sha256').update(face).digest('hex'));
 }
}
assert.equal(photoHashes.size,5,'Each adult has a distinct original character image');
assert.equal(emotionHashes.size,30,'Each emotional thumbnail has a unique encoded image');
assert.equal(art.portrait('man'),null,'No changes to male character assets');
assert.equal(art.face('man','neutral'),null,'No changes to male character emoticons');
const page=fs.readFileSync(path.join(root,'teacher-class-diary-play.html'),'utf8');
const css=fs.readFileSync(path.join(root,'styles/class-diary-female-hq-v1.css'),'utf8');
for(const name of jsFiles){
 const version=name==='class-diary-female-hq-v1.js'?'20261120-upper-body-1':'20261120-hq1';
 assert(page.includes('src="js/'+name+'?v='+version+'"'),'Missing game asset '+name);
}
assert(!page.includes('class-diary-female-matte-v1.css'),'Matte illustration filtering must be disabled');
assert(!page.includes('femaleHQ.prepareMatte('),'No glossy-skin recoloring or matte image substitution');
assert(!('prepareMatte' in art),'Original photo portraits must load without a matte recoloring step');
assert(!('MATTE_ASSETS' in art),'Image source must not refer to cartoon/matte assets');
for(const id of ids)assert(art.portrait(id).startsWith('data:image/webp;base64,'),'Photo-style WebP restored');
for(const marker of [
 'femaleHQ.portrait(partner)','femaleHQ.portrait(who)','femaleHQ.portrait(guest.id)',
 'femaleHQ.face(who,expression','showCharacterFace(game.profile.partner,semesterArt.expression',
 'renderSupportingCast(chapterGuest)','maleSemester.paint(',
 'femaleHQ.portrait(guest.id)','id="sceneGuestPortrait"','id="scenePortrait"'
])assert(page.includes(marker),'Missing screen connection '+marker);
assert(page.includes('styles/class-diary-female-hq-v1.css?v=20261120-bust1'));
assert(page.includes('femaleHQ.prepareBust('),'Five female photo crops should initialize');
assert(page.includes("dataset.portraitFraming='bust'"),'Visible portrait should update when crop finishes');
assert(page.includes("femaleHQ.hasBust(who)"),'In-scene female art should use bust variant');
assert(page.includes("femaleHQ.hasBust(guest.id)"),'Female supporting actors should use bust variant');
assert(css.includes('[data-portrait-framing="bust"]'),'Upper-body framing CSS exists');
assert(css.includes('width:min(80vw,355px)'),'Mobile bust scaling exists');
assert(css.includes('max-width:620px'),'Mobile HQ layout must exist');
assert(css.includes('data-art-quality="hq"'),'HQ styling must be scoped');
// Test the exact crop geometry using a synchronous fake browser canvas.
assert.equal(art.prepareBust(),0,'Node without browser APIs should preserve originals');
assert.equal(Object.keys(art.BUST_CROP).length,5);
const cropCalls=[];
const repaint=[];
context.Image=class TestImage{
 constructor(){this.naturalWidth=800;this.naturalHeight=1200;}
 set src(url){assert(url.startsWith('data:image/webp;base64,'));this.onload();}
};
context.document={createElement(tag){
 assert.equal(tag,'canvas');
 return {
  width:0,height:0,
  getContext(kind){
   assert.equal(kind,'2d');
   return {drawImage(_img,x,y,w,h,dx,dy,dw,dh){
    cropCalls.push({x,y,w,h,dx,dy,dw,dh});
   }};
  },
  toDataURL(format,quality){
   assert.equal(format,'image/webp');
   assert.equal(quality,.86);
   return 'data:image/webp;base64,VEVTVA==';
  }
 };
}};
assert.equal(art.prepareBust((id,url)=>repaint.push({id,url})),5,'All five female crops should be generated');
assert.equal(cropCalls.length,5);
assert.equal(repaint.length,5);
for(const id of ids){
 assert(art.hasBust(id),'Prepared bust missing: '+id);
 assert(art.BUST_CROP[id]>=.65&&art.BUST_CROP[id]<=.72,'Keep upper-body only: '+id);
 assert(art.portrait(id).startsWith('data:image/webp;base64,'));
}
assert(!art.hasBust('man'),'Male portrait must never be cropped');
for(const call of cropCalls){
 assert.equal(call.w,800);
 assert.equal(call.dw,800);
 assert.equal(call.dh,call.h);
 assert.equal(call.y,0);
 assert(call.h>=780&&call.h<=864,'Waist-up crop must discard the lower third of body');
}
console.log('PASS female bust: five original portraits cropped to upper body, 30 expressions retained, mobile/desktop game integration, no storage');
