\set ON_ERROR_STOP on
set role service_role;
do $$ declare rows jsonb; begin
 rows:=public.beagu_run_unified_records_v11120(null,1,true);
 if jsonb_array_length(rows)<>3 or rows#>>'{0,score}'<>'800' or rows#>>'{2,score}'<>'200' then raise exception 'combined ranking incorrect: %',rows;end if;
 if exists(select 1 from jsonb_array_elements(rows) e where e ? 'session_id' or e ? 'version' or e->'details' ? 'secret') then raise exception 'private field exposed';end if;
 if jsonb_array_length(public.beagu_run_unified_records_v11120('easy',1,false))<>0 then raise exception 'filter';end if;
 if jsonb_array_length(public.beagu_run_unified_records_v11120(null,5,false))<>0 then raise exception 'page boundary';end if;
end $$;
update public.arcade_run4_records_candidate set verification_status='rejected',verified_at=null where session_id='00000000-0000-4000-8000-000000000021';
do $$ begin
 if jsonb_array_length(public.beagu_run_unified_records_v11120(null,1,true))<>2 then raise exception 'revoked row leaked';end if;
 if (select count(*) from public.beagu_arcade_archive_v11115 where game='teacher_run_retirement_v4')<>2 then raise exception 'archive data lost';end if;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.beagu_run_unified_records_v11120(text,integer,boolean)','execute') or has_function_privilege('authenticated','public.beagu_run_unified_records_v11120(text,integer,boolean)','execute') then raise exception 'direct RPC grant';end if;
end $$;
