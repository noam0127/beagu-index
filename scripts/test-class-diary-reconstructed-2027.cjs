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
const engine=require('../js/class-diary-semester-long-v3.js');
const journal=require('../js/class-diary-daily-journal-v1.js');
const baseStats={affection:35,trust:42,agency:42,fatigue:35,voice:45,boundary:48,support:67};
const stages=['woman','man','none','man2','man3'];
for(const partner of stages)for(const experience of ['new','mid','senior']){
 const stateBase={schoolName:'허구초등학교',profile:{name:'새봄',partner,experience,pedagogy:'field',gender:'undisclosed'},
  stats:baseStats,scriptEdition:novel.VERSION};
 let state=engine.createGame(stateBase);
 for(let n=1;n<=36;n++){
  const scene=engine.chapter(state);
  assert.equal(scene.title,novel.scene(n).title,'Reconstructed title must be live');
  assert.equal(scene.date,'2027-'+novel.scene(n).date);
  assert.equal(scene.choices.length,3);
  assert(scene.paragraphs.length>=7);
  assert.equal(scene.visual,novel.scene(n).visual);
  for(let c=0;c<3;c++)assert.equal(scene.choices[c].label,globalThis.BeaguClassDiaryBranchMap.episode(n).choices[c].label);
  assert(scene.paragraphs.join('').length>=300,'Scene is not substantial enough');
  assert(!scene.paragraphs.some(x=>['[BGM','[SFX','[전환','[연출','[행동'].some(prefix=>x.trimStart().startsWith(prefix))),
   'Stage directions must not appear as subtitles');
  state=engine.choose(state,String((n+1)%3));
  assert.equal(state.phase,'semester_reflection');
  assert.equal(state.lastOutcome.paragraphs.length,2);
  assert.equal(state.history.length,n);
  state=journal.choose(state,n%3);
  assert.equal(state.journal.length,n);
  state=engine.advance(state);
 }
 assert.equal(state.phase,'semester_ending');
 assert.equal(state.journal.length,36);
 assert(state.ending.paragraphs.some(p=>p.includes('강낭콩')));
}
const original=engine.createGame({schoolName:'허구초등학교',
 profile:{name:'새봄',partner:'woman',experience:'mid',pedagogy:'field'},
 stats:baseStats});
assert.equal(engine.chapter(original).title,'장미반의 낯선 이름',
 'Older saved stories must keep original narrative edition');

console.log('PASS: new 36-episode manuscript, 108 outcomes, branch titles, audio direction, legacy-save edition separation');
