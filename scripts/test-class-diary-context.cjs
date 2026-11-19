/* Official fact context: no invented personal profiles, withholding and demo isolation. */
'use strict';
const assert=require('node:assert/strict');
const context=require('../js/class-diary-context-v1.js');
const demo=require('../js/class-diary-demo-v1.js');
const world={
 mode:'real_approved',eligible:true,publishedYears:[2024],
 basic:{id:'7972013',name:'검증된 가상 초등학교'},
 numbers:{
  students:{value:412,referenceYear:2024,status:'APPROVED'},
  teachers:{value:25,referenceYear:2024,status:'APPROVED'},
  junior_teacher_ratio:{value:22.5,referenceYear:2024,status:'APPROVED'},
  admin_employees:{value:6,referenceYear:2024,status:'APPROVED'},
  classes:{value:17,referenceYear:2024,status:'APPROVED'},
  students_per_class:{value:24.2,referenceYear:2024,status:'APPROVED'},
  male_teacher_ratio:{value:28,referenceYear:2024,status:'APPROVED'},
  district_housing_price_mean:{value:19500,unit:'만원',referenceYear:2025,status:'APPROVED'},
  playground_area:{value:3000,unit:'㎡',referenceYear:2024,status:'APPROVED'}
 },
 categories:{meal_place:{value:'교내 급식실',referenceYear:2024,status:'APPROVED'}},
 geography:{tags:[{id:'admin_dong',source:'official_address',label:'동 소재'}]}
};
for(let d=1;d<=7;d++){
 const c=context.forDay(world,d);
 assert(['approved_school_context','fiction_only'].includes(c.source));
 assert(c.facts.every(f=>f.source.startsWith('approved_official_')));
 assert(c.facts.every(f=>typeof f.value==='string'));
}
const first=context.forDay(world,1);
assert(first.facts.some(f=>f.key==='students'&&f.value==='412명'));
assert(first.facts.some(f=>f.key==='teachers'&&f.referenceYear===2024));
assert(context.forDay(world,2).facts.some(f=>f.key==='admin_employees'));
assert(context.forDay(world,3).facts.some(f=>f.key==='meal_place'));
assert(context.forDay(world,5).facts.some(f=>f.key==='playground_area'));
assert(context.forDay(world,6).facts.some(f=>f.key==='district_housing_price_mean'));
assert(context.forDay(world,7).facts.some(f=>f.key==='male_teacher_ratio'));
assert.deepEqual(context.forDay(demo.createDemo().world,1).facts,[]);
assert.equal(context.forDay(demo.createDemo().world,1).passage,null);
const withheld={...world,numbers:{...world.numbers,students:{value:2222,referenceYear:2024,status:'WITHHELD'},
 teachers:{value:40,referenceYear:2024,status:'REVIEW_REQUIRED'}}};
assert(!context.forDay(withheld,1).facts.some(x=>['students','teachers'].includes(x.key)));
const invalidRatio={...world,numbers:{...world.numbers,male_teacher_ratio:{value:109,referenceYear:2024,status:'APPROVED'}}};
assert(!context.forDay(invalidRatio,7).facts.some(f=>f.key==='male_teacher_ratio'));
const invalidMoney={...world,numbers:{...world.numbers,district_housing_price_mean:{
 value:7000,referenceYear:2025,status:'APPROVED'}}};
assert(!context.forDay(invalidMoney,6).facts.some(f=>f.key==='district_housing_price_mean'));
assert.deepEqual(context.forDay({...world,publishedYears:[]},3).facts,[]);
assert(context.forDay(world,7).passage.includes('비율은 누군가의 능력이나 성품을 말해 주지 않는다'));
assert.throws(()=>context.forDay(world,8),/INVALID_STORY_DAY/);
console.log('PASS: 7 days of approved school variables; withholding, units, person-safe narration, and fictional demo isolation');
