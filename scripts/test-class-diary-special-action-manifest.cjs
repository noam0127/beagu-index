'use strict';
/* Confirm that every proposed non-repeating game asset has an actual narrative beat. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const items=require('../data/class-diary-special-action-manifest-v1.json');
const identity=require('../data/class-diary-character-identity-lock-v1.json');
const dogyeom=require('../js/class-diary-colleague-dogyeom-v1.js');
const taeo=require('../js/class-diary-colleague-taeo-v1.js');
const male=require('../js/class-diary-male-natural-v2.js');
const sources={dogyeom,taeo};
const names=new Set(),real=new Set(identity.canonical.map(c=>c.file));
assert.equal(items.scope,'review_only');
assert.equal(items.productionEnabled,false);
assert.equal(items.cuts.length,6,'six unique high-value action cuts');
assert.equal(items.artDirection.stringColor,'blue');
assert.equal(items.excluded.defaultCyclicPoseCount,69);
for(const cut of items.cuts){
 assert(!names.has(cut.id),'duplicate '+cut.id);
 names.add(cut.id);
 assert(real.has(cut.canonical),'must use immutable original image '+cut.id);
 assert.equal(cut.approve,false,'never silently approve new faces');
 assert(['P0','P1'].includes(cut.priority));
 assert(cut.episodes.length>0);
 assert(cut.evidence.length===cut.episodes.length,'each scene needs independent evidence '+cut.id);
 assert(cut.episodes.every(n=>Number.isInteger(n)&&n>=1&&n<=36));
 assert(new Set(cut.episodes).size===cut.episodes.length);
 for(const evidence of cut.evidence){
   assert(cut.episodes.includes(evidence.episode),'evidence outside declared episode');
   let prose;
   if(evidence.source==='js/class-diary-colleague-dogyeom-v1.js')prose=dogyeom.moment(evidence.episode);
   else if(evidence.source==='js/class-diary-colleague-taeo-v1.js')prose=taeo.moment(evidence.episode);
   else if(evidence.source==='docs/class-diary-36-episode-rewrite.md')prose=fs.readFileSync(path.join(root,evidence.source),'utf8');
   else throw Error('unapproved source file '+evidence.source);
   assert(prose.includes(evidence.needle),'missing quoted scene evidence '+cut.id+' E'+evidence.episode+' '+evidence.needle);
 }
}
const specialCount=Object.values(male.SPECIAL).reduce((a,obj)=>a+Object.keys(obj).length,0);
assert.equal(specialCount,39,'chapter-specific source map drift');
console.log('PASS 6 unique story-backed cut designs, all source evidence, original identity hold, 39 fixed/69 cyclic existing pose mappings');
