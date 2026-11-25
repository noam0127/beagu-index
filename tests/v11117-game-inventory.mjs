import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(p,'utf8'),window={};vm.runInNewContext(read('js/teacher-run-4-rules.js'),{window,Math});const rules=window.BeaguRun4Rules;
for(const plan of rules.bossPlan){let prev=-1;for(const tier of ['easy','normal','hard','very_hard','extreme']){const b=rules.createBosses(tier);b.advance(plan.start);const hp=b.active().hp;assert.ok(hp>prev);prev=hp;assert.equal(b.damage(1,plan.start+.1),null);assert.equal(b.active().hp,hp-1);assert.equal(b.damage(hp,plan.start+.2).id,plan.id);assert.equal(b.active(),null);assert.equal(b.damage(hp,plan.start+.3),null);assert.equal(b.defeated().length,1);}}
for(const path of ['teacher-run.html','teacher-run-4-preview.html']){
 const src=read(path),start=src.indexOf('function inventorySlots('),end=src.indexOf('function activeItemIcons(',start);
 assert.ok(start>=0&&end>start);
 const leave=rules.createLeave(),events=[];leave.advance(50);
 const run=new Function('rules','leave','allies','bosses','events','return (()=>{let state="playing",clock=50,life=50,maxLife=100;const inventoryKeys=["z","x","c","v"],inventoryYears=[5,10,20],player={x:0,y:0};const recordInput=(type,data)=>events.push([type,data?.choice]),setNotice=()=>{},burst=()=>{},playTone=()=>{},updateLabels=()=>{},cooperate=()=>events.push(["cooperate"]);'+src.slice(start,end)+'return {useInventorySlot,slots:()=>inventorySlots(leave.state(),true,leave.remaining(clock)),life:()=>life};})()')(rules,leave,{count:()=>2,canCooperate:()=>true},rules.createBosses('normal'),events);
 assert.equal(run.useInventorySlot(0),true);assert.equal(run.life(),80);assert.equal(leave.state().used,1);assert.deepEqual(events,[['collect',5],['leave',5]]);assert.equal(run.useInventorySlot(0),false);assert.equal(run.useInventorySlot(1),false);assert.equal(leave.state().pending.length,1);assert.equal(run.useInventorySlot(3),true);
 assert.match(src,/\["KeyZ","KeyX","KeyC","KeyV"\]\.indexOf\(e\.code\)/);assert.match(src,/b\.onclick=\(\)=>useInventorySlot\(i\)/);assert.match(src,/damageBoss\(p\.damage\)/);assert.match(src,/const lost=active\.hp-\(after\?\.hp\?\?0\)/);
}
console.log('PASS one-action inventory, physical hotkeys, non-stacking, 25 boss/tier health and defeat checks');
