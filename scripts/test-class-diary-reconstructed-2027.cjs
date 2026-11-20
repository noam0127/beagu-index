/* Complete reconstructed spring novel must match branching/story/audio metadata. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
globalThis.BeaguClassDiaryBranchMap=require('../js/class-diary-branch-map-v1.js');
for(let i=1;i<=6;i++){
 const part=require('../js/class-diary-rewritten-act'+i+'-v1.js');
 assert.equal(globalThis['BeaguClassDiaryRewrittenAct'+i].length,6);
}
const novel=require('../js/class-diary-reconstructed-2027-v1.js');
assert.deepEqual(novel.validate(),{episodes:36,acts:6,choices:108});
assert.equal(novel.scene(16).date,'05-14','21 cake pieces must fall on Friday before Teachers Day');
assert.match(novel.scene(16).lines.join(''),/스물한/);
assert.match(novel.scene(15).lines.join(''),/둘이 같겠어요/);
assert.match(novel.scene(14).lines.join(''),/다트/);
assert.match(novel.scene(27).lines.join(''),/사과/);
assert.match(novel.scene(36).lines.join(''),/강낭콩/);
const html=fs.readFileSync(path.resolve(__dirname,'../teacher-class-diary-play.html'),'utf8');
assert(html.includes('class-diary-reconstructed-2027-v1.js'));
assert(html.includes('class-diary-rewritten-act1-v1.js'));
assert(html.includes('class-diary-rewritten-act6-v1.js'));
assert(html.includes('scriptEdition'));
const directions=require('../js/class-diary-scene-direction-v1.js');
for(let n=1;n<=36;n++){
 const row=novel.scene(n);
 assert.equal(directions.forEpisode(n,row.title,globalThis.BeaguClassDiaryBranchMap.episode(n).title)?.episode,n,
  'All reconstructed episodes activate their direction metadata');
}
console.log('PASS: new 36-episode manuscript, 108 outcomes, branch titles, audio direction, legacy-save edition separation');
