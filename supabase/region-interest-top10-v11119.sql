-- Candidate only: preserve existing top5 and private event data.
begin;
create or replace function public.beagu_region_interest_top10_v1()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('region',r.region,'office',r.office) order by r.selections desc,r.region,r.office),'[]'::jsonb)
 from (
  select e.region,e.office,count(*) as selections
  from beagu_private.region_search_interest_v1 e
  where e.counted_at>=now()-interval '72 hours' and exists(select 1 from public.beagu_lv1_office_directory d where d.sido_standard=e.region and d.support_office=e.office)
  group by e.region,e.office order by selections desc,e.region,e.office limit 10
 ) r;
$$;
revoke all on function public.beagu_region_interest_top10_v1() from public,anon,authenticated;
grant execute on function public.beagu_region_interest_top10_v1() to anon,authenticated,service_role;
commit;
