import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const source=read('js/arcade-bgm-v1.js');
const volley=read('teacher-volleyball.html');
const run=read('teacher-run.html');
const style=read('styles/arcade-cabinet-v1.css');
assert.match(source,/Keep%20your%20dream%20alive/);
assert.match(source,/jester_theme_0\.mp3/);
assert.match(volley,/js\/arcade-bgm-v1\.js\?v=20261123-cc0-v1/);
assert.match(run,/js\/arcade-bgm-v1\.js\?v=20261123-cc0-v1/);
assert.match(volley,/bgm\.sync\(soundOn&&\["starting","playing","point"\]/);
assert.match(run,/bgm\.sync\(soundOn&&\(state==="playing"\|\|state==="starting"\)\)/);
assert.match(style,/\.arcade-bgm-credit a:focus-visible/);
assert.match(read('index.html'),/teacher-volleyball\.html\?v=20261123-touch-jump1/);
assert.match(read('index.html'),/teacher-run\.html\?v=20261123-cc0-bgm2/);
assert.match(volley,/styles\/arcade-cabinet-v1\.css\?v=20261123-cc0-bgm2/);
assert.match(run,/styles\/arcade-cabinet-v1\.css\?v=20261123-cc0-bgm2/);
assert.match(volley,/https:\/\/opengameart\.org\/content\/keep-your-dream-alive-seamless-loop/);
assert.match(run,/https:\/\/opengameart\.org\/content\/8-bit-jester-theme/);
const sounds=[];
const listeners=new Map();
let hidden=false;
class MockAudio{
 constructor(){this.paused=true;this.playCalls=0;this.pauseCalls=0;this.loop=false;this.volume=1;this.listeners={};sounds.push(this)}
 play(){this.playCalls++;this.paused=false;return Promise.resolve()}
 pause(){this.pauseCalls++;this.paused=true}
 addEventListener(type,handler){this.listeners[type]=handler}
 removeEventListener(type){delete this.listeners[type]}
}
const doc={
 get hidden(){return hidden},
 addEventListener(type,fn){listeners.set(type,fn)},
 removeEventListener(type){listeners.delete(type)}
};
const root={AudioContext:null,webkitAudioContext:null};
const env={window:root,Audio:MockAudio,document:doc,
 setInterval(){throw Error('Unexpected fallback timer')},clearInterval(){},
 console,Promise,Object};
vm.runInNewContext(source,env,{filename:'arcade-bgm-v1.js'});
assert.equal(typeof root.BeaguArcadeBgm.create,'function');
assert.equal(sounds.length,0,'No track should load on page boot');
const volleyball=root.BeaguArcadeBgm.create('volleyball');
assert.equal(sounds.length,1);
const audio=sounds[0];
assert.equal(audio.src,undefined,'No remote request before explicit play');
assert.equal(audio.loop,true);
assert(audio.volume<=.15,'Music must stay below SFX volume');
volleyball.sync(false);
assert.equal(audio.playCalls,0,'No autoplay before user starts');
volleyball.sync(true);
await Promise.resolve();await Promise.resolve();
assert.equal(audio.playCalls,1);
assert.equal(audio.paused,false);
volleyball.sync(true);
assert.equal(audio.playCalls,1,'Repeated frame sync must not restart music');
hidden=true;listeners.get('visibilitychange')();
assert.equal(audio.paused,true,'Background tab must pause');
hidden=false;listeners.get('visibilitychange')();
await Promise.resolve();await Promise.resolve();
assert.equal(audio.playCalls,2);
volleyball.sync(false);
assert.equal(audio.paused,true,'Pause and mute must stop music');
volleyball.dispose();
assert.equal(listeners.size,0,'Disposed sound should release document listener');
const teacherRun=root.BeaguArcadeBgm.create('teacher_run');
assert.match(sounds[1].src||'',/^$/);
teacherRun.sync(true);await Promise.resolve();await Promise.resolve();
assert.match(sounds[1].src,/jester_theme_0\.mp3/);
teacherRun.sync(false);teacherRun.dispose();
console.log('PASS: two CC0 tracks, click-to-play, loop, pause, mute, background-tab pause, credits and fallback wiring');
