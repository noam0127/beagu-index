-- 2026 school-result review queue: server/service-only, no public counts or original answers.
-- This change cannot approve a school; consent proof must be reviewed separately.
create or replace function public.beagu_2026_admin_review_queue(
 p_filter text default 'all',p_limit integer default 20,p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_filter not in ('all','technical','question','school','prelaunch','approved','held')
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
       'approved',count(*) filter(where r.approval_status='APPROVED'))
     from public.beagu_2026_results_snapshot r
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
         (select a.action from beagu_private.beagu_2026_results_approval_audit a
           where a.school_id=r.school_id order by a.recorded_at desc,a.id desc limit 1)
           as last_decision
       from public.beagu_2026_results_snapshot r
       join public.schools s on s.school_id=r.school_id
       left join beagu_private.beagu_2026_auto_review_status q on
         q.school_id=r.school_id and q.survey_year=2026
         and q.source_spreadsheet_id='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4'
       where p_filter='all'
          or (p_filter='technical' and q.technical_status='TECHNICAL_CHECK_PASSED')
          or (p_filter='question' and q.technical_status='NEEDS_QUESTION_CHECK')
          or (p_filter='school' and q.technical_status='NEEDS_SCHOOL_CHECK')
          or (p_filter='prelaunch' and q.technical_status='PRELAUNCH_EXCLUDED')
          or (p_filter='approved' and r.approval_status='APPROVED')
          or (p_filter='held' and r.approval_status='WITHHELD')
       order by r.school_id
       limit p_limit offset p_offset
     ) v
   ),'[]'::jsonb),
   'notice','PRIVATE_REVIEW_ONLY_NO_CONSENT_OR_RELEASE_AUTHORIZATION')
 into result;
 return result;
end $$;
revoke all on function public.beagu_2026_admin_review_queue(text,integer,integer) from public,anon,authenticated;
grant execute on function public.beagu_2026_admin_review_queue(text,integer,integer) to service_role;

-- Hold/reject an exact version. A hold revokes an earlier approval immediately.
create or replace function public.beagu_2026_admin_hold_result(
 p_school_id text,p_expected_sha256 text,p_actor uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.beagu_2026_results_snapshot;
begin
 if p_school_id !~ '^[A-Z0-9]{7}$'
    or p_expected_sha256 !~ '^[0-9a-f]{64}$'
    or p_actor is null or length(trim(coalesce(p_reason,'')))<12
    or length(p_reason)>500 or p_reason ~ '[<>]' then
   raise exception 'invalid hold reason or identifier';
 end if;
 select * into strict r from public.beagu_2026_results_snapshot
   where school_id=p_school_id for update;
 if r.payload_sha256 is distinct from p_expected_sha256 then
   raise exception 'snapshot changed; reload before decision';
 end if;
 update public.beagu_2026_results_snapshot set
    approval_status='WITHHELD',approved_by=null,approved_at=null,
    approved_payload_sha256=null,approval_evidence=null
 where school_id=p_school_id;
 insert into beagu_private.beagu_2026_results_approval_audit(
   school_id,payload_sha256,action,actor,evidence)
 values(p_school_id,r.payload_sha256,'WITHHELD',p_actor::text,
   jsonb_build_object('decision','HOLD','reason',trim(p_reason),
                      'privacy_review','not_a_public_release'));
end $$;
revoke all on function public.beagu_2026_admin_hold_result(text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.beagu_2026_admin_hold_result(text,text,uuid,text) to service_role;