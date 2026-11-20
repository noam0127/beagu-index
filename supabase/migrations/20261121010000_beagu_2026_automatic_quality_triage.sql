-- 2026 automatic aggregate quality triage. This is NOT public-release authorization.
-- Observable signals only: school match, catalog shape, mandatory question parsing.
create table if not exists beagu_private.beagu_2026_quality_reviews (
 school_id text primary key references public.schools(school_id) on delete cascade,
 payload_sha256 text not null check(payload_sha256 ~ '^[a-f0-9]{64}$'),
 quality_status text not null check(quality_status in ('AUTO_PASS','REVIEW_REQUIRED')),
 reasons text[] not null default '{}',
 evidence_scope text not null default 'AGGREGATE_ONLY' check(evidence_scope='AGGREGATE_ONLY'),
 checked_at timestamptz not null default now()
);
alter table beagu_private.beagu_2026_quality_reviews enable row level security;
revoke all on beagu_private.beagu_2026_quality_reviews from public,anon,authenticated;
grant select,insert,update,delete on beagu_private.beagu_2026_quality_reviews to service_role;

create or replace function beagu_private.refresh_2026_quality_reviews()
returns integer language plpgsql set search_path='' as $fn$
declare n integer;
begin
 with inspect as (
   select r.school_id,r.payload_sha256,r.school_response_rows,r.school_match_status,
     count(*) filter(where j.q->>'id' ~ '^Q(0[1-9]|1[0-3])$'
       and coalesce((j.q->>'row')::integer,-999)=-1) core_count,
     count(*) filter(where j.q->>'id' ~ '^Q(0[1-9]|1[0-3])$'
       and coalesce((j.q->>'row')::integer,-999)=-1
       and coalesce((j.q->>'valid')::integer,-1)+coalesce((j.q->>'invalid')::integer,-1)=r.school_response_rows)
       core_complete,
     count(*) filter(where j.q->>'id' ~ '^Q(0[1-9]|1[0-3])$'
       and coalesce((j.q->>'row')::integer,-999)=-1
       and coalesce((j.q->>'invalid')::integer,0)>0) core_invalid
   from public.beagu_2026_results_snapshot r
   cross join lateral jsonb_array_elements(r.questions) j(q)
   group by r.school_id,r.payload_sha256,r.school_response_rows,r.school_match_status
 ), decisions as (
   select school_id,payload_sha256,
     array_remove(array[
       case when school_match_status<>'EXACT_REGION_OFFICE_NAME' then 'SCHOOL_MATCH_UNRESOLVED' end,
       case when core_count<>13 or core_complete<>13 then 'MANDATORY_QUESTION_COVERAGE' end,
       case when core_invalid>0 then 'UNRECOGNIZED_MANDATORY_ANSWER' end
     ]::text[],null) reasons
   from inspect
 ), upserted as (
   insert into beagu_private.beagu_2026_quality_reviews as old(
      school_id,payload_sha256,quality_status,reasons,checked_at)
   select school_id,payload_sha256,
      case when cardinality(reasons)=0 then 'AUTO_PASS' else 'REVIEW_REQUIRED' end,
      reasons,now() from decisions
   on conflict(school_id) do update set
     payload_sha256=excluded.payload_sha256,quality_status=excluded.quality_status,
     reasons=excluded.reasons,checked_at=now()
   where (old.payload_sha256,old.quality_status,old.reasons) is distinct from
     (excluded.payload_sha256,excluded.quality_status,excluded.reasons)
   returning 1
 )
 select count(*) into n from upserted;
 delete from beagu_private.beagu_2026_quality_reviews q
 where not exists(select 1 from public.beagu_2026_results_snapshot r where r.school_id=q.school_id);
 return n;
end $fn$;
revoke all on function beagu_private.refresh_2026_quality_reviews() from public,anon,authenticated;
grant execute on function beagu_private.refresh_2026_quality_reviews() to service_role;
-- Cron executes as the privileged database job owner; no browser privileges.
select cron.schedule('beagu-2026-auto-quality-triage','*/5 * * * *',
 'select beagu_private.refresh_2026_quality_reviews();');
