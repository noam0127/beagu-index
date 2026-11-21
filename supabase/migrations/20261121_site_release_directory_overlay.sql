alter table public.beagu_site_release_state_v1
  add column if not exists public_data_blob_sha text;
alter table public.beagu_site_release_jobs_v1
  add column if not exists public_data_blob_sha text;
alter table public.beagu_site_release_jobs_v1
  drop constraint if exists beagu_site_release_jobs_v1_action_check;
alter table public.beagu_site_release_jobs_v1
  add constraint beagu_site_release_jobs_v1_action_check
  check(action in ('bootstrap','stage_apply','stage_rollback','prod_apply','prod_rollback','data_refresh'));
alter table public.beagu_site_release_state_v1
  add constraint beagu_site_release_data_blob_hex check(public_data_blob_sha is null or public_data_blob_sha ~ '^[0-9a-f]{40}$');
alter table public.beagu_site_release_jobs_v1
  add constraint beagu_site_release_job_data_blob_hex check(public_data_blob_sha is null or public_data_blob_sha ~ '^[0-9a-f]{40}$');
