import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const volley=read('teacher-volleyball.html'),run=read('teacher-run.html');
const shared=read('js/arcade-mystery-items-v1.js');
const backend=read('supabase/functions/arcade-leaderboard/index.ts');
for(const page of [volley,run]){
 const scripts=[...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
 assert.ok(scripts.length>0,'Game needs inline script');
 for(const s of scripts)assert.doesNotThrow(()=>new Function(s));
}
assert.doesNotThrow(()=>new Function(shared));
for(const key of ['airCourier','itemScoreEvents','rapid_smash','volley-item-score-label',
 'Math.ceil(current*.10)','Math.ceil(current*.25)','15.8*battle.allyJump',
 'ball.vx*=2;ball.vy*=2'])assert.ok(volley.includes(key),key);
assert.ok(volley.includes('mystery.pick(false,null,true)'));
assert.match(run,/function drawReadableNotice\(/);
assert.match(run,/ctx\.measureText/);
assert.doesNotMatch(run,/ctx\.fillText\(notice,W\/2,111,126\)/);
assert.match(run,/mysteryBuffs\.bullet=t\+5/);
assert.match(run,/isMysteryBuff\("bullet"\)\|\|gameRandom\(\)<\.5/);assert.match(run,/const gameRandom=\(\)=>/);
assert.match(run,/Math\.ceil\(score\*\.10\)/);
assert.match(run,/Math\.ceil\(score\*\.25\)/);
assert.match(shared,/{id:"rapid_smash"/);
assert.match(shared,/{id:"bullet"/);
const section=backend.match(/function verifiedVolleyballItemScore[\s\S]+?(?=\nfunction scoreFromVolleyball25)/)?.[0];
assert.ok(section,'Server validator missing');
const executable=section.replaceAll('result:any','result')
 .replaceAll('tenths:number','tenths')
 .replaceAll('player:number','player')
 .replaceAll('cpu:number','cpu')
 .replaceAll('):number',')');
const validate=new Function('int',executable+'\nreturn verifiedVolleyballItemScore;')(
 (x,a,b)=>typeof x==='number'&&Number.isInteger(x)&&x>=a&&x<=b
);
assert.equal(validate({},120,3,1),0,'Legacy item-free matches remain valid');
const valid=[{kind:'salary',t:300,player:2,cpu:0,delta:100},
 {kind:'bullying',t:600,player:3,cpu:1,delta:-39}];
assert.equal(validate({itemScoreEvents:valid,itemScoreDelta:61},120,3,1),61);
assert.throws(()=>validate({itemScoreEvents:valid,itemScoreDelta:1000},120,3,1));
assert.throws(()=>validate({itemScoreEvents:[{...valid[0],delta:500}],itemScoreDelta:500},120,3,1));
console.log('PASS: Game HUD, airplane, percent items, 5s buffs, and server replay validation');
