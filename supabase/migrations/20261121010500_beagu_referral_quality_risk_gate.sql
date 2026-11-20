-- Referral rewards are conditional on trusted Form-submit quality signals.
-- We neither store individual answers nor accuse a respondent of fraud.
-- Pending/suspicious events do not confer Lv2; manual owner override is reversible.
alter table beagu_private.challenge_referral_events
  drop constraint if exists challenge_referral_events_decision_check;
alter table beagu_private.challenge_referral_events
 add constraint challenge_referral_events_decision_check check(
   decision in ('credited','invalid_link','same_device','duplicate_respondent',
    'already_upgraded','pending_quality_review','rejected_quality'));

create table if not exists beagu_private.challenge_referral_quality_reviews (
 event_sha256 text primary key check(event_sha256 ~ '^[a-f0-9]{64}$'),
 respondent_visitor_id uuid,
 quality_status text not null check(quality_status in
   ('AUTO_PASS','REVIEW_REQUIRED','MANUALLY_APPROVED','REJECTED')),
 signals text[] not null default '{}',
 reviewer_user_id uuid references auth.users(id),
 reviewed_at timestamptz,
 notes text,
 checked_at timestamptz not null default now(),
 constraint quality_manual_requires_review check(
   quality_status not in ('MANUALLY_APPROVED','REJECTED') or
   (reviewer_user_id is not null and reviewed_at is not null and length(coalesce(notes,''))>=12))
);
alter table beagu_private.challenge_referral_quality_reviews enable row level security;
revoke all on beagu_private.challenge_referral_quality_reviews from public,anon,authenticated;
grant select,insert,update on beagu_private.challenge_referral_quality_reviews to service_role;

create table if not exists beagu_private.challenge_referral_quality_audit (
 id bigint generated always as identity primary key,
 event_sha256 text not null check(event_sha256 ~ '^[a-f0-9]{64}$'),
 action text not null check(action in ('QUALITY_FLAGGED','QUALITY_RECOVERED','OWNER_APPROVED','OWNER_REJECTED')),
 actor_user_id uuid references auth.users(id),
 reason_codes text[] not null default '{}',
 recorded_at timestamptz not null default now()
);
alter table beagu_private.challenge_referral_quality_audit enable row level security;
revoke all on beagu_private.challenge_referral_quality_audit from public,anon,authenticated;
grant select,insert on beagu_private.challenge_referral_quality_audit to service_role;

-- Guard the original credit function too, so stale deployed code cannot bypass
-- the new quality gate. Function body is otherwise unchanged.
create or replace function public.beagu_referral_credit(
 p_event_hash text,p_referral_hash text,p_respondent_hash text,p_respondent_uuid uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare p beagu_private.challenge_referral_profiles%rowtype;
 old_event beagu_private.challenge_referral_events%rowtype;
 outcome text;
begin
 if not exists(select 1 from beagu_private.challenge_referral_quality_reviews q
     where q.event_sha256=p_event_hash and q.quality_status in ('AUTO_PASS','MANUALLY_APPROVED'))
 then return jsonb_build_object('credited',false,'decision','quality_attestation_required'); end if;
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
 if not found or p.disabled then outcome:='invalid_link';
 elsif p.visitor_id=p_respondent_uuid then outcome:='same_device';
 elsif p.access_level=2 then outcome:='already_upgraded';
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

create or replace function public.beagu_referral_credit_quality_gate(
 p_event_hash text,p_referral_hash text,p_respondent_hash text,
 p_respondent_uuid uuid,p_quality_attested boolean,p_quality_signals text[])
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare p beagu_private.challenge_referral_profiles%rowtype;
 old beagu_private.challenge_referral_events%rowtype;
 previous beagu_private.challenge_referral_quality_reviews%rowtype;
 issues text[]:='{}'; status text; result jsonb;
begin
 if coalesce((select enabled from beagu_private.challenge_referral_settings where name='ingest_enabled'),false)=false
 then raise exception 'ingest disabled'; end if;
 if p_event_hash !~ '^[a-f0-9]{64}$' or p_referral_hash !~ '^[a-f0-9]{64}$'
   or p_respondent_hash !~ '^[a-f0-9]{64}$' or p_respondent_uuid is null
   or p_quality_attested is null or p_quality_signals is null
   or cardinality(p_quality_signals)>4
   or exists(select 1 from unnest(p_quality_signals) s
      where s is null or s not in ('MISSING_REQUIRED_CORE','STRAIGHTLINE_LIKERT',
      'UNREADABLE_ITEM_RESPONSE','REUSED_RESPONDENT_IDENTITY'))
 then raise exception 'invalid quality attestation'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_event_hash),2602);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_respondent_hash),2603);
 select * into old from beagu_private.challenge_referral_events where event_sha256=p_event_hash for update;
 select * into previous from beagu_private.challenge_referral_quality_reviews where event_sha256=p_event_hash for update;
 if previous.quality_status in ('MANUALLY_APPROVED','REJECTED') then
   return jsonb_build_object('credited',false,'decision',
     case when previous.quality_status='MANUALLY_APPROVED' then 'already_reviewed' else 'rejected_quality' end);
 end if;
 issues:=coalesce(p_quality_signals,'{}');
 if not p_quality_attested then issues:=array_append(issues,'QUALITY_ATTESTATION_MISSING'); end if;
 if exists(select 1 from beagu_private.challenge_referral_events e
     where e.campaign='2026' and e.respondent_sha256=p_respondent_hash
       and e.event_sha256<>p_event_hash)
 then issues:=array_append(issues,'REUSED_RESPONDENT_IDENTITY'); end if;
 -- A genuinely suspicious event remains pending even when a subsequent
 -- retry omits flags; the owner must resolve the dispute.
 if previous.quality_status='REVIEW_REQUIRED'
   and previous.signals && array['MISSING_REQUIRED_CORE','STRAIGHTLINE_LIKERT',
     'UNREADABLE_ITEM_RESPONSE','REUSED_RESPONDENT_IDENTITY']::text[]
 then issues:=array_cat(issues,previous.signals); end if;
 select * into p from beagu_private.challenge_referral_profiles
   where campaign='2026' and referral_token_sha256=p_referral_hash for update;
 status:=case when cardinality(issues)=0 then 'AUTO_PASS' else 'REVIEW_REQUIRED' end;
 insert into beagu_private.challenge_referral_quality_reviews(
   event_sha256,respondent_visitor_id,quality_status,signals,checked_at)
 values(p_event_hash,p_respondent_uuid,status,
   array(select distinct x from unnest(issues) x),now())
 on conflict(event_sha256) do update set quality_status=excluded.quality_status,
   signals=excluded.signals,checked_at=now();

 if status='REVIEW_REQUIRED' then
   if not found then null; end if;
   if old.event_sha256 is null then
     insert into beagu_private.challenge_referral_events(
       event_sha256,campaign,referral_token_sha256,respondent_sha256,
       referrer_visitor_id,decision)
     values(p_event_hash,'2026',p_referral_hash,p_respondent_hash,p.visitor_id,
       'pending_quality_review');
   elsif old.decision='credited' then
     update beagu_private.challenge_referral_events set decision='pending_quality_review'
       where event_sha256=p_event_hash;
     -- Multiple legitimate events still count; only demote if nothing remains.
     if old.referrer_visitor_id is not null and not exists(
        select 1 from beagu_private.challenge_referral_events e
         where e.campaign='2026' and e.referrer_visitor_id=old.referrer_visitor_id
           and e.decision='credited')
     then
       update beagu_private.challenge_referral_profiles
         set access_level=1,valid_referrals=0,upgraded_at=null
         where campaign='2026' and visitor_id=old.referrer_visitor_id;
     end if;
   end if;
   if previous.event_sha256 is null or previous.quality_status='AUTO_PASS' then
     insert into beagu_private.challenge_referral_quality_audit(event_sha256,action,reason_codes)
     values(p_event_hash,'QUALITY_FLAGGED',array(select distinct x from unnest(issues) x));
   end if;
   return jsonb_build_object('credited',false,'decision','pending_quality_review');
 end if;

 if old.event_sha256 is not null then
   if old.decision='pending_quality_review'
       and previous.signals <@ array['QUALITY_ATTESTATION_MISSING']::text[] then
      delete from beagu_private.challenge_referral_events where event_sha256=p_event_hash;
      insert into beagu_private.challenge_referral_quality_audit(event_sha256,action,reason_codes)
       values(p_event_hash,'QUALITY_RECOVERED','{}');
   else
      return jsonb_build_object('credited',false,'decision','duplicate_event');
   end if;
 end if;
 -- Validated, lock-protected original anti-self/anti-repeat credit logic.
 result:=public.beagu_referral_credit(
   p_event_hash,p_referral_hash,p_respondent_hash,p_respondent_uuid);
 return result;
end $fn$;
revoke all on function public.beagu_referral_credit_quality_gate(text,text,text,uuid,boolean,text[]) from public,anon,authenticated;
grant execute on function public.beagu_referral_credit_quality_gate(text,text,text,uuid,boolean,text[]) to service_role;

-- Owner-only queue; never expose raw Form submission IDs, answers or secrets.
create or replace function public.beagu_referral_quality_queue()
returns jsonb language sql stable security definer set search_path='' as $fn$
 select jsonb_build_object(
  'total',count(*),
  'items',coalesce((
    select jsonb_agg(to_jsonb(z) order by z.checked_at desc)
    from (select q.event_sha256,q.quality_status,q.signals,q.checked_at,
         (e.referrer_visitor_id is not null) as linked_to_referrer
      from beagu_private.challenge_referral_quality_reviews q
      join beagu_private.challenge_referral_events e on e.event_sha256=q.event_sha256
      where q.quality_status='REVIEW_REQUIRED'
      order by q.checked_at desc limit 40) z
   ),'[]'::jsonb))
 from beagu_private.challenge_referral_quality_reviews
 where quality_status='REVIEW_REQUIRED'
$fn$;
revoke all on function public.beagu_referral_quality_queue() from public,anon,authenticated;
grant execute on function public.beagu_referral_quality_queue() to service_role;

create or replace function public.beagu_referral_quality_resolve(
 p_event_hash text,p_actor uuid,p_session uuid,p_decision text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare q beagu_private.challenge_referral_quality_reviews%rowtype;
 e beagu_private.challenge_referral_events%rowtype;
 p beagu_private.challenge_referral_profiles%rowtype;
begin
 if p_event_hash !~ '^[a-f0-9]{64}$'
   or p_decision not in ('APPROVE','REJECT')
   or length(trim(coalesce(p_reason,''))) not between 12 and 500
   or p_reason ~ '[<>]'
 then raise exception 'invalid review decision'; end if;
 if not exists(select 1 from public.beagu_admin_accounts a
     where a.user_id=p_actor and a.enabled and a.role='owner')
   or not public.beagu_admin_active_mfa_session(p_actor,p_session)
 then raise exception 'owner MFA required'; end if;
 select * into strict q from beagu_private.challenge_referral_quality_reviews
   where event_sha256=p_event_hash for update;
 select * into strict e from beagu_private.challenge_referral_events
   where event_sha256=p_event_hash for update;
 if q.quality_status<>'REVIEW_REQUIRED' or e.decision<>'pending_quality_review'
 then raise exception 'not pending review'; end if;
 if p_decision='APPROVE' then
   select * into strict p from beagu_private.challenge_referral_profiles
     where campaign='2026' and referral_token_sha256=e.referral_token_sha256 for update;
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(e.respondent_sha256),2603);
   if p.disabled or p.access_level<>1 or p.visitor_id=q.respondent_visitor_id
      or exists(select 1 from beagu_private.challenge_referral_events z
       where z.campaign='2026' and z.respondent_sha256=e.respondent_sha256
         and z.event_sha256<>p_event_hash and z.decision='credited')
   then raise exception 'cannot approve duplicate, self or disabled referral'; end if;
   update beagu_private.challenge_referral_events set decision='credited'
     where event_sha256=p_event_hash;
   update beagu_private.challenge_referral_profiles
     set access_level=2,valid_referrals=1,upgraded_at=now()
     where campaign='2026' and visitor_id=p.visitor_id;
 else
   update beagu_private.challenge_referral_events set decision='rejected_quality'
     where event_sha256=p_event_hash;
 end if;
 update beagu_private.challenge_referral_quality_reviews
   set quality_status=case when p_decision='APPROVE' then 'MANUALLY_APPROVED' else 'REJECTED' end,
     reviewer_user_id=p_actor,reviewed_at=now(),notes=trim(p_reason),checked_at=now()
   where event_sha256=p_event_hash;
 insert into beagu_private.challenge_referral_quality_audit(
   event_sha256,action,actor_user_id,reason_codes)
 values(p_event_hash,case when p_decision='APPROVE' then 'OWNER_APPROVED' else 'OWNER_REJECTED' end,
 p_actor,q.signals);
 return jsonb_build_object('ok',true,'decision',p_decision);
end $fn$;
revoke all on function public.beagu_referral_quality_resolve(text,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.beagu_referral_quality_resolve(text,uuid,uuid,text,text) to service_role;
