-- Disposable fixture only. Opaque synthetic lookup/verifier values.
do $$ begin
 if has_table_privilege('anon','public.beagu_lv3_accounts','select')
  or has_table_privilege('authenticated','public.beagu_lv3_accounts','insert')
  or has_function_privilege('anon','public.beagu_lv3_register_v1(text,text,text,text,text,timestamptz)','execute')
  or has_function_privilege('authenticated','public.beagu_lv3_register_v1(text,text,text,text,text,timestamptz)','execute')
  or not has_function_privilege('service_role','public.beagu_lv3_register_v1(text,text,text,text,text,timestamptz)','execute')
  or not (select relrowsecurity from pg_class where oid='public.beagu_lv3_accounts'::regclass)
 then raise exception 'unsafe grants'; end if;
end $$;
set role service_role;
do $$
declare a uuid; b uuid; source text;
begin
 foreach source in array array[repeat('c',64),repeat('d',64),repeat('e',64)] loop
   begin
    perform public.beagu_lv3_register_v1(source,repeat('1',64),repeat('2',64),repeat('3',64),repeat('f',64),now()+interval '1 hour');
    raise exception 'invalid session accepted';
   exception when invalid_authorization_specification then null; end;
 end loop;
 a:=public.beagu_lv3_register_v1(repeat('a',64),repeat('1',64),repeat('2',64),repeat('3',64),repeat('f',64),now()+interval '1 hour');
 begin
  perform public.beagu_lv3_register_v1(repeat('b',64),repeat('1',64),repeat('4',64),repeat('5',64),repeat('9',64),now()+interval '1 hour');
  raise exception 'duplicate lookup accepted';
 exception when unique_violation then null; end;
 if exists(select 1 from public.beagu_level_sessions where token_sha256=repeat('9',64)) then raise exception 'duplicate left a session'; end if;
 b:=public.beagu_lv3_register_v1(repeat('b',64),repeat('6',64),repeat('4',64),repeat('5',64),repeat('9',64),now()+interval '1 hour');
 if a=b or (select count(*) from public.beagu_lv3_accounts)<>2 then raise exception 'wrong accounts'; end if;
 begin
  perform public.beagu_lv3_register_v1(repeat('a',64),repeat('7',64),repeat('8',64),repeat('0',64),repeat('8',64),now()+interval '1 hour');
  raise exception 'duplicate visitor accepted';
 exception when unique_violation then null; end;
 if not exists(select 1 from public.beagu_level_sessions where token_sha256=repeat('f',64) and level3_account_id=a and access_level=2)
 or not exists(select 1 from public.beagu_level_sessions where token_sha256=repeat('9',64) and level3_account_id=b and access_level=2)
 then raise exception 'session binding failure'; end if;
 raise notice 'PASS: earned-only signup, duplicate username and visitor rejection, atomic session binding, restricted grants';
end $$;
