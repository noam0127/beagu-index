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

-- Admin defaults to the exceptional records; normal aggregate rows remain queryable through 'all'.
CREATE OR REPLACE FUNCTION public.beagu_2026_admin_review_queue(p_filter text DEFAULT 'all'::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if p_filter not in ('all','technical','question','school','prelaunch','approved','held','quality')
    or p_limit<1 or p_limit>40 or p_offset<0 or p_offset>10000 then
   raise exception 'invalid review filters';
 end if;
 select jsonb_build_object(
   'summary', (select jsonb_build_object(
       'total',count(*),
       'technical',count(*) filter(where q.technical_status='TECHNICAL_CHECK_PASSED'),
       'question',count(*) filter(where q.technical_status='NEEDS_QUESTION_CHECK'),
       'school',count(*) filter(where q.technical_status='NEEDS_SCHOOL_CHECK'),
       'prelaunch',count(*) filter(where q.technical_status='PRELAUNCH_EXCLUDED'),
       'approved',count(*) filter(where r.approval_status='APPROVED'),
       'quality_auto',count(*) filter(where quality.quality_status='AUTO_PASS'))
     from public.beagu_2026_results_snapshot r
     left join beagu_private.beagu_2026_quality_reviews quality on quality.school_id=r.school_id and quality.payload_sha256=r.payload_sha256
     left join beagu_private.beagu_2026_auto_review_status q on
       q.school_id=r.school_id and q.survey_year=2026
       and q.source_spreadsheet_id='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4'),
   'items',coalesce((
     select jsonb_agg(to_jsonb(v) order by v.school_id) from (
       select r.school_id,s.school_name,s.sido_standard AS region,
         s.support_office AS office,r.payload_sha256,
         r.school_response_rows AS private_response_rows,
         r.approval_status,r.approved_at,r.updated_at,
         coalesce(q.technical_status,'NOT_CHECKED') AS technical_status,
         coalesce(q.reasons,array['QA_NOT_AVAILABLE']::text[]) AS review_reasons,
         coalesce(quality.quality_status,'NOT_SCANNED') AS quality_status,
         coalesce(quality.reasons,array['QUALITY_SCAN_PENDING']::text[]) AS quality_reasons,
         coalesce(b.review_status,'NOT_REVIEWED') AS basis_review_status,
         b.reviewed_at AS basis_reviewed_at,
         (select a.action from beagu_private.beagu_2026_results_approval_audit a
           where a.school_id=r.school_id order by a.recorded_at desc,a.id desc limit 1)
           as last_decision
       from public.beagu_2026_results_snapshot r
       join public.schools s on s.school_id=r.school_id
       left join beagu_private.beagu_2026_auto_review_status q on
         q.school_id=r.school_id and q.survey_year=2026
         and q.source_spreadsheet_id='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4'
       left join beagu_private.beagu_2026_quality_reviews quality
         on quality.school_id=r.school_id and quality.payload_sha256=r.payload_sha256
       left join beagu_private.beagu_2026_publication_basis_review b
         on b.school_id=r.school_id and b.payload_sha256=r.payload_sha256
       where p_filter='all'
          or (p_filter='technical' and q.technical_status='TECHNICAL_CHECK_PASSED')
          or (p_filter='question' and q.technical_status='NEEDS_QUESTION_CHECK')
          or (p_filter='school' and q.technical_status='NEEDS_SCHOOL_CHECK')
          or (p_filter='prelaunch' and q.technical_status='PRELAUNCH_EXCLUDED')
          or (p_filter='approved' and r.approval_status='APPROVED')
          or (p_filter='held' and r.approval_status='WITHHELD')
          or (p_filter='quality' and coalesce(quality.quality_status,'NOT_SCANNED')<>'AUTO_PASS')
       order by r.school_id
       limit p_limit offset p_offset
     ) v
   ),'[]'::jsonb),
   'notice','PRIVATE_REVIEW_ONLY_NO_CONSENT_OR_RELEASE_AUTHORIZATION')
 into result;
 return result;
end $function$;

