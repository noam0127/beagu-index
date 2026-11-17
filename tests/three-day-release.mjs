import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {approved2026ReleaseIsOldEnough,releaseMetrics,THREE_DAY_DELAY_MS} from '../supabase/functions/_shared/release-policy.mjs';
assert.equal(THREE_DAY_DELAY_MS,72*60*60*1000);
const now=Date.parse('2026-11-18T00:00:00.000Z');
const recent=new Date(now-71*60*60*1000).toISOString();
const eligible=new Date(now-73*60*60*1000).toISOString();
assert.equal(approved2026ReleaseIsOldEnough(recent,now),false);
assert.equal(approved2026ReleaseIsOldEnough(eligible,now),true);
assert.equal(approved2026ReleaseIsOldEnough('missing',now),false);
const metric={
  survey_year:2026,question_id:'percentile',access_level:1,value:'77',
  approval_status:'APPROVED',privacy_status:'PASSED',
  identity_reviewed:true,question_reviewed:true,small_cell_reviewed:true,
  differencing_reviewed:true,approved_by:'reviewer',approval_evidence:'verified report',
  release_version:'release-1',approved_at:new Date(Date.now()-71*60*60*1000).toISOString()
};
const schema={
  survey_year:2026,question_id:'percentile',verified:true,access_level:1,
  value_type:'number',minimum:0,maximum:100,label:'전국 상대 위치',
  meaning:'전국과 비교한 위치',interpretation:'검증된 참고 지표',
  direction:'higher',unit:'%',spatial_scope:'전국'
};
assert.equal(releaseMetrics([metric],[schema],1).length,0,'Too-recent 2026 approvals must not leak');
metric.approved_at=new Date(Date.now()-73*60*60*1000).toISOString();
assert.equal(releaseMetrics([metric],[schema],1).length,1,'Approved and old enough metrics may be returned');
metric.privacy_status='REVIEW_PENDING';
assert.equal(releaseMetrics([metric],[schema],1).length,0,'Three-day delay does not bypass privacy review');
const migration=readFileSync('supabase/migrations/20261118_public_2026_72hour_review_cooldown.sql','utf8');
assert.match(migration,/manual_release_at <= now\(\) - interval '72 hours'/);
assert.match(migration,/updated_at <= now\(\) - interval '72 hours'/);
assert.match(migration,/valid_observation_count >= 5/);
console.log('PASS: 2026 approval cooldown 72 hours, privacy review and RLS delay');
