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
 if public.beagu_postit_create_post_v3(a,n,'general',null,null,null,'retry')->>'replayed'<>'true' then raise exception 'idempotency'; end if;
 if public.beagu_postit_create_post_v3(a,gen_random_uuid(),'general',null,null,null,repeat('가',301))->>'error'<>'INVALID_POST' then raise exception 'length'; end if;
 if public.beagu_postit_create_post_v3(a,gen_random_uuid(),'general','A123456',null,null,'bad')->>'error'<>'INVALID_POST' then raise exception 'invalid tag'; end if;
 if public.beagu_postit_create_post_v3(a,gen_random_uuid(),'general',null,null,null,'cooldown')->>'error'<>'POST_RATE_LIMIT' then raise exception 'cooldown'; end if;
 result:=public.beagu_postit_create_post_v3('20000000-0000-4000-8000-000000000003',gen_random_uuid(),'school','A123456',null,null,'tagged');
 if result->>'id' is null or not exists(select 1 from public.beagu_postit_posts where id=(result->>'id')::uuid and school_id='A123456' and subject_type='school') then raise exception 'school tag'; end if;
 if public.beagu_postit_create_post_v2(a,gen_random_uuid(),'school','A123456',null,null,repeat('가',201))->>'error'<>'INVALID_POST' then raise exception 'legacy RPC changed'; end if;
 raise notice 'locker room schema checks passed';
end $test$;
