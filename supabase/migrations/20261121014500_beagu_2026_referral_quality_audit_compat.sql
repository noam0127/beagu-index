-- Compatibility with existing audit table created by another workflow.
-- Preserve old action names and reason_codes; add free-text owner review memo
-- used by the screened referral credit pipeline.
alter table beagu_private.challenge_referral_quality_audit
 add column if not exists note text;
alter table beagu_private.challenge_referral_quality_audit
 add column if not exists reason_codes text[] not null default '{}'::text[];
alter table beagu_private.challenge_referral_quality_audit
 drop constraint if exists challenge_referral_quality_audit_action_check;
alter table beagu_private.challenge_referral_quality_audit
 add constraint challenge_referral_quality_audit_action_check check(
   action in ('QUALITY_FLAGGED','QUALITY_RECOVERED','OWNER_APPROVED','OWNER_REJECTED',
              'FLAGGED','CLEARED','REJECTED','REVOKED')
 );
-- Existing event audit remains entirely in the private schema.
alter table beagu_private.challenge_referral_quality_audit enable row level security;
revoke all on beagu_private.challenge_referral_quality_audit from public,anon,authenticated;
