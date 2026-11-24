-- Isolated fixture only.
do $$ begin
 if has_function_privilege('anon','public.run4_candidate_claim(uuid,text)','EXECUTE') or has_function_privilege('authenticated','public.run4_candidate_save(uuid,text,jsonb)','EXECUTE') or has_table_privilege('anon','public.arcade_run4_attempts_candidate','SELECT') then raise exception 'public access';end if;
end $$;
set role service_role;
do $$
declare sid uuid:='66666666-6666-4666-8666-666666666666'; actor text:=repeat('f',64);
begin
 if not public.run4_candidate_start(sid,actor,'1234567','normal',42,clock_timestamp()) then raise exception 'session creation';end if;
 if public.run4_candidate_claim(sid,actor) then raise exception 'premature claim';end if;
 update public.arcade_run4_sessions_candidate set started_at=clock_timestamp()-interval '2 minutes' where id=sid;
 if public.run4_candidate_claim(sid,repeat('e',64)) then raise exception 'foreign claim';end if;
 if not public.run4_candidate_claim(sid,actor) then raise exception 'valid claim rejected';end if;
 if public.run4_candidate_claim(sid,actor) then raise exception 'concurrent claim accepted';end if;
 -- Isolated fixture seeds prior attempts to exercise daily limits, no live timing changes.
 insert into public.arcade_run4_attempts_candidate(session_id,actor_hash,attempted_at)
 select sid,actor,clock_timestamp() from generate_series(1,9);
 if public.run4_candidate_claim(sid,actor) then raise exception 'daily actor limit';end if;
 if (public.run4_candidate_get(sid)->>'replay_seed')::integer<>42 then raise exception 'seed missing';end if;
 insert into public.arcade_run4_attempts_candidate(session_id,actor_hash,attempted_at)
 select sid,repeat('e',64),clock_timestamp() from generate_series(1,290);
 if (select count(*) from public.arcade_run4_attempts_candidate)<>300 then raise exception 'fixture count';end if;
 if not public.run4_candidate_start('77777777-7777-4777-8777-777777777777',repeat('a',64),'1234567','normal',42,clock_timestamp()) then raise exception 'new session';end if;
 update public.arcade_run4_sessions_candidate set started_at=clock_timestamp()-interval '2 minutes' where id='77777777-7777-4777-8777-777777777777';
 if public.run4_candidate_claim('77777777-7777-4777-8777-777777777777',repeat('a',64)) then raise exception 'global limit';end if;
 raise notice 'PASS RUN4_EDGE_STORE service-only RPC, owner, cooldown, daily quota schema';
end $$;
reset role;
