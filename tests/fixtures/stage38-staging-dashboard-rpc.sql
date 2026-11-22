-- STAGE38 ISOLATED STAGING ONLY: ycwuugggqbunlbwuzvbx
-- NEVER APPLY to production project snvzwrexuqavnfvzgxqj.
-- Exact original service-role-only dashboard aggregate from versioned migration.
-- Prerequisite: tests/fixtures/stage38-staging-dashboard-tables.sql.
-- Does not copy production records or make real historical statistics.

-- Read-only, service-role-only aggregate for the administrator dashboard.
-- Does not expose respondents, IPs, device identifiers, visitor UUIDs, or raw game sessions.
-- No historical values are synthesized. Null means not currently collected.
create or replace function public.beagu_admin_dashboard_v1(p_period text default '7d')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_start timestamptz;
  v_now timestamptz := now();
  v_visit jsonb;
  v_visit_trend jsonb;
  v_search jsonb;
  v_search_trend jsonb;
  v_top_searched jsonb;
  v_top_detailed jsonb;
  v_top_selected jsonb;
  v_school_views jsonb;
  v_games jsonb;
  v_game_trend jsonb;
  v_game_schools jsonb;
  v_game_difficulty jsonb;
  v_challenge jsonb;
  v_level jsonb;
  v_security jsonb;
begin
  if p_period not in ('today','7d','30d','all') then
    raise exception 'INVALID_PERIOD' using errcode='22023';
  end if;
  v_start := case p_period
    when 'today' then ((v_now at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul')
    when '7d' then v_now - interval '7 days'
    when '30d' then v_now - interval '30 days'
    else '2000-01-01 00:00:00+00'::timestamptz
  end;

  select pg_catalog.jsonb_build_object(
    'page_views', count(*),
    'estimated_unique_visitors', count(distinct visitor_id),
    'pages', coalesce((select jsonb_agg(to_jsonb(q) order by q.page) from
      (select page, count(*)::bigint as views from beagu_private.visits
       where visited_at>=v_start group by page) q), '[]'::jsonb),
    'new_accounts', (select count(*) from auth.users u where u.created_at>=v_start
      and not exists (select 1 from public.beagu_admin_accounts a where a.user_id=u.id)),
    'active_registered_users', null,
    'collection', 'beagu_private.visits'
  ) into v_visit
  from beagu_private.visits where visited_at >= v_start;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.day),'[]'::jsonb) into v_visit_trend
    from (select (visited_at at time zone 'Asia/Seoul')::date as day,
      count(*)::bigint as views,count(distinct visitor_id)::bigint as visitors
      from beagu_private.visits where visited_at>=v_start group by 1 order by 1 desc limit 120) q;

  select pg_catalog.jsonb_build_object(
    'all_events', count(*),
    'searches', count(*) filter(where event_type='search_confirmed'),
    'school_selections', count(*) filter(where event_type='school_selected'),
    'detail_entries', count(*) filter(where event_type='detail_viewed'),
    'conversion_rate', case when count(*) filter(where event_type='search_confirmed')>0 then
      round(100.0 * count(*) filter(where event_type='detail_viewed')
        / nullif(count(*) filter(where event_type='search_confirmed'),0),1)
      else null end,
    'conversion_note', '학교별 이벤트 수의 비율이며 동일 이용자 전환율이 아님'
  ) into v_search from public.school_search_events where searched_at>=v_start;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.day),'[]'::jsonb) into v_search_trend
    from (select (searched_at at time zone 'Asia/Seoul')::date as day,
      count(*) filter(where event_type='search_confirmed')::bigint as searches,
      count(*) filter(where event_type='detail_viewed')::bigint as details
      from public.school_search_events where searched_at>=v_start group by 1 order by 1 desc limit 120) q;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.hits desc,q.school_name),'[]'::jsonb)
    into v_top_searched from (
    select e.school_id, coalesce(max(s.school_name),e.school_id) as school_name,
      count(*)::bigint as hits
    from public.school_search_events e left join public.schools s on s.school_id=e.school_id
    where e.event_type='search_confirmed' and e.searched_at>=v_start
    group by e.school_id order by hits desc limit 40) q;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.hits desc,q.school_name),'[]'::jsonb)
    into v_top_detailed from (
    select e.school_id, coalesce(max(s.school_name),e.school_id) as school_name,
      count(*)::bigint as hits
    from public.school_search_events e left join public.schools s on s.school_id=e.school_id
    where e.event_type='detail_viewed' and e.searched_at>=v_start
    group by e.school_id order by hits desc limit 40) q;


  -- Raw, confirmed school selections are a different metric from validated
  -- one-browser/day view counts. Historical events are never backfilled into views.
  select coalesce(jsonb_agg(to_jsonb(q) order by q.hits desc,q.school_name),'[]'::jsonb)
    into v_top_selected from (
    select e.school_id,coalesce(max(s.school_name),e.school_id) as school_name,
      count(*)::bigint as hits
    from public.school_search_events e left join public.schools s on s.school_id=e.school_id
    where e.event_type='school_selected' and e.searched_at>=v_start
    group by e.school_id order by hits desc limit 40) q;

  select pg_catalog.jsonb_build_object(
    'total', count(*),
    'last_7d', count(*) filter(where d.created_at >= v_now - interval '7 days'),
    'last_30d', count(*) filter(where d.created_at >= v_now - interval '30 days'),
    'unique_school_count', count(distinct d.school_id),
    'daily_deduplication', '한국 날짜 기준 학교·방문자당 1회',
    'top', coalesce((select jsonb_agg(to_jsonb(t) order by t.views desc,t.school_name) from (
      select d2.school_id,coalesce(max(s2.school_name),d2.school_id) as school_name,
        count(*)::bigint as views,
        count(*) filter(where d2.created_at>=v_now-interval '7 days')::bigint as last_7d,
        count(*) filter(where d2.created_at>=v_now-interval '30 days')::bigint as last_30d
      from beagu_private.school_view_daily d2 left join public.schools s2 on s2.school_id=d2.school_id
      where d2.created_at>=v_start
        and not exists (select 1 from beagu_private.school_view_admin_exclusions ex where ex.visitor_digest=d2.visitor_digest)
      group by d2.school_id order by views desc limit 40
    ) t),'[]'::jsonb)
  ) into v_school_views from beagu_private.school_view_daily d
     where d.created_at>=v_start
       and not exists (select 1 from beagu_private.school_view_admin_exclusions ex where ex.visitor_digest=d.visitor_digest);

  select coalesce(jsonb_agg(to_jsonb(q) order by q.game),'[]'::jsonb) into v_games from (
    select case when game in ('volleyball','volleyball_25') then 'volleyball'
       when game in ('teacher_run','teacher_run_retirement') then 'teacher_run'
       else game end as game,
       count(*)::bigint as plays,
       count(*) filter(where submitted_at is not null)::bigint as completed,
       round((avg(extract(epoch from (submitted_at-started_at)))
          filter(where submitted_at is not null and submitted_at>=started_at))::numeric,1) as average_seconds,
       round(100.0*count(*) filter(where submitted_at is not null)/nullif(count(*),0),1) as completion_rate
    from public.arcade_game_sessions
    where started_at>=v_start
    group by 1) q;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.day),'[]'::jsonb) into v_game_trend from (
    select (started_at at time zone 'Asia/Seoul')::date as day,count(*)::bigint as plays,
      count(*) filter(where submitted_at is not null)::bigint completed
    from public.arcade_game_sessions where started_at>=v_start
    group by 1 order by 1 desc limit 120) q;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.plays desc,q.school_name),'[]'::jsonb) into v_game_schools from (
    select school_id,coalesce(max(school_name),school_id,'학교 미등록') school_name,count(*)::bigint plays
    from public.arcade_game_sessions where started_at>=v_start
    group by school_id order by plays desc limit 40) q;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.plays desc),'[]'::jsonb) into v_game_difficulty from (
    select coalesce(difficulty,'기록 없음') as difficulty,count(*)::bigint plays
    from public.arcade_game_sessions where started_at>=v_start group by 1) q;

  select pg_catalog.jsonb_build_object(
    'participants', (select count(*) from beagu_private.participants where joined_at>=v_start),
    'referral_links_issued', (select count(*) from beagu_private.challenge_referral_profiles where issued_at>=v_start),
    'level_2_upgrades', (select count(*) from beagu_private.challenge_referral_profiles
      where upgraded_at is not null and upgraded_at>=v_start),
    'referral_events', (select count(*) from beagu_private.challenge_referral_events where created_at>=v_start),
    'referral_decisions',coalesce((select jsonb_agg(to_jsonb(q) order by q.decision) from (
      select decision,count(*)::bigint events from beagu_private.challenge_referral_events
      where created_at>=v_start group by decision) q),'[]'::jsonb)
  ) into v_challenge;

  select pg_catalog.jsonb_build_object(
    'level_0', null,
    'level_1_sessions', (select count(*) from public.beagu_level_sessions
      where access_level=1 and expires_at>v_now),
    'level_2_sessions',(select count(*) from public.beagu_level_sessions
      where access_level=2 and expires_at>v_now),
    'note','Lv.1/2는 계정 수가 아닌 만료되지 않은 발급 세션 수이며 Lv.0은 별도로 집계하지 않음'
  ) into v_level;

  select pg_catalog.jsonb_build_object(
    'admin_logins',(select count(*) from public.beagu_admin_audit_events
      where event_type='admin_login' and outcome='success' and occurred_at>=v_start),
    'access_denials',(select count(*) from public.beagu_admin_audit_events
      where outcome='denied' and occurred_at>=v_start),
    'recent',coalesce((select jsonb_agg(to_jsonb(q) order by q.occurred_at desc) from (
      select occurred_at,event_type,outcome from public.beagu_admin_audit_events
      where occurred_at>=v_start order by occurred_at desc limit 30
    ) q),'[]'::jsonb),
    'source','beagu_admin_audit_events',
    'auth_failures',null,
    'collector_errors',null
  ) into v_security;

  return pg_catalog.jsonb_build_object(
    'period',p_period,'as_of',v_now,'timezone','Asia/Seoul',
    'site',v_visit,'visit_trend',v_visit_trend,
    'search',v_search,'search_trend',v_search_trend,
    'top_searched',v_top_searched,'top_detailed',v_top_detailed,'top_selected',v_top_selected,'school_views',v_school_views,
    'games',v_games,'game_trend',v_game_trend,'game_schools',v_game_schools,
    'game_difficulty',v_game_difficulty,
    'challenge',v_challenge,'levels',v_level,'security',v_security,
    'visual_novel',jsonb_build_object('plays',null,'completion_rate',null,'note','영구 플레이 통계 미수집')
  );
end
$function$;
revoke all on function public.beagu_admin_dashboard_v1(text) from public, anon, authenticated;
grant execute on function public.beagu_admin_dashboard_v1(text) to service_role;
comment on function public.beagu_admin_dashboard_v1(text) is 'Private admin dashboard aggregate. Service role only; entry point must verify MFA/administrator allowlist.';