-- Stage 4: disposable PostgreSQL server-control rehearsal ONLY.
-- Not a migration; explicitly refuse installation outside the isolated fixture DB.
do $$ begin
 if current_database() <> 'beagu_integrated_control_fixture' then
   raise exception 'isolated_control_fixture_required';
 end if;
end $$;

create table public.beagu_integrated_fixture_jobs_v1(
 id uuid primary key default gen_random_uuid(),
 base_sha text not null check(base_sha ~ '^[0-9a-f]{40}$'),
 candidate_sha text not null check(candidate_sha ~ '^[0-9a-f]{40}$' and candidate_sha<>base_sha),
 plan_sha text not null check(plan_sha ~ '^[0-9a-f]{64}$'),
 recipe_sha text not null check(recipe_sha ~ '^[0-9a-f]{64}$'),
 approval_sha text not null check(approval_sha ~ '^[0-9a-f]{64}$'),
 version text not null, summary text not null, final_evidence text check(final_evidence is null or final_evidence ~ '^[0-9a-f]{64}$'),
 status text not null default 'queued' check(status in ('queued','running','blocked','verified','completed')),
 next_step integer not null default 0 check(next_step>=0),
 task_count integer not null check(task_count between 2 and 100),
 unique(base_sha,candidate_sha),
 check(next_step<=task_count)
);
create unique index beagu_integrated_fixture_one_active_v1
 on public.beagu_integrated_fixture_jobs_v1((1)) where status in ('queued','running','blocked','verified');
create table public.beagu_integrated_fixture_steps_v1(
 job_id uuid not null references public.beagu_integrated_fixture_jobs_v1(id),
 idx integer not null check(idx>=0),
 task jsonb not null,
 status text not null default 'pending' check(status in ('pending','running','done','blocked')),
 lease uuid,
 worker_run text,
 evidence text check(evidence is null or evidence ~ '^[0-9a-f]{64}$'),
 error text,
 primary key(job_id,idx),
 check((status='running')=(lease is not null)),
 check((status='running')=(worker_run is not null)),
 check((status='done')=(evidence is not null))
);
alter table public.beagu_integrated_fixture_jobs_v1 enable row level security;
alter table public.beagu_integrated_fixture_steps_v1 enable row level security;
revoke all on public.beagu_integrated_fixture_jobs_v1,public.beagu_integrated_fixture_steps_v1 from public,anon,authenticated;
grant select,insert,update on public.beagu_integrated_fixture_jobs_v1,public.beagu_integrated_fixture_steps_v1 to service_role;

-- Both old and new entry paths serialize on the existing release-state row.
-- This blocks direct legacy inserts (including automatic public-data refresh) as well as RPC enqueue.
create function public.beagu_integrated_fixture_legacy_guard_v1() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 perform 1 from public.beagu_site_release_state_v1 where id=1 for update;
 if exists(select 1 from public.beagu_integrated_fixture_jobs_v1 where status in ('queued','running','blocked','verified')) then
   raise exception 'integrated_release_active' using errcode='55000';
 end if;
 return new;
end $$;
revoke all on function public.beagu_integrated_fixture_legacy_guard_v1() from public,anon,authenticated;
grant execute on function public.beagu_integrated_fixture_legacy_guard_v1() to service_role;
create trigger integrated_fixture_legacy_insert_guard before insert on public.beagu_site_release_jobs_v1
 for each row execute function public.beagu_integrated_fixture_legacy_guard_v1();
-- Keep draft/production pinned while integrated job runs. No legacy completion or registration
-- can replace the pointers; a later approved production finalize protocol must do this atomically.
create trigger integrated_fixture_state_guard before update on public.beagu_site_release_state_v1
 for each row execute function public.beagu_integrated_fixture_legacy_guard_v1();

create function public.beagu_integrated_fixture_transition_v1(p_action text,p jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.beagu_site_release_state_v1%rowtype;
 j public.beagu_integrated_fixture_jobs_v1%rowtype;
 t public.beagu_integrated_fixture_steps_v1%rowtype;
 jid uuid; lease_id uuid; n integer; op text; rank integer; last_rank integer:=-1; ops text[]:='{}';
begin
 if current_database()<>'beagu_integrated_control_fixture' then raise exception 'isolated_control_fixture_required'; end if;
 if jsonb_typeof(p) is distinct from 'object' or p->>'scope' is distinct from 'isolated_fixture_only' then
  return jsonb_build_object('error','fixture_scope_required');
 end if;
 select * into strict s from public.beagu_site_release_state_v1 where id=1 for update;
 if p_action='create' then
  if coalesce(p->>'base_sha','') !~ '^[0-9a-f]{40}$' or coalesce(p->>'candidate_sha','') !~ '^[0-9a-f]{40}$'
    or p->>'base_sha'=p->>'candidate_sha' or coalesce(p->>'plan_sha256','') !~ '^[0-9a-f]{64}$'
    or coalesce(p->>'recipe_sha256','') !~ '^[0-9a-f]{64}$' or coalesce(p->>'approval_sha256','') !~ '^[0-9a-f]{64}$'
    or p->'confirmed' is distinct from 'true'::jsonb or jsonb_typeof(p->'tasks') is distinct from 'array' then
   return jsonb_build_object('error','invalid_approval_pins');
  end if;
  if s.production_sha is distinct from p->>'base_sha' or s.draft_sha is distinct from p->>'candidate_sha' then
   return jsonb_build_object('error','stale_or_changed_plan');
  end if;
  if s.draft_version is null or s.draft_summary is null then return jsonb_build_object('error','missing_version_metadata'); end if;
  n:=jsonb_array_length(p->'tasks');
  if n not between 2 and 100 then return jsonb_build_object('error','invalid_tasks'); end if;
  -- Additional defense; the trusted Python verifier checks file/recipe pins before calling.
  for t in select null::uuid, (ord-1)::integer, task, 'pending'::text, null::uuid,null::text,null::text,null::text
    from jsonb_array_elements(p->'tasks') with ordinality as e(task,ord)
  loop
   op:=t.task->>'op';
   rank:=array_position(array['backup','apply_sql','apply_scheduler','deploy_edge','verify_backend','publish_pages','verify_live'],op);
   if jsonb_typeof(t.task) is distinct from 'object' or rank is null or rank<last_rank
     or jsonb_typeof(t.task->'files') is distinct from 'array' or not (t.task ? 'edge_function')
     or (select count(*) from jsonb_object_keys(t.task))<>3 then return jsonb_build_object('error','invalid_task_order'); end if;
   last_rank:=rank; ops:=array_append(ops,op);
  end loop;
  if ops[n-1]<>'publish_pages' or ops[n]<>'verify_live'
    or cardinality(array_positions(ops,'publish_pages'))<>1 or cardinality(array_positions(ops,'verify_live'))<>1
    or (n>2 and (ops[1]<>'backup' or ops[n-2]<>'verify_backend'
      or cardinality(array_positions(ops,'backup'))<>1 or cardinality(array_positions(ops,'verify_backend'))<>1)) then
   return jsonb_build_object('error','missing_checkpoints');
  end if;
  select * into j from public.beagu_integrated_fixture_jobs_v1 where base_sha=p->>'base_sha' and candidate_sha=p->>'candidate_sha';
  if found then
   if j.plan_sha is distinct from p->>'plan_sha256' or j.recipe_sha is distinct from p->>'recipe_sha256'
    or j.approval_sha is distinct from p->>'approval_sha256' or
    (select jsonb_agg(task order by idx) from public.beagu_integrated_fixture_steps_v1 where job_id=j.id) is distinct from p->'tasks' then
    return jsonb_build_object('error','duplicate_candidate_conflict');
   end if;
   return jsonb_build_object('id',j.id);
  end if;
  if exists(select 1 from public.beagu_site_release_jobs_v1 where status in ('queued','running')) or
     exists(select 1 from public.beagu_integrated_fixture_jobs_v1 where status in ('queued','running','blocked','verified')) then
   return jsonb_build_object('error','active_release_exists');
  end if;
  insert into public.beagu_integrated_fixture_jobs_v1(base_sha,candidate_sha,plan_sha,recipe_sha,approval_sha,version,summary,task_count)
    values(p->>'base_sha',p->>'candidate_sha',p->>'plan_sha256',p->>'recipe_sha256',p->>'approval_sha256',s.draft_version,s.draft_summary,n) returning id into jid;
  insert into public.beagu_integrated_fixture_steps_v1(job_id,idx,task)
    select jid,(ord-1)::integer,task from jsonb_array_elements(p->'tasks') with ordinality as e(task,ord);
  return jsonb_build_object('id',jid);
 end if;
 if coalesce(p->>'job_id','') !~ '^[a-f0-9-]{36}$' then return jsonb_build_object('error','invalid_job_id'); end if;
 select * into j from public.beagu_integrated_fixture_jobs_v1 where id=(p->>'job_id')::uuid for update;
 if not found then return jsonb_build_object('error','unknown_job'); end if;
 if p_action='status' then
   return to_jsonb(j)||jsonb_build_object('scope','isolated_fixture_only','execution_enabled',false,'steps',
    (select jsonb_agg(to_jsonb(x)-'lease'-'worker_run'-'job_id' order by idx) from public.beagu_integrated_fixture_steps_v1 x where job_id=j.id));
 end if;
 -- Finalize is an isolated control-plane transaction, not a publication operation.
 -- The trusted caller must have independently verified all provider receipts first.
 if p_action='finalize' then
  if j.plan_sha is distinct from p->>'plan_sha256' or j.recipe_sha is distinct from p->>'recipe_sha256'
   or j.candidate_sha is distinct from p->>'candidate_sha' or coalesce(p->>'final_evidence','') !~ '^[0-9a-f]{64}$' then
   return jsonb_build_object('error','finalization_pin_mismatch');
  end if;
  if j.status='completed' then
   if j.final_evidence is distinct from p->>'final_evidence' then return jsonb_build_object('error','finalization_pin_mismatch'); end if;
   return jsonb_build_object('ok',true,'version',j.version,'candidate_sha',j.candidate_sha,'rehearsal',true);
  end if;
  if j.status<>'verified' or j.next_step<>j.task_count or s.production_sha is distinct from j.base_sha
   or s.draft_sha is distinct from j.candidate_sha or s.draft_version is distinct from j.version or s.draft_summary is distinct from j.summary
   or exists(select 1 from public.beagu_site_release_jobs_v1 where status in ('queued','running')) then
   return jsonb_build_object('error','finalization_not_ready');
  end if;
  if (select count(*) from public.beagu_integrated_fixture_steps_v1 where job_id=j.id and status='done' and evidence is not null)<>j.task_count
   or not exists(select 1 from public.beagu_integrated_fixture_steps_v1 where job_id=j.id and idx=j.task_count-1
    and task->>'op'='verify_live' and evidence=p->>'final_evidence') then
   return jsonb_build_object('error','final_evidence_mismatch');
  end if;
  if exists(select 1 from public.beagu_site_release_history_v1 where target='production' and version=j.version and to_sha<>j.candidate_sha) then
   return jsonb_build_object('error','version_already_used');
  end if;
  -- All changes are in the same transaction under release-state lock. A failure
  -- rolls back status, pointer and history together. The legacy trigger sees
  -- completed only within this transaction and cannot race the state row lock.
  update public.beagu_integrated_fixture_jobs_v1 set status='completed',final_evidence=p->>'final_evidence' where id=j.id;
  insert into public.beagu_site_release_jobs_v1(id,action,target,from_sha,to_sha,version,summary,status,finished_at)
   values(j.id,'prod_apply','production',j.base_sha,j.candidate_sha,j.version,j.summary,'deployed',now());
  insert into public.beagu_site_release_history_v1(job_id,target,action,version,summary,from_sha,to_sha)
   values(j.id,'production','prod_apply',j.version,j.summary,j.base_sha,j.candidate_sha);
  update public.beagu_site_release_state_v1 set production_sha=j.candidate_sha,production_version=j.version,updated_at=now() where id=1;
  return jsonb_build_object('ok',true,'version',j.version,'candidate_sha',j.candidate_sha,'rehearsal',true);
 end if;
 if s.production_sha is distinct from j.base_sha or s.draft_sha is distinct from j.candidate_sha then
  return jsonb_build_object('error','stale_or_changed_plan');
 end if;
 if p_action='claim' then
  if coalesce(p->>'worker_run','') !~ '^[0-9]{1,24}:[0-9]{1,8}$' then return jsonb_build_object('error','invalid_worker_run'); end if;
  if j.base_sha is distinct from p->>'observed_base' or j.candidate_sha is distinct from p->>'candidate_sha'
    or j.plan_sha is distinct from p->>'plan_sha256' or j.recipe_sha is distinct from p->>'recipe_sha256' then
   return jsonb_build_object('error','stale_or_changed_plan');
  end if;
  if j.status in ('verified','completed') then return jsonb_build_object('completed',true); end if;
  if j.status='blocked' then return jsonb_build_object('error','release_blocked'); end if;
  select * into t from public.beagu_integrated_fixture_steps_v1 where job_id=j.id and idx=j.next_step for update;
  if not found or t.status<>'pending' then return jsonb_build_object('error','step_already_claimed_or_uncertain'); end if;
  if (select count(*) from public.beagu_integrated_fixture_steps_v1 where job_id=j.id and idx<j.next_step and status='done')<>j.next_step then
   return jsonb_build_object('error','missing_prior_checkpoint');
  end if;
  lease_id:=gen_random_uuid();
  update public.beagu_integrated_fixture_steps_v1 set status='running',lease=lease_id,worker_run=p->>'worker_run' where job_id=j.id and idx=j.next_step;
  update public.beagu_integrated_fixture_jobs_v1 set status='running' where id=j.id;
  return jsonb_build_object('idx',j.next_step,'lease',lease_id,'task',t.task);
 elsif p_action='finish' then
  if j.status<>'running' or to_jsonb(j.next_step) is distinct from p->'idx' then return jsonb_build_object('error','stale_step_receipt'); end if;
  select * into t from public.beagu_integrated_fixture_steps_v1 where job_id=j.id and idx=j.next_step for update;
  if not found or t.status<>'running' or t.lease::text is distinct from p->>'lease' or t.worker_run is distinct from p->>'worker_run' or t.task is distinct from p->'task' then
   return jsonb_build_object('error','wrong_step_lease');
  end if;
  if p->>'evidence' is null then
   update public.beagu_integrated_fixture_steps_v1 set status='blocked',lease=null,worker_run=null,error='effect_uncertain_or_failed' where job_id=j.id and idx=j.next_step;
   update public.beagu_integrated_fixture_jobs_v1 set status='blocked' where id=j.id;
  else
   if p->>'evidence' !~ '^[0-9a-f]{64}$' then return jsonb_build_object('error','invalid_step_evidence'); end if;
   update public.beagu_integrated_fixture_steps_v1 set status='done',lease=null,worker_run=null,evidence=p->>'evidence' where job_id=j.id and idx=j.next_step;
   update public.beagu_integrated_fixture_jobs_v1 set next_step=j.next_step+1,
    status=case when j.next_step+1=j.task_count then 'verified' else 'running' end where id=j.id;
  end if;
  return jsonb_build_object('ok',true);
 end if;
 return jsonb_build_object('error','invalid_action');
exception when unique_violation then return jsonb_build_object('error','active_release_exists');
end $$;
revoke all on function public.beagu_integrated_fixture_transition_v1(text,jsonb) from public,anon,authenticated;
grant execute on function public.beagu_integrated_fixture_transition_v1(text,jsonb) to service_role;
