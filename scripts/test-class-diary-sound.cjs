/* Audio v5: retain 7-day cues and test 36-episode seasonal/emotional soundtrack. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sound=require('../js/class-diary-sound-v1.js');
const names=['daily','playful','heartfelt','tension','tender','restful','bright','ending','quiet','comic','intimate','reconcile'];
assert.deepEqual(Object.keys(sound.TRACKS),names);
for(const key of names){
 const t=sound.TRACKS[key];
 assert.equal(t.license,'https://creativecommons.org/licenses/by/4.0/');
 assert(t.page.startsWith('https://www.scottbuckley.com.au/library/'));
 assert(t.url.startsWith('https://www.scottbuckley.com.au/'));
 assert(t.url.endsWith('.mp3'));
}
assert.equal(sound.TRACKS.ending.name,'Home Was You');
assert.equal(sound.dayTrack(1),'quiet');
assert.equal(sound.dayTrack(2),'tension');
assert.equal(sound.dayTrack(7),'intimate');
assert.equal(sound.TRACKS.comic.name,'Quirky Lane');
assert.equal(sound.TRACKS.reconcile.name,'Reawakening');
assert.equal(sound.dayTrack(3),'heartfelt');
assert.equal(sound.dayTrack(6),'restful');
assert.equal(sound.choiceTrack(4,'together'),'reconcile');
assert.equal(sound.choiceTrack(7,'promise'),'reconcile');
assert.equal(sound.choiceTrack(6,'letter'),'intimate');
assert.equal(sound.choiceTrack(5,'invite'),'tender');
assert.equal(sound.choiceTrack(6,'coffee'),'tender');
assert.equal(sound.sceneTrack({kind:'tense'}),'tension');
assert.equal(sound.sceneTrack({kind:'gentle'}),'heartfelt');
assert.equal(sound.sceneTrack({kind:'bright'}),'bright');
assert.equal(sound.sceneTrack({tone:'playful'}),'comic');
assert.equal(sound.sceneTrack({id:'seat_song',kind:'bright'}),'comic');
assert.equal(sound.sceneTrack({id:'sport',kind:'bright'}),'comic');
assert.equal(sound.sceneTrack({kind:'tense',result:{line:'회고'}}),'intimate');
assert.equal(sound.placeCue('월요일 아침 · 교문 앞'),'step');
assert.equal(sound.placeCue('목요일 오후 · 복도'),'door');
assert.equal(sound.placeCue('수요일 3교시 · 학년연구실'),'paper');
assert.equal(sound.placeCue('토요일 오후 · 동네 카페'),'cup');
assert.equal(sound.placeCue('알 수 없음'),null);
assert.deepEqual(Object.keys(sound.AMBIENCE),['classroom','workroom']);
assert.deepEqual(Object.keys(sound.FOLEY),['pageTurn']);
assert.equal(sound.ambienceFor('3학년 교실 · 수요일 4교시','heartfelt'),'classroom');
assert.equal(sound.ambienceFor('월요일 아침 · 학년연구실','quiet'),'workroom');
assert.equal(sound.ambienceFor('월요일 아침 · 학년연구실','tension'),null);
assert.equal(sound.ambienceFor('교문 앞 · 등교','quiet'),null);
assert.equal(sound.ambienceFor('동네 카페 · 오후','tender'),null);
assert.equal(sound.ambienceFor('교실','ending'),null);
for(const track of [...Object.values(sound.AMBIENCE),...Object.values(sound.FOLEY)]){
 assert.equal(track.license,'public-domain');
 assert(track.url.startsWith('https://upload.wikimedia.org/wikipedia/commons/'));
 assert(track.url.endsWith('.ogg'));
 assert(track.page.startsWith('https://commons.wikimedia.org/wiki/File:'));
}
assert.throws(()=>sound.setAmbience('missing'),/UNKNOWN_AMBIENCE/);
sound.setAmbience(null);
sound.setAmbience('classroom');
sound.note('pageTurn');
assert.throws(()=>sound.dayTrack(8),/INVALID_DAY/);
assert.rejects(sound.setTrack('unknown'),/UNKNOWN_TRACK/).catch(e=>{process.exitCode=1;console.error(e)});
assert.equal(sound.isEnabled(),false);
assert.equal(sound.setMusicVolume(.12),.12);
assert.equal(sound.setMusicVolume(30),1);
assert.equal(sound.setSfxVolume(-1),0);
sound.setEffectsEnabled(false);sound.note('choice');sound.setEffectsEnabled(true);
sound.note('paper');sound.note('step');sound.note('door');sound.note('cup');
sound.setEnabled(false);
assert(sound.credit().tracks.length===12);
assert.equal(sound.credit().recordings.length,3);
// The semester is scored by actual chapter, never the 7-day music cycle.
const semester=require('../js/class-diary-semester-v1.js');
assert.equal(sound.SEMESTER_SCORE.length,36);
assert.equal(semester.validate().episodes,36);
for(let i=1;i<=36;i++){
 const scene=semester.SCENES[i-1],cue=sound.semesterScore(i);
 assert(sound.TRACKS[cue.track],'No music at episode '+i);
 assert(cue.ambience===null||sound.AMBIENCE[cue.ambience],'No ambient sound at episode '+i);
 assert(cue.cue===null||['step','door','paper','cup','transition'].includes(cue.cue),'Unknown cue at episode '+i);
 if(cue.track==='tension')assert.equal(cue.ambience,null,'Tense scene must duck ambient audio');
 if(['hallway','gate','consultation','weekend','night'].includes(scene[2]))assert.equal(cue.ambience,null,'Avoid misleading ambient in '+scene[2]);
 for(const partner of ['woman','man','none']){
  for(const choice of ['0','1','2']){
   const reflection=sound.semesterScore(i,{reflection:true,choice,partner});
   assert(sound.TRACKS[reflection.track],'No reflection track '+i);
   assert.equal(reflection.ambience,null);
   assert.equal(reflection.cue,null);
  }
 }
}
assert.equal(sound.semesterScore(1).track,'quiet','Cold March opening');
assert.equal(sound.semesterScore(5).track,'tension','March meeting');
assert.equal(sound.semesterScore(19).track,'tension','June accident');
assert.equal(sound.semesterScore(21).track,'tension','June family consultation');
assert.equal(sound.semesterScore(23).track,'tension','June misunderstanding');
assert.equal(sound.semesterScore(34).track,'tender','July walk');
assert.equal(sound.semesterScore(36).track,'intimate','Summer final diary page');
assert.equal(sound.semesterScore(1).ambience,'classroom');
assert.equal(sound.semesterScore(2).ambience,'workroom');
assert.equal(sound.semesterScore(4).cue,'step');
assert.equal(sound.semesterScore(11).cue,'door');
assert.equal(sound.semesterScore(25,{reflection:true,choice:'0',partner:'woman'}).track,'quiet','Child safety is not a romance trigger');
assert.equal(sound.semesterScore(34,{reflection:true,choice:'0',partner:'man'}).track,'intimate');
assert.equal(sound.semesterScore(34,{reflection:true,choice:'0',partner:'none'}).track,'heartfelt','Friendship route');
assert.equal(sound.semesterScore(30,{reflection:true,choice:'0',partner:'woman'}).track,'reconcile');
assert.equal(sound.semesterScore(30,{reflection:true,choice:'2',partner:'woman'}).track,'quiet');
assert.throws(()=>sound.semesterScore(0),/INVALID_SEMESTER_EPISODE/);
assert.throws(()=>sound.semesterScore(37),/INVALID_SEMESTER_EPISODE/);
assert.throws(()=>sound.semesterScore(1,{reflection:true,choice:'unknown'}),/INVALID_SEMESTER_CHOICE/);
const semesterPage=fs.readFileSync(path.join(__dirname,'../teacher-class-diary-play.html'),'utf8');
assert(semesterPage.includes('sound.semesterScore(game.episode,'),'Semester screen must use the 36-episode score');
assert(!semesterPage.includes("sound.dayTrack((game.episode-1)%7+1)"),'Old 7-day cycle must not override semester score');
assert(semesterPage.includes('sound.setAmbience(score.ambience)'),'Semester ambience must be routed');
assert(semesterPage.includes("sound.setAmbience(null);\n const ending=game.ending;"),'Semester ending ambience must be silent');
const src=fs.readFileSync(path.join(__dirname,'../js/class-diary-sound-v1.js'),'utf8');
assert(!/localStorage|sessionStorage|indexedDB|sendBeacon|fetch\(/.test(src),
 'Sound module cannot store gameplay, preferences or transmit user data');
console.log('PASS: 36 scored chapters, reflection/route cues, 12 BGM, optional ambience, 7-day continuity and no persistence');
