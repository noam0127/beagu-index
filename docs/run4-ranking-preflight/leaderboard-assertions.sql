-- Disposable PostgreSQL only, after schema/store/edge/leaderboard drafts.
do $$ begin
 if has_function_privilege('anon','public.run4_candidate_list(text,text)','EXECUTE') or has_function_privilege('authenticated','public.run4_candidate_list(text,text)','EXECUTE') then raise exception 'public RPC access';end if;
end $$;
set role service_role;
insert into public.arcade_run4_sessions_candidate(id,rules_version,difficulty,actor_hash,started_at,school_id,replay_seed)
values ('88888888-8888-4888-8888-888888888888','4.0','easy',repeat('a',64),clock_timestamp()-interval '200 seconds','1234567',42),
('99999999-9999-4999-8999-999999999999','4.0','hard',repeat('b',64),clock_timestamp()-interval '200 seconds','1234567',42);
insert into public.arcade_run4_records_candidate(session_id,score,base_score,survival_seconds,victory,boss_count,result,verification_status,verified_at)
values ('88888888-8888-4888-8888-888888888888',17626,8813,190,true,5,'{}','verified',clock_timestamp()),
('99999999-9999-4999-8999-999999999999',900000,1000,190,true,5,'{}','pending',null);
do $$ declare rows jsonb;begin
 rows:=public.run4_candidate_list('easy','all_bosses');
 if jsonb_array_length(rows)<>1 or (rows->0->>'score')::integer<>17626 then raise exception 'wrong leaderboard';end if;
 if (rows->0) ?| array['session_id','actor_hash','school_id','result','replay_seed'] then raise exception 'private fields';end if;
 if jsonb_array_length(public.run4_candidate_list('hard','all'))<>0 then raise exception 'pending leak';end if;
 if jsonb_array_length(public.run4_candidate_list('all','retired'))<>1 then raise exception 'retired filter';end if;
 if jsonb_array_length(public.run4_candidate_list('invalid','all'))<>0 then raise exception 'invalid filter';end if;
 raise notice 'PASS RUN4_BOARD verified only, rank filters, private fields and role grants';
end $$;
reset role;
