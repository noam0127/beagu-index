-- 2026 final edited workbook only. Existing 2023-25 rows never updated.
begin;
alter table public.beagu_edited_school_rows drop constraint beagu_edited_school_rows_survey_year_check;
alter table public.beagu_edited_school_rows add constraint beagu_edited_school_rows_survey_year_check check(survey_year in (2023,2024,2025,2026));
create or replace function public.beagu_2026_edited_publish_v1(p_actor uuid,p_session uuid,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $publish$
declare n integer; first_row integer;
begin
 if not exists(select 1 from public.beagu_admin_accounts where user_id=p_actor and enabled and role='owner') or not coalesce(public.beagu_admin_active_mfa_session(p_actor,p_session),false) then raise exception 'owner MFA required'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'invalid file';end if;
 n:=jsonb_array_length(p_rows);
 if n not between 1 and 7000 then raise exception 'invalid size';end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r where jsonb_typeof(r)<>'object' or not(r ?& array['school_id','percentile','questions']) or (r-array['school_id','percentile','questions'])<>'{}'::jsonb or coalesce(r->>'school_id','') !~ '^[A-Z0-9]{7}$' or jsonb_typeof(r->'percentile')<>'number' or (r->>'percentile')::numeric not between 0 and 100 or jsonb_typeof(r->'questions')<>'array') then raise exception 'invalid school row';end if;
 if (select count(distinct r->>'school_id') from jsonb_array_elements(p_rows) r)<>n then raise exception 'duplicate school';end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r where not exists(select 1 from public.schools s where s.school_id=r->>'school_id' and s.school_kind='초등학교' and s.status='운영')) then raise exception 'unknown school';end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r cross join lateral jsonb_array_elements(r->'questions') q where jsonb_typeof(q)<>'object' or not(q ?& array['questionId','row','values']) or (q-array['questionId','row','values'])<>'{}'::jsonb or coalesce(q->>'questionId','') !~ '^Q(0[1-9]|[1-4][0-9]|50)$' or q->>'questionId'='Q31' or jsonb_typeof(q->'row')<>'number' or jsonb_typeof(q->'values')<>'array' or jsonb_array_length(q->'values') not between 1 and 25) then raise exception 'invalid question';end if;
 perform pg_advisory_xact_lock(2026,2026);
 select coalesce(max(source_row),1)+1 into first_row from public.beagu_edited_school_rows where survey_year=2026;
 -- Full replacement of visible 2026 edited edition only. Previous rows retained, not deleted.
 update public.beagu_edited_school_rows set release_status='REJECTED' where survey_year=2026 and source_tab='2026 최종 편집본' and release_status='APPROVED';
 insert into public.beagu_edited_school_rows(survey_year,source_row,school_id,original_school_name,original_sido,original_support_office,source_tab,display_values,release_status,reviewed_by,reviewed_at)
 select 2026,first_row+row_number() over(order by s.school_id)-1,s.school_id,s.school_name,s.sido_standard,s.support_office,'2026 최종 편집본',jsonb_build_object('percentile',r->'percentile','questions',r->'questions'),'APPROVED',p_actor::text,clock_timestamp()
 from jsonb_array_elements(p_rows) r join public.schools s on s.school_id=r->>'school_id';
 return jsonb_build_object('ok',true,'schools',n);
end $publish$;
create or replace function public.beagu_2026_edited_read_v1(p_ids text[],p_level integer)
returns jsonb language sql stable security definer set search_path='' as $read$
 select jsonb_build_object('active',exists(select 1 from public.beagu_edited_school_rows where survey_year=2026 and source_tab='2026 최종 편집본' and release_status='APPROVED'),
 'schools',coalesce((select jsonb_object_agg(r.school_id,r.display_values) from public.beagu_edited_school_rows r
 where r.survey_year=2026 and r.source_tab='2026 최종 편집본' and r.release_status='APPROVED' and p_level in (1,2) and cardinality(p_ids) between 1 and 20 and r.school_id=any(p_ids)
 and not exists(select 1 from beagu_private.beagu_2026_civic_publication_hold h where h.school_id=r.school_id and h.active)
 and not exists(select 1 from beagu_private.beagu_2026_level_release_approvals l where l.access_level=p_level and not coalesce(l.approved,false))
 and not exists(select 1 from beagu_private.beagu_2026_percentile_v13_decisions d where d.id=(select d2.id from beagu_private.beagu_2026_percentile_v13_decisions d2 where d2.school_id=r.school_id and d2.access_level=p_level order by d2.decided_at desc,d2.id desc limit 1) and d.decision='REVOKE')
 ),'{}'::jsonb));
$read$;
revoke all on function public.beagu_2026_edited_publish_v1(uuid,uuid,jsonb),public.beagu_2026_edited_read_v1(text[],integer) from public,anon,authenticated;
grant execute on function public.beagu_2026_edited_publish_v1(uuid,uuid,jsonb),public.beagu_2026_edited_read_v1(text[],integer) to service_role;
create or replace function public.beagu_2026_simple_report(p_school text,p_detail text,p_actor_hash text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare answer uuid;
begin
 if p_school is null or p_school !~ '^[A-Z0-9]{7}$' or p_actor_hash is null or p_actor_hash !~ '^[a-f0-9]{64}$' or length(trim(coalesce(p_detail,''))) not between 12 and 500 or p_detail ~ '[<>[:cntrl:]]' or not exists(select 1 from public.schools where school_id=p_school) then raise exception 'invalid report';end if;
 perform pg_advisory_xact_lock(hashtext(p_actor_hash));perform pg_advisory_xact_lock(2026,hashtext(p_school||':report'));
 if (select count(*) from beagu_private.beagu_2026_civic_feedback where actor_hash=p_actor_hash and created_at>now()-interval '24 hours')>=5 or (select count(*) from beagu_private.beagu_2026_civic_feedback where school_id=p_school and created_at>now()-interval '24 hours')>=80 then raise exception 'rate limited';end if;
 insert into beagu_private.beagu_2026_civic_feedback(school_id,kind,category,question_id,detail,actor_hash,verified_visitor) values(p_school,'REPORT','OTHER',null,trim(p_detail),p_actor_hash,null) returning id into answer;
 return answer;
end $$;

CREATE OR REPLACE FUNCTION public.beagu_2026_civic_hold_context(p_actor uuid, p_session uuid, p_feedback uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE result jsonb;
BEGIN
 IF p_actor IS NULL OR p_session IS NULL OR NOT EXISTS(SELECT 1 FROM public.beagu_admin_accounts WHERE user_id=p_actor AND role='owner' AND enabled)
 OR public.beagu_admin_active_mfa_session(p_actor,p_session) IS DISTINCT FROM true THEN RAISE EXCEPTION 'owner MFA required'; END IF;
 SELECT jsonb_build_object('snapshot_sha',coalesce(e.file_sha,r.payload_sha256),'school_approval',case when e.file_sha is not null then 'APPROVED' else r.approval_status end,'edited_file',e.file_sha is not null,'edited_after_hold',coalesce(e.reviewed_at>h.updated_at,false),
 'held',coalesce(h.active,false),'hold_feedback',h.feedback_id,'history',
 (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC),'[]'::jsonb) FROM
 (SELECT action,reason,created_at FROM beagu_private.beagu_2026_civic_feedback_audit WHERE feedback_id=f.id ORDER BY created_at DESC LIMIT 50) a))
 INTO result FROM beagu_private.beagu_2026_civic_feedback f
 LEFT JOIN public.beagu_2026_results_snapshot r ON r.school_id=f.school_id
 LEFT JOIN beagu_private.beagu_2026_civic_publication_hold h ON h.school_id=f.school_id
 LEFT JOIN LATERAL (select encode(extensions.digest(z.display_values::text||':'||z.source_row::text,'sha256'),'hex') as file_sha,z.reviewed_at from public.beagu_edited_school_rows z where z.school_id=f.school_id and z.survey_year=2026 and z.source_tab='2026 최종 편집본' and z.release_status='APPROVED' limit 1) e on true
 WHERE f.id=p_feedback;
 IF result IS NULL THEN RAISE EXCEPTION 'feedback not found'; END IF;
 RETURN result;
END $function$;
CREATE OR REPLACE FUNCTION public.beagu_2026_civic_hold_school(p_actor uuid, p_session uuid, p_feedback uuid, p_expected_sha text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE f beagu_private.beagu_2026_civic_feedback; s public.beagu_2026_results_snapshot; edited_sha text;
BEGIN
 IF p_actor IS NULL OR p_session IS NULL OR p_feedback IS NULL OR p_expected_sha IS NULL
 OR p_expected_sha !~ '^[a-f0-9]{64}$' OR (length(trim(coalesce(p_reason,''))) NOT BETWEEN 12 AND 500 OR coalesce(p_reason,'') ~ '[<>[:cntrl:]]')
 THEN RAISE EXCEPTION 'invalid hold request'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.beagu_admin_accounts WHERE user_id=p_actor AND role='owner' AND enabled)
 OR public.beagu_admin_active_mfa_session(p_actor,p_session) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'owner MFA required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(2026,2026);
 SELECT * INTO STRICT f FROM beagu_private.beagu_2026_civic_feedback WHERE id=p_feedback FOR UPDATE;
 IF f.kind<>'REPORT' OR f.status<>'REVIEWING' THEN RAISE EXCEPTION 'reviewed report required'; END IF;
 SELECT encode(extensions.digest(z.display_values::text||':'||z.source_row::text,'sha256'),'hex') into edited_sha from public.beagu_edited_school_rows z where z.school_id=f.school_id and z.survey_year=2026 and z.source_tab='2026 최종 편집본' and z.release_status='APPROVED' for update;
 IF edited_sha IS NOT NULL THEN
  IF edited_sha IS DISTINCT FROM p_expected_sha THEN RAISE EXCEPTION 'edited file changed';END IF;
 ELSE
  SELECT * INTO STRICT s FROM public.beagu_2026_results_snapshot WHERE school_id=f.school_id FOR UPDATE;
  IF s.payload_sha256 IS DISTINCT FROM p_expected_sha THEN RAISE EXCEPTION 'snapshot changed'; END IF;
 END IF;
 INSERT INTO beagu_private.beagu_2026_civic_publication_hold(school_id,feedback_id,snapshot_sha256,decision_by,reason)
 VALUES(f.school_id,p_feedback,p_expected_sha,p_actor,trim(p_reason))
 ON CONFLICT(school_id) DO UPDATE SET feedback_id=excluded.feedback_id,snapshot_sha256=excluded.snapshot_sha256,
 active=true,decision_by=excluded.decision_by,reason=excluded.reason,updated_at=now()
 WHERE NOT beagu_private.beagu_2026_civic_publication_hold.active;
 IF NOT FOUND THEN RAISE EXCEPTION 'active hold already exists'; END IF;
 -- Invalidate the old school approval, preserving the raw aggregate.
 UPDATE public.beagu_2026_results_snapshot SET approval_status='WITHHELD',approved_by=NULL,approved_at=NULL,approved_payload_sha256=NULL,approval_evidence=NULL WHERE school_id=f.school_id;
 INSERT INTO beagu_private.beagu_2026_civic_feedback_audit(feedback_id,actor_id,action,reason)
 VALUES(p_feedback,p_actor,'PUBLICATION_HOLD',trim(p_reason));
 RETURN jsonb_build_object('ok',true,'school_id',f.school_id,'status','HELD');
END $function$;
CREATE OR REPLACE FUNCTION public.beagu_2026_civic_resume_school(p_actor uuid, p_session uuid, p_feedback uuid, p_expected_sha text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE h beagu_private.beagu_2026_civic_publication_hold; r public.beagu_2026_results_snapshot; edited_sha text; edited_reviewed timestamptz;
BEGIN
 IF p_actor IS NULL OR p_session IS NULL OR p_feedback IS NULL OR p_expected_sha IS NULL
 OR p_expected_sha !~ '^[a-f0-9]{64}$' OR (length(trim(coalesce(p_reason,''))) NOT BETWEEN 12 AND 500 OR coalesce(p_reason,'') ~ '[<>[:cntrl:]]')
 THEN RAISE EXCEPTION 'invalid resume request'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.beagu_admin_accounts WHERE user_id=p_actor AND role='owner' AND enabled)
 OR public.beagu_admin_active_mfa_session(p_actor,p_session) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'owner MFA required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(2026,2026);
 SELECT * INTO STRICT h FROM beagu_private.beagu_2026_civic_publication_hold WHERE feedback_id=p_feedback AND active FOR UPDATE;
 SELECT encode(extensions.digest(z.display_values::text||':'||z.source_row::text,'sha256'),'hex'),z.reviewed_at into edited_sha,edited_reviewed from public.beagu_edited_school_rows z where z.school_id=h.school_id and z.survey_year=2026 and z.source_tab='2026 최종 편집본' and z.release_status='APPROVED' for update;
 IF edited_sha IS NOT NULL THEN
  IF edited_sha IS DISTINCT FROM p_expected_sha OR edited_reviewed IS NULL OR edited_reviewed<=h.updated_at THEN RAISE EXCEPTION 'fresh edited file required';END IF;
 ELSE
 SELECT * INTO STRICT r FROM public.beagu_2026_results_snapshot WHERE school_id=h.school_id FOR UPDATE;
 IF r.payload_sha256 IS DISTINCT FROM p_expected_sha OR r.approval_status<>'APPROVED'
 OR r.approved_payload_sha256 IS DISTINCT FROM r.payload_sha256
 OR r.approved_at IS NULL OR r.approved_at<=h.updated_at OR r.approved_at<r.source_snapshot_at OR r.approved_at<r.updated_at
 OR r.school_match_status<>'EXACT_REGION_OFFICE_NAME'
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.questions) q WHERE coalesce((q->>'invalid')::integer,1)>0)
 OR NOT EXISTS(SELECT 1 FROM beagu_private.beagu_2026_auto_review_status t WHERE t.school_id=r.school_id AND t.survey_year=2026
 AND t.source_spreadsheet_id='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4'
 AND t.technical_status='TECHNICAL_CHECK_PASSED' AND t.matching_core_questions=13 AND t.verified_catalog_questions=13
 AND t.source_response_rows=r.school_response_rows AND t.checked_at>h.updated_at AND t.checked_at>=r.source_snapshot_at)
 OR NOT EXISTS(SELECT 1 FROM beagu_private.beagu_2026_publication_basis_review b WHERE b.school_id=r.school_id AND b.payload_sha256=r.payload_sha256
 AND b.review_status='VERIFIED' AND b.reviewer_user_id::text=r.approved_by AND b.reviewed_at>h.updated_at AND b.reviewed_at>=r.source_snapshot_at AND b.notice_effective_at<=r.source_snapshot_at
 AND b.distinct_respondents_reviewed AND b.personal_data_reviewed AND b.small_sample_reviewed AND b.reidentification_reviewed AND b.prior_data_combination_reviewed)
 THEN RAISE EXCEPTION 'fresh exact snapshot approval and QA required'; END IF;
 END IF;
 UPDATE beagu_private.beagu_2026_civic_publication_hold SET active=false,updated_at=now(),decision_by=p_actor,reason=trim(p_reason) WHERE school_id=h.school_id;
 INSERT INTO beagu_private.beagu_2026_civic_feedback_audit(feedback_id,actor_id,action,reason) VALUES(p_feedback,p_actor,'PUBLICATION_HOLD_LIFTED',trim(p_reason));
 RETURN jsonb_build_object('ok',true,'status','REVIEWED','school_id',h.school_id);
END $function$;
revoke all on function public.beagu_2026_simple_report(text,text,text) from public,anon,authenticated;
grant execute on function public.beagu_2026_simple_report(text,text,text) to service_role;
revoke all on function public.beagu_2026_civic_hold_context(uuid,uuid,uuid),public.beagu_2026_civic_hold_school(uuid,uuid,uuid,text,text),public.beagu_2026_civic_resume_school(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.beagu_2026_civic_hold_context(uuid,uuid,uuid),public.beagu_2026_civic_hold_school(uuid,uuid,uuid,text,text),public.beagu_2026_civic_resume_school(uuid,uuid,uuid,text,text) to service_role;
commit;
