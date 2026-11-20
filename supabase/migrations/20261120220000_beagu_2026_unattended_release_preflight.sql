-- Unattended 2026 publication preflight. Runs after private QA without owner actions.
-- It NEVER makes a nonconsenting or sparse school survey answer public.
create table if not exists beagu_private.beagu_2026_auto_release_preflight (
  school_id text primary key references public.schools(school_id),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  response_rows integer not null check (response_rows >= 0),
  decision text not null check (decision in (
    'HOLD_REJECTED','HOLD_TECHNICAL','HOLD_SMALL_SAMPLE','HOLD_INVALID_QUESTION',
    'HOLD_NOTICE_UNVERIFIED','READY_FOR_AUTO_RELEASE')),
  reasons text[] not null default '{}',
  evaluated_at timestamptz not null default now()
);
alter table beagu_private.beagu_2026_auto_release_preflight enable row level security;
revoke all on beagu_private.beagu_2026_auto_release_preflight from public,anon,authenticated;
grant select,insert,update,delete on beagu_private.beagu_2026_auto_release_preflight to service_role;

create or replace function beagu_private.refresh_2026_auto_release_preflight()
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare r jsonb;
begin
  with checks as (
    select s.school_id,s.payload_sha256,s.school_response_rows,
     q.technical_status,q.matching_core_questions,q.verified_catalog_questions,
     b.review_status,b.payload_sha256 as basis_hash,b.notice_effective_at,b.reviewed_at,
     b.distinct_respondents_reviewed,b.personal_data_reviewed,
     b.small_sample_reviewed,b.reidentification_reviewed,b.prior_data_combination_reviewed,
     exists(select 1 from jsonb_array_elements(s.questions) item
       where coalesce((item->>'invalid')::integer,1)>0) as has_invalid,
     s.school_match_status,s.source_snapshot_at
    from public.beagu_2026_results_snapshot s
    left join beagu_private.beagu_2026_auto_review_status q
      on q.school_id=s.school_id and q.survey_year=2026
       and q.source_spreadsheet_id='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4'
    left join beagu_private.beagu_2026_publication_basis_review b
      on b.school_id=s.school_id
  ), classified as (
    select *,
     case
      when review_status='REJECTED' and basis_hash=payload_sha256 then 'HOLD_REJECTED'
      when school_match_status<>'EXACT_REGION_OFFICE_NAME'
        or coalesce(technical_status,'')<>'TECHNICAL_CHECK_PASSED'
        or coalesce(matching_core_questions,0)<>13 or coalesce(verified_catalog_questions,0)<>13
        then 'HOLD_TECHNICAL'
      when school_response_rows<10 then 'HOLD_SMALL_SAMPLE'
      when has_invalid then 'HOLD_INVALID_QUESTION'
      when review_status is distinct from 'VERIFIED' or basis_hash is distinct from payload_sha256
       or notice_effective_at is null or notice_effective_at>source_snapshot_at
       or reviewed_at is null or reviewed_at<source_snapshot_at
       or not coalesce(distinct_respondents_reviewed,false)
       or not coalesce(personal_data_reviewed,false)
       or not coalesce(small_sample_reviewed,false)
       or not coalesce(reidentification_reviewed,false)
       or not coalesce(prior_data_combination_reviewed,false)
        then 'HOLD_NOTICE_UNVERIFIED'
      else 'READY_FOR_AUTO_RELEASE'
     end as decision,
     array_remove(array[
       case when school_response_rows<10 then 'SCHOOL_RESPONSES_UNDER_TEN' end,
       case when coalesce(technical_status,'')<>'TECHNICAL_CHECK_PASSED' then 'TECHNICAL_CHECK_PENDING' end,
       case when school_match_status<>'EXACT_REGION_OFFICE_NAME' then 'SCHOOL_MATCH_NOT_EXACT' end,
       case when has_invalid then 'QUESTION_VALIDATION_NOT_CLEAN' end,
       case when review_status is distinct from 'VERIFIED'
         or basis_hash is distinct from payload_sha256 then 'PUBLISHING_BASIS_NOT_VERIFIED' end
     ]::text[],null) as reasons
    from checks
  )
  insert into beagu_private.beagu_2026_auto_release_preflight as t
    (school_id,payload_sha256,response_rows,decision,reasons,evaluated_at)
  select school_id,payload_sha256,school_response_rows,decision,reasons,now() from classified
  on conflict(school_id) do update
    set payload_sha256=excluded.payload_sha256,
      response_rows=excluded.response_rows,decision=excluded.decision,
      reasons=excluded.reasons,evaluated_at=now();

  select jsonb_build_object(
    'school_snapshots',count(*),
    'ready',count(*) filter(where decision='READY_FOR_AUTO_RELEASE'),
    'low_sample',count(*) filter(where decision='HOLD_SMALL_SAMPLE'),
    'technical_hold',count(*) filter(where decision='HOLD_TECHNICAL'),
    'consent_hold',count(*) filter(where decision='HOLD_NOTICE_UNVERIFIED'),
    'other_hold',count(*) filter(where decision in ('HOLD_REJECTED','HOLD_INVALID_QUESTION')),
    'checked_at',max(evaluated_at)
  ) into r from beagu_private.beagu_2026_auto_release_preflight;
  return r;
end $fn$;
revoke all on function beagu_private.refresh_2026_auto_release_preflight() from public,anon,authenticated;
grant execute on function beagu_private.refresh_2026_auto_release_preflight() to service_role;

-- Re-evaluate after the 15-minute private technical QA job; no browser sessions.
do $job$
begin
  if not exists (select 1 from cron.job where jobname='beagu-2026-unattended-release-preflight')
  then perform cron.schedule('beagu-2026-unattended-release-preflight',
    '8,23,38,53 * * * *',
    'select beagu_private.refresh_2026_auto_release_preflight()');
  end if;
end $job$;
