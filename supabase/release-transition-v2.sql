-- Atomic release control-plane transitions. Existing survey and published notice tables untouched.
create or replace function public.beagu_release_transition_v2(p_action text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.beagu_site_release_state_v1%rowtype; j public.beagu_site_release_jobs_v1%rowtype; jid uuid; dest text; ver text; sm text; prev text;
begin
 select * into strict s from public.beagu_site_release_state_v1 where id=1 for update;
 if p_action='register' then
  if exists(select 1 from public.beagu_site_release_jobs_v1 where status in ('queued','running')) then return jsonb_build_object('error','release_in_progress'); end if;
  if s.production_sha is distinct from p_payload->>'base' or s.draft_sha is distinct from p_payload->>'expected_draft' then return jsonb_build_object('error','direct_draft_conflict'); end if;
  dest:=p_payload->>'sha'; ver:=p_payload->>'version'; sm:=p_payload->>'summary';
  if dest is null or dest !~ '^[0-9a-f]{40}$' or dest=s.production_sha or ver is null or sm is null then return jsonb_build_object('error','invalid_direct_sha'); end if;
  if exists(select 1 from public.beagu_site_release_history_v1 where target='production' and action='prod_apply' and version=ver and to_sha<>dest) then return jsonb_build_object('error','version_already_used'); end if;
  update public.beagu_site_release_state_v1 set draft_sha=dest,draft_version=ver,draft_summary=sm,updated_at=now() where id=1;
  return jsonb_build_object('draft_sha',dest);
 elsif p_action='enqueue' then
  if s.production_sha is distinct from p_payload->>'from_sha' then return jsonb_build_object('error','direct_confirmation_required'); end if;
  if exists(select 1 from public.beagu_site_release_jobs_v1 where status in ('queued','running')) then return jsonb_build_object('error','release_in_progress'); end if;
  dest:=p_payload->>'to_sha'; ver:=p_payload->>'version'; sm:=p_payload->>'summary';
  if p_payload->>'action'='prod_apply' then
   if s.draft_sha is distinct from dest or s.draft_version is distinct from ver or s.draft_summary is distinct from sm or dest=s.production_sha then return jsonb_build_object('error','direct_draft_conflict'); end if;
  elsif p_payload->>'action'='prod_rollback' then
   select from_sha into prev from public.beagu_site_release_history_v1 where target='production' and action<>'data_refresh' order by deployed_at desc,id desc limit 1;
   if prev is null or prev is distinct from dest or dest=s.production_sha then return jsonb_build_object('error','direct_confirmation_required'); end if;
  else return jsonb_build_object('error','invalid_action'); end if;
  if dest is null or dest !~ '^[0-9a-f]{40}$' then return jsonb_build_object('error','invalid_direct_sha'); end if;
  insert into public.beagu_site_release_jobs_v1(action,target,from_sha,to_sha,version,summary,created_by) values(p_payload->>'action','production',s.production_sha,dest,ver,sm,(p_payload->>'created_by')::uuid) returning id into jid;
  return jsonb_build_object('id',jid);
 elsif p_action='complete' then
  select * into j from public.beagu_site_release_jobs_v1 where id=(p_payload->>'job_id')::uuid for update;
  if not found then return jsonb_build_object('error','job_not_found'); end if;
  if j.status='deployed' then return jsonb_build_object('ok',true,'version',j.version,'url',j.deployed_url); end if;
  if j.status<>'running' or j.target<>'production' or j.to_sha is null then return jsonb_build_object('error','job_not_running'); end if;
  if s.production_sha is distinct from j.from_sha then return jsonb_build_object('error','stale_production_base'); end if;
  if j.action not in ('bootstrap','prod_apply','prod_rollback','data_refresh') then return jsonb_build_object('error','invalid_action'); end if;
  if j.action='data_refresh' and j.to_sha is distinct from s.production_sha then return jsonb_build_object('error','stale_production_base'); end if;
  update public.beagu_site_release_state_v1 set production_sha=j.to_sha,production_version=case when j.action='data_refresh' then s.production_version else j.version end,public_data_blob_sha=coalesce(j.public_data_blob_sha,s.public_data_blob_sha),updated_at=now() where id=1;
  insert into public.beagu_site_release_history_v1(job_id,target,action,version,summary,from_sha,to_sha,deployed_url) values(j.id,j.target,j.action,j.version,j.summary,j.from_sha,j.to_sha,'https://baeguindex.com/') on conflict(job_id) do nothing;
  update public.beagu_site_release_jobs_v1 set status='deployed',finished_at=now(),deployed_url='https://baeguindex.com/' where id=j.id;
  return jsonb_build_object('ok',true,'version',j.version,'url','https://baeguindex.com/');
 end if;
 return jsonb_build_object('error','invalid_action');
 exception when unique_violation then return jsonb_build_object('error','release_in_progress');
end $$;
revoke all on function public.beagu_release_transition_v2(text,jsonb) from public,anon,authenticated;
grant execute on function public.beagu_release_transition_v2(text,jsonb) to service_role;
