set role service_role;
insert into public.arcade_game_scores(session_id,game,score,school_id,school_name,public_result) values
('00000000-0000-4000-8000-000000000010','volleyball_25',1,'1234567','동명초','{"outcome":"defeat"}'),
('00000000-0000-4000-8000-000000000011','volleyball_25',2,'1234567','동명초','{"outcome":"stopped"}');
insert into public.arcade_game_scores(session_id,game,score,school_id,school_name,public_result) values
('00000000-0000-4000-8000-000000000010','volleyball_25',1,'1234567','동명초','{"outcome":"defeat"}') on conflict do nothing;
do $$ begin
if (select count(*) from public.beagu_arcade_archive_v11115 where game='volleyball_25')<>4 then raise exception 'archive or dedup';end if;
if (select count(*) from public.arcade_game_scores where game='volleyball_25')<>2 then raise exception 'pruning changed';end if;
if (select count(*) from public.beagu_arcade_archive_v11115 where outcome='defeat')<>1 then raise exception 'defeat duplicate';end if;
if jsonb_array_length(public.beagu_arcade_history_v11115('volleyball_25',null,1))<>4 then raise exception 'history';end if;
if (select count(*) from jsonb_array_elements(public.beagu_arcade_school_rank_v11115('volleyball_25')) r where r->>'school_id'='1234567' and r->>'losses'='1' and r->>'stopped'='1')<>1 then raise exception 'school outcomes';end if;
end $$;
reset role;
do $$ begin
if has_table_privilege('anon','public.beagu_arcade_archive_v11115','select') or has_function_privilege('anon','public.beagu_arcade_history_v11115(text,text,integer)','execute') then raise exception 'private archive exposed';end if;
end $$;
