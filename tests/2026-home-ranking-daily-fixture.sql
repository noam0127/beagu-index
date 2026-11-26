\set ON_ERROR_STOP on
create role anon; create role authenticated; create role service_role bypassrls;
create schema beagu_private;
grant usage on schema beagu_private to service_role;
create table public.schools(school_id text primary key,school_name text,sido_standard text,sido text,status text);
create table beagu_private.beagu_2026_percentile_v13_current(school_id text,source_version text,percentile_method text,percentile numeric);
create table beagu_private.beagu_2026_percentile_v13_decisions(id bigserial,school_id text,access_level integer,source_version text,percentile_method text,decision text);
grant select on all tables in schema beagu_private to service_role;
grant select on public.schools to service_role;
create function public.beagu_2026_percentile_v13_values(p_ids text[],p_level integer) returns jsonb language sql stable as $$
 select coalesce(jsonb_object_agg(c.school_id,c.percentile),'{}'::jsonb)
 from beagu_private.beagu_2026_percentile_v13_current c join (
  select distinct on(school_id) * from beagu_private.beagu_2026_percentile_v13_decisions
  where access_level=p_level order by school_id,id desc
 ) d using(school_id,source_version,percentile_method)
 where c.school_id=any(p_ids) and cardinality(p_ids)<=20 and d.decision='APPROVE'
$$;
\i supabase/2026-home-ranking-daily-v1.sql
insert into public.schools select lpad(i::text,7,'0'),'fixture '||i,'region','region','운영' from generate_series(1,25) i;
insert into beagu_private.beagu_2026_percentile_v13_current
 select lpad(i::text,7,'0'),'correct-source','verticality-percent-rank',case when i<=2 then 100 else 100-i end from generate_series(1,25) i;
insert into beagu_private.beagu_2026_percentile_v13_current values('0000003','wrong-source','other-direction',97);
insert into beagu_private.beagu_2026_percentile_v13_decisions(school_id,access_level,source_version,percentile_method,decision)
 select lpad(i::text,7,'0'),1,'correct-source','verticality-percent-rank','APPROVE' from generate_series(1,25) i;
insert into beagu_private.beagu_2026_percentile_v13_decisions(school_id,access_level,source_version,percentile_method,decision)
 values('0000003',1,'wrong-source','other-direction','APPROVE'),('0000001',2,'correct-source','verticality-percent-rank','APPROVE');
do $$ begin
 if public.beagu_2026_home_ranking_read_v1(1)->'rows'<>'[]'::jsonb then raise exception 'unconfigured leak'; end if;
end $$;
insert into beagu_private.beagu_2026_home_rank_config_v1 values(true,'correct-source','verticality-percent-rank');
select public.beagu_2026_home_ranking_refresh_v1();
select public.beagu_2026_home_ranking_refresh_v1();
do $$ declare r jsonb; begin
 r:=public.beagu_2026_home_ranking_read_v1(1)->'rows';
 if jsonb_array_length(r)<>20 or (r->0->>'rank')::int<>1 or (r->1->>'rank')::int<>1 or (r->2->>'rank')::int<>3 then raise exception 'ranking/tie/limit'; end if;
 if exists(select 1 from jsonb_array_elements(r) e where e->>'school_id'='0000003') then raise exception 'wrong source leak'; end if;
 if jsonb_array_length(public.beagu_2026_home_ranking_read_v1(2)->'rows')<>1 then raise exception 'tier leak'; end if;
 if public.beagu_2026_home_ranking_read_v1(0)->'rows'<>'[]'::jsonb then raise exception 'lv0 leak'; end if;
 if has_function_privilege('anon','public.beagu_2026_home_ranking_read_v1(integer)','EXECUTE') then raise exception 'anon grant'; end if;
 if has_function_privilege('authenticated','public.beagu_2026_home_ranking_read_v1(integer)','EXECUTE') then raise exception 'auth grant'; end if;
end $$;
set role service_role;
select public.beagu_2026_home_ranking_read_v1(1);
reset role;
insert into beagu_private.beagu_2026_percentile_v13_decisions(school_id,access_level,source_version,percentile_method,decision)
 values('0000001',1,'correct-source','verticality-percent-rank','REVOKE');
do $$ begin
 if public.beagu_2026_home_ranking_read_v1(1)->'rows'<>'[]'::jsonb then raise exception 'revoked snapshot leaked'; end if;
 if jsonb_array_length(public.beagu_2026_home_ranking_read_v1(2)->'rows')<>1 then raise exception 'cross-tier invalidation'; end if;
end $$;
