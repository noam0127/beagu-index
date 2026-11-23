-- QA ONLY, staging project ycwuugggqbunlbwuzvbx.
-- Copied only function definitions from prod; NOT prod response data or users.
-- READ-ONLY queue/count RPCs remain service_role-only and unreachable from
-- locked Edge endpoint until independent owner AAL2 and audit review.
-- Reference to operating source spreadsheet replaced by harmless QA string.
CREATE OR REPLACE FUNCTION public.beagu_2026_admin_pipeline_status()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object(
  'year',2026,
  'response_trust',jsonb_build_object(
   'scope','REFERRAL_ONLY',
   'general_individual_check','NOT_CONNECTED',
   'referral_events',(select count(*) from beagu_private.challenge_referral_events e
       where e.campaign='2026'),
   'referral_review_required',(select count(*)
       from beagu_private.challenge_referral_quality_reviews q
       where q.quality_status='REVIEW_REQUIRED'),
   'referral_auto_pass',(select count(*)
       from beagu_private.challenge_referral_quality_reviews q
       where q.quality_status='AUTO_PASS')
  ),
  'aggregation_accuracy',jsonb_build_object(
   'total',(select count(*) from public.beagu_2026_results_snapshot),
   'basic_auto_pass',(select count(*) from public.beagu_2026_results_snapshot r
      join beagu_private.beagu_2026_quality_reviews q
       on q.school_id=r.school_id and q.payload_sha256=r.payload_sha256
       and q.quality_status='AUTO_PASS'),
   'basic_review_required',(select count(*) from public.beagu_2026_results_snapshot r
      left join beagu_private.beagu_2026_quality_reviews q
       on q.school_id=r.school_id and q.payload_sha256=r.payload_sha256
       where coalesce(q.quality_status,'NOT_SCANNED')<>'AUTO_PASS'),
   'full_technical_pass',(select count(*) from public.beagu_2026_results_snapshot r
      join beagu_private.beagu_2026_auto_review_status t
       on t.school_id=r.school_id and t.survey_year=2026
       and t.source_spreadsheet_id='STAGING_QA_SOURCE_2026'
       and t.technical_status='TECHNICAL_CHECK_PASSED'
       and t.checked_at>=r.source_snapshot_at),
   'snapshot_at',(select max(source_snapshot_at)
      from public.beagu_2026_results_snapshot),
   'basic_checked_at',(select max(checked_at)
      from beagu_private.beagu_2026_quality_reviews)
  ),
  'publication_eligibility',jsonb_build_object(
   'basis_verified',(select count(*) from public.beagu_2026_results_snapshot r
      join beagu_private.beagu_2026_publication_basis_review b
       on b.school_id=r.school_id and b.payload_sha256=r.payload_sha256
       and b.review_status='VERIFIED'),
   'approved',(select count(*) from public.beagu_2026_results_snapshot r
      where r.approval_status='APPROVED'
        and r.approved_payload_sha256=r.payload_sha256),
   'single_response_schools',(select count(*)
      from public.beagu_2026_results_snapshot where school_response_rows=1),
   'single_technical_pass',(select count(*)
      from public.beagu_2026_results_snapshot r
      join beagu_private.beagu_2026_auto_review_status t
        on t.school_id=r.school_id and t.survey_year=2026
        and t.source_spreadsheet_id='STAGING_QA_SOURCE_2026'
      where r.school_response_rows=1
        and t.technical_status='TECHNICAL_CHECK_PASSED'
        and t.checked_at>=r.source_snapshot_at),
   'single_technical_review_needed',(select count(*)
      from public.beagu_2026_results_snapshot r
      left join beagu_private.beagu_2026_auto_review_status t
        on t.school_id=r.school_id and t.survey_year=2026
        and t.source_spreadsheet_id='STAGING_QA_SOURCE_2026'
      where r.school_response_rows=1 and
         (t.technical_status IS DISTINCT FROM 'TECHNICAL_CHECK_PASSED'
          or t.checked_at<r.source_snapshot_at)),
   'single_verified_basis',(select count(*)
      from public.beagu_2026_results_snapshot r
      join beagu_private.beagu_2026_publication_basis_review b
        on b.school_id=r.school_id
       and b.payload_sha256=r.payload_sha256
       and b.review_status='VERIFIED'
      where r.school_response_rows=1),
   'one_response_review_policy','ONE_OR_MORE_NO_AUTOMATIC_N5_REJECTION',
   'single_school_release_rule','VERIFIED_BASIS_AND_SNAPSHOT_APPROVAL_REQUIRED',
   'under_five_schools',(select count(*)
      from public.beagu_2026_results_snapshot where school_response_rows<5),
   'scope','SNAPSHOT_BOUND_PRIVATE_REVIEW'
  ),
  'note','AUTO_PASS_IS_AGGREGATE_INTEGRITY_NOT_INDIVIDUAL_TRUST_OR_RELEASE_AUTHORIZATION'
 )
$function$;

CREATE OR REPLACE FUNCTION public.beagu_2026_admin_record_basis_review(p_school_id text, p_expected_sha256 text, p_actor uuid, p_session uuid, p_decision text, p_basis_type text, p_notice_ref text, p_notice_digest text, p_notice_effective_at timestamp with time zone, p_scope text, p_notes text, p_distinct_respondents_reviewed boolean DEFAULT false, p_personal_data_reviewed boolean DEFAULT false, p_small_sample_reviewed boolean DEFAULT false, p_reidentification_reviewed boolean DEFAULT false, p_prior_data_combination_reviewed boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

end $function$;

CREATE OR REPLACE FUNCTION public.beagu_2026_admin_review_queue(p_filter text DEFAULT 'all'::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if p_filter not in ('all','technical','question','school','prelaunch','approved','held','quality','single','single_technical','awaiting_basis')
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
       'quality_auto',count(*) filter(where quality.quality_status='AUTO_PASS'),
       'single',count(*) filter(where r.school_response_rows=1),
       'single_technical',count(*) filter(where r.school_response_rows=1 AND q.technical_status='TECHNICAL_CHECK_PASSED'))
     from public.beagu_2026_results_snapshot r
     left join beagu_private.beagu_2026_quality_reviews quality on quality.school_id=r.school_id and quality.payload_sha256=r.payload_sha256
     left join beagu_private.beagu_2026_auto_review_status q on
       q.school_id=r.school_id and q.survey_year=2026
       and q.source_spreadsheet_id='STAGING_QA_SOURCE_2026'),
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
         and q.source_spreadsheet_id='STAGING_QA_SOURCE_2026'
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
          or (p_filter='single' and r.school_response_rows=1)
          or (p_filter='single_technical' and r.school_response_rows=1
              and q.technical_status='TECHNICAL_CHECK_PASSED')
          or (p_filter='awaiting_basis' and r.school_response_rows>=1
              and q.technical_status='TECHNICAL_CHECK_PASSED'
              and not exists (
                 select 1 from beagu_private.beagu_2026_publication_basis_review verified
                 where verified.school_id=r.school_id
                   and verified.payload_sha256=r.payload_sha256
                   and verified.review_status='VERIFIED'))
       order by r.school_id
       limit p_limit offset p_offset
     ) v
   ),'[]'::jsonb),
   'notice','PRIVATE_REVIEW_ONLY_NO_CONSENT_OR_RELEASE_AUTHORIZATION')
 into result;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.beagu_referral_quality_queue()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object(
  'total',count(*),
  'items',coalesce((
    select jsonb_agg(to_jsonb(z) order by z.checked_at desc)
    from (select q.event_sha256,q.quality_status,q.signals,q.checked_at,
         (e.referrer_visitor_id is not null) as linked_to_referrer
      from beagu_private.challenge_referral_quality_reviews q
      join beagu_private.challenge_referral_events e on e.event_sha256=q.event_sha256
      where q.quality_status='REVIEW_REQUIRED'
      order by q.checked_at desc limit 40) z
   ),'[]'::jsonb))
 from beagu_private.challenge_referral_quality_reviews
 where quality_status='REVIEW_REQUIRED'
$function$;

CREATE OR REPLACE FUNCTION public.beagu_referral_quality_resolve(p_event_hash text, p_actor uuid, p_session uuid, p_decision text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q beagu_private.challenge_referral_quality_reviews%rowtype;
 e beagu_private.challenge_referral_events%rowtype;
 p beagu_private.challenge_referral_profiles%rowtype;
begin
 if p_event_hash !~ '^[a-f0-9]{64}$'
   or p_decision not in ('APPROVE','REJECT')
   or length(trim(coalesce(p_reason,''))) not between 12 and 500
   or p_reason ~ '[<>]'
 then raise exception 'invalid review decision'; end if;
 if not exists(select 1 from public.beagu_admin_accounts a
     where a.user_id=p_actor and a.enabled and a.role='owner')
   or not public.beagu_admin_active_mfa_session(p_actor,p_session)
 then raise exception 'owner MFA required'; end if;
 select * into strict q from beagu_private.challenge_referral_quality_reviews
   where event_sha256=p_event_hash for update;
 select * into strict e from beagu_private.challenge_referral_events
   where event_sha256=p_event_hash for update;
 if q.quality_status<>'REVIEW_REQUIRED' or e.decision<>'pending_quality_review'
 then raise exception 'not pending review'; end if;
 if p_decision='APPROVE' then
   -- Stage-specific: no Lv2 credit without independently verified form evidence
   -- and the explicit private 2026 referral launch gate.
   if not q.form_quality_attested or not exists(
      select 1 from beagu_private.challenge_referral_settings s
      where s.name='public_enabled' and s.enabled
   ) then raise exception 'verified submission not configured' using errcode='42501'; end if;
   select * into strict p from beagu_private.challenge_referral_profiles
     where campaign='2026' and referral_token_sha256=e.referral_token_sha256 for update;
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(e.respondent_sha256),2603);
   if p.disabled or p.access_level<>1 or p.visitor_id=q.respondent_visitor_id
      or exists(select 1 from beagu_private.challenge_referral_events z
       where z.campaign='2026' and z.respondent_sha256=e.respondent_sha256
         and z.event_sha256<>p_event_hash and z.decision='credited')
   then raise exception 'cannot approve duplicate, self or disabled referral'; end if;
   update beagu_private.challenge_referral_events set decision='credited'
     where event_sha256=p_event_hash;
   update beagu_private.challenge_referral_profiles
     set access_level=2,valid_referrals=1,upgraded_at=now()
     where campaign='2026' and visitor_id=p.visitor_id;
 else
   update beagu_private.challenge_referral_events set decision='rejected_quality'
     where event_sha256=p_event_hash;
 end if;
 update beagu_private.challenge_referral_quality_reviews
   set quality_status=case when p_decision='APPROVE' then 'MANUALLY_APPROVED' else 'REJECTED' end,
     reviewer_user_id=p_actor,reviewed_at=now(),notes=trim(p_reason),checked_at=now()
   where event_sha256=p_event_hash;
 insert into beagu_private.challenge_referral_quality_audit(
   event_sha256,action,actor_user_id,reason_codes)
 values(p_event_hash,case when p_decision='APPROVE' then 'OWNER_APPROVED' else 'OWNER_REJECTED' end,
 p_actor,q.signals);
 return jsonb_build_object('ok',true,'decision',p_decision);
end $function$;

-- Hardening vs the original: include explicit active AAL2 session in RPC
-- and write both private + public audits in ONE transaction.
CREATE OR REPLACE FUNCTION public.beagu_2026_admin_hold_result(
  p_school_id text, p_expected_sha256 text, p_actor uuid, p_session uuid, p_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $hold$
DECLARE r public.beagu_2026_results_snapshot;
BEGIN
 IF p_school_id !~ '^TST[0-9]{4}$'
    OR p_expected_sha256 !~ '^[0-9a-f]{64}$'
    OR p_actor IS NULL OR p_session IS NULL
    OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 12 AND 500
    OR p_reason ~ '[<>]'
 THEN RAISE EXCEPTION 'invalid QA hold decision' USING errcode='22023'; END IF;
 IF NOT EXISTS(
   SELECT 1 FROM public.beagu_admin_accounts a
   WHERE a.user_id=p_actor AND a.enabled AND a.role='owner'
 ) OR NOT public.beagu_admin_active_mfa_session(p_actor,p_session)
 THEN RAISE EXCEPTION 'OWNER_MFA_REQUIRED' USING errcode='42501'; END IF;
 SELECT * INTO STRICT r FROM public.beagu_2026_results_snapshot
   WHERE school_id=p_school_id FOR UPDATE;
 IF r.payload_sha256 IS DISTINCT FROM p_expected_sha256
 THEN RAISE EXCEPTION 'snapshot changed; reload before decision' USING errcode='40001'; END IF;
 UPDATE public.beagu_2026_results_snapshot
 SET approval_status='WITHHELD',approved_by=NULL,approved_at=NULL,
     approved_payload_sha256=NULL,approval_evidence=NULL
 WHERE school_id=p_school_id;
 INSERT INTO beagu_private.beagu_2026_results_approval_audit(
   school_id,payload_sha256,action,actor,evidence)
 VALUES(p_school_id,r.payload_sha256,'WITHHELD',p_actor::text,
   pg_catalog.jsonb_build_object('decision','HOLD','reason',trim(p_reason),
      'privacy_review','not_a_public_release'));
 INSERT INTO public.beagu_admin_audit_events(
   actor_user_id,event_type,outcome,details)
 VALUES(p_actor,'admin_2026_review_hold','success',
   pg_catalog.jsonb_build_object('school_id',p_school_id,'action','WITHHELD'));
END;
$hold$;

-- SECURITY DEFINER functions must NEVER inherit PUBLIC EXECUTE.
REVOKE ALL ON FUNCTION public.beagu_2026_admin_review_queue(text,integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.beagu_2026_admin_pipeline_status() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.beagu_referral_quality_queue() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.beagu_referral_quality_resolve(text,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.beagu_2026_admin_record_basis_review(
 text,text,uuid,uuid,text,text,text,text,timestamptz,text,text,boolean,boolean,boolean,boolean,boolean
) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.beagu_2026_admin_hold_result(text,text,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_2026_admin_review_queue(text,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.beagu_2026_admin_pipeline_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.beagu_referral_quality_queue() TO service_role;
GRANT EXECUTE ON FUNCTION public.beagu_referral_quality_resolve(text,uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.beagu_2026_admin_record_basis_review(
 text,text,uuid,uuid,text,text,text,text,timestamptz,text,text,boolean,boolean,boolean,boolean,boolean
) TO service_role;
GRANT EXECUTE ON FUNCTION public.beagu_2026_admin_hold_result(text,text,uuid,uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
