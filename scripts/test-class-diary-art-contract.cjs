/* Stage 7-1: asset plan contract only. No binary art is required until status=ready. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const visual=require('../js/class-diary-visual-v1.js');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/class-diary-art-manifest-v1.json'),'utf8'));
const REQUIRED_EXPRESSIONS=['neutral','smile','worried','flustered','tired','shy'];
const REQUIRED_LEGACY_SCENES=['morning','meeting','classroom','hallway','evening','weekend','night','gate','cafe','consultation'];
const REQUIRED_PARTNERS={woman:'jiyoon',man:'hyunwoo',none:'minseo'};
const uniquePaths=new Set();
let ready=0;
function checkImage(relative,status,limit){
 assert.match(relative,/^assets\/class-diary\/(?:characters\/[a-z]+\/[a-z]+|backgrounds\/[a-z-]+)\.webp$/);
 assert(!uniquePaths.has(relative),'Duplicate asset path: '+relative);
 uniquePaths.add(relative);
 assert(['planned','ready'].includes(status),'Invalid status: '+status);
 if(status!=='ready')return;
 const full=path.resolve(root,relative);
 assert(full.startsWith(root+path.sep),'Unsafe path');
 assert(fs.existsSync(full),'Ready asset missing: '+relative);
 const bytes=fs.readFileSync(full);
 assert(bytes.length>100&&bytes.length<=limit,'Image byte budget failed: '+relative);
 assert.equal(bytes.toString('ascii',0,4),'RIFF','Not a RIFF WebP: '+relative);
 assert.equal(bytes.toString('ascii',8,12),'WEBP','Not a WebP: '+relative);
 ready++;
}
assert.equal(manifest.schema,'class-diary-art-manifest/v1');
assert.equal(manifest.fallback,'legacy-svg');
assert.equal(manifest.artDirection.id,'korean-live-action-drama-photorealistic-v1');
assert.equal(manifest.artDirection.rendering,'photorealistic');
assert.equal(manifest.artDirection.format,'fictional-original-adult-cast');
assert.equal(manifest.artDirection.referenceUse,'composition-only-no-identity-copy');
assert.equal(manifest.artDirection.protagonist,'first-person-configurable-no-fixed-portrait');
for(const banned of ['anime','cartoon','manga','watercolor','chibi','celebrity-likeness','existing-drama-stills']){
 assert(manifest.artDirection.forbiddenStyles.includes(banned),'Missing prohibited visual direction '+banned);
}

assert.equal(visual.VERSION,'class-diary-visual/v1');
assert.deepEqual(manifest.expressions,REQUIRED_EXPRESSIONS);
assert.equal(manifest.baseDimensions.portrait.width,1536);
assert.equal(manifest.baseDimensions.portrait.height,2048);
assert.equal(manifest.baseDimensions.background.width,1920);
assert.equal(manifest.baseDimensions.background.height,1080);
assert.equal(manifest.baseDimensions.portrait.alpha,true);
assert.equal(manifest.baseDimensions.background.alpha,false);
assert(manifest.limits.initialSceneTotalBytes>=manifest.limits.portraitBytes+manifest.limits.backgroundBytes-50000);
assert.deepEqual(Object.keys(manifest.expressionFallback),REQUIRED_EXPRESSIONS);
assert.deepEqual(Object.keys(REQUIRED_PARTNERS).sort(),manifest.characters.map(c=>c.legacyKey).sort());
assert.deepEqual(manifest.characters.map(c=>c.id).sort(),Object.values(REQUIRED_PARTNERS).sort());
for(const c of manifest.characters){
 assert.equal(c.id,REQUIRED_PARTNERS[c.legacyKey]);
 assert.equal(visual.CAST[c.legacyKey].name,c.name);
 assert(c.age>=20,'All romance/friendship cast must be adult');
 assert.equal(c.identityLock,'same-fictional-adult-actor-across-six-expression-assets');
 assert.equal(c.expressionRendering,'subtle-natural-facial-muscle-movement-no-cartoon-exaggeration');
 assert.deepEqual(Object.keys(c.expressionStatus),REQUIRED_EXPRESSIONS);
 for(const exp of REQUIRED_EXPRESSIONS)checkImage(
   'assets/class-diary/characters/'+c.id+'/'+exp+'.webp',
   c.expressionStatus[exp],manifest.limits.portraitBytes);
}
assert.equal(manifest.characters.find(c=>c.id==='minseo').relationship,'friendship-only');
assert.deepEqual(Object.keys(manifest.expressionFallback).map(k=>manifest.expressionFallback[k]),
 ['neutral','happy','worried','worried','worried','happy']);
assert.deepEqual(manifest.backgrounds.map(x=>x.id).filter(x=>x!=='bookstore').sort(),REQUIRED_LEGACY_SCENES.sort());
assert(manifest.backgrounds.some(x=>x.id==='bookstore'&&x.status==='planned'),'Bookstore is not wired yet');
for(const s of manifest.backgrounds){
 assert(s.title&&s.light&&s.description);
 assert.equal(s.visualTreatment,'photorealistic-fictional-korean-school-or-neighborhood-set');
 if(s.id!=='bookstore')assert(visual.backgroundSvg(s.id).startsWith('<svg'),'Missing legacy SVG background');
 checkImage(s.file,s.status,manifest.limits.backgroundBytes);
}
for(const rule of ['originalArtOnly','noSchoolIdentifyingInformation','noRealStaffInference','studentRomanceForbidden','noPlayerStateStorage','doNotRenderPlannedAssets','visualEffectReducedMotion','noRealPersonLikeness','noReferenceFrameReproduction','noFixedProtagonistGender','mustMatchPhotorealisticDirection']){
 assert.equal(manifest.rules[rule],true,'Missing visual safety rule: '+rule);
}
assert.equal(uniquePaths.size,29);
console.log('PASS stage 7-1 photorealistic direction: 3 original adult cast × 6 expressions, 11 planned backgrounds, legacy SVG fallback, '+ready+' ready images validated, no game state touched');
