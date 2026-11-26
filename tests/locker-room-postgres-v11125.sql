\set ON_ERROR_STOP on
-- Fresh disposable PostgreSQL only. No production connections.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create table public.schools(school_id text primary key);
insert into public.schools values ('A123456');
\ir ../supabase/migrations/20261120_beagu_postit_school_conversations.sql
\ir ../supabase/migrations/20261120_beagu_postit_session_identity.sql
\ir ../supabase/migrations/20261120_beagu_postit_game_subjects.sql
\ir ../supabase/migrations/20261120_beagu_postit_comparison_subjects.sql
\ir ../supabase/migrations/20261120_beagu_postit_game_school_refs.sql
\ir ../supabase/migrations/20261121140000_beagu_postit_atomic_write.sql
insert into public.beagu_postit_posts(id,school_id,author_uid,body,subject_type,created_at)
values ('10000000-0000-4000-8000-000000000001','A123456','20000000-0000-4000-8000-000000000001','original','school',now()-interval '2 days');
insert into public.beagu_postit_comments(post_id,author_uid,body)
values ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','comment');
insert into public.beagu_postit_reactions(author_uid,target_type,target_id,kind)
values ('20000000-0000-4000-8000-000000000002','post','10000000-0000-4000-8000-000000000001','like');
create table if not exists public.beagu_admin_accounts(user_id uuid primary key,role text,enabled boolean);
\ir ../docs/v1.11.25-locker-room-schema-preview.sql
do $test$
declare a uuid:='20000000-0000-4000-8000-000000000001'; n uuid:='30000000-0000-4000-8000-000000000001'; result jsonb; original uuid:='10000000-0000-4000-8000-000000000001';
begin
 if not exists(select 1 from public.beagu_postit_posts where id=original and author_uid=a and school_id='A123456' and body='original' and status='published') then raise exception 'legacy post changed'; end if;
 if (select count(*) from public.beagu_postit_comments where post_id=original)<>1 or (select count(*) from public.beagu_postit_reactions where target_id=original)<>1 then raise exception 'legacy interaction changed'; end if;
 if has_table_privilege('anon','public.beagu_postit_posts','select') or has_table_privilege('authenticated','public.beagu_postit_posts','select') or not (select relrowsecurity from pg_class where oid='public.beagu_postit_posts'::regclass) then raise exception 'RLS / privilege regression'; end if;
 if has_function_privilege('anon','public.beagu_postit_create_post_v3(uuid,uuid,text,text,text,text,text)','execute') or has_function_privilege('authenticated','public.beagu_postit_create_post_v3(uuid,uuid,text,text,text,text,text)','execute') or not has_function_privilege('service_role','public.beagu_postit_create_post_v3(uuid,uuid,text,text,text,text,text)','execute') then raise exception 'RPC ACL regression'; end if;
 result:=public.beagu_postit_create_post_v3(a,n,'general',null,null,null,repeat('가',300));
 if result->>'id' is null or not exists(select 1 from public.beagu_postit_posts where id=(result->>'id')::uuid and author_uid=a and school_id is null and subject_type='general' and char_length(body)=300) then raise exception 'general create failed: %',result; end if;
 if public.beagu_postit_create_post_v3(a,n,'general',null,null,null,'retry')->>'replayed' is distinct from 'true' then raise exception 'idempotency'; end if;
 if public.beagu_postit_create_post_v3(a,gen_random_uuid(),'general',null,null,null,repeat('가',301))->>'error' is distinct from 'INVALID_POST' then raise exception 'length'; end if;
 if public.beagu_postit_create_post_v3(a,gen_random_uuid(),'general','A123456',null,null,'bad')->>'error' is distinct from 'INVALID_POST' then raise exception 'invalid tag'; end if;
 if public.beagu_postit_create_post_v3(a,gen_random_uuid(),'general',null,null,null,'cooldown')->>'error' is distinct from 'POST_RATE_LIMIT' then raise exception 'cooldown'; end if;
 result:=public.beagu_postit_create_post_v3('20000000-0000-4000-8000-000000000003',gen_random_uuid(),'school','A123456',null,null,'tagged');
 if result->>'id' is null or not exists(select 1 from public.beagu_postit_posts where id=(result->>'id')::uuid and school_id='A123456' and subject_type='school') then raise exception 'school tag'; end if;
 if public.beagu_postit_create_post_v2(a,gen_random_uuid(),'school','A123456',null,null,repeat('가',201))->>'error' is distinct from 'INVALID_POST' then raise exception 'legacy RPC changed'; end if;
 raise notice 'locker room schema checks passed';
end $test$;

-- Exact school count; hidden/removed/general rows never contribute.
insert into public.beagu_postit_posts(school_id,author_uid,body,subject_type,status)
values ('A123456',gen_random_uuid(),'hidden','school','hidden'),
 ('A123456',gen_random_uuid(),'removed','school','removed');
do $counts$
begin
 if (select post_count from public.beagu_postit_school_counts_v1(array['A123456'])) is distinct from 2::bigint
 then raise exception 'school count mismatch'; end if;
 if exists(select 1 from public.beagu_postit_school_counts_v1(array['Z999999'])) then raise exception 'unknown school count'; end if;
 if has_function_privilege('anon','public.beagu_postit_school_counts_v1(text[])','execute')
 or has_function_privilege('authenticated','public.beagu_postit_school_counts_v1(text[])','execute')
 or not has_function_privilege('service_role','public.beagu_postit_school_counts_v1(text[])','execute')
 then raise exception 'school count ACL'; end if;
end $counts$;

-- Synthetic owner only; nothing is configured in production.
insert into public.beagu_admin_accounts(user_id,role,enabled) values ('90000000-0000-4000-8000-000000000001','owner',true);
insert into public.beagu_locker_operator_v1(author_uid,admin_user_id) values('90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001');
do $nick$
declare p uuid; a uuid:='90000000-0000-4000-8000-000000000003'; op uuid:='90000000-0000-4000-8000-000000000002'; nick text; cn text; flag boolean;
begin
 insert into public.beagu_postit_posts(author_uid,subject_type,body,locker_nickname,locker_operator)
 values(a,'general','fixture','카리브해매너티',true) returning id,locker_nickname,locker_operator into p,nick,flag;
 if flag or nick not in ('아웃사이드 히터','아포짓 스파이커','미들 블로커','세터','리베로') then raise exception 'nickname spoof';end if;
 insert into public.beagu_postit_comments(post_id,author_uid,body) values(p,a,'same author') returning locker_nickname into cn;
 if cn is distinct from nick then raise exception 'alias consistency';end if;
 for i in 1..12 loop
  insert into public.beagu_postit_comments(post_id,author_uid,body) values(p,gen_random_uuid(),'different actor');
 end loop;
 if (select count(distinct nickname) from public.beagu_locker_aliases_v1 where post_id=p)<>13 then raise exception 'alias collision';end if;
 insert into public.beagu_postit_comments(post_id,author_uid,body) values(p,op,'operator') returning locker_nickname,locker_operator into cn,flag;
 if cn is distinct from '카리브해매너티' or flag is distinct from true then raise exception 'operator nickname';end if;
 update public.beagu_admin_accounts set enabled=false where user_id='90000000-0000-4000-8000-000000000001';
 begin
  insert into public.beagu_postit_comments(post_id,author_uid,body) values(p,op,'revoked operator');
  raise exception 'revoked binding accepted';
 exception when insufficient_privilege then null;
 end;
 if has_table_privilege('service_role','public.beagu_locker_operator_v1','insert') then raise exception 'untrusted binding write';end if;
 if exists(select 1 from public.beagu_postit_posts where body='original' and locker_nickname is not null) then raise exception 'legacy nickname rewritten';end if;
 if has_table_privilege('anon','public.beagu_locker_aliases_v1','select') or has_table_privilege('authenticated','public.beagu_locker_operator_v1','select') then raise exception 'private mapping exposed';end if;
end $nick$;

-- Exercise actual service_role privileges (not only postgres superuser).
-- The real admin migration grants SELECT to service_role; reproduce that ACL.
grant select on public.beagu_admin_accounts to service_role;
update public.beagu_admin_accounts set enabled=true where user_id='90000000-0000-4000-8000-000000000001';
set role service_role;
do $service$
declare p uuid; name1 text; name2 text; flag boolean; r jsonb;
begin
 r:=public.beagu_postit_create_post_v3('91000000-0000-4000-8000-000000000001',gen_random_uuid(),'general',null,null,null,'service role post');
 p:=(r->>'id')::uuid;
 select locker_nickname,locker_operator into name1,flag from public.beagu_postit_posts where id=p;
 if p is null or name1 is null or flag is distinct from false then raise exception 'service writer alias unavailable';end if;
 r:=public.beagu_postit_create_comment_v2('91000000-0000-4000-8000-000000000001',gen_random_uuid(),p,'same writer');
 select locker_nickname into name2 from public.beagu_postit_comments where id=(r->>'id')::uuid;
 if name2 is distinct from name1 then raise exception 'service writer thread alias mismatch';end if;
 r:=public.beagu_postit_create_comment_v2('90000000-0000-4000-8000-000000000002',gen_random_uuid(),p,'operator comment');
 select locker_nickname,locker_operator into name2,flag from public.beagu_postit_comments where id=(r->>'id')::uuid;
 if name2 is distinct from '카리브해매너티' or flag is distinct from true then raise exception 'operator service role mismatch';end if;
 begin
  update public.beagu_locker_operator_v1 set author_uid='91000000-0000-4000-8000-000000000001';
  raise exception 'service role changed operator binding';
 exception when insufficient_privilege then null; end;
end $service$;
reset role;
do $privacy$
begin
 if has_function_privilege('anon','public.beagu_locker_allocate_alias_v1(uuid,uuid)','execute')
 or has_function_privilege('authenticated','public.beagu_locker_allocate_alias_v1(uuid,uuid)','execute')
 or has_table_privilege('service_role','public.beagu_locker_aliases_v1','update')
 then raise exception 'alias privilege regression';end if;
 raise notice 'PASS service role actual RPC, thread consistency, operator binding and alias ACL';
end $privacy$;
