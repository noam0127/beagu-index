import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const window={};vm.runInNewContext(read('js/volley-match-bonus-v1.js'),{window});
const rules=window.BeaguVolleyMatchBonus;
const backend=read('supabase/functions/arcade-leaderboard/index.ts');
const source=backend.slice(backend.indexOf('function verifiedVolleyballItemScore('),backend.indexOf('// Deliberately return only gameplay facts')).replace(/:\s*(?:any|number)/g,'');
const validate=new Function('int',source+'\nreturn scoreFromVolleyball25;')((n,a,b)=>Number.isInteger(n)&&n>=a&&n<=b);
for(const [p,c,ended] of [[24,24,false],[25,24,false],[24,25,false],[25,25,false],[26,24,true],[24,26,true],[30,29,false],[31,29,true],[29,31,true],[25,23,true],[23,25,true]])assert.equal(rules.ended(p,c,true),ended);
const fixture=(r,extra=false)=>{const player=r.split('P').length-1,cpu=r.length-player,activeTenths=Math.max(1000,r.length*10),victory=rules.ended(player,cpu,true)&&player>cpu,endedEarly=!rules.ended(player,cpu,true),baseScore=Math.max(0,player*100-cpu*50),multiplier=victory?1+Math.floor(Math.max(0,25-cpu)/5):1,survivalBonus=Math.min(900,Math.floor(activeTenths/10))*4,ordinary=baseScore*multiplier+survivalBonus;const b=rules.calculate(r,player,cpu,ordinary,true);return {player,cpu,activeTenths,victory,endedEarly,baseScore,multiplier,survivalBonus,finalScore:ordinary+(extra?b.points:0),matchRule:'deuce_v1',rallyHistory:r,...(extra?{bonusRule:'fire_court_v1',matchBonus:b.points,matchBonusKind:b.kind}:{})};};
// Preview deuce rules remain functional, but the official server still uses 25-point scoring.
for(const r of ['PC'.repeat(24),'PC'.repeat(24)+'P','PC'.repeat(24)+'C','PC'.repeat(24)+'PP','PC'.repeat(24)+'CC','PC'.repeat(29)+'PP','PC'.repeat(60)+'PP']){
 const f=fixture(r,true);assert.equal(rules.ended(f.player,f.cpu,true),!f.endedEarly);
 if(f.player>25||f.cpu>25)assert.throws(()=>validate(f,f.activeTenths/10+2));
}
const early=fixture('PC'.repeat(24)+'P');assert.throws(()=>validate(early,102));
assert.throws(()=>rules.calculate('PC'.repeat(24)+'PPC',26,25,1000,true));
assert.doesNotMatch(backend,/matchRule:"deuce_v1"/);
assert.equal(rules.ended(25,24,false),true);
const legacy={player:25,cpu:24,activeTenths:1000,victory:true,endedEarly:false,baseScore:1300,multiplier:1,survivalBonus:400,finalScore:1700};assert.equal(validate(legacy,102),1700);
const html=read('teacher-volleyball.html');assert.match(html,/deuceEnabled=ranking\?\.matchRule==="deuce_v1"/);assert.match(html,/if\(matchEnded\(state.leftScore,state.rightScore\)\)/);for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(m[1]);
const start=html.indexOf('const MATCH_TARGET=25;'),end=html.indexOf('const W =',start);const scoring=html.slice(start,end);const point=html.slice(html.indexOf('function point(leftWins) {'),html.indexOf('function step() {'));const call=new Function('state','side',scoring+'\ndeuceEnabled=true;const cheerMilestones={};const pointEncouragement=()=>"";let finished=0;const setStatus=()=>{},tone=()=>{},syncUI=()=>{},finishMatch=()=>{finished++;state.phase="finished";};'+point+'\npoint(side);return finished;');
for(const [p,c,side,done] of [[24,24,true,0],[25,24,false,0],[25,24,true,1],[24,25,false,1],[30,29,true,1]])assert.equal(call({phase:'playing',leftScore:p,rightScore:c,winStreak:0,bestStreak:0,flash:0,maxDeficit:0},side),done);
console.log('PASS preview deuce, repeated ties and actual point handler; official server rejects extended matches and retains legacy 25:24');
