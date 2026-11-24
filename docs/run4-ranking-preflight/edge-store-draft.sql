-- REVIEW ONLY, after schema-draft.sql and store-draft.sql in disposable PostgreSQL.
begin;
create table public.arcade_run4_attempts_candidate(
 id bigint generated always as identity primary key,
 session_id uuid not null references public.arcade_run4_sessions_candidate(id),
 actor_hash text not null,
 attempted_at timestamptz not null default clock_timestamp()
);
alter table public.arcade_run4_attempts_candidate enable row level security;
revoke all on public.arcade_run4_attempts_candidate from public,anon,authenticated,service_role;
grant select,insert on public.arcade_run4_attempts_candidate to service_role;
grant usage on sequence public.arcade_run4_attempts_candidate_id_seq to service_role;
create index arcade_run4_attempts_time_candidate on public.arcade_run4_attempts_candidate(attempted_at);
create index arcade_run4_attempts_actor_time_candidate on public.arcade_run4_attempts_candidate(actor_hash,attempted_at);
create function public.run4_candidate_claim(p_id uuid,p_actor text)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.arcade_run4_sessions_candidate%rowtype; day_start timestamptz; 
begin
 -- Fixed global lock serializes daily quota claims; failed replays count.
 perform pg_advisory_xact_lock(73114001);
 select * into s from public.arcade_run4_sessions_candidate where id=p_id and actor_hash=p_actor for update;
 if not found or s.replay_seed is null or s.started_at<clock_timestamp()-interval '1 hour' or s.started_at>clock_timestamp()-interval '1 second' or exists(select 1 from public.arcade_run4_records_candidate where session_id=p_id) then return false;end if;
 day_start:=date_trunc('day',clock_timestamp() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
 if (select count(*) from public.arcade_run4_attempts_candidate where attempted_at>=day_start)>=300
 or (select count(*) from public.arcade_run4_attempts_candidate where actor_hash=p_actor and attempted_at>=day_start)>=10
 or exists(select 1 from public.arcade_run4_attempts_candidate where session_id=p_id and attempted_at>clock_timestamp()-interval '30 seconds') then return false;end if;
 insert into public.arcade_run4_attempts_candidate(session_id,actor_hash) values(p_id,p_actor);
 return true;
end $$;
create function public.run4_candidate_start(p_id uuid,p_actor text,p_school text,p_tier text,p_seed bigint,p_started timestamptz)
returns boolean language sql security invoker set search_path=pg_catalog,public as $$ select run4_internal_candidate.start_session(p_id,p_actor,p_school,p_tier,p_seed,p_started) $$;
create function public.run4_candidate_get(p_id uuid)
returns jsonb language sql security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',s.id,'version',s.rules_version,'actor_hash',s.actor_hash,'school_id',s.school_id,'difficulty',s.difficulty,'started_at',s.started_at,'replay_seed',s.replay_seed,'submitted',exists(select 1 from public.arcade_run4_records_candidate r where r.session_id=s.id))
 from public.arcade_run4_sessions_candidate s where s.id=p_id and s.replay_seed is not null
$$;
create function public.run4_candidate_save(p_id uuid,p_actor text,p_result jsonb)
returns boolean language sql security invoker set search_path=pg_catalog,public as $$ select run4_internal_candidate.save_verified(p_id,p_actor,p_result) $$;
revoke all on function public.run4_candidate_start(uuid,text,text,text,bigint,timestamptz),public.run4_candidate_get(uuid),public.run4_candidate_claim(uuid,text),public.run4_candidate_save(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.run4_candidate_start(uuid,text,text,text,bigint,timestamptz),public.run4_candidate_get(uuid),public.run4_candidate_claim(uuid,text),public.run4_candidate_save(uuid,text,jsonb) to service_role;
commit;
