-- Keep the existing, already-deployed referral quality gate as the single
-- point of review. Its verified Form endpoint calls this original duplicate-
-- safe credit function after preliminary anomaly screening.
-- A second independent quality gate would double-hold legitimate referrals.
create or replace function public.beagu_referral_credit(
 p_event_hash text,p_referral_hash text,p_respondent_hash text,p_respondent_uuid uuid
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
 p beagu_private.challenge_referral_profiles%rowtype;
 old_event beagu_private.challenge_referral_events%rowtype;
 outcome text;
begin
 if coalesce((select enabled from beagu_private.challenge_referral_settings where name='ingest_enabled'),false)=false
 then raise exception 'ingest disabled' using errcode='42501'; end if;
 if p_event_hash !~ '^[0-9a-f]{64}$' or p_referral_hash !~ '^[0-9a-f]{64}$'
  or p_respondent_hash !~ '^[0-9a-f]{64}$' or p_respondent_uuid is null
 then raise exception 'invalid event' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_event_hash),2602);
 select * into old_event from beagu_private.challenge_referral_events
 where event_sha256=p_event_hash;
 if found then return jsonb_build_object('credited',false,'decision','duplicate_event'); end if;
 select * into p from beagu_private.challenge_referral_profiles
 where referral_token_sha256=p_referral_hash and campaign='2026' for update;
 if not found or p.disabled then
   outcome:='invalid_link';
 elsif p.visitor_id=p_respondent_uuid then
   outcome:='same_device';
 elsif p.access_level=2 then
   outcome:='already_upgraded';
 else
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_respondent_hash),2603);
   if exists(select 1 from beagu_private.challenge_referral_events
      where campaign='2026' and respondent_sha256=p_respondent_hash and decision='credited')
   then outcome:='duplicate_respondent';
   else outcome:='credited'; end if;
 end if;
 insert into beagu_private.challenge_referral_events
 (event_sha256,campaign,referral_token_sha256,respondent_sha256,referrer_visitor_id,decision)
 values(p_event_hash,'2026',p_referral_hash,p_respondent_hash,
   case when p.visitor_id is null then null else p.visitor_id end,outcome);
 if outcome='credited' then
    update beagu_private.challenge_referral_profiles
       set access_level=2,valid_referrals=1,upgraded_at=now()
    where campaign='2026' and visitor_id=p.visitor_id and access_level=1;
 end if;
 return jsonb_build_object('credited',outcome='credited','decision',outcome);
end $fn$;
revoke all on function public.beagu_referral_credit(text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.beagu_referral_credit(text,text,text,uuid) to service_role;
