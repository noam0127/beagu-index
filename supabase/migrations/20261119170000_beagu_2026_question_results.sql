-- Private versioned aggregates; no respondent-level choices or free text.
create table public.beagu_2026_results_snapshot (
 school_id text primary key references public.schools(school_id),
 school_response_rows integer not null check(school_response_rows between 1 and 50000),
 school_match_status text not null check(school_match_status in ('EXACT_REGION_OFFICE_NAME','NEEDS_REVIEW')),
 questions jsonb not null check(jsonb_typeof(questions)='array'),
 payload_sha256 text not null, source_snapshot_at timestamptz not null,
 approval_status text not null default 'WITHHELD' check(approval_status in ('WITHHELD','APPROVED')),
 approved_by text, approved_at timestamptz, approval_evidence jsonb,
 approved_payload_sha256 text,
 updated_at timestamptz not null default now()
);
alter table public.beagu_2026_results_snapshot enable row level security;
revoke all on public.beagu_2026_results_snapshot from anon,authenticated;
grant select,insert,update,delete on public.beagu_2026_results_snapshot to service_role;
create table beagu_private.beagu_2026_results_sync (
 singleton boolean primary key default true check(singleton), snapshot_at timestamptz not null, totals jsonb not null
);
create table beagu_private.beagu_2026_results_approval_audit (
 id bigint generated always as identity primary key,school_id text not null,payload_sha256 text not null,
 action text not null, actor text not null,evidence jsonb not null, recorded_at timestamptz not null default now()
);
create or replace function public.beagu_2026_replace_results_snapshot(p_snapshot jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare s jsonb; h text; ts timestamptz; previous_ts timestamptz; n integer:=0;
begin
 if p_snapshot->>'source_spreadsheet_id'<>'1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4'
   or p_snapshot->>'official_start_day'<>'2026-11-01' or p_snapshot->>'schema_version'<>'1'
   or jsonb_typeof(p_snapshot->'schools')<>'array' then raise exception 'invalid snapshot'; end if;
 ts:=(p_snapshot->>'snapshot_at')::timestamptz;
 if ts is null or ts>now()+interval '5 minutes' then raise exception 'invalid timestamp'; end if;
 perform pg_advisory_xact_lock(2026,5017);
 select snapshot_at into previous_ts from beagu_private.beagu_2026_results_sync where singleton;
 if previous_ts is not null and ts<previous_ts then raise exception 'stale snapshot'; end if;
 for s in select value from jsonb_array_elements(p_snapshot->'schools') loop
   h:=encode(extensions.digest(s::text,'sha256'),'hex');
   insert into public.beagu_2026_results_snapshot as old
     (school_id,school_response_rows,school_match_status,questions,payload_sha256,source_snapshot_at)
   values (s->>'school_id',(s->>'school_response_rows')::integer,s->>'school_match_status',s->'questions',h,ts)
   on conflict(school_id) do update set
     school_response_rows=excluded.school_response_rows,school_match_status=excluded.school_match_status,
     questions=excluded.questions,payload_sha256=excluded.payload_sha256,source_snapshot_at=excluded.source_snapshot_at,
     approval_status=case when old.payload_sha256=excluded.payload_sha256 then old.approval_status else 'WITHHELD' end,
     approved_by=case when old.payload_sha256=excluded.payload_sha256 then old.approved_by end,
     approved_at=case when old.payload_sha256=excluded.payload_sha256 then old.approved_at end,
     approval_evidence=case when old.payload_sha256=excluded.payload_sha256 then old.approval_evidence end,
     approved_payload_sha256=case when old.payload_sha256=excluded.payload_sha256 then old.approved_payload_sha256 end,
     updated_at=case when old.payload_sha256=excluded.payload_sha256 then old.updated_at else now() end;
   n:=n+1;
 end loop;
 -- Full snapshot replacement also withdraws schools removed from the source.
 delete from public.beagu_2026_results_snapshot r where not exists
   (select 1 from jsonb_array_elements(p_snapshot->'schools') item(value) where item.value->>'school_id'=r.school_id);
 insert into beagu_private.beagu_2026_results_sync(singleton,snapshot_at,totals) values(true,ts,p_snapshot->'totals')
 on conflict(singleton) do update set snapshot_at=excluded.snapshot_at,totals=excluded.totals;
 return n;
end $$;
create or replace function public.beagu_2026_approve_results(p_school_id text,p_expected_sha256 text,p_actor text,p_evidence jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare r public.beagu_2026_results_snapshot; k text;
begin
 select * into strict r from public.beagu_2026_results_snapshot where school_id=p_school_id for update;
 if r.payload_sha256<>p_expected_sha256 or length(trim(p_actor))<2 then raise exception 'approval target mismatch'; end if;
 if r.school_match_status<>'EXACT_REGION_OFFICE_NAME' or exists(select 1 from jsonb_array_elements(r.questions) q where (q->>'invalid')::integer>0)
 then raise exception 'technical review unresolved'; end if;
 foreach k in array array['source_scoring','school_identity','duplicate_responses','consent','small_sample','reidentification','prior_data_combination'] loop
   if coalesce(length(trim(p_evidence->>k)),0)<10 then raise exception 'missing review evidence: %',k; end if;
 end loop;
 if coalesce(p_evidence->>'decision','')<>'APPROVE_EXACT_SNAPSHOT' then raise exception 'explicit approval required'; end if;
 -- Reapproving the same already approved version does not move its release time.
 if r.approval_status='APPROVED' and r.approved_payload_sha256=r.payload_sha256 then return; end if;
 update public.beagu_2026_results_snapshot set approval_status='APPROVED',approved_by=p_actor,approved_at=now(),
 approval_evidence=p_evidence,approved_payload_sha256=payload_sha256 where school_id=p_school_id;
 insert into beagu_private.beagu_2026_results_approval_audit(school_id,payload_sha256,action,actor,evidence)
 values(p_school_id,r.payload_sha256,'APPROVED',p_actor,p_evidence);
end $$;
create or replace function public.beagu_2026_released_question_results(p_school_id text)
returns jsonb language sql stable security definer set search_path='' as $$
 select questions from public.beagu_2026_results_snapshot r where school_id=p_school_id
 and approval_status='APPROVED' and approved_payload_sha256=payload_sha256
 and approved_at<=now()-interval '24 hours' and approved_at>=updated_at
 and school_match_status='EXACT_REGION_OFFICE_NAME' and length(trim(approved_by))>=2
 and approval_evidence->>'decision'='APPROVE_EXACT_SNAPSHOT'
 and not exists(select 1 from unnest(array['source_scoring','school_identity','duplicate_responses','consent','small_sample','reidentification','prior_data_combination']) k
 where coalesce(length(trim(approval_evidence->>k)),0)<10)
 and not exists(select 1 from jsonb_array_elements(questions) q where (q->>'invalid')::integer>0)
$$;
revoke all on function public.beagu_2026_replace_results_snapshot(jsonb) from public,anon,authenticated;
revoke all on function public.beagu_2026_approve_results(text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.beagu_2026_released_question_results(text) from public,anon,authenticated;
grant execute on function public.beagu_2026_replace_results_snapshot(jsonb) to service_role;
grant execute on function public.beagu_2026_approve_results(text,text,text,jsonb) to service_role;
grant execute on function public.beagu_2026_released_question_results(text) to service_role;
