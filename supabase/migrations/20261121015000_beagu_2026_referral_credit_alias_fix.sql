-- A PL/pgSQL record variable must not shadow a subquery table alias.
CREATE OR REPLACE FUNCTION public.beagu_referral_credit(p_event_hash text, p_referral_hash text, p_respondent_hash text, p_respondent_uuid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare is_self boolean;
        c_same boolean;
        gated boolean;
        ref_profile beagu_private.challenge_referral_profiles%rowtype;
        old_event beagu_private.challenge_referral_events%rowtype;
        outcome text;
begin
 if p_respondent_uuid is null or p_event_hash !~ '^[a-f0-9]{64}$'
   or p_referral_hash !~ '^[a-f0-9]{64}$' or p_respondent_hash !~ '^[a-f0-9]{64}$'
 then raise exception 'invalid event' using errcode='22023'; end if;
 select exists(select 1 from beagu_private.challenge_referral_profiles p
   where p.campaign='2026' and p.referral_token_sha256=p_referral_hash
     and p.visitor_id=p_respondent_uuid) into is_self;
 select c.same_device into c_same from beagu_private.challenge_referral_quality_cases c
   where c.event_sha256=p_event_hash
     and c.referral_token_sha256=p_referral_hash
     and c.respondent_sha256=p_respondent_hash;
 select coalesce((select enabled from beagu_private.challenge_referral_settings
                   where name='quality_gate_enabled'),false) into gated;
 if c_same is not null or gated then
   if c_same is not null and c_same is distinct from is_self
   then raise exception 'screened respondent mismatch'; end if;
   return beagu_private.referral_credit_screened(p_event_hash,p_referral_hash,p_respondent_hash);
 end if;
 -- Compatibility path for the older, already-installed Form trigger.
 -- Stops running as soon as a verified modern signal enables the gate.
 if coalesce((select enabled from beagu_private.challenge_referral_settings
              where name='ingest_enabled'),false)=false
 then raise exception 'ingest disabled' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_event_hash),2602);
 select * into old_event from beagu_private.challenge_referral_events
  where event_sha256=p_event_hash;
 if found then return jsonb_build_object('credited',false,'decision','duplicate_event'); end if;
 select * into ref_profile from beagu_private.challenge_referral_profiles
   where referral_token_sha256=p_referral_hash and campaign='2026' for update;
 if not found or ref_profile.disabled then outcome:='invalid_link';
 elsif ref_profile.visitor_id=p_respondent_uuid then outcome:='same_device';
 elsif ref_profile.access_level=2 then outcome:='already_upgraded';
 else
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_respondent_hash),2603);
   if exists(select 1 from beagu_private.challenge_referral_events
      where campaign='2026' and respondent_sha256=p_respondent_hash and decision='credited')
   then outcome:='duplicate_respondent'; else outcome:='credited'; end if;
 end if;
 insert into beagu_private.challenge_referral_events
  (event_sha256,campaign,referral_token_sha256,respondent_sha256,referrer_visitor_id,decision)
 values(p_event_hash,'2026',p_referral_hash,p_respondent_hash,
   case when ref_profile.visitor_id is null then null else ref_profile.visitor_id end,outcome);
 if outcome='credited' then
   update beagu_private.challenge_referral_profiles
      set access_level=2,valid_referrals=1,upgraded_at=now()
      where campaign='2026' and visitor_id=ref_profile.visitor_id and access_level=1;
 end if;
 return jsonb_build_object('credited',outcome='credited','decision',outcome);
end $function$
;
