import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const original=readFileSync('supabase/migrations/20261122013000_beagu_2026_nonscorable_core_coverage.sql','utf8');
const fixture=readFileSync('tests/sql/2026-qa-isolated-staging-sandbox.sql','utf8');

function sandboxDefinition(name){
 const start=original.indexOf('CREATE OR REPLACE FUNCTION beagu_private.'+name+'()');
 assert.ok(start>=0,'missing source function: '+name);
 const head=original.indexOf('$function$',start);
 const tail=original.indexOf('$function$',head+10);
 assert.ok(head>=0&&tail>head,'malformed SQL function: '+name);
 return (original.slice(start,tail+'$function$'.length)+';')
   .replaceAll('beagu_private.','qa2026_sandbox.')
   .replaceAll('public.beagu_metric_catalog','qa2026_sandbox.beagu_metric_catalog')
   .replaceAll('public.beagu_2026_results_snapshot','qa2026_sandbox.beagu_2026_results_snapshot');
}
for(const name of ['review_2026_staged_aggregates','refresh_2026_quality_reviews']){
 assert.ok(fixture.includes(sandboxDefinition(name)),name+' staging copy has drifted from production candidate');
}
for(const scenario of [
 'regular_13_only','valid_cannot_judge','optional_questions_blank','core_question_blank',
 'unrecognized_Q08','school_mismatch','impossible_QA_count','missing_snapshot_core',
 'unrecognized_Q12_other','missing_QA_core_slot'
]){
 assert.ok(fixture.includes("'"+scenario+"'"),'missing case: '+scenario);
}
assert.match(fixture,/REVOKE ALL ON SCHEMA qa2026_sandbox FROM PUBLIC, anon, authenticated/);
assert.match(fixture,/REVOKE ALL ON ALL TABLES IN SCHEMA qa2026_sandbox FROM PUBLIC,anon,authenticated/);
assert.match(fixture,/REVOKE ALL ON ALL FUNCTIONS IN SCHEMA qa2026_sandbox FROM PUBLIC,anon,authenticated/);
assert.match(fixture,/t\.publication_status IS DISTINCT FROM 'WITHHELD'/);
assert.match(fixture,/qa2026_sandbox already exists; refusing to overwrite/);
assert.doesNotMatch(fixture,/public\.beagu_2026_results_snapshot|public\.beagu_metric_catalog|beagu_private\./);
assert.doesNotMatch(fixture,/\b(?:cron\.schedule|DROP\s+SCHEMA|DROP\s+TABLE|TRUNCATE)\b/i);
assert.doesNotMatch(fixture,/^\s*(?:BEGIN|COMMIT);\s*$/gm,'must not use embedded transactions in Supabase migrations');
assert.doesNotMatch(fixture,/SUPABASE_SERVICE_ROLE_KEY|BEAGU_2026_INGEST_TOKEN|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
console.log('PASS: isolated 2026 staging SQL tracks actual functions, has 10 synthetic fixtures, is private, never publishes');
