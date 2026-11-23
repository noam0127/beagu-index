-- ISOLATED STAGING ycwuugggqbunlbwuzvbx ONLY.
-- Retention undecided: preview ONLY. Never automatically purge audit evidence.
-- Raw member audit fields remain strictly private with RLS and no exposed grants.
DO $stage$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_constraint c
   WHERE c.conrelid='public.beagu_2026_results_snapshot'::regclass
   AND c.conname='beagu_2026_results_snapshot_school_id_check'
   AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%TST%'
 ) THEN RAISE EXCEPTION 'REFUSE_NON_ISOLATED_STAGE_DB'; END IF;
END $stage$;

CREATE TABLE IF NOT EXISTS beagu_private.beagu_member_audit_retention_policy_v1(
 singleton_id smallint PRIMARY KEY DEFAULT 1 CHECK(singleton_id=1),
 retention_days integer NULL CHECK(retention_days BETWEEN 30 AND 3650),
 approved boolean NOT NULL DEFAULT false,
 approved_at timestamptz NULL,
 approved_by uuid NULL,
 legal_hold boolean NOT NULL DEFAULT true,
 automated_deletion_enabled boolean NOT NULL DEFAULT false
   CHECK(automated_deletion_enabled=false),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT member_retention_unapproved_until_review
 CHECK(NOT approved OR (retention_days IS NOT NULL AND approved_at IS NOT NULL AND approved_by IS NOT NULL))
);
INSERT INTO beagu_private.beagu_member_audit_retention_policy_v1(singleton_id)
 VALUES(1) ON CONFLICT(singleton_id) DO NOTHING;
ALTER TABLE beagu_private.beagu_member_audit_retention_policy_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE beagu_private.beagu_member_audit_retention_policy_v1
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE beagu_private.beagu_postit_member_link_audit
 FROM PUBLIC,anon,authenticated;

-- Defense in depth: service role is the sole RPC caller. The invoking Edge
-- must first verify the signature via Supabase Auth.getUser(JWT) and confirm
-- JWT sub/session_id/AAL2 match the values passed here.
CREATE OR REPLACE FUNCTION public.beagu_stage_member_audit_owner_mfa(
 p_actor uuid,p_session uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
 SELECT p_actor IS NOT NULL AND p_session IS NOT NULL
 AND EXISTS(
  SELECT 1 FROM public.beagu_admin_accounts a
  JOIN auth.users u ON u.id=a.user_id
  WHERE a.user_id=p_actor AND a.enabled=true AND a.role='owner'
  AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
 )
 AND public.beagu_admin_active_mfa_session(p_actor,p_session)=true
 AND public.beagu_stage_active_member_auth_session(p_actor,p_session)=true;
$fn$;
REVOKE ALL ON FUNCTION public.beagu_stage_member_audit_owner_mfa(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_stage_member_audit_owner_mfa(uuid,uuid)
 TO service_role;

CREATE OR REPLACE FUNCTION public.beagu_stage_member_audit_report(
 p_actor uuid,p_session uuid,p_window_days integer DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 n_total bigint;
 n_window bigint;
 n_link bigint;
 n_suspend bigint;
 n_reactivate bigint;
 n_90 bigint;
 n_180 bigint;
 n_365 bigint;
 policy beagu_private.beagu_member_audit_retention_policy_v1%ROWTYPE;
BEGIN
 IF NOT public.beagu_stage_member_audit_owner_mfa(p_actor,p_session)
 THEN RETURN '{"error":"ACCESS_DENIED"}'::jsonb; END IF;
 IF p_window_days IS NULL OR p_window_days NOT IN (7,30,90,180,365)
 THEN RETURN '{"error":"INVALID_WINDOW"}'::jsonb; END IF;

 SELECT count(*),
  count(*) FILTER(WHERE occurred_at>=now()-pg_catalog.make_interval(days=>p_window_days)),
  count(*) FILTER(WHERE occurred_at>=now()-pg_catalog.make_interval(days=>p_window_days) AND operation='LINK'),
  count(*) FILTER(WHERE occurred_at>=now()-pg_catalog.make_interval(days=>p_window_days) AND operation='SUSPEND'),
  count(*) FILTER(WHERE occurred_at>=now()-pg_catalog.make_interval(days=>p_window_days) AND operation='REACTIVATE'),
  count(*) FILTER(WHERE occurred_at<now()-interval '90 days'),
  count(*) FILTER(WHERE occurred_at<now()-interval '180 days'),
  count(*) FILTER(WHERE occurred_at<now()-interval '365 days')
 INTO n_total,n_window,n_link,n_suspend,n_reactivate,n_90,n_180,n_365
 FROM beagu_private.beagu_postit_member_link_audit;
 SELECT * INTO STRICT policy
 FROM beagu_private.beagu_member_audit_retention_policy_v1
 WHERE singleton_id=1;
 -- Audit access, but not the raw sensitive subject/session identifiers
 -- or any report body. The read and its access log are atomic.
 INSERT INTO public.beagu_admin_audit_events(
 actor_user_id,event_type,outcome,details
 ) VALUES(p_actor,'member_audit_report','success',
    jsonb_build_object('window_days',p_window_days,'scope','aggregate_only'));
 RETURN pg_catalog.jsonb_build_object(
  'status','ok','aggregate_only',true,
  'total_events',n_total,'window_days',p_window_days,
  'window_total',n_window,
  'actions',pg_catalog.jsonb_build_object(
    'link',n_link,'suspend',n_suspend,'reactivate',n_reactivate),
  'retention_preview_only',pg_catalog.jsonb_build_object(
    'older_than_90_days',n_90,'older_than_180_days',n_180,'older_than_365_days',n_365),
  'policy',pg_catalog.jsonb_build_object(
    'approved',policy.approved,'retention_days',policy.retention_days,
    'legal_hold',policy.legal_hold,
    'automated_deletion_enabled',policy.automated_deletion_enabled),
  'deleted_rows',0);
END;
$fn$;
REVOKE ALL ON FUNCTION public.beagu_stage_member_audit_report(uuid,uuid,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_stage_member_audit_report(uuid,uuid,integer)
 TO service_role;

-- Small redacted event timeline: no visitor/user/session/author identifiers.
-- Still restricted to owner MFA, capped to 25 events.
CREATE OR REPLACE FUNCTION public.beagu_stage_member_audit_timeline(
 p_actor uuid,p_session uuid,p_limit integer DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 items jsonb;
BEGIN
 IF NOT public.beagu_stage_member_audit_owner_mfa(p_actor,p_session)
 THEN RETURN '{"error":"ACCESS_DENIED"}'::jsonb; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25
 THEN RETURN '{"error":"INVALID_LIMIT"}'::jsonb; END IF;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
    'event_id',e.id,'day_utc',to_char(e.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD'),
    'operation',e.operation,
    'before',e.before_status,'after',e.after_status
  ) ORDER BY e.id DESC),'[]'::jsonb)
 INTO items FROM (
   SELECT id,occurred_at,operation,before_status,after_status
   FROM beagu_private.beagu_postit_member_link_audit
   ORDER BY id DESC LIMIT p_limit
 ) e;
 INSERT INTO public.beagu_admin_audit_events(
  actor_user_id,event_type,outcome,details
 ) VALUES(p_actor,'member_audit_timeline','success',
    jsonb_build_object('limit',p_limit,'scope','redacted_no_subject_ids'));
 RETURN pg_catalog.jsonb_build_object(
   'status','ok','redacted',true,'items',items,
   'identifiers_excluded',true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.beagu_stage_member_audit_timeline(uuid,uuid,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_stage_member_audit_timeline(uuid,uuid,integer)
 TO service_role;

NOTIFY pgrst,'reload schema';
