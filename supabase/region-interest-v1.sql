-- Additive regional search interest, independent of survey results and school rankings.
begin;
create table if not exists beagu_private.region_search_interest_v1(
 region text not null,
 office text not null,
 visitor_digest text not null,
 hour_bucket timestamptz not null,
 counted_at timestamptz not null default now(),
 primary key(visitor_digest,hour_bucket,region,office)
);
create index if not exists region_search_interest_v1_counted_idx on beagu_private.region_search_interest_v1(counted_at);
alter table beagu_private.region_search_interest_v1 enable row level security;
revoke all on beagu_private.region_search_interest_v1 from public,anon,authenticated;
create or replace function public.beagu_record_region_interest_v1(p_region text,p_office text,p_visitor uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_salt text; v_digest text; v_hour timestamptz:=date_trunc('hour',now()); v_auth uuid; v_inserted boolean;
begin
 if p_region is null or p_office is null or p_visitor is null or length(p_region) not between 1 and 24 or length(p_office) not between 1 and 120 then return false;end if;
 if not exists(select 1 from public.beagu_lv1_office_directory d where d.sido_standard=p_region and d.support_office=p_office) then return false;end if;
 select salt::text into v_salt from beagu_private.school_search_settings where name='salt';
 if v_salt is null then return false;end if;
 v_auth:=auth.uid();
 if v_auth is not null and exists(select 1 from public.beagu_admin_accounts a where a.user_id=v_auth and a.enabled is true) then return false;end if;
 if exists(select 1 from beagu_private.school_view_admin_exclusions a where a.visitor_digest=pg_catalog.encode(extensions.digest(p_visitor::text||':'||v_salt||':school-views-v1','sha256'),'hex')) then return false;end if;
 v_digest:=pg_catalog.encode(extensions.digest(p_visitor::text||':'||v_salt||':region-interest-v1','sha256'),'hex');
 perform pg_advisory_xact_lock(pg_catalog.hashtextextended(v_digest||':'||v_hour::text,0));
 if (select count(*) from beagu_private.region_search_interest_v1 where visitor_digest=v_digest and hour_bucket=v_hour)>=20 then return false;end if;
 insert into beagu_private.region_search_interest_v1(region,office,visitor_digest,hour_bucket) values(p_region,p_office,v_digest,v_hour) on conflict do nothing returning true into v_inserted;
 -- Expired events are never needed for a 72h ranking. No scheduled jobs.
 if coalesce(v_inserted,false) then delete from beagu_private.region_search_interest_v1 where counted_at<now()-interval '7 days';end if;
 return coalesce(v_inserted,false);
end;$$;
create or replace function public.beagu_region_interest_top5_v1()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('region',r.region,'office',r.office) order by r.selections desc,r.region,r.office),'[]'::jsonb)
 from (
  select e.region,e.office,count(*) as selections
  from beagu_private.region_search_interest_v1 e
  where e.counted_at>=now()-interval '72 hours' and exists(select 1 from public.beagu_lv1_office_directory d where d.sido_standard=e.region and d.support_office=e.office)
  group by e.region,e.office order by selections desc,e.region,e.office limit 5
 ) r;
$$;
revoke all on function public.beagu_record_region_interest_v1(text,text,uuid),public.beagu_region_interest_top5_v1() from public,anon,authenticated;
grant execute on function public.beagu_record_region_interest_v1(text,text,uuid),public.beagu_region_interest_top5_v1() to anon,authenticated,service_role;
commit;
