-- Stage38: isolated staging only. Negative security checks; no persistent writes.
BEGIN;
DO $test$
DECLARE v boolean;
BEGIN
 SELECT public.beagu_admin_active_mfa_session('00000000-0000-0000-0000-000000000000'::uuid,'00000000-0000-0000-0000-000000000000'::uuid) INTO v;
 IF v IS DISTINCT FROM false THEN RAISE EXCEPTION 'Missing MFA session unexpectedly accepted'; END IF;
 IF has_function_privilege('anon','public.beagu_admin_active_mfa_session(uuid,uuid)','EXECUTE') OR has_function_privilege('authenticated','public.beagu_admin_active_mfa_session(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'MFA guard is directly callable'; END IF;
 IF has_table_privilege('anon','public.beagu_admin_audit_events','SELECT') OR has_table_privilege('authenticated','public.beagu_admin_audit_events','INSERT') THEN RAISE EXCEPTION 'Audit log exposed'; END IF;
 IF has_table_privilege('service_role','public.beagu_admin_audit_events','UPDATE') OR has_table_privilege('service_role','public.beagu_admin_audit_events','DELETE') THEN RAISE EXCEPTION 'Audit log is mutable'; END IF;
 IF has_function_privilege('anon','public.beagu_admin_member_sms_status_v1(uuid[])','EXECUTE') OR has_function_privilege('authenticated','public.beagu_admin_member_sms_status_v1(uuid[])','EXECUTE') THEN RAISE EXCEPTION 'SMS status RPC exposed'; END IF;
END $test$;
SELECT 'PASS_ADMIN_MFA_AUDIT_SMS_NEGATIVE_SECURITY' AS result;
ROLLBACK;