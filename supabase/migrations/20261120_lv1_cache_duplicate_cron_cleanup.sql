-- Reconcile concurrent Lv.1 cache optimizations on 2026-11-20.
-- Production uses the newer RLS-protected beagu_lv1_school_sort_cache_v1
-- with its own advisory lock, freshness stamp, and five-minute refresh.
-- A second 15-minute job called the SAME function and caused redundant work.
-- Remove only this older duplicate; do not touch the active five-minute job.
do $$
begin
  if exists(select 1 from cron.job
       where jobname='beagu-lv1-school-sort-cache-refresh-v1') then
    perform cron.unschedule('beagu-lv1-school-sort-cache-refresh-v1');
  end if;
end $$;
