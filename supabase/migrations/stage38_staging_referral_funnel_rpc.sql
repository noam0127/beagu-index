-- STAGE38: isolated staging project ycwuugggqbunlbwuzvbx ONLY.
-- NEVER RUN ON production project snvzwrexuqavnfvzgxqj.
-- Metadata-only reconstruction of historical challenge_referral_events table from
-- production information_schema, indexes, constraints (no rows/data copied).
-- All funnel DDL, recording and aggregate RPC are verbatim from
-- 20261121093000_referral_funnel_private_v1.sql below.
-- Do not enable public PostgREST read or grant EXECUTE to browsers.

CREATE TABLE IF NOT EXISTS beagu_private.challenge_referral_events (
  event_sha256 text PRIMARY KEY CHECK (event_sha256 ~ '^[0-9a-f]{64}$'),
  campaign text NOT NULL DEFAULT '2026',
  referral_token_sha256 text NOT NULL CHECK (referral_token_sha256 ~ '^[0-9a-f]{64}$'),
  respondent_sha256 text NOT NULL CHECK (respondent_sha256 ~ '^[0-9a-f]{64}$'),
  referrer_visitor_id uuid,
  decision text NOT NULL CHECK (decision IN (
    'credited','invalid_link','same_device','duplicate_respondent',
    'already_upgraded','pending_quality_review','rejected_quality'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT challenge_referral_events_campaign_referrer_visitor_id_fkey
    FOREIGN KEY (campaign, referrer_visitor_id)
    REFERENCES beagu_private.challenge_referral_profiles(campaign, visitor_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS challenge_referral_one_respondent_credit
  ON beagu_private.challenge_referral_events(campaign,respondent_sha256)
  WHERE decision='credited';
CREATE INDEX IF NOT EXISTS challenge_referral_events_owner_idx
  ON beagu_private.challenge_referral_events(campaign,referrer_visitor_id,created_at DESC);
ALTER TABLE beagu_private.challenge_referral_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beagu_private.challenge_referral_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON beagu_private.challenge_referral_events TO service_role;

create table if not exists beagu_private.challenge_referral_funnel_events (
  campaign text not null default '2026' check (campaign = '2026'),
  referral_token_sha256 text not null check (referral_token_sha256 ~ '^[0-9a-f]{64}$'),
  browser_sha256 text not null check (browser_sha256 ~ '^[0-9a-f]{64}$'),
  stage text not null check (stage in ('open','proof','handoff')),
  day_kst date not null default ((now() at time zone 'Asia/Seoul')::date),
  recorded_at timestamptz not null default now(),
  primary key (campaign, referral_token_sha256, browser_sha256, stage, day_kst)
);
create index if not exists referral_funnel_events_recent_v1
  on beagu_private.challenge_referral_funnel_events (recorded_at, referral_token_sha256, stage);
alter table beagu_private.challenge_referral_funnel_events enable row level security;
revoke all on beagu_private.challenge_referral_funnel_events from public, anon, authenticated;
grant select, insert, delete on beagu_private.challenge_referral_funnel_events to service_role;

create or replace function public.beagu_referral_funnel_record_v1(
  p_referral_hash text, p_browser_hash text, p_stage text
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_referral_hash is null or p_referral_hash !~ '^[0-9a-f]{64}$'
     or p_browser_hash is null or p_browser_hash !~ '^[0-9a-f]{64}$'
     or p_stage not in ('open','proof','handoff') then return false; end if;
  if not exists(
    select 1 from beagu_private.challenge_referral_profiles p
    where p.campaign='2026' and p.referral_token_sha256=p_referral_hash
      and p.disabled=false
  ) then return false; end if;
  insert into beagu_private.challenge_referral_funnel_events(
    campaign,referral_token_sha256,browser_sha256,stage
  ) values('2026',p_referral_hash,p_browser_hash,p_stage)
  on conflict do nothing;
  -- Data minimization: purge old pseudonyms opportunistically.
  delete from beagu_private.challenge_referral_funnel_events
    where recorded_at < now() - interval '31 days';
  return true;
end $$;
revoke all on function public.beagu_referral_funnel_record_v1(text,text,text) from public,anon,authenticated;
grant execute on function public.beagu_referral_funnel_record_v1(text,text,text) to service_role;

create or replace function public.beagu_admin_referral_funnel_v1(p_period text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare since_time timestamptz;
begin
  if p_period not in ('today','7d','30d','all') or p_period is null then
    raise exception 'invalid period' using errcode='22023';
  end if;
  -- Browser pseudonyms are held no longer than 31 days. "all" is capped to 30d.
  since_time := case p_period
    when 'today' then (date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
    when '7d' then now()-interval '7 days'
    else now()-interval '30 days'
  end;
  return (
    with recent_events as (
      select referral_token_sha256,
        count(*) filter (where stage='open') as opened,
        count(*) filter (where stage='proof') as proof_issued,
        count(*) filter (where stage='handoff') as handoffs,
        max(recorded_at) as latest_activity
      from beagu_private.challenge_referral_funnel_events
      where recorded_at >= since_time
      group by referral_token_sha256
    ),
    completed as (
      select referrer_visitor_id,
        count(*) filter (where decision='credited') as credited,
        count(*) as form_events
      from beagu_private.challenge_referral_events
      where created_at >= since_time
      group by referrer_visitor_id
    ),
    rows as (
      select p.short_code as code,
        coalesce(e.opened,0) as opened,
        coalesce(e.proof_issued,0) as proof_issued,
        coalesce(e.handoffs,0) as handoffs,
        coalesce(c.credited,0) as credited,
        coalesce(c.form_events,0) as form_events,
        p.valid_referrals as lifetime_valid,
        p.access_level as level,
        e.latest_activity
      from beagu_private.challenge_referral_profiles p
      left join recent_events e on e.referral_token_sha256=p.referral_token_sha256
      left join completed c on c.referrer_visitor_id=p.visitor_id
      where p.campaign='2026' and p.short_code is not null
      order by coalesce(e.opened,0) desc, coalesce(e.proof_issued,0) desc, p.issued_at desc
      limit 200
    )
    select jsonb_build_object(
      'as_of',now(),'period',p_period,'tracking_since','2026-11-21',
      'max_tracking_days',30,
      'rows',coalesce(jsonb_agg(to_jsonb(r) order by r.opened desc,r.proof_issued desc,r.code), '[]'::jsonb))
    from rows r
  );
end $$;
revoke all on function public.beagu_admin_referral_funnel_v1(text) from public,anon,authenticated;
grant execute on function public.beagu_admin_referral_funnel_v1(text) to service_role;
