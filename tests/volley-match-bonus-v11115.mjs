import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const window={};vm.runInNewContext(read('js/volley-match-bonus-v1.js'),{window});const calc=window.BeaguVolleyMatchBonus.calculate;
const backend=read('supabase/functions/arcade-leaderboard/index.ts');
const a=backend.indexOf('function verifiedVolleyballItemScore('),b=backend.indexOf('// Deliberately return only gameplay facts',a);assert.ok(a>=0&&b>a);
const code=backend.slice(a,b).replace(/:\s*(?:any|number)/g,'');
const validate=new Function('int',code+'\nreturn scoreFromVolleyball25;')((n,a,b)=>Number.isInteger(n)&&n>=a&&n<=b);
for(const [r,kind,rate] of [['P'.repeat(25),'sweep',50],['C'.repeat(10)+'P'.repeat(25),'great_comeback',50],['PC'.repeat(23)+'CPP','dramatic',40],['PC'.repeat(5)+'P'.repeat(20),'dominant',30],['C'.repeat(6)+'P'.repeat(25),'comeback',25],['PC'.repeat(23)+'PP','close',20],['PC'.repeat(10)+'P'.repeat(15),'streak',15],['C'.repeat(25),'none',0],['PC'.repeat(10),'none',0]]){
 const player=r.split('P').length-1,cpu=r.length-player,activeTenths=1000,victory=player===25,endedEarly=player<25&&cpu<25,baseScore=Math.max(0,player*100-cpu*50),multiplier=victory?1+Math.floor((25-cpu)/5):1,survivalBonus=400,ordinary=baseScore*multiplier+survivalBonus;const f={player,cpu,activeTenths,victory,endedEarly,baseScore,multiplier,survivalBonus,finalScore:ordinary};const bonus=calc(r,player,cpu,ordinary);assert.equal(bonus.kind,kind);assert.equal(calc(r,player,cpu,1000).rate,rate);assert.equal(validate(f,102),ordinary);assert.throws(()=>validate({...f,finalScore:ordinary+1},102));if(bonus.points>0)assert.throws(()=>validate({...f,finalScore:ordinary+bonus.points,bonusRule:'fire_court_v1',rallyHistory:r,matchBonus:bonus.points},102));
}
assert.doesNotMatch(backend,/BEAGU_VOLLEY_MATCH_BONUS_ENABLED|MATCH_BONUS_ENABLED/);
assert.match(read('teacher-volleyball.html'),/ranking\?\.matchBonusRule==="fire_court_v1"/);assert.match(read('js/arcade-leaderboard-v1.js'),/data\.matchBonusRule==="fire_court_v1"/);
console.log('PASS 9 preview bonus paths, existing official score contract retained, forged bonuses rejected, opt-in disabled');
