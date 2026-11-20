-- Remove the unused parallel quality implementation introduced during
-- integration. The existing production route remains:
-- Form quality signals -> public.beagu_referral_credit_quality_gate ->
-- challenge_referral_quality_reviews -> owner MFA case resolution.
-- No submission or referral data live in the temporary cases table.
do $fn$
begin
  if exists(select 1 from beagu_private.challenge_referral_quality_cases limit 1)
  then raise exception 'unsafe cleanup: temporary quality cases contain records'; end if;
end $fn$;
drop function if exists public.beagu_referral_quality_review_queue(integer,integer);
drop function if exists public.beagu_referral_quality_resolve(text,text,uuid,uuid,text);
drop function if exists public.beagu_referral_quality_screen(text,text,text,uuid,integer,boolean,timestamptz);
drop function if exists beagu_private.referral_credit_screened(text,text,text);
drop function if exists beagu_private.recompute_referral_quality_entitlement(text);
drop table if exists beagu_private.challenge_referral_quality_cases;
delete from beagu_private.challenge_referral_settings
 where name='quality_gate_enabled' and enabled=false;
-- Do not drop the existing challenge_referral_quality_audit table or its
-- historical event actions; it belongs to the active original quality gate.
