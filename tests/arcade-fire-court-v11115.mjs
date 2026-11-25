import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const events=new Map(),timers=new Map();let id=0,notes=0,closed=0;
const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){}});
class Context{
 constructor(){this.state='running';this.currentTime=0;this.destination={};}
 createGain(){return {gain:param(),connect(){},disconnect(){}};}
 createOscillator(){return {frequency:param(),connect(){},disconnect(){},start(){notes++;},stop(){}};}
 close(){closed++;return Promise.resolve();}
}
const window={AudioContext:Context};
const document={hidden:false,addEventListener(n,f){events.set(n,f);},removeEventListener(n){events.delete(n);}};
vm.runInNewContext(read('js/arcade-fire-court-bgm-v1.js'),{window,document,setInterval(f,ms){timers.set(++id,{f,ms});return id;},clearInterval(i){timers.delete(i);}});
const api=window.BeaguFireCourtBgm;
for(const [a,b,stage] of [[0,0,0],[4,0,0],[3,5,1],[10,3,2],[15,0,3],[0,20,4],[25,0,4]])assert.equal(api.volleyballStage(a,b),stage);
for(const kind of ['volleyball','teacher_run']){
 const tracks=api.playlists[kind];assert.equal(tracks.length,5);assert.equal(new Set(tracks.map(t=>String(t.lead))).size,5);
 assert.ok(tracks.every((t,i)=>i===0||t.tempo>tracks[i-1].tempo));
 const bgm=api.create(kind),before=notes;assert.equal(timers.size,0);
 bgm.sync(true);assert.equal(timers.size,1);assert.equal(notes,before+2);
 bgm.sync(true);assert.equal(notes,before+2);
 for(let stage=1;stage<5;stage++){bgm.setStage(stage);assert.equal(bgm.stage,stage);assert.equal(timers.size,1);assert.equal([...timers.values()][0].ms,Math.round(30000/tracks[stage].tempo));}
 document.hidden=true;events.get('visibilitychange')();assert.equal(timers.size,0);
 document.hidden=false;events.get('visibilitychange')();assert.equal(timers.size,1);
 bgm.sync(false);assert.equal(timers.size,0);bgm.setStage(0);assert.equal(timers.size,0);
 bgm.dispose();assert.equal(events.size,0);
}
assert.equal(closed,2);
const bossBgm=api.create('teacher_run');bossBgm.sync(true);
assert.equal(Object.keys(api.bossTracks).length,5);
for(const [id,t] of Object.entries(api.bossTracks)){bossBgm.setBoss(id);assert.equal(bossBgm.boss,id);assert.equal(timers.size,1);assert.equal([...timers.values()][0].ms,Math.round(30000/t.tempo));bossBgm.setStage(3);}
bossBgm.setBoss(null);assert.equal([...timers.values()][0].ms,Math.round(30000/api.playlists.teacher_run[3].tempo));bossBgm.dispose();
assert.ok(api.playlists.volleyball.every(t=>!api.playlists.teacher_run.some(u=>String(t.lead)===String(u.lead))));
for(const p of ['teacher-volleyball.html','teacher-run.html','teacher-run-4-preview.html']){
 const s=read(p);
 assert.match(s,/fire-court-controls/);assert.match(s,/arcade-fire-court-v1\.css/);
 assert.match(s,/BeaguFireCourtBgm\.create/);assert.match(s,/bgm\.setStage\(0\)/);
 assert.equal((s.match(/id="pause"/g)||[]).length,1);
 for(const m of s.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(m[1]);
}
assert.match(read('teacher-volleyball.html'),/volleyballStage\(state.leftScore,state.rightScore\)/);
assert.match(read('teacher-run.html'),/bgm.setStage\(state==="starting"\|\|state==="ready"\?0:stage\)/);
assert.match(read('js/run4-official-client-v1.js'),/enabled:false/);
console.log('PASS fire-court stage timing, distinct music, mute, pause, tab visibility, reset and disposal; official write disabled');
