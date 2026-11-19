'use strict';
const assert=require('node:assert/strict');
const sound=require('../js/class-diary-sound-v1.js');
const names=['daily','tension','bright','tender','ending'];
for(const key of names){
  assert.equal(sound.TRACKS[key].license,'https://creativecommons.org/licenses/by/4.0/');
  assert(sound.TRACKS[key].url.startsWith('https://www.scottbuckley.com.au/library/wp-content/uploads/'));
}
assert.equal(sound.TRACKS.ending.name,'Home Was You');
assert.equal(sound.dayTrack(2),'tension');
assert.equal(sound.dayTrack(3),'bright');
assert.equal(sound.choiceTrack(4,'together'),'daily');
assert.equal(sound.choiceTrack(5,'invite'),'tender');
assert.equal(sound.choiceTrack(6,'coffee'),'tender');
assert.throws(()=>sound.dayTrack(8),/INVALID_DAY/);
assert.rejects(sound.setTrack('unknown'),/UNKNOWN_TRACK/).catch(e=>{process.exitCode=1;console.error(e);});
assert.equal(sound.isEnabled(),false);
const credit=sound.credit();
assert(credit.credit.includes('Scott Buckley'));
assert(credit.credit.includes('CC BY 4.0'));
sound.note('choice');
sound.setEnabled(false);
const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'../js/class-diary-sound-v1.js'),'utf8');
assert(!/localStorage|sessionStorage|indexedDB|sendBeacon|fetch\(/.test(src),'Sound engine must never save gameplay or transmit user data');
console.log('PASS: five CC-BY tracks, conditional story mood, keyboard click tone, credits and no persistence');
