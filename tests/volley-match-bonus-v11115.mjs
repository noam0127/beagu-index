import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const window={};vm.runInNewContext(read('js/volley-match-bonus-v1.js'),{window});
const calc=window.BeaguVolleyMatchBonus.calculate;
const backend=read('supabase/functions/arcade-leaderboard/index.ts');
const code=backend.slice(backend.indexOf('function matchBonusFromRallies('),backend.indexOf('// Deliberately return only gameplay facts')).replace(/:\s*(?:any|number)/g,'');
const validate=new Function('int',code+'\nreturn scoreFromVolleyball25;')((n,a,b)=>Number.isInteger(n)&&n>=a&&n<=b);
const fixture=(r)=>{const player=r.split('P').length-1,cpu=r.length-player,activeTenths=1000,victory=player===25,endedEarly=player<25&&cpu<25,baseScore=Math.max(0,player*100-cpu*50),multiplier=victory?1+Math.floor((25-cpu)/5):1,survivalBonus=400,ordinary=baseScore*multiplier+survivalBonus;const b=calc(r,player,cpu,ordinary);return {player,cpu,activeTenths,victory,endedEarly,baseScore,multiplier,survivalBonus,finalScore:ordinary+b.points,bonusRule:'fire_court_v1',rallyHistory:r,matchBonus:b.points,matchBonusKind:b.kind};};
for(const [r,kind,rate] of [['P'.repeat(25),'sweep',50],['C'.repeat(10)+'P'.repeat(25),'great_comeback',50],['PC'.repeat(23)+'CPP','dramatic',40],['PC'.repeat(5)+'P'.repeat(20),'dominant',30],['C'.repeat(6)+'P'.repeat(25),'comeback',25],['PC'.repeat(23)+'PP','close',20],['PC'.repeat(10)+'P'.repeat(15),'streak',15],['C'.repeat(25),'none',0],['PC'.repeat(10),'none',0]]){const f=fixture(r);assert.equal(f.matchBonusKind,kind);assert.equal(calc(r,f.player,f.cpu,1000).rate,rate);assert.equal(validate(f,102),f.finalScore);assert.throws(()=>validate({...f,matchBonus:f.matchBonus+1},102));assert.throws(()=>validate({...f,finalScore:f.finalScore+1},102));}
const f=fixture('PC'.repeat(10)+'P'.repeat(15));const {bonusRule,rallyHistory,matchBonus,matchBonusKind,...legacy}=f;legacy.finalScore-=matchBonus;assert.equal(validate(legacy,102),legacy.finalScore);assert.throws(()=>validate({...f,rallyHistory:'P'.repeat(25)+'C'.repeat(10)},102));assert.throws(()=>validate({...f,rallyHistory:'x'+f.rallyHistory.slice(1)},102));assert.throws(()=>validate({...f,bonusRule:'unknown'},102));
assert.match(backend,/BEAGU_VOLLEY_MATCH_BONUS_ENABLED/);assert.match(backend,/bonus_rule_disabled/);assert.match(read('teacher-volleyball.html'),/ranking\?\.matchBonusRule==="fire_court_v1"/);assert.match(read('js/arcade-leaderboard-v1.js'),/data\.matchBonusRule==="fire_court_v1"/);
console.log('PASS 9 representative match paths, client/server parity, forged amount/trace rejection, legacy contract and opt-in');
