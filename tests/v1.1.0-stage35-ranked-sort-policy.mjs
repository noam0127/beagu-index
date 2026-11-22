import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canSortRankedSchools} from '../supabase/functions/_shared/release-policy.mjs';

const allowed=['school_name','address','beagu_percentile_2025',
  'student_count','junior_teacher_ratio','male_teacher_ratio','view_count'];
for(const sort of allowed){
  assert.equal(canSortRankedSchools(1,sort),true,'Lv1 historical sort available: '+sort);
  assert.equal(canSortRankedSchools(2,sort),true,'Lv2 sort available: '+sort);
}
for(const level of [0,-1,null,NaN,Infinity,'not-a-level']){
  assert.equal(canSortRankedSchools(level,'housing_price_won'),false,
    'No unauthenticated or invalid tier can use Lv2 sort');
}
assert.equal(canSortRankedSchools(1,'housing_price_won'),false,
  'A server-authenticated Lv1 session must not use land-price sorting');
assert.equal(canSortRankedSchools(2,'housing_price_won'),true,
  'Lv2 unlocks the preexisting land-price sort');
assert.equal(canSortRankedSchools(3,'housing_price_won'),true,
  'Lv3 will retain unlocked Lv2 sorting after membership implementation');

const api=readFileSync('supabase/functions/beagu-level-api/index.ts','utf8');
const start=api.indexOf("if(body.action==='ranked_schools')");
const end=api.indexOf("const rankedQuery=(table:string)=>",start);
assert.ok(start>=0&&end>start,'Ranked API branch must exist');
const portion=api.slice(start,end);
assert.match(portion,/if\(!canSortRankedSchools\(Number\(session\.access_level\),sort\)\)/,
  'Ranked API must check the SERVER session tier (never a request body level)');
assert.match(portion,/return send\(\{error:'ACCESS_DENIED'\},403,origin\)/,
  'Lv1 sort restriction must produce HTTP 403');
assert.ok(portion.indexOf("if(!canSortRankedSchools(")>
  portion.indexOf("if(!sorts.has(sort)"),
  'Reject invalid sorts before checking tier authorization');
assert.ok(!portion.includes("admin.from("),
  'Tier gate must precede any privileged database reads');
console.log('PASS: Lv1 cannot request land-price ranking, Lv2+ can, and backend gate precedes data access.');
console.log('NOT TESTED: full Lv3 server session, cross-account access or release policy.');
