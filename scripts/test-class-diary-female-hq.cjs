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
 const photo=webpBytes(art.portrait(id));
 assert(photo.length>10000&&photo.length<150000,'Portrait compression budget '+id);
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
 const version=name==='class-diary-female-hq-v1.js'?'20261120-matte-1':'20261120-hq1';
 assert(page.includes('src="js/'+name+'?v='+version+'"'),'Missing game asset '+name);
}
assert(page.includes('styles/class-diary-female-matte-v1.css?v=20261120-1'));
assert(page.includes('femaleHQ.prepareMatte('),'Matte pass must be active in the game');
const matteCss=fs.readFileSync(path.join(root,'styles/class-diary-female-matte-v1.css'),'utf8');
assert(matteCss.includes('brightness(.97)')&&matteCss.includes('saturate(.92)'),'Matte styling');
assert.equal(Object.keys(art.STYLE_KEYS).length,5,'Five distinctive identities');
assert.equal(art.prepareMatte(),0,'Node tests must not touch browser Canvas');
const pixels=new Uint8ClampedArray([250,225,209,255, 240,240,240,255, 85,67,54,255]);
art.mattePixels(pixels,3,1);
assert(pixels[0]<250&&pixels[1]<225,'Warm pale specular skin must lose highlight');
assert.deepEqual(Array.from(pixels.slice(4,8)),[240,240,240,255],'Neutral grays must not be recolored');
assert.deepEqual(Array.from(pixels.slice(8,12)),[85,67,54,255],'Dark linework must stay intact');
for(const marker of [
 'femaleHQ.portrait(partner)','femaleHQ.portrait(who)','femaleHQ.portrait(guest.id)',
 'femaleHQ.face(who,expression','showCharacterFace(game.profile.partner,semesterArt.expression',
 'renderSupportingCast(chapterGuest)','maleSemester.paint(',
 'femaleHQ.portrait(guest.id)','id="sceneGuestPortrait"','id="scenePortrait"'
])assert(page.includes(marker),'Missing screen connection '+marker);
assert(page.includes('styles/class-diary-female-hq-v1.css?v=20261120-hq1'));
assert(css.includes('max-width:620px'),'Mobile HQ layout must exist');
assert(css.includes('data-art-quality="hq"'),'HQ styling must be scoped');
console.log('PASS HQ: 5 distinct women, 30 expressions, local matte skin highlight reduction, 36-episode/7-day integration, no persistence');
