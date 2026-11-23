-- Synthetic SQL authorization contract, NOT real user MFA enrollment/E2E.
-- Single transaction, rollback all actors/sessions/audit rows.
BEGIN;
DO $qa$
DECLARE
 owner_user constant uuid := 'd3000000-0000-4000-8000-000000000001';
 admin_user constant uuid := 'd3000000-0000-4000-8000-000000000002';
 viewer_user constant uuid := 'd3000000-0000-4000-8000-000000000003';
 owner_aal2 constant uuid := 'd3000000-0000-4000-8000-000000000011';
 owner_aal1 constant uuid := 'd3000000-0000-4000-8000-000000000012';
 owner_expired constant uuid := 'd3000000-0000-4000-8000-000000000013';
 admin_aal2 constant uuid := 'd3000000-0000-4000-8000-000000000021';
 viewer_aal2 constant uuid := 'd3000000-0000-4000-8000-000000000031';
 report jsonb;
 timeline jsonb;
 access_before bigint;
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM pg_constraint c
  WHERE c.conrelid='public.beagu_2026_results_snapshot'::regclass
    AND c.conname='beagu_2026_results_snapshot_school_id_check'
    AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%TST%'
 ) THEN RAISE EXCEPTION 'REFUSE_NON_ISOLATED_STAGE'; END IF;
 IF (SELECT count(*) FROM auth.users)<>0
    OR (SELECT count(*) FROM auth.sessions)<>0
    OR (SELECT count(*) FROM public.beagu_admin_accounts)<>0
    OR (SELECT count(*) FROM public.beagu_admin_audit_events)<>0
    OR (SELECT count(*) FROM beagu_private.beagu_postit_member_link_audit)<>0
 THEN RAISE EXCEPTION 'REFUSE_NONEMPTY_STAGE_QA'; END IF;
 IF has_function_privilege('anon',
  'public.beagu_stage_member_audit_report(uuid,uuid,integer)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.beagu_stage_member_audit_report(uuid,uuid,integer)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.beagu_stage_member_audit_report(uuid,uuid,integer)','EXECUTE')
 OR has_function_privilege('anon',
  'public.beagu_stage_member_audit_timeline(uuid,uuid,integer)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.beagu_stage_member_audit_timeline(uuid,uuid,integer)','EXECUTE')
 OR has_table_privilege('anon',
  'beagu_private.beagu_postit_member_link_audit','SELECT')
 OR has_table_privilege('authenticated',
  'beagu_private.beagu_postit_member_link_audit','SELECT')
 THEN RAISE EXCEPTION 'UNSAFE_AUDIT_DATA_ACCESS'; END IF;

 INSERT INTO auth.users(id,instance_id,aud,role,raw_app_meta_data,
  raw_user_meta_data,email_confirmed_at,created_at,updated_at)
 VALUES
 (owner_user,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','{}'::jsonb,'{}'::jsonb,now(),now(),now()),
 (admin_user,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','{}'::jsonb,'{}'::jsonb,now(),now(),now()),
 (viewer_user,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','{}'::jsonb,'{}'::jsonb,now(),now(),now());

 INSERT INTO public.beagu_admin_accounts(user_id,enabled,role)
 VALUES(owner_user,true,'owner'),(admin_user,true,'admin'),(viewer_user,true,'viewer');
 INSERT INTO auth.sessions(id,user_id,aal,created_at,updated_at,not_after)
 VALUES
 (owner_aal2,owner_user,'aal2'::auth.aal_level,now(),now(),now()+interval '1 hour'),
 (owner_aal1,owner_user,'aal1'::auth.aal_level,now(),now(),now()+interval '1 hour'),
 (owner_expired,owner_user,'aal2'::auth.aal_level,now(),now(),now()-interval '1 second'),
 (admin_aal2,admin_user,'aal2'::auth.aal_level,now(),now(),now()+interval '1 hour'),
 (viewer_aal2,viewer_user,'aal2'::auth.aal_level,now(),now(),now()+interval '1 hour');

 IF NOT public.beagu_stage_member_audit_owner_mfa(owner_user,owner_aal2)
 THEN RAISE EXCEPTION 'VALID_OWNER_AAL2_REJECTED'; END IF;
 IF public.beagu_stage_member_audit_owner_mfa(owner_user,owner_aal1)
 OR public.beagu_stage_member_audit_owner_mfa(owner_user,owner_expired)
 OR public.beagu_stage_member_audit_owner_mfa(owner_user,admin_aal2)
 OR public.beagu_stage_member_audit_owner_mfa(admin_user,admin_aal2)
 OR public.beagu_stage_member_audit_owner_mfa(viewer_user,viewer_aal2)
 OR public.beagu_stage_member_audit_owner_mfa(NULL,owner_aal2)
 OR public.beagu_stage_member_audit_owner_mfa(owner_user,NULL)
 THEN RAISE EXCEPTION 'NON_OWNER_OR_AAL1_OR_EXPIRED_ACCEPTED'; END IF;
 UPDATE public.beagu_admin_accounts SET enabled=false WHERE user_id=owner_user;
 IF public.beagu_stage_member_audit_owner_mfa(owner_user,owner_aal2)
 THEN RAISE EXCEPTION 'DISABLED_OWNER_ACCEPTED'; END IF;
 UPDATE public.beagu_admin_accounts SET enabled=true WHERE user_id=owner_user;
 UPDATE auth.users SET email_confirmed_at=NULL WHERE id=owner_user;
 IF public.beagu_stage_member_audit_owner_mfa(owner_user,owner_aal2)
 THEN RAISE EXCEPTION 'UNCONFIRMED_OWNER_ACCEPTED'; END IF;
 UPDATE auth.users SET email_confirmed_at=now() WHERE id=owner_user;

 INSERT INTO beagu_private.beagu_postit_member_link_audit(
 actor_user_id,auth_session_id,visitor_id,author_uid,
 operation,before_status,after_status,occurred_at
 ) VALUES
 (owner_user,owner_aal2,'d3000000-0000-4000-8000-000000000041','d3000000-0000-4000-8000-000000000051','LINK','none','active',now()-interval '1 day'),
 (owner_user,owner_aal2,'d3000000-0000-4000-8000-000000000041','d3000000-0000-4000-8000-000000000051','SUSPEND','active','suspended',now()-interval '2 days'),
 (owner_user,owner_aal2,'d3000000-0000-4000-8000-000000000041','d3000000-0000-4000-8000-000000000051','REACTIVATE','suspended','active',now()-interval '100 days'),
 (owner_user,owner_aal2,'d3000000-0000-4000-8000-000000000041','d3000000-0000-4000-8000-000000000051','LINK','none','active',now()-interval '200 days'),
 (owner_user,owner_aal2,'d3000000-0000-4000-8000-000000000041','d3000000-0000-4000-8000-000000000051','SUSPEND','active','suspended',now()-interval '370 days');

 -- Explicitly deny all unauthorized requests with NO audit payload returned.
 FOR report IN SELECT public.beagu_stage_member_audit_report(
  admin_user,admin_aal2,30
 ) UNION ALL SELECT public.beagu_stage_member_audit_report(
  viewer_user,viewer_aal2,30
 ) UNION ALL SELECT public.beagu_stage_member_audit_report(
  owner_user,owner_aal1,30
 ) UNION ALL SELECT public.beagu_stage_member_audit_report(
  owner_user,owner_expired,30
 ) UNION ALL SELECT public.beagu_stage_member_audit_report(
  owner_user,admin_aal2,30
 ) LOOP
   IF report->>'error'<>'ACCESS_DENIED' THEN
     RAISE EXCEPTION 'UNAUTHORIZED_AUDIT_REPORT_LEAK'; END IF;
 END LOOP;

 SELECT count(*) INTO access_before FROM public.beagu_admin_audit_events;
 IF access_before<>0 THEN RAISE EXCEPTION 'DENIED_ACCESS_AUDIT_READ_LEAK'; END IF;
 report:=public.beagu_stage_member_audit_report(owner_user,owner_aal2,30);
 IF report->>'status'<>'ok' OR (report->>'total_events')::int<>5
    OR (report->>'window_total')::int<>2
    OR (report->'actions'->>'link')::int<>1
    OR (report->'actions'->>'suspend')::int<>1
    OR (report->'actions'->>'reactivate')::int<>0
    OR (report->'retention_preview_only'->>'older_than_90_days')::int<>3
    OR (report->'retention_preview_only'->>'older_than_180_days')::int<>2
    OR (report->'retention_preview_only'->>'older_than_365_days')::int<>1
    OR (report->'policy'->>'approved')::boolean<>false
    OR (report->'policy'->>'legal_hold')::boolean<>true
    OR (report->'policy'->>'automated_deletion_enabled')::boolean<>false
    OR (report->>'deleted_rows')::int<>0
 THEN RAISE EXCEPTION 'AUDIT_AGGREGATE_OR_HOLD_INCORRECT: %',report; END IF;
 IF report::text LIKE '%d3000000-0000-4000-8000-%'
 THEN RAISE EXCEPTION 'RAW_IDENTIFIER_LEAKED_IN_REPORT'; END IF;
 IF (SELECT count(*) FROM public.beagu_admin_audit_events
  WHERE event_type='member_audit_report' AND actor_user_id=owner_user
   AND outcome='success')<>1
 THEN RAISE EXCEPTION 'AUDIT_REPORT_ACCESS_NOT_LOGGED'; END IF;
 IF public.beagu_stage_member_audit_report(owner_user,owner_aal2,900)->>'error'<>'INVALID_WINDOW'
 THEN RAISE EXCEPTION 'UNBOUNDED_REPORT_WINDOW_ALLOWED'; END IF;

 IF public.beagu_stage_member_audit_timeline(admin_user,admin_aal2,5)->>'error'<>'ACCESS_DENIED'
 THEN RAISE EXCEPTION 'ADMIN_TIMELINE_LEAK'; END IF;
 IF public.beagu_stage_member_audit_timeline(owner_user,owner_aal1,5)->>'error'<>'ACCESS_DENIED'
 THEN RAISE EXCEPTION 'AAL1_TIMELINE_LEAK'; END IF;
 timeline:=public.beagu_stage_member_audit_timeline(owner_user,owner_aal2,3);
 IF timeline->>'status'<>'ok' OR jsonb_array_length(timeline->'items')<>3
    OR (timeline->>'identifiers_excluded')::boolean<>true
 THEN RAISE EXCEPTION 'TIMELINE_REDACTION_INCORRECT: %',timeline; END IF;
 IF timeline::text LIKE '%d3000000-0000-4000-8000-%' OR
    timeline::text LIKE '%actor_user_id%' OR
    timeline::text LIKE '%visitor_id%' OR
    timeline::text LIKE '%auth_session_id%'
 THEN RAISE EXCEPTION 'TIMELINE_RAW_IDENTIFIERS_LEAKED'; END IF;
 IF public.beagu_stage_member_audit_timeline(owner_user,owner_aal2,26)->>'error'<>'INVALID_LIMIT'
 THEN RAISE EXCEPTION 'UNBOUNDED_TIMELINE_ACCEPTED'; END IF;
 IF (SELECT count(*) FROM public.beagu_admin_audit_events
    WHERE actor_user_id=owner_user)<>2
 THEN RAISE EXCEPTION 'AUDIT_ACCESS_LOG_MISSING_OR_DUPLICATED'; END IF;
 IF (SELECT count(*) FROM beagu_private.beagu_postit_member_link_audit)<>5
 THEN RAISE EXCEPTION 'RETENTION_PREVIEW_DELETED_EVENTS'; END IF;

 RAISE NOTICE 'PASS: owner AAL2 sees redacted summary/timeline; non-owner/aal1/expired denied, preview 90/180/365 with legal hold, no deletions, reads audited';
END $qa$;
ROLLBACK;
SELECT
 (SELECT count(*) FROM auth.users) users_after,
 (SELECT count(*) FROM auth.sessions) sessions_after,
 (SELECT count(*) FROM public.beagu_admin_accounts) admins_after,
 (SELECT count(*) FROM public.beagu_admin_audit_events) admin_access_logs_after,
 (SELECT count(*) FROM beagu_private.beagu_postit_member_link_audit) audit_events_after,
 (SELECT approved FROM beagu_private.beagu_member_audit_retention_policy_v1 WHERE singleton_id=1) policy_approved,
 (SELECT legal_hold FROM beagu_private.beagu_member_audit_retention_policy_v1 WHERE singleton_id=1) legal_hold,
 (SELECT automated_deletion_enabled FROM beagu_private.beagu_member_audit_retention_policy_v1 WHERE singleton_id=1) auto_purge;
