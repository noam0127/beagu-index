-- REVIEW ONLY; run exclusively after schema-draft.sql in a disposable database.
begin;
alter table public.arcade_run4_sessions_candidate
 add column school_id text check(school_id ~ '^[A-Z0-9]{7}$'),
 add column replay_seed bigint check(replay_seed between 0 and 4294967295);
create index arcade_run4_actor_window_candidate on public.arcade_run4_sessions_candidate(actor_hash,started_at);
create schema run4_internal_candidate;
revoke all on schema run4_internal_candidate from public,anon,authenticated;
grant usage on schema run4_internal_candidate to service_role;
create function run4_internal_candidate.start_session(p_id uuid,p_actor text,p_school text,p_tier text,p_seed bigint,p_started timestamptz)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if p_actor is null or p_actor !~ '^[0-9a-f]{64}$' or p_school is null or p_school !~ '^[A-Z0-9]{7}$' or p_seed is null or p_seed not between 0 and 4294967295 or p_started is null or abs(extract(epoch from (clock_timestamp()-p_started)))>60 then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor,0));
 if (select count(*) from public.arcade_run4_sessions_candidate where actor_hash=p_actor and started_at>clock_timestamp()-interval '15 minutes')>=40 then return false;end if;
 insert into public.arcade_run4_sessions_candidate(id,rules_version,difficulty,actor_hash,started_at,school_id,replay_seed)
 values(p_id,'4.0',p_tier,p_actor,p_started,p_school,p_seed) on conflict(id) do nothing;
 return found;
end $$;
create function run4_internal_candidate.save_verified(p_id uuid,p_actor text,p_result jsonb)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.arcade_run4_sessions_candidate%rowtype; v_score integer; v_base integer; v_seconds integer; v_win boolean; v_multiplier integer; v_bosses integer;
begin
 select * into s from public.arcade_run4_sessions_candidate where id=p_id and actor_hash=p_actor for update;
 if not found or s.replay_seed is null or s.school_id is null or s.started_at<clock_timestamp()-interval '1 hour' or s.started_at>clock_timestamp()-interval '1 second' then return false;end if;
 if p_result is null or p_result->>'game' is distinct from 'teacher_run_retirement_v4' or p_result->>'version' is distinct from '4.0' or p_result->>'difficulty' is distinct from s.difficulty then return false;end if;
 v_score=(p_result->>'score')::integer;v_base=(p_result->>'baseScore')::integer;v_seconds=(p_result->>'survivalSeconds')::integer;v_win=(p_result->>'victory')::boolean;
 v_bosses=jsonb_array_length(p_result->'bossIds');
 v_multiplier=case s.difficulty when 'easy' then 10 when 'normal' then 15 when 'hard' then 20 when 'very_hard' then 22 else 24 end;
 if v_seconds is null or v_seconds not between 0 and 190 or v_seconds>floor(extract(epoch from clock_timestamp()-s.started_at))+1 or v_win is distinct from (v_seconds=190) or v_base is null or v_base not between 0 and least(200000,4000+v_seconds*1000) or v_score is distinct from floor(v_base::numeric*v_multiplier*(case when v_win then 2 else 1 end)/10)::integer then return false;end if;
 insert into public.arcade_run4_records_candidate(session_id,score,base_score,survival_seconds,victory,boss_count,result,verification_status,verified_at)
 values(p_id,v_score,v_base,v_seconds,v_win,v_bosses,p_result,'verified',clock_timestamp()) on conflict(session_id) do nothing;
 return found;
end $$;
revoke all on function run4_internal_candidate.start_session(uuid,text,text,text,bigint,timestamptz),run4_internal_candidate.save_verified(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function run4_internal_candidate.start_session(uuid,text,text,text,bigint,timestamptz),run4_internal_candidate.save_verified(uuid,text,jsonb) to service_role;
commit;
