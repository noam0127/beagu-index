// node scripts/test-class-diary-world.cjs
// No production credentials or actual survey data are needed.
'use strict';
const assert=require('node:assert/strict');
const world=require('../js/class-diary-world-v1.js');
const baseSchool={
  school_id:'A123456',school_name:'가상봄초등학교',school_kind:'초등학교',
  status:'운영',sido_standard:'강원',address:'강원특별자치도 춘천시 동면 가상로 1',
  support_office:'춘천',establishment:'공립'
};
function fact(key,value,year=2024,survey=2025,review='APPROVED'){
  return {fact_key:key,fact_value:value,source_year:year,survey_year:survey,
    review_status:review,unit:key.endsWith('_ratio')?'%':'명'};
}
function payload(overrides={}){
  return {schemaVersion:world.VERSION,school:baseSchool,
    publishedYears:[2023],facts:[fact('students',110),fact('teachers',12)],
    categories:[],verifiedRegionTags:[],...overrides};
}
const make=(x)=>world.generateWorld(payload(x));
const one=make();
assert.equal(one.eligible,true);
assert.equal(one.basic.scale,'small');
assert.equal(one.numbers.students.value,110);
assert.equal(one.numbers.students.referenceYear,2024);
assert(one.geography.tags.some(x=>x.id==='admin_myeon'));
assert(!one.geography.tags.some(x=>x.id==='coast'));
assert.equal(one.storyIsFiction,true);
assert.equal(one.coverage.numericTotal,18);
assert.equal(one.coverage.categoricalTotal,3);
const medium=make({facts:[fact('students',151)]});
const large=make({facts:[fact('students',601)]});
assert.equal(medium.basic.scale,'medium');
assert.equal(large.basic.scale,'large');
const conflicting=make({facts:[fact('students',151,2024,2024),fact('students',152,2024,2025)]});
assert.equal(conflicting.basic.scale,null);
assert(conflicting.issues.some(x=>x.code==='CONFLICTING_APPROVED_VALUES'&&x.key==='students'));
const repeat=make({facts:[fact('students',151,2024,2024),fact('students',151,2024,2025)]});
assert.equal(repeat.numbers.students.value,151);
assert.equal(repeat.basic.scale,'medium');
const noData=make({publishedYears:[],facts:[]});
assert.equal(noData.eligible,false);
assert.equal(noData.basic.scale,null);
const withheld=make({facts:[fact('students',99,2024,2025,'WITHHELD')]});
assert.equal(withheld.numbers.students,null);
const unsafe=make({facts:[fact('male_teacher_ratio',101),fact('september_participation_rate',73,2024)]});
assert.equal(unsafe.numbers.male_teacher_ratio,null);
assert.equal(unsafe.numbers.september_participation_rate,null);
assert(unsafe.issues.some(x=>x.code==='UNEXPECTED_REFERENCE_YEAR'));
const memory=make({facts:[fact('september_participation_rate',45,2023)]});
assert(memory.storyHooks.some(x=>x.id==='september_memory'&&x.day===4));
const coastalGuess=make({school:{...baseSchool,address:'제주특별자치도 제주시 한림읍 가상길 1',sido_standard:'제주'}});
assert(!coastalGuess.geography.tags.some(x=>['coast','island','tourism'].includes(x.id)));
const vetted=make({verifiedRegionTags:[{tag:'coast',label:'해안',source_type:'official_geospatial',
  source_ref:'verified-geo-file-id',review_status:'APPROVED'}]});
assert(vetted.geography.tags.some(x=>x.id==='coast'));
const falseGeo=make({verifiedRegionTags:[{tag:'island',label:'섬',source_type:'guess',
  source_ref:'map',review_status:'APPROVED'}]});
assert(!falseGeo.geography.tags.some(x=>x.id==='island'));
assert.throws(()=>world.generateWorld({school:{school_id:'bad'}}),/INVALID_APPROVED_WORLD_INPUT/);
const complete=make({
  school:{...baseSchool,education_office:'강원특별자치도교육청',
    education_office_code:'K10',source:'NEIS',last_synced_at:'2026-11-19'},
  facts:world.NUMERIC_KEYS.map(key=>fact(key,20,
    key==='september_participation_rate'?2023:
    key==='district_housing_price_mean'?2025:2024)),
  categories:world.CATEGORY_KEYS.map(key=>({
    fact_key:key,fact_value:'검증',review_status:'APPROVED',
    reference_year:2024,survey_year:2025,label:key
  }))
});
assert.equal(complete.coverage.numericKnown,18);
assert.equal(complete.coverage.categoricalKnown,3);
assert.equal(complete.basic.educationOffice,'강원특별자치도교육청');
assert.equal(complete.basic.openingDate,null);
const linked=new Set(complete.storyHooks.flatMap(h=>h.referenceKeys));
for(const key of world.NUMERIC_KEYS)assert(linked.has(key),'No context hook for '+key);
for(const key of world.CATEGORY_KEYS)assert(linked.has(key),'No context hook for '+key);
console.log('PASS: class-diary-world-v1 data quality, 21/21 hook coverage, and school provenance');
