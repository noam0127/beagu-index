-- 2026 publication-basis evidence intake: PENDING/REJECTED ONLY.
-- Never promotes to VERIFIED or approves a school. Existing publication gate unchanged.
create table if not exists beagu_private.beagu_2026_basis_review_events (
 id bigint generated always as identity primary key,
 school_id text not null references public.schools(school_id),
 payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
 action text not null check (action in ('PENDING','REJECTED')),
 actor_user_id uuid not null references auth.users(id),
 notice_source_ref text,
 notice_digest_sha256 text,
 recorded_at timestamptz not null default now(),
 notes text not null,
 constraint basis_review_event_notes_safe check(length(notes) between 12 and 500)
);
alter table beagu_private.beagu_2026_basis_review_events enable row level security;
revoke all on beagu_private.beagu_2026_basis_review_events from public,anon,authenticated;
grant select,insert on beagu_private.beagu_2026_basis_review_events to service_role;

create or replace function public.beagu_2026_admin_record_basis_review(
 p_school_id text,
 p_expected_sha256 text,
 p_actor uuid,
 p_session uuid,
 p_decision text,
 p_basis_type text,
 p_notice_ref text,
 p_notice_digest text,
 p_notice_effective_at timestamptz,
 p_scope text,
 p_notes text,
 p_distinct_respondents_reviewed boolean default false,
 p_personal_data_reviewed boolean default false,
 p_small_sample_reviewed boolean default false,
 p_reidentification_reviewed boolean default false,
 p_prior_data_combination_reviewed boolean default false
)
returns void
language plpgsql security definer set search_path='' as $fn$
declare r public.beagu_2026_results_snapshot;
begin
 if p_school_id !~ '^[A-Z0-9]{7}$'
   or p_expected_sha256 !~ '^[a-f0-9]{64}$'
   or p_actor is null or p_session is null
   or p_decision not in ('PENDING','REJECTED')
   or p_basis_type not in ('EXPLICIT_RESPONDENT_CONSENT','OTHER_DOCUMENTED_LEGAL_BASIS')
     and p_basis_type is not null
   or length(coalesce(p_notice_ref,''))>400
   or length(coalesce(p_scope,''))>500
   or length(trim(coalesce(p_notes,''))) not between 12 and 500
   or coalesce(p_notes,'') ~ '[<>]'
   or (p_notice_digest is not null and p_notice_digest !~ '^[a-f0-9]{64}$')
   or (p_notice_ref is not null and p_notice_ref ~ '[<>\r\n]')
   or (p_scope is not null and p_scope ~ '[<>\r\n]')
 then raise exception 'invalid evidence draft'; end if;

 if not exists (select 1 from public.beagu_admin_accounts a
   where a.user_id=p_actor and a.role='owner' and a.enabled)
   or not public.beagu_admin_active_mfa_session(p_actor,p_session)
 then raise exception 'verified owner MFA required'; end if;

 select * into strict r from public.beagu_2026_results_snapshot
   where school_id=p_school_id for update;
 if r.payload_sha256 is distinct from p_expected_sha256
 then raise exception 'review target changed; reload'; end if;

 -- Explicit refusal or unresolved review MUST revoke any prior verified basis
 -- for the exact school and therefore immediately fail the release RPC.
 insert into beagu_private.beagu_2026_publication_basis_review(
   school_id,payload_sha256,review_status,basis_type,notice_source_ref,
   notice_digest_sha256,notice_effective_at,publication_scope,
   reviewer_user_id,distinct_respondents_reviewed,personal_data_reviewed,
   small_sample_reviewed,reidentification_reviewed,prior_data_combination_reviewed,
   reviewed_at,notes,updated_at
 ) values(
   p_school_id,p_expected_sha256,p_decision,p_basis_type,
   nullif(trim(p_notice_ref),''),p_notice_digest,p_notice_effective_at,
   nullif(trim(p_scope),''),p_actor,
   p_distinct_respondents_reviewed,p_personal_data_reviewed,
   p_small_sample_reviewed,p_reidentification_reviewed,p_prior_data_combination_reviewed,
   now(),trim(p_notes),now()
 ) on conflict(school_id) do update set
   payload_sha256=excluded.payload_sha256,
   review_status=excluded.review_status,
   basis_type=excluded.basis_type,
   notice_source_ref=excluded.notice_source_ref,
   notice_digest_sha256=excluded.notice_digest_sha256,
   notice_effective_at=excluded.notice_effective_at,
   publication_scope=excluded.publication_scope,
   reviewer_user_id=excluded.reviewer_user_id,
   distinct_respondents_reviewed=excluded.distinct_respondents_reviewed,
   personal_data_reviewed=excluded.personal_data_reviewed,
   small_sample_reviewed=excluded.small_sample_reviewed,
   reidentification_reviewed=excluded.reidentification_reviewed,
   prior_data_combination_reviewed=excluded.prior_data_combination_reviewed,
   reviewed_at=excluded.reviewed_at,
   notes=excluded.notes,updated_at=now();

 insert into beagu_private.beagu_2026_basis_review_events(
   school_id,payload_sha256,action,actor_user_id,notice_source_ref,notice_digest_sha256,notes)
 values(p_school_id,p_expected_sha256,p_decision,p_actor,
   nullif(trim(p_notice_ref),''),p_notice_digest,trim(p_notes));

 -- A rejected or pending basis immediately revokes any previous public approval.
 update public.beagu_2026_results_snapshot set
   approval_status='WITHHELD',approved_by=null,approved_at=null,
   approved_payload_sha256=null,approval_evidence=null
 where school_id=p_school_id and approval_status='APPROVED';

end $fn$;
revoke all on function public.beagu_2026_admin_record_basis_review(
 text,text,uuid,uuid,text,text,text,text,timestamptz,text,text,boolean,boolean,boolean,boolean,boolean)
 from public,anon,authenticated;
grant execute on function public.beagu_2026_admin_record_basis_review(
 text,text,uuid,uuid,text,text,text,text,timestamptz,text,text,boolean,boolean,boolean,boolean,boolean)
 to service_role;
