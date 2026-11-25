-- Synthetic verified and pending fixture. Direct service role writes here are test-only.
set role service_role;
insert into public.arcade_run4_sessions_candidate(id,rules_version,difficulty,actor_hash,school_id,replay_seed)
values ('00000000-0000-4000-8000-000000000020','4.0','hard',repeat('a',64),'1234567',42),
('00000000-0000-4000-8000-000000000021','4.0','hard',repeat('b',64),'1234567',43);
insert into public.arcade_run4_records_candidate(session_id,score,base_score,survival_seconds,victory,boss_count,result,verification_status,verified_at)
values ('00000000-0000-4000-8000-000000000020',400,100,190,true,5,'{"hits":0,"secret":"not public"}','verified',now()),
('00000000-0000-4000-8000-000000000021',800,200,190,true,5,'{"hits":0}','pending',null);
do $$ begin
if (select count(*) from public.beagu_arcade_archive_v11115 where game='teacher_run_retirement_v4')<>1 then raise exception 'verified only';end if;
if jsonb_array_length(public.beagu_arcade_history_v11115('teacher_run_retirement',null,1))<>2 then raise exception 'combined history';end if;
if (select count(*) from jsonb_array_elements(public.beagu_arcade_history_v11115('teacher_run_retirement',null,1)) r where r->>'version'='4.0' and r->>'schoolName'='동명초' and not (r->'details' ? 'secret'))<>1 then raise exception 'school name or allowlist';end if;
end $$;
update public.arcade_run4_records_candidate set verification_status='verified',verified_at=now() where session_id='00000000-0000-4000-8000-000000000021';
do $$ begin
if (select count(*) from public.beagu_arcade_archive_v11115 where game='teacher_run_retirement_v4')<>2 then raise exception 'verification transition';end if;
end $$;
reset role;
set role anon;
do $$ begin
if (select points from public.beagu_school_game_points(array['1234567']))<>1503 then raise exception 'school points old+new';end if;
end $$;
reset role;
