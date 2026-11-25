set role service_role;
insert into public.arcade_game_scores(session_id,game,score,school_id,school_name) values
 ('00000000-0000-4000-8000-000000000004','volleyball_25',10,'1234567','동명초'),
 ('00000000-0000-4000-8000-000000000005','teacher_run_retirement',20,'1234567','동명초');
-- The 10-point row was pruned immediately; attempting to replay it must not add points again.
insert into public.arcade_game_scores(session_id,game,score,school_id,school_name)
 values('00000000-0000-4000-8000-000000000004','volleyball_25',10,'1234567','동명초')
 on conflict(session_id) do nothing;
insert into public.arcade_game_scores(session_id,game,score,school_id,school_name)
 values('00000000-0000-4000-8000-000000000006','teacher_run_retirement_v4',9000,'1234567','동명초');
reset role;
do $$
begin
 if has_table_privilege('anon','public.beagu_school_game_point_receipts','select') or has_table_privilege('authenticated','public.beagu_school_game_point_receipts','select')
 or has_table_privilege('anon','public.beagu_school_game_point_totals','insert')
 or has_table_privilege('authenticated','public.beagu_school_game_point_totals','update')
 or has_function_privilege('anon','public.beagu_count_school_game_points()','execute') then raise exception 'public write or receipt exposure'; end if;
 if exists(select 1 from public.arcade_game_scores where session_id='00000000-0000-4000-8000-000000000004') then raise exception 'pruning fixture failed'; end if;
end $$;
set role anon;
do $$
begin
 if (select points from public.beagu_school_game_points(array['1234567']) )<>330 then raise exception 'point total should be 330'; end if;
 if (select points from public.beagu_school_game_points(array['7654321']) )<>500 then raise exception 'same-name school mixed'; end if;
 if (select points from public.beagu_school_game_points(array['1111111']))<>0 then raise exception 'zero total'; end if;
 if (select count(*) from public.beagu_school_game_points(array['1234567','1234567','invalid']))<>1 then raise exception 'invalid batch'; end if;
 if (select count(*) from public.beagu_school_game_points(array_fill('1234567'::text,array[41])))<>0 then raise exception 'overlarge batch'; end if;
end $$;
reset role;
