-- New inspection mode starts in backwards-compatible form: the new Form
-- signal envelope turns strict screening on automatically when first observed
-- from the authenticated official trigger. Old live Forms do not stop earning.
alter table beagu_private.challenge_referral_settings
 drop constraint if exists challenge_referral_settings_name_check;
alter table beagu_private.challenge_referral_settings
 add constraint challenge_referral_settings_name_check
 check(name in ('public_enabled','ingest_enabled','login_enabled','quality_gate_enabled'));
insert into beagu_private.challenge_referral_settings(name,enabled)
 values('quality_gate_enabled',false)
 on conflict(name) do nothing;

-- Form-linked referral quality gate: clean responses credit automatically;
-- suspicious signals are held for owner review, with live Lv2 entitlement recalculated.
-- Raw answers, Form response IDs, teacher names, emails, and proof URLs are never persisted.
create table if not exists beagu_private.challenge_referral_quality_cases (
 event_sha256 text primary key check(event_sha256 ~ '^[a-f0-9]{64}$'),
 referral_token_sha256 text not null check(referral_token_sha256 ~ '^[a-f0-9]{64}$'),
 respondent_sha256 text not null check(respondent_sha256 ~ '^[a-f0-9]{64}$'),
 same_device boolean not null,
 core_answered integer check(core_answered between 0 and 13),
 straightline boolean,
 submitted_at timestamptz not null,
 status text not null check(status in ('AUTO_CLEARED','PENDING_REVIEW','CLEARED','REJECTED')),
 reason_codes text[] not null default '{}',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 review_reason text
);
alter table beagu_private.challenge_referral_quality_cases enable row level security;
revoke all on beagu_private.challenge_referral_quality_cases from public,anon,authenticated;
grant select,insert,update on beagu_private.challenge_referral_quality_cases to service_role;

create table if not exists beagu_private.challenge_referral_quality_audit (
 id bigint generated always as identity primary key,
 event_sha256 text not null references beagu_private.challenge_referral_quality_cases(event_sha256),
 action text not null check(action in ('FLAGGED','CLEARED','REJECTED','REVOKED')),
 actor_user_id uuid references auth.users(id),
 note text not null,
 recorded_at timestamptz not null default now()
);
alter table beagu_private.challenge_referral_quality_audit enable row level security;
revoke all on beagu_private.challenge_referral_quality_audit from public,anon,authenticated;
grant select,insert on beagu_private.challenge_referral_quality_audit to service_role;

-- A profile is earned only while at least one credited, quality-cleared event
-- remains. This also immediately invalidates issued Lv2 codes at next API check.
create or replace function beagu_private.recompute_referral_quality_entitlement(p_referral_hash text)
returns void language plpgsql security definer set search_path='' as $fn$
declare has_valid boolean;
begin
 if p_referral_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid referral'; end if;
 select exists(
  select 1 from beagu_private.challenge_referral_events e
  left join beagu_private.challenge_referral_quality_cases c
    on c.event_sha256=e.event_sha256
      and c.referral_token_sha256=e.referral_token_sha256
      and c.respondent_sha256=e.respondent_sha256
  where e.campaign='2026' and e.decision='credited'
    and e.referral_token_sha256=p_referral_hash
    and (c.status in ('AUTO_CLEARED','CLEARED')
      or (c.event_sha256 is null and e.created_at<
        (select s.changed_at from beagu_private.challenge_referral_settings s
         where s.name='quality_gate_enabled' and s.enabled=true)))
 ) into has_valid;
 update beagu_private.challenge_referral_profiles p set
  access_level=case when has_valid then 2 else 1 end,
  valid_referrals=case when has_valid then 1 else 0 end,
  upgraded_at=case when has_valid then coalesce(p.upgraded_at,now()) else null end
 where p.campaign='2026' and p.referral_token_sha256=p_referral_hash
   and not p.disabled;
end $fn$;
revoke all on function beagu_private.recompute_referral_quality_entitlement(text) from public,anon,authenticated;
grant execute on function beagu_private.recompute_referral_quality_entitlement(text) to service_role;

-- Referrals and quality records share the same advisory-lock key. Replays
-- cannot clear a pending, manually cleared, or rejected record.
create or replace function public.beagu_referral_quality_screen(
 p_event_hash text,p_referral_hash text,p_respondent_hash text,
 p_respondent_uuid uuid,p_core_answered integer,p_straightline boolean,
 p_submitted_at timestamptz
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare c beagu_private.challenge_referral_quality_cases%rowtype;
        is_self boolean;
        flags text[];
        incoming text;
begin
 if p_event_hash !~ '^[a-f0-9]{64}$'
   or p_referral_hash !~ '^[a-f0-9]{64}$'
   or p_respondent_hash !~ '^[a-f0-9]{64}$'
   or p_respondent_uuid is null or p_submitted_at is null
   or p_submitted_at<timestamp with time zone '2026-11-01 00:00:00+09'
   or p_submitted_at>now()+interval '5 minutes'
   or (p_core_answered is not null and p_core_answered not between 0 and 13)
 then raise exception 'invalid quality signal'; end if;
 -- Existing owner-installed Form trigger may still send only metadata.
 -- In that case preserve its original behavior until the updated trusted
 -- trigger sends the first complete, nonidentifying signal envelope.
 if (p_core_answered is null or p_straightline is null)
   and not coalesce((select enabled from beagu_private.challenge_referral_settings
                     where name='quality_gate_enabled'),false)
 then return jsonb_build_object('status','LEGACY_COMPATIBLE'); end if;
 if p_core_answered is not null and p_straightline is not null then
   update beagu_private.challenge_referral_settings
      set enabled=true,changed_at=now()
    where name='quality_gate_enabled' and enabled=false;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_event_hash),2602);
 select exists(select 1 from beagu_private.challenge_referral_profiles p
   where p.campaign='2026' and p.referral_token_sha256=p_referral_hash
     and p.visitor_id=p_respondent_uuid) into is_self;
 flags:=array_remove(array[
  case when p_core_answered is distinct from 13 then 'CORE_ANSWER_COMPLETENESS_UNVERIFIED' end,
  case when p_straightline is null then 'STRAIGHTLINE_SIGNAL_MISSING' end,
  case when p_straightline is true then 'UNIFORM_CORE_RESPONSE_PATTERN' end
 ]::text[],null);
 incoming:=case when cardinality(flags)=0 then 'AUTO_CLEARED' else 'PENDING_REVIEW' end;
 select * into c from beagu_private.challenge_referral_quality_cases
   where event_sha256=p_event_hash for update;
 if found then
   if c.referral_token_sha256<>p_referral_hash
     or c.respondent_sha256<>p_respondent_hash or c.same_device is distinct from is_self
   then raise exception 'event identity collision'; end if;
   if c.status='AUTO_CLEARED' and incoming='PENDING_REVIEW' then
     update beagu_private.challenge_referral_quality_cases set
      status='PENDING_REVIEW',reason_codes=flags,updated_at=now()
     where event_sha256=p_event_hash;
     insert into beagu_private.challenge_referral_quality_audit(event_sha256,action,note)
       values(p_event_hash,'FLAGGED','Quality signal escalated on revalidation');
     perform beagu_private.recompute_referral_quality_entitlement(p_referral_hash);
     return jsonb_build_object('status','PENDING_REVIEW','credited',false);
   end if;
   return jsonb_build_object('status',c.status,'credited',c.status in ('AUTO_CLEARED','CLEARED'));
 end if;
 insert into beagu_private.challenge_referral_quality_cases(
   event_sha256,referral_token_sha256,respondent_sha256,same_device,
   core_answered,straightline,submitted_at,status,reason_codes
 ) values(p_event_hash,p_referral_hash,p_respondent_hash,is_self,
   p_core_answered,p_straightline,p_submitted_at,incoming,flags);
 if incoming='PENDING_REVIEW' then
   insert into beagu_private.challenge_referral_quality_audit(event_sha256,action,note)
    values(p_event_hash,'FLAGGED','Automatic quality signal requires human review');
 end if;
 return jsonb_build_object('status',incoming,'credited',incoming='AUTO_CLEARED');
end $fn$;
revoke all on function public.beagu_referral_quality_screen(text,text,text,uuid,integer,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.beagu_referral_quality_screen(text,text,text,uuid,integer,boolean,timestamptz) to service_role;

-- Common, fully screened credit logic for automatic and owner-cleared events.
-- Rechecking under a lock preserves original anti-duplicate guarantees.
create or replace function beagu_private.referral_credit_screened(
 p_event_hash text,p_referral_hash text,p_respondent_hash text
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare p beagu_private.challenge_referral_profiles%rowtype;
        c beagu_private.challenge_referral_quality_cases%rowtype;
        outcome text;
begin
 if coalesce((select enabled from beagu_private.challenge_referral_settings where name='ingest_enabled'),false)=false
 then raise exception 'ingest disabled' using errcode='42501'; end if;
 if p_event_hash !~ '^[a-f0-9]{64}$' or p_referral_hash !~ '^[a-f0-9]{64}$'
    or p_respondent_hash !~ '^[a-f0-9]{64}$'
 then raise exception 'invalid event' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_event_hash),2602);
 select * into c from beagu_private.challenge_referral_quality_cases
 where event_sha256=p_event_hash and referral_token_sha256=p_referral_hash
   and respondent_sha256=p_respondent_hash for update;
 if not found or c.status not in ('AUTO_CLEARED','CLEARED') then
   return jsonb_build_object('credited',false,'decision','pending_quality_review');
 end if;
 if exists(select 1 from beagu_private.challenge_referral_events e
           where e.event_sha256=p_event_hash)
 then return jsonb_build_object('credited',false,'decision','duplicate_event'); end if;
 select * into p from beagu_private.challenge_referral_profiles
 where referral_token_sha256=p_referral_hash and campaign='2026' for update;
 if not found or p.disabled then
   outcome:='invalid_link';
 elsif c.same_device then
   outcome:='same_device';
 elsif p.access_level=2 and p.valid_referrals>=1 then
   outcome:='already_upgraded';
 else
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_respondent_hash),2603);
   if exists(select 1 from beagu_private.challenge_referral_events e
     where e.campaign='2026' and e.respondent_sha256=p_respondent_hash
       and e.decision='credited')
   then outcome:='duplicate_respondent';
   else outcome:='credited'; end if;
 end if;
 insert into beagu_private.challenge_referral_events
 (event_sha256,campaign,referral_token_sha256,respondent_sha256,referrer_visitor_id,decision)
 values(p_event_hash,'2026',p_referral_hash,p_respondent_hash,
   case when p.visitor_id is null then null else p.visitor_id end,outcome);
 if outcome='credited' then
   update beagu_private.challenge_referral_profiles set
    access_level=2,valid_referrals=1,upgraded_at=now()
   where campaign='2026' and visitor_id=p.visitor_id;
 end if;
 return jsonb_build_object('credited',outcome='credited','decision',outcome);
end $fn$;
revoke all on function beagu_private.referral_credit_screened(text,text,text) from public,anon,authenticated;
grant execute on function beagu_private.referral_credit_screened(text,text,text) to service_role;

-- Preserve API contract; no service path may silently bypass quality screening.
create or replace function public.beagu_referral_credit(
 p_event_hash text,p_referral_hash text,p_respondent_hash text,p_respondent_uuid uuid
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare is_self boolean;
        c_same boolean;
        gated boolean;
        p beagu_private.challenge_referral_profiles%rowtype;
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
 select * into p from beagu_private.challenge_referral_profiles
   where referral_token_sha256=p_referral_hash and campaign='2026' for update;
 if not found or p.disabled then outcome:='invalid_link';
 elsif p.visitor_id=p_respondent_uuid then outcome:='same_device';
 elsif p.access_level=2 then outcome:='already_upgraded';
 else
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_respondent_hash),2603);
   if exists(select 1 from beagu_private.challenge_referral_events
      where campaign='2026' and respondent_sha256=p_respondent_hash and decision='credited')
   then outcome:='duplicate_respondent'; else outcome:='credited'; end if;
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

-- Owner can clear an exception or reject it, not mark it 'automatic'.
-- A cleared case credits using only pseudonymous hashes, with no raw ID saved.
create or replace function public.beagu_referral_quality_resolve(
 p_event_hash text,p_decision text,p_actor uuid,p_session uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare c beagu_private.challenge_referral_quality_cases%rowtype;
        credit jsonb;
begin
 if p_event_hash !~ '^[a-f0-9]{64}$' or p_decision not in ('CLEARED','REJECTED')
   or length(trim(coalesce(p_reason,''))) not between 12 and 500
   or coalesce(p_reason,'')~'[<>]' or p_actor is null or p_session is null
 then raise exception 'invalid review'; end if;
 if not exists(select 1 from public.beagu_admin_accounts a
   where a.user_id=p_actor and a.enabled and a.role='owner')
    or not public.beagu_admin_active_mfa_session(p_actor,p_session)
 then raise exception 'verified owner MFA required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_event_hash),2602);
 select * into strict c from beagu_private.challenge_referral_quality_cases
  where event_sha256=p_event_hash for update;
 if c.status not in ('PENDING_REVIEW','CLEARED','REJECTED')
 then raise exception 'manual review not required'; end if;
 if c.status='REJECTED' and p_decision='CLEARED'
    and length(trim(p_reason))<20
 then raise exception 'reversal reason insufficient'; end if;
 update beagu_private.challenge_referral_quality_cases set
   status=p_decision,reviewed_by=p_actor,reviewed_at=now(),
   review_reason=trim(p_reason),updated_at=now()
 where event_sha256=p_event_hash;
 insert into beagu_private.challenge_referral_quality_audit(
  event_sha256,action,actor_user_id,note)
 values(p_event_hash,p_decision,p_actor,trim(p_reason));
 if p_decision='REJECTED' then
   perform beagu_private.recompute_referral_quality_entitlement(c.referral_token_sha256);
   return jsonb_build_object('ok',true,'status','REJECTED','credited',false);
 end if;
 -- Existing credited event: restore valid entitlement; first-time event:
 -- execute the original duplicate/self-referral checks with screened identity.
 if exists(select 1 from beagu_private.challenge_referral_events
   where event_sha256=p_event_hash and decision='credited') then
   perform beagu_private.recompute_referral_quality_entitlement(c.referral_token_sha256);
   return jsonb_build_object('ok',true,'status','CLEARED','credited',true);
 end if;
 credit:=beagu_private.referral_credit_screened(
   c.event_sha256,c.referral_token_sha256,c.respondent_sha256);
 return jsonb_build_object('ok',true,'status','CLEARED',
    'credited',coalesce((credit->>'credited')::boolean,false),
    'decision',credit->>'decision');
end $fn$;
revoke all on function public.beagu_referral_quality_resolve(text,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.beagu_referral_quality_resolve(text,text,uuid,uuid,text) to service_role;

create or replace function public.beagu_referral_quality_review_queue(
 p_limit integer default 20,p_offset integer default 0
) returns jsonb language sql stable security definer set search_path='' as $fn$
 select jsonb_build_object(
   'pending',(select count(*) from beagu_private.challenge_referral_quality_cases
     where status='PENDING_REVIEW'),
   'items',coalesce((
     select jsonb_agg(to_jsonb(v) order by v.submitted_at desc) from (
       select left(c.event_sha256,12) as case_label,
         c.event_sha256,c.status,c.reason_codes,c.core_answered,
         c.straightline,c.submitted_at,c.created_at,c.updated_at
       from beagu_private.challenge_referral_quality_cases c
       where c.status='PENDING_REVIEW'
       order by c.submitted_at desc,c.event_sha256
       limit least(greatest(p_limit,1),40) offset least(greatest(p_offset,0),10000)
     ) v
   ),'[]'::jsonb)
 )
$fn$;
revoke all on function public.beagu_referral_quality_review_queue(integer,integer) from public,anon,authenticated;
grant execute on function public.beagu_referral_quality_review_queue(integer,integer) to service_role;
