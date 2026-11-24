-- Approval-only scheduler setup. Run after account-provisional-v1.sql.
-- Supabase pg_cron uses UTC by default: Sunday 15:00 UTC = Monday 00:00 KST.
-- Check cron.timezone before enabling the schedule. No production application during development.
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN RAISE EXCEPTION 'pg_cron required'; END IF;
 IF coalesce(current_setting('cron.timezone',true),'UTC') NOT IN ('UTC','GMT','Etc/UTC') THEN RAISE EXCEPTION 'verify cron timezone before scheduling'; END IF;
END $$;
-- Every minute, preallocate at most 500 members; no large midnight transaction.
-- Old aliases are never served by the current-week selector. Bounded pruning.
SELECT cron.schedule('beagu-account-nickname-weekly-v1','* * * * *',
 'SELECT beagu_private.beagu_account_prepare_nicknames_v1(statement_timestamp(),500);');
SELECT cron.schedule('beagu-account-nickname-prune-v1','*/5 * * * *',
 'SELECT beagu_private.beagu_account_prune_nicknames_v1(statement_timestamp(),1000);');
