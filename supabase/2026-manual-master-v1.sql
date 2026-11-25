-- Candidate only. All writes are owner MFA and service role restricted.
begin;
create table if not exists beagu_private.master_2026_batches_v1(
 id bigint generated always as identity primary key, source_version text not null,
 payload_sha text not null, actor uuid not null, created_at timestamptz not null default clock_timestamp(),
 entries jsonb not null, question_refs jsonb not null default '[]'::jsonb, unique(source_version,payload_sha)
);
alter table beagu_private.master_2026_batches_v1 add column if not exists question_refs jsonb not null default '[]'::jsonb;
create table if not exists beagu_private.master_2026_pointer_v1(
 singleton boolean primary key check(singleton),batch_id bigint references beagu_private.master_2026_batches_v1(id)
);
create table if not exists beagu_private.master_2026_history_v1(
 id bigint generated always as identity primary key,actor uuid not null,
 old_batch bigint,new_batch bigint,changed_at timestamptz not null default clock_timestamp()
);
alter table beagu_private.master_2026_batches_v1 enable row level security;
alter table beagu_private.master_2026_pointer_v1 enable row level security;
alter table beagu_private.master_2026_history_v1 enable row level security;
revoke all on beagu_private.master_2026_batches_v1,beagu_private.master_2026_pointer_v1,beagu_private.master_2026_history_v1 from public,anon,authenticated;
grant select,insert on beagu_private.master_2026_batches_v1,beagu_private.master_2026_history_v1 to service_role;
grant select,insert,update on beagu_private.master_2026_pointer_v1 to service_role;
grant usage,select on sequence beagu_private.master_2026_batches_v1_id_seq,beagu_private.master_2026_history_v1_id_seq to service_role;
-- All checks are against the same stored aggregate and existing verified basis. No inferred privacy approval.
create or replace view beagu_private.master_2026_question_eligible_v1 with(security_invoker=true) as
 select r.school_id,r.payload_sha256,r.updated_at,b.updated_at as basis_updated_at
 from public.beagu_2026_results_snapshot r
 join beagu_private.beagu_2026_publication_basis_review b on b.school_id=r.school_id and b.payload_sha256=r.payload_sha256
 join beagu_private.beagu_2026_auto_review_status t on t.school_id=r.school_id and t.survey_year=2026
 where r.school_match_status='EXACT_REGION_OFFICE_NAME' and r.school_response_rows>=1
 and r.payload_sha256 ~ '^[a-f0-9]{64}$'
 and r.approval_status in ('WITHHELD','APPROVED')
 and jsonb_typeof(r.questions)='array'
 and not exists(select 1 from jsonb_array_elements(r.questions) q where coalesce((q->>'invalid')::integer,1)>0)
 and t.source_spreadsheet_id='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4'
 and t.technical_status='TECHNICAL_CHECK_PASSED' and t.matching_core_questions=13 and t.verified_catalog_questions=13
 and t.checked_at>=r.source_snapshot_at and t.source_response_rows=r.school_response_rows
 and b.review_status='VERIFIED' and b.reviewed_at>=r.source_snapshot_at and b.reviewed_at>=r.updated_at
 and b.notice_effective_at<=r.source_snapshot_at
 and b.distinct_respondents_reviewed and b.personal_data_reviewed and b.small_sample_reviewed and b.reidentification_reviewed and b.prior_data_combination_reviewed
 and not exists(select 1 from beagu_private.beagu_2026_civic_publication_hold h where h.school_id=r.school_id and (h.active or h.updated_at>=b.reviewed_at))
 and not exists(select 1 from beagu_private.beagu_2026_auto_exception x where x.school_id=r.school_id);
revoke all on beagu_private.master_2026_question_eligible_v1 from public,anon,authenticated;
grant select on beagu_private.master_2026_question_eligible_v1 to service_role;
-- Candidate function signature remains backward-compatible for CSV-only callers.
create or replace function public.beagu_2026_master_publish_v1(p_actor uuid,p_session uuid,p_version text,p_rows jsonb,p_question_refs jsonb default '[]'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $master$
declare n int; matched int; eligible int; v_entries jsonb; v_refs jsonb; v_question_count int; old_id bigint; new_id bigint; v_sha text;
begin
 if not exists(select 1 from public.beagu_admin_accounts where user_id=p_actor and role='owner' and enabled) or not coalesce(public.beagu_admin_active_mfa_session(p_actor,p_session),false) then raise exception 'owner MFA required';end if;
 if p_version is null or length(p_version) not between 8 and 160 or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'invalid master';end if;
 n:=jsonb_array_length(p_rows);
 if n not between 1 and 7000 then raise exception 'invalid count';end if;
 if exists(select 1 from jsonb_array_elements(p_rows) x where jsonb_typeof(x)<>'object' or not(x ?& array['school_id','observations','sum_units','percentile']) or (x-array['school_id','observations','sum_units','percentile'])<>'{}'::jsonb or x->>'school_id' !~ '^[A-Z0-9]{7}$' or jsonb_typeof(x->'observations')<>'number' or jsonb_typeof(x->'sum_units')<>'number' or jsonb_typeof(x->'percentile')<>'number') then raise exception 'invalid row';end if;
 if (select count(distinct x->>'school_id') from jsonb_array_elements(p_rows)x)<>n then raise exception 'duplicate school';end if;
 if exists(select 1 from jsonb_to_recordset(p_rows) r(school_id text,observations numeric,sum_units numeric,percentile numeric) where observations not between 1 and 10000 or observations<>trunc(observations) or sum_units<0 or sum_units<>trunc(sum_units) or sum_units>36036000*observations or percentile not between 0 and 100 or percentile<>round(percentile,1)) then raise exception 'invalid numbers';end if;
 if exists(with scores as (select *,rank() over(order by sum_units*1.000000000000000000000000000000000000/observations) as rnk from jsonb_to_recordset(p_rows) r(school_id text,observations numeric,sum_units numeric,percentile numeric)) select 1 from scores where percentile<>case when n=1 then 0 else round(100::numeric*(rnk-1)/(n-1),1) end) then raise exception 'rank mismatch';end if;
 perform pg_advisory_xact_lock(2026,11117);
 select batch_id into old_id from beagu_private.master_2026_pointer_v1 where singleton for update;
 with f as (select * from jsonb_to_recordset(p_rows) r(school_id text,observations integer,sum_units numeric,percentile numeric)),
 exact as (select f.school_id,f.percentile as displayed,a.percentile,a.valid_observation_count,a.updated_at,a.eligible_since,a.scope_ok,a.structure_ok,a.exact_evidence_ok,a.held from f join beagu_private.beagu_2026_auto_preflight a on a.school_id=f.school_id and a.source_version=p_version and round(a.percentile,1)=f.percentile and a.valid_observation_count=f.observations)
 select count(*),count(*) filter(where scope_ok and structure_ok and exact_evidence_ok and not held),coalesce(jsonb_agg(jsonb_build_object('school_id',school_id,'displayed',displayed,'percentile',percentile,'observations',valid_observation_count,'updated_at',updated_at,'eligible_since',eligible_since) order by school_id) filter(where scope_ok and structure_ok and exact_evidence_ok and not held),'[]'::jsonb) into matched,eligible,v_entries from exact;
 if matched<>n or eligible=0 then raise exception 'source mismatch or no eligible evidence';end if;
 if jsonb_typeof(p_question_refs) is distinct from 'array' or jsonb_array_length(p_question_refs)>n then raise exception 'invalid question references';end if;
 if exists(select 1 from jsonb_array_elements(p_question_refs) x where jsonb_typeof(x)<>'object' or not(x ?& array['school_id','payload_sha256']) or (x-array['school_id','payload_sha256'])<>'{}'::jsonb or coalesce(x->>'school_id','') !~ '^[A-Z0-9]{7}$' or coalesce(x->>'payload_sha256','') !~ '^[a-f0-9]{64}$' or not exists(select 1 from jsonb_array_elements(p_rows) y where y->>'school_id'=x->>'school_id')) then raise exception 'invalid question reference';end if;
 if (select count(distinct x->>'school_id') from jsonb_array_elements(p_question_refs)x)<>jsonb_array_length(p_question_refs) then raise exception 'duplicate question reference';end if;
 -- Incorrect/stale snapshot hash rejects the entire upload before the pointer changes.
 if exists(select 1 from jsonb_to_recordset(p_question_refs) q(school_id text,payload_sha256 text) where not exists(select 1 from public.beagu_2026_results_snapshot r where r.school_id=q.school_id and r.payload_sha256=q.payload_sha256)) then raise exception 'question snapshot changed';end if;
 select coalesce(jsonb_agg(jsonb_build_object('school_id',q.school_id,'payload_sha256',q.payload_sha256,'updated_at',v.updated_at,'basis_updated_at',v.basis_updated_at) order by q.school_id),'[]'::jsonb),count(*)
 into v_refs,v_question_count from jsonb_to_recordset(p_question_refs) q(school_id text,payload_sha256 text)
 join beagu_private.master_2026_question_eligible_v1 v using(school_id,payload_sha256)
 where exists(select 1 from jsonb_array_elements(v_entries) e where e->>'school_id'=q.school_id);
 v_sha:=pg_catalog.encode(extensions.digest(jsonb_build_object('rows',p_rows,'question_refs',p_question_refs)::text,'sha256'),'hex');
 insert into beagu_private.master_2026_batches_v1(source_version,payload_sha,actor,entries,question_refs) values(p_version,v_sha,p_actor,v_entries,v_refs) on conflict(source_version,payload_sha) do nothing returning id into new_id;
 if new_id is null then
  select id into new_id from beagu_private.master_2026_batches_v1 where source_version=p_version and payload_sha=v_sha and entries=v_entries and question_refs=v_refs;
  if new_id is null or old_id is distinct from new_id then raise exception 'existing batch requires explicit restore';end if;
  return jsonb_build_object('ok',true,'batch_id',new_id,'eligible',eligible,'blocked',n-eligible,'question_eligible',v_question_count,'question_blocked',jsonb_array_length(p_question_refs)-v_question_count,'duplicate',true);
 end if;
 insert into beagu_private.master_2026_pointer_v1(singleton,batch_id) values(true,new_id) on conflict(singleton) do update set batch_id=excluded.batch_id;
 insert into beagu_private.master_2026_history_v1(actor,old_batch,new_batch) values(p_actor,old_id,new_id);
 return jsonb_build_object('ok',true,'batch_id',new_id,'previous_batch',old_id,'eligible',eligible,'blocked',n-eligible,'question_eligible',v_question_count,'question_blocked',jsonb_array_length(p_question_refs)-v_question_count);
end $master$;
create or replace function public.beagu_2026_master_restore_v1(p_actor uuid,p_session uuid,p_batch bigint,p_expected bigint)
returns jsonb language plpgsql security invoker set search_path='' as $restore$
declare old_id bigint;
begin
 if not exists(select 1 from public.beagu_admin_accounts where user_id=p_actor and role='owner' and enabled) or not coalesce(public.beagu_admin_active_mfa_session(p_actor,p_session),false) then raise exception 'owner MFA required';end if;
 perform pg_advisory_xact_lock(2026,11117);
 select batch_id into old_id from beagu_private.master_2026_pointer_v1 where singleton for update;
 if not found or old_id is distinct from p_expected or (p_batch is not null and not exists(select 1 from beagu_private.master_2026_batches_v1 where id=p_batch)) then raise exception 'stale restore';end if;
 update beagu_private.master_2026_pointer_v1 set batch_id=p_batch where singleton;
 insert into beagu_private.master_2026_history_v1(actor,old_batch,new_batch) values(p_actor,old_id,p_batch);
 return jsonb_build_object('ok',true,'batch_id',p_batch);
end $restore$;
create or replace function public.beagu_2026_master_values_v1(p_ids text[],p_level integer)
returns jsonb language sql stable security invoker set search_path='' as $values$
 select coalesce(jsonb_object_agg(a.school_id,r.displayed),'{}'::jsonb)
 from beagu_private.master_2026_pointer_v1 s join beagu_private.master_2026_batches_v1 b on b.id=s.batch_id
 cross join lateral jsonb_to_recordset(b.entries) r(school_id text,displayed numeric,percentile numeric,observations integer,updated_at timestamptz,eligible_since timestamptz)
 join beagu_private.beagu_2026_auto_preflight a on a.school_id=r.school_id and a.source_version=b.source_version and a.percentile=r.percentile and a.valid_observation_count=r.observations and a.updated_at=r.updated_at and a.eligible_since=r.eligible_since
 where s.singleton and p_level in (1,2) and cardinality(p_ids) between 1 and 20 and a.school_id=any(p_ids)
 and a.scope_ok and a.structure_ok and a.exact_evidence_ok and not a.held
 and not exists(select 1 from beagu_private.beagu_2026_level_release_approvals l where l.access_level=p_level and (not coalesce(l.approved,false) or l.updated_at>=b.created_at))
 and not exists(select 1 from beagu_private.beagu_2026_percentile_v13_decisions d where d.school_id=a.school_id and d.access_level=p_level and (d.decision='REVOKE' or d.decided_at>=b.created_at));
$values$;
-- Same active batch and dynamic protection checks for detail. Never return Q31/Q51.
create or replace function public.beagu_2026_master_questions_v1(p_school_id text,p_level integer)
returns jsonb language sql stable security invoker set search_path='' as $questions$
 select (select coalesce(jsonb_agg(q.value order by q.ordinality),'[]'::jsonb) from jsonb_array_elements(r.questions) with ordinality q(value,ordinality) where q.value->>'id' not in ('Q31','Q51'))
 from beagu_private.master_2026_pointer_v1 p join beagu_private.master_2026_batches_v1 b on b.id=p.batch_id
 cross join lateral jsonb_to_recordset(b.question_refs) f(school_id text,payload_sha256 text,updated_at timestamptz,basis_updated_at timestamptz)
 join beagu_private.master_2026_question_eligible_v1 v on v.school_id=f.school_id and v.payload_sha256=f.payload_sha256 and v.updated_at=f.updated_at and v.basis_updated_at=f.basis_updated_at
 join public.beagu_2026_results_snapshot r on r.school_id=f.school_id and r.payload_sha256=f.payload_sha256
 where p.singleton and p_level in (1,2) and f.school_id=p_school_id
 and public.beagu_2026_master_values_v1(array[p_school_id],p_level) ? p_school_id
 and not exists(select 1 from beagu_private.beagu_2026_level_release_approvals l where l.access_level=p_level and (not coalesce(l.approved,false) or l.updated_at>=b.created_at));
$questions$;
revoke all on function public.beagu_2026_master_questions_v1(text,integer) from public,anon,authenticated;
grant execute on function public.beagu_2026_master_questions_v1(text,integer) to service_role;
revoke all on function public.beagu_2026_master_publish_v1(uuid,uuid,text,jsonb,jsonb),public.beagu_2026_master_restore_v1(uuid,uuid,bigint,bigint),public.beagu_2026_master_values_v1(text[],integer) from public,anon,authenticated;
grant execute on function public.beagu_2026_master_publish_v1(uuid,uuid,text,jsonb,jsonb),public.beagu_2026_master_restore_v1(uuid,uuid,bigint,bigint),public.beagu_2026_master_values_v1(text[],integer) to service_role;
commit;
