-- Disposable database only, after schema-draft.sql. Never run on production.
do $$
begin
 if has_table_privilege('anon','public.arcade_run4_sessions_candidate','SELECT')
 or has_table_privilege('authenticated','public.arcade_run4_records_candidate','INSERT')
 or has_table_privilege('anon','public.arcade_run4_verified_candidate','SELECT')
 or not has_table_privilege('service_role','public.arcade_run4_records_candidate','INSERT')
 then raise exception 'incorrect grants'; end if;
 if (select count(*) from pg_class where oid in ('public.arcade_run4_sessions_candidate'::regclass,'public.arcade_run4_records_candidate'::regclass) and relrowsecurity)<>2
 then raise exception 'RLS disabled';end if;
end $$;
set role service_role;
insert into public.arcade_run4_sessions_candidate(id,rules_version,difficulty,actor_hash)
values ('11111111-1111-4111-8111-111111111111','4.0','normal',repeat('a',64));
insert into public.arcade_run4_records_candidate(session_id,score,base_score,survival_seconds,victory,boss_count,result)
values ('11111111-1111-4111-8111-111111111111',3000,1000,190,true,5,'{}'::jsonb);
do $$
begin
 if exists(select 1 from public.arcade_run4_verified_candidate) then raise exception 'pending result visible';end if;
 begin
 insert into public.arcade_run4_records_candidate(session_id,score,base_score,survival_seconds,victory,boss_count,result)
 values ('11111111-1111-4111-8111-111111111111',3000,1000,190,true,5,'{}'::jsonb);
 raise exception 'duplicate accepted';
 exception when unique_violation then null;end;
 begin
 update public.arcade_run4_records_candidate set victory=false where session_id='11111111-1111-4111-8111-111111111111';
 raise exception 'invalid retirement accepted';
 exception when check_violation then null;end;
 begin
 update public.arcade_run4_records_candidate set verification_status='verified' where session_id='11111111-1111-4111-8111-111111111111';
 raise exception 'verified without timestamp accepted';
 exception when check_violation then null;end;
end $$;
-- Fixture emulates an authoritative verifier; this is not a real game proof.
update public.arcade_run4_records_candidate set verification_status='verified',verified_at=now()
where session_id='11111111-1111-4111-8111-111111111111';
do $$
begin
 if (select count(*) from public.arcade_run4_verified_candidate where rules_version='4.0' and difficulty='normal' and victory and boss_count=5)<>1
 then raise exception 'verified projection incorrect';end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='arcade_run4_verified_candidate' and column_name in ('session_id','actor_hash','result'))
 then raise exception 'private identifiers exposed';end if;
end $$;
reset role;
do $$
begin
 if (select count(*) from public.arcade_game_scores)<>1 then raise exception 'legacy row changed';end if;
 raise notice 'PASS run4 isolated schema, roles/RLS, duplicate rejection, verified-only projection, legacy preservation';
end $$;
