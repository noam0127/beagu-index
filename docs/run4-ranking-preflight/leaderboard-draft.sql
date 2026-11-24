-- Review-only, after edge-store-draft.sql. No deployment or production migration.
begin;
create function public.run4_candidate_list(p_tier text,p_outcome text)
returns jsonb language sql security invoker set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(to_jsonb(r) order by r.score desc,r.submitted_at asc),'[]'::jsonb) from (
 select score,difficulty,survival_seconds,victory,boss_count,submitted_at
 from public.arcade_run4_verified_candidate
 where p_tier in ('all','easy','normal','hard','very_hard','extreme')
 and p_outcome in ('all','retired','all_bosses')
 and (p_tier='all' or difficulty=p_tier)
 and (p_outcome='all' or (p_outcome='retired' and victory) or (p_outcome='all_bosses' and boss_count=5))
 order by score desc,submitted_at asc limit 10
 ) r
$$;
revoke all on function public.run4_candidate_list(text,text) from public,anon,authenticated,service_role;
grant execute on function public.run4_candidate_list(text,text) to service_role;
commit;
