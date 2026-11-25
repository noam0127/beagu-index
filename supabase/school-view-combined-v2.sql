-- Additive candidate only. Keep legacy totals, daily detail deduplication, and administrator exclusions.
begin;
create table if not exists beagu_private.school_search_view_daily_v2 (
 school_id text not null references public.schools(school_id) on delete restrict,
 visitor_digest text not null,
 view_day date not null,
 action_id uuid not null unique,
 primary key(school_id,visitor_digest,view_day)
);
alter table beagu_private.school_search_view_daily_v2 enable row level security;
revoke all on beagu_private.school_search_view_daily_v2 from public,anon,authenticated;
-- Store only accepted increments (no visitor IDs); ranking and displayed totals use the same transaction.
create table if not exists beagu_private.school_combined_view_activity_v2 (
 school_id text not null references public.schools(school_id) on delete restrict,
 action_id uuid not null,
 view_kind text not null check(view_kind in ('search','detail')),
 counted_at timestamptz not null default now(),
 primary key(action_id,view_kind)
);
create index if not exists school_combined_view_activity_v2_time on beagu_private.school_combined_view_activity_v2(counted_at,school_id);
alter table beagu_private.school_combined_view_activity_v2 enable row level security;
revoke all on beagu_private.school_combined_view_activity_v2 from public,anon,authenticated;
grant select on beagu_private.school_combined_view_activity_v2 to service_role;
-- Same narrow public RPC boundary as the existing record-school-view function.
create or replace function public.beagu_record_school_view_v2(p_school_id text,p_action_id uuid,p_visitor uuid,p_event_type text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_salt text; v_digest text; v_day date; v_claim uuid; v_added boolean:=false; v_total bigint; v_auth_id uuid;
begin
 if p_school_id is null or p_school_id !~ '^[A-Z0-9]{7}$' or p_action_id is null or p_visitor is null or p_event_type is null or p_event_type not in ('search_confirmed','school_selected','detail_viewed') then return null;end if;
 select (e.searched_at at time zone 'Asia/Seoul')::date into v_day
 from public.school_search_events e join public.schools s on s.school_id=e.school_id
 where e.action_id=p_action_id and e.school_id=p_school_id and e.event_type=p_event_type
 and e.searched_at between now()-interval '10 minutes' and now()+interval '1 minute'
 and s.status='운영' and (p_event_type='detail_viewed' or e.source_page in ('search','search-lv1','search-lv2'));
 if v_day is null then return null;end if;
 select salt::text into v_salt from beagu_private.school_search_settings where name='salt';
 if v_salt is null then return null;end if;
 v_digest:=pg_catalog.encode(extensions.digest(p_visitor::text||':'||v_salt||':school-views-v1','sha256'),'hex');
 v_auth_id:=auth.uid();
 if not ((v_auth_id is not null and exists(select 1 from public.beagu_admin_accounts a where a.user_id=v_auth_id and a.enabled is true)) or exists(select 1 from beagu_private.school_view_admin_exclusions a where a.visitor_digest=v_digest)) then
   if p_event_type='detail_viewed' then
     insert into beagu_private.school_view_claims(action_id,school_id,visitor_digest) values(p_action_id,p_school_id,v_digest) on conflict do nothing returning action_id into v_claim;
     if v_claim is not null then
       insert into beagu_private.school_view_daily(school_id,visitor_digest,view_day) values(p_school_id,v_digest,v_day) on conflict do nothing returning true into v_added;
     end if;
   else
     insert into beagu_private.school_search_view_daily_v2(school_id,visitor_digest,view_day,action_id) values(p_school_id,v_digest,v_day,p_action_id) on conflict do nothing returning true into v_added;
   end if;
   if coalesce(v_added,false) then
     insert into beagu_private.school_combined_view_activity_v2(school_id,action_id,view_kind) values(p_school_id,p_action_id,case when p_event_type='detail_viewed' then 'detail' else 'search' end);
     insert into public.beagu_school_view_totals(school_id,views) values(p_school_id,1) on conflict(school_id) do update set views=public.beagu_school_view_totals.views+1,updated_at=now() returning views into v_total;
   end if;
 end if;
 if v_total is null then select views into v_total from public.beagu_school_view_totals where school_id=p_school_id;end if;
 return pg_catalog.jsonb_build_object('school_id',p_school_id,'views',coalesce(v_total,0),'counted',coalesce(v_added,false));
end;
$$;
revoke all on function public.beagu_record_school_view_v2(text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.beagu_record_school_view_v2(text,uuid,uuid,text) to anon,authenticated,service_role;
-- Preserve previous ranking RPC and history. Only post-cutover accepted combined increments enter v2.
create or replace function public.beagu_school_interest_rankings_v2()
returns jsonb language sql stable security invoker set search_path='' as $$
 with counts as (
  select school_id,
   count(*) filter(where counted_at>=now()-interval '72 hours') as current_views,
   count(*) filter(where counted_at<now()-interval '72 hours') as previous_views
  from beagu_private.school_combined_view_activity_v2
  where counted_at>=now()-interval '144 hours' and counted_at<=now()
  group by school_id
 ), rising as (
  select s.school_id,s.school_name,coalesce(s.sido_standard,s.sido) as region,
   c.current_views,c.current_views-c.previous_views as growth
  from counts c join public.schools s on s.school_id=c.school_id
  where s.status='운영' and c.current_views>=1
  order by growth desc,current_views desc,s.school_name,s.school_id limit 10
 )
 select pg_catalog.jsonb_build_object('rising',coalesce((select pg_catalog.jsonb_agg(
  pg_catalog.jsonb_build_object('school_id',school_id,'school_name',school_name,'region',region,'visitors',current_views,'growth',growth)
  order by growth desc,current_views desc,school_name,school_id) from rising),'[]'::jsonb),'window_hours',72);
$$;
revoke all on function public.beagu_school_interest_rankings_v2() from public,anon,authenticated;
grant execute on function public.beagu_school_interest_rankings_v2() to service_role;
commit;
