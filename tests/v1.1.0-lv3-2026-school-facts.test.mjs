import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=p=>fs.readFileSync(p,'utf8');
const sql=read('supabase/migrations/20261122004000_beagu_lv3_2026_official_school_facts_v1.sql');
const edge=read('supabase/functions/beagu-lv3-school-facts-v1/index.ts');
const legacy=read('supabase/functions/beagu-level-api/index.ts');
const browser=read('js/level-search.js');
test('2026 source provenance is mandatory; empty release ledger cannot invent current facts',()=>{
 assert.match(sql,/create table if not exists beagu_private\.lv3_official_school_facts_2026_v1/);
 assert.match(sql,/reference_year integer not null default 2026 check\(reference_year=2026\)/);
 assert.match(sql,/neis_source_digest text not null check\(neis_source_digest ~ '\^\[a-f0-9\]\{64\}\$'\)/);
 assert.match(sql,/neis_as_of date not null/);
 assert.match(sql,/neis_reviewed boolean not null default false/);
 assert.match(sql,/review_status text not null default 'PENDING'/);
 assert.doesNotMatch(sql,/\binsert\s+into\s+beagu_private\.lv3_official_school_facts_2026_v1\b/i);
 assert.match(sql,/2026-01-01/);
 assert.doesNotMatch(sql,/now\(\).*as.*source_year|current_date.*as.*source_year/i);
});
test('school-info and public-property amounts require independent 2026 sources and dates',()=>{
 for(const v of ["school_info_source_ref","school_info_source_digest","school_info_as_of","school_info_reviewed","housing_source_ref","housing_source_digest","housing_as_of","housing_reviewed"])
  assert.ok(sql.includes(v),v);
 assert.match(sql,/not school_info_reviewed or \(/);
 assert.match(sql,/not housing_reviewed or \(/);
 assert.match(sql,/case when f\.school_info_reviewed and f\.school_info_as_of<=current_date then f\.student_count end/);
 assert.match(sql,/case when f\.housing_reviewed and f\.housing_as_of<=current_date then f\.housing_price_won end/);
 assert.match(sql,/then f\.male_teacher_ratio end as male_teacher_ratio/);
 assert.match(sql,/f\.neis_as_of<=current_date/);
});
test('Lv3 facts are only published when owner, private review and global release are ALL valid',()=>{
 for(const guard of [
  "f.review_status='APPROVED'",
  'f.personal_data_reviewed',
  'f.reidentification_reviewed',
  'f.prior_data_combination_reviewed',
  "a.role='owner'",
  'a.enabled=true',
  'gate.singleton and gate.enabled',
  'f.reviewed_at>=f.updated_at'
 ])assert.ok(sql.includes(guard.replaceAll("\\'","'")),guard);
 assert.match(sql,/create or replace view public\.beagu_lv3_2026_school_facts_v1\s+with \(security_invoker=true\)/);
 assert.match(sql,/revoke all on public\.beagu_lv3_2026_school_facts_v1\s+from public,anon,authenticated/);
 assert.match(sql,/grant select on public\.beagu_lv3_2026_school_facts_v1 to service_role/);
});
test('source edits invalidate earlier sign-off, even if importer forgets updated_at',()=>{
 assert.match(sql,/create or replace function beagu_private\.lv3_2026_facts_revision_guard_v1/);
 assert.match(sql,/pg_catalog\.to_jsonb\(new\)/);
 assert.match(sql,/new\.review_status:='PENDING'/);
 assert.match(sql,/new\.reviewer_user_id:=null/);
 assert.match(sql,/new\.reviewed_at:=null/);
 assert.match(sql,/before update on beagu_private\.lv3_official_school_facts_2026_v1/);
});
test('private source and reviewer identities are never exposed from public API',()=>{
 assert.match(sql,/alter table beagu_private\.lv3_official_school_facts_2026_v1 enable row level security/);
 assert.match(sql,/revoke all on beagu_private\.lv3_official_school_facts_2026_v1\s+from public,anon,authenticated/);
 assert.match(sql,/grant select on beagu_private\.lv3_official_school_facts_2026_v1 to service_role/);
 assert.doesNotMatch(sql,/grant\s+(?:insert|update|delete)\s+on\s+beagu_private\.lv3_official_school_facts_2026_v1\s+to service_role/i);
 assert.match(edge,/const table="beagu_lv3_2026_school_facts_v1"/);
 assert.match(edge,/function projected\(row:Record<string,unknown>\)/);
 assert.match(edge,/for\(const field of columns\.split\(","\)\)/);
 assert.doesNotMatch(edge,/select\('\*'\)|select\("\*"\)|source_digest|reviewer_user_id|approval_evidence|user_metadata|raw_user_meta_data/);
});
test('2026 facts require Supabase verified Auth+active session+linked owner and CURRENT approved Lv2',()=>{
 for(const v of [
  'db.auth.getUser(jwt[1])','beagu_member_live_session_v1',
  'beagu_2026_verified_visitor_level_v1',
  'beagu_lv3_verify_session_v1',
  'X-Beagu-Level-Session','X-Beagu-Lv3-Token',
  'Number(level.access_level)!==2',
  'Number(qualified)!==2',
  'authError||!account?.user||account.user.is_anonymous',
  'return !grantError&&authorized===true'
 ])assert.ok(edge.includes(v),v);
 assert.match(edge,/if\(!await currentLv3\(req\)\.catch\(\(\)=>false\)\)/);
 assert.doesNotMatch(edge,/window\.|document\.|dataset\.level|body\.level|input\.level/);
});
test('2026 sortable data uses a verified 2026 view and exact allowlist, never old mixed-year student facts',()=>{
 for(const sort of ['school_name','address','student_count','junior_teacher_ratio','male_teacher_ratio','housing_price_won','beagu_percentile_2025','view_count'])
  assert.ok(edge.includes('"'+sort+'"'),sort);
 assert.match(edge,/sortFields\.has\(sort\)/);
 assert.match(edge,/\.order\(sort,\{ascending:dir==="asc",nullsFirst:false\}\)/);
 assert.match(edge,/\.range\(page\*20,page\*20\+19\)/);
 assert.match(sql,/2026::integer as reference_year/);
 assert.match(sql,/h\.beagu_percentile_2025/);
 assert.match(sql,/h\.view_count/);
 assert.doesNotMatch(sql,/h\.student_count|h\.housing_price_won|h\.junior_teacher_ratio|h\.male_teacher_ratio/);
});
test('Lv1 housing sort is rejected on server and disabled in UI, Lv2 retains old 2025 baseline',()=>{
 assert.match(legacy,/if\(sort==='housing_price_won'&&Number\(session\.access_level\)<2\)/);
 assert.match(legacy,/LV2_REQUIRED_FOR_HOUSING_SORT/);
 assert.match(legacy,/beagu_lv1_school_sort_cache_v1/);
 assert.match(legacy,/beagu_lv1_school_sort_index/);
 assert.match(browser,/opt\.disabled=verifiedTier<2/);
 assert.match(browser,/verifiedTier=Number\(data\.level\)\|\|0/);
 assert.match(browser,/verifiedTier=Number\(state\.level\)\|\|0/);
 assert.match(browser,/if\(opt\.disabled&&\$\('regionSort'\)\.value==='housing_price_won'\)/);
 assert.doesNotThrow(()=>new vm.Script(browser));
});
test('Stage22 separate endpoint is not loaded in production HTML, release switch remains OFF',()=>{
 const release=read('supabase/migrations/20261122002000_beagu_lv3_server_authorization_v1.sql');
 assert.match(release,/enabled boolean not null default false/);
 for(const page of ['search.html','search-lv1.html','challenge.html','levels.html'])
  assert.ok(!read(page).includes('beagu-lv3-school-facts-v1'),page);
 assert.match(edge,/if\(origin&&!allowed\.has\(origin\)\)/);
 assert.match(edge,/Cache-Control":"private, no-store/);
 assert.match(edge,/Referrer-Policy":"no-referrer/);
});
