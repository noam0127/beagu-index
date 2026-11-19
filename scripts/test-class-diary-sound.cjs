/* Stage 5: 8 licensed BGM tracks and original memory-only cues. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sound=require('../js/class-diary-sound-v1.js');
const names=['daily','playful','heartfelt','tension','tender','restful','bright','ending'];
assert.deepEqual(Object.keys(sound.TRACKS),names);
for(const key of names){
 const t=sound.TRACKS[key];
 assert.equal(t.license,'https://creativecommons.org/licenses/by/4.0/');
 assert(t.page.startsWith('https://www.scottbuckley.com.au/library/'));
 assert(t.url.startsWith('https://www.scottbuckley.com.au/library/wp-content/uploads/'));
 assert(t.url.endsWith('.mp3'));
}
assert.equal(sound.TRACKS.ending.name,'Home Was You');
assert.equal(sound.dayTrack(2),'tension');
assert.equal(sound.dayTrack(3),'heartfelt');
assert.equal(sound.dayTrack(6),'restful');
assert.equal(sound.choiceTrack(4,'together'),'heartfelt');
assert.equal(sound.choiceTrack(5,'invite'),'tender');
assert.equal(sound.choiceTrack(6,'coffee'),'tender');
assert.equal(sound.sceneTrack({kind:'tense'}),'tension');
assert.equal(sound.sceneTrack({kind:'gentle'}),'heartfelt');
assert.throws(()=>sound.dayTrack(8),/INVALID_DAY/);
assert.rejects(sound.setTrack('unknown'),/UNKNOWN_TRACK/).catch(e=>{process.exitCode=1;console.error(e)});
assert.equal(sound.isEnabled(),false);
assert.equal(sound.setMusicVolume(.12),.12);
assert.equal(sound.setMusicVolume(30),1);
assert.equal(sound.setSfxVolume(-1),0);
sound.setEffectsEnabled(false);sound.note('choice');sound.setEffectsEnabled(true);
sound.setEnabled(false);
assert(sound.credit().tracks.length===8);
const src=fs.readFileSync(path.join(__dirname,'../js/class-diary-sound-v1.js'),'utf8');
assert(!/localStorage|sessionStorage|indexedDB|sendBeacon|fetch\(/.test(src),
 'Sound module cannot store gameplay, preferences or transmit user data');
console.log('PASS: 8 CC BY 4.0 tracks, stage cues, bounded volume, no game persistence');
