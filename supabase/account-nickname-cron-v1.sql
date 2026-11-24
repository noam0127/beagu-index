-- Approval-only scheduler setup. Run after account-provisional-v1.sql.
-- Supabase pg_cron uses UTC by default: Sunday 15:00 UTC = Monday 00:00 KST.
-- Check cron.timezone before enabling the schedule. No production application during development.
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN RAISE EXCEPTION 'pg_cron required'; END IF;
 IF coalesce(current_setting('cron.timezone',true),'UTC') NOT IN ('UTC','GMT','Etc/UTC') THEN RAISE EXCEPTION 'verify cron timezone before scheduling'; END IF;
END $$;
-- Retry hourly after the weekly boundary in case of a transient failure.
-- Rotation checks the KST week_start and does nothing for already-rotated members.
SELECT cron.schedule('beagu-account-nickname-weekly-v1','0 * * * *',
 'SELECT beagu_private.beagu_account_rotate_nicknames_v1();');
