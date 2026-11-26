import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(p,'utf8');
class Node {
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.hidden=false;}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 setAttribute(k,v){this.attrs[k]=v;}
}
const ctx=vm.createContext({window:{},document:{createElement:t=>new Node(t)}});
for(const p of ['js/historical-original-questions.js','js/historical-questionnaire-choices.js','js/2025-observed-choices.js','js/2026-questionnaire-options-v1.2.js','js/school-facilities-v11126.js'])vm.runInContext(read(p),ctx);
const F=ctx.window.BeaguSchoolFacilities;
const mode=(year,questionId,modeOption)=>({year,questionId,modeOption});
const result=(questionId,row,...values)=>({questionId,row,values});
const historical=[mode(2024,'Q11','2점: 모든 학년에 학년연구실이 있다'),mode(2024,'Q12','5점: 분리 장소가 없다'),mode(2025,'Q14','③장소는 있으나 실제 분리는 안 된다'),mode(2025,'Q36','있다'),mode(2025,'Q37','없다'),mode(2025,'Q43','모름'),mode(2023,'Q11','1'),mode(2025,'Q44','있다')];
const newest=[result('Q42',1,'공간 없음'),result('Q42',3,'전용 공간으로 이용 가능'),result('Q42',5,'잘 모르겠다'),result('Q42',6,'공간 없음'),result('Q41',0,'개인별로 제공'),result('Q43',-1,'TV'),result('Q44',-1,'온수'),result('Q45',0,'학년 연구실'),result('Q45',10,'교실'),result('Q45',11,'이용 가능한 비품·통신시설 없음'),result('Q45',4,'잘 모르겠다'),result('Q31',-1,'있다'),result('Q51',-1,'개인정보'),result('Q42',99,'공간 없음'),result('Q42',2,'잘못된 값'),result('Q42',0,'공간 없음','잘 모르겠다')];
const pick=(tier,m=historical,r=newest)=>Object.fromEntries(F.collect(m,r,tier).map(x=>[x.id,x.active]));
assert.equal(F.collect(historical,newest,0).length,0);
assert.equal(F.collect(historical,newest,undefined).length,0);
assert.deepEqual(pick(1),{grade:true,toilet:false,separate:true,gradeWater:true});
const two=pick(2);
assert.equal(two.grade,true,'older O overrides newer X');
assert.equal(two.toilet,true,'new O overrides older X');
assert.equal(two.shower,false);
assert.equal(two.pc,true);
assert.equal(two.tv,true);
assert.equal(two.hotwater,true);
assert.equal(two.gradeWater,true);
assert.equal(two.water,true);
assert.equal(two.wifi,true);
assert.equal(two.wifiWeak,false);
for(const k of ['supplies','rest','subject','coffee','board','cool'])assert.equal(k in two,false,'unknown or unselected is not X: '+k);
assert.equal(F.collect([],[],2).length,0);
assert.deepEqual(pick(1,[mode(2023,'Q11','2점: 학년연구실과 휴식장소가 있음')],[]),{extraRest:true,grade:true});
assert.deepEqual(pick(1,[mode(2023,'Q11','4점: 학년 연구실도 없음')],[]),{grade:false});
assert.deepEqual(pick(1,[mode(2023,'Q11','2')],[]),{});
const host=new Node('section');
F.render(host,historical,newest,2);
assert.equal(host.hidden,false);
assert.ok(host.children[1].children.some(n=>n.className.includes('is-absent')));
F.render(host,historical,[],1);
assert.ok(!host.children[1].children.some(n=>n.attrs['aria-label']?.includes('2026')));
F.render(host,historical,newest,0);assert.equal(host.hidden,true);assert.equal(host.children.length,0);
const search=read('js/level-search.js'),report=read('school-report.html'),css=read('styles/school-facilities-v11126.css'),html=read('search-lv1.html');
assert.ok(search.includes('host.replaceChildren(facilities,yearlyPercentileHistory(school,viewerTier))'));
assert.ok(report.indexOf('id="reportFacilities"')<report.indexOf('id="reportBasicCard"'));
assert.ok(report.includes('state.facilityModes=[];state.facilityResults=[];'));
assert.ok(html.indexOf('js/school-facilities-v11126.js')<html.indexOf('js/level-search.js'));
assert.match(css,/grayscale\(1\)/);assert.match(css,/@media\(max-width:420px\)/);
new vm.Script(search);
console.log('facility union, access tiers, unknown handling, refresh, positioning and syntax passed');
