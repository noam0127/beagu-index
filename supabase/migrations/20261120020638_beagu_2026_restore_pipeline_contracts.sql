-- Accept the existing historical participation row and the Edge Function's
-- version that includes newly participating schools.
alter table public.beagu_2026_public_progress
 drop constraint beagu_2026_public_progress_publish_policy_check,
 add constraint beagu_2026_public_progress_publish_policy_check
 check (publish_policy in ('national_submission_count_only_v1','national_cumulative_counts_only_v2'));

-- Require an exact version and an identified operator for manual school release.
create or replace function public.beagu_2026_approve_results(p_school_id text,p_expected_sha256 text,p_actor text,p_evidence jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare r public.beagu_2026_results_snapshot; k text;
begin
 select * into strict r from public.beagu_2026_results_snapshot where school_id=p_school_id for update;
 if r.payload_sha256 is distinct from p_expected_sha256 or coalesce(length(trim(p_actor)),0)<2 then
   raise exception 'approval target mismatch';
 end if;
 if r.school_match_status<>'EXACT_REGION_OFFICE_NAME' or exists(select 1 from jsonb_array_elements(r.questions) q where (q->>'invalid')::integer>0)
 then raise exception 'technical review unresolved'; end if;
 foreach k in array array['source_scoring','school_identity','duplicate_responses','consent','small_sample','reidentification','prior_data_combination'] loop
   if jsonb_typeof(p_evidence->k) is distinct from 'string'
      or coalesce(length(trim(p_evidence->>k)),0)<10 then
     raise exception 'missing review evidence: %',k;
   end if;
 end loop;
 if coalesce(p_evidence->>'decision','')<>'APPROVE_EXACT_SNAPSHOT' then raise exception 'explicit approval required'; end if;
 -- Reapproving the same already approved version does not move its release time.
 if r.approval_status='APPROVED' and r.approved_payload_sha256=r.payload_sha256 then return; end if;
 update public.beagu_2026_results_snapshot set approval_status='APPROVED',approved_by=p_actor,approved_at=now(),
 approval_evidence=p_evidence,approved_payload_sha256=payload_sha256 where school_id=p_school_id;
 insert into beagu_private.beagu_2026_results_approval_audit(school_id,payload_sha256,action,actor,evidence)
 values(p_school_id,r.payload_sha256,'APPROVED',p_actor,p_evidence);
end $$;
revoke all on function public.beagu_2026_approve_results(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.beagu_2026_approve_results(text,text,text,jsonb) to service_role;
