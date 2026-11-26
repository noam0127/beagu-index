\set ON_ERROR_STOP on
-- Run after the verified locker schema regression; disposable DB only.
create schema if not exists beagu_private;
create table public.beagu_level_sessions(token_sha256 text primary key,access_level smallint not null,created_at timestamptz default now(),expires_at timestamptz not null,identity_campaign text,identity_visitor_id uuid);
create table beagu_private.fixture_earned(visitor_id uuid primary key,earned boolean not null);
create function public.beagu_has_earned_challenge_visitor(p_visitor uuid) returns boolean language sql stable security definer set search_path='' as $$select coalesce((select earned from beagu_private.fixture_earned where visitor_id=p_visitor),false)$$;
grant select,insert,update,delete on public.beagu_level_sessions to service_role;
\ir ../supabase/migrations/20261121103000_beagu_postit_member_auth.sql
\ir ../docs/level3-account-schema-preview.sql
\ir ../docs/v1.11.25-locker-lv3-auth-preview.sql
insert into auth.users(id) values ('a0000000-0000-4000-8000-000000000001');
insert into public.beagu_postit_member_accounts(auth_user_id,identity_visitor_id,author_uid) values ('a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001');
insert into beagu_private.fixture_earned values ('b0000000-0000-4000-8000-000000000001',true),('b0000000-0000-4000-8000-000000000002',true);
insert into public.beagu_level_sessions(token_sha256,access_level,expires_at,identity_campaign,identity_visitor_id) values
(repeat('a',64),2,now()+interval '1 hour','2026','b0000000-0000-4000-8000-000000000001'),
(repeat('b',64),2,now()+interval '1 hour','2026','b0000000-0000-4000-8000-000000000002'),
(repeat('c',64),1,now()+interval '1 hour','2026','b0000000-0000-4000-8000-000000000001');
set role service_role;
select public.beagu_lv3_register_v1(repeat('a',64),repeat('1',64),repeat('2',64),repeat('3',64),repeat('d',64),now()+interval '1 hour');
select public.beagu_lv3_register_v1(repeat('b',64),repeat('4',64),repeat('5',64),repeat('6',64),repeat('e',64),now()+interval '1 hour');
do $test$
declare a uuid; b uuid;
begin
 a:=public.beagu_locker_notification_actor_v1(repeat('d',64));
 b:=public.beagu_locker_notification_actor_v1(repeat('e',64));
 if a is null or b is null or a=b then raise exception 'Lv3 principal missing';end if;
 if public.beagu_locker_writer_v1(repeat('d',64)) is distinct from a then raise exception 'new account writer denied';end if;
 if public.beagu_locker_writer_v1(repeat('e',64)) is not null then raise exception 'legacy ownership bypass';end if;
 if b='20000000-0000-4000-8000-000000000001' then raise exception 'legacy author auto-claimed';end if;
 if public.beagu_locker_notification_actor_v1(repeat('a',64)) is not null or public.beagu_locker_notification_actor_v1(repeat('b',64)) is not null or public.beagu_locker_notification_actor_v1(repeat('c',64)) is not null or public.beagu_locker_notification_actor_v1('invalid') is not null then raise exception 'code-only read bypass';end if;
 if (select count(*) from public.beagu_level_sessions where token_sha256 in (repeat('a',64),repeat('b',64)) and access_level=2)<>2 then raise exception 'existing Lv2 lost';end if;
end $test$;
reset role;
-- Synthetic independently verified transfer only; never populate from code alone.
insert into beagu_private.beagu_locker_legacy_actor_links_v1(account_id,author_uid)
 select account_id,'20000000-0000-4000-8000-000000000001' from public.beagu_lv3_accounts where visitor_id='b0000000-0000-4000-8000-000000000002';
do $test$
declare a uuid; post_id uuid; adm uuid:='a0000000-0000-4000-8000-000000000001';
begin
 if public.beagu_locker_writer_v1(repeat('e',64)) is distinct from '20000000-0000-4000-8000-000000000001'::uuid then raise exception 'verified legacy ownership lost';end if;
 if not exists(select 1 from public.beagu_postit_posts where id='10000000-0000-4000-8000-000000000001' and author_uid='20000000-0000-4000-8000-000000000001' and body='original') then raise exception 'legacy row overwritten';end if;
 if has_function_privilege('anon','public.beagu_locker_writer_v1(text)','execute') or has_function_privilege('authenticated','public.beagu_locker_notification_actor_v1(text)','execute') or has_table_privilege('service_role','beagu_private.beagu_locker_legacy_actor_links_v1','insert') then raise exception 'private actor ACL';end if;
 a:=public.beagu_locker_writer_v1(repeat('d',64));
 insert into public.beagu_postit_posts(author_uid,subject_type,body) values(a,'general','moderation test') returning id into post_id;
 insert into public.beagu_postit_reactions(author_uid,target_type,target_id,kind) values('20000000-0000-4000-8000-000000000001','post',post_id,'report');
 insert into public.beagu_admin_accounts(user_id,role,enabled) values(adm,'owner',true);
 if public.beagu_postit_report_decide_v1('post',post_id,'restrict_24h','fixture reason',adm) is null then raise exception 'moderation missing';end if;
 if public.beagu_locker_writer_v1(repeat('d',64)) is not null or public.beagu_locker_notification_actor_v1(repeat('d',64)) is distinct from a then raise exception 'restriction or read mismatch';end if;
 if public.beagu_postit_report_decide_v1('post',post_id,'restore','fixture restore',adm) is null then raise exception 'restore failed';end if;
 if public.beagu_locker_writer_v1(repeat('d',64)) is distinct from a then raise exception 'restore not effective';end if;
 update beagu_private.fixture_earned set earned=false where visitor_id='b0000000-0000-4000-8000-000000000001';
 if public.beagu_locker_notification_actor_v1(repeat('d',64)) is not null then raise exception 'revoked earned access';end if;
 update public.beagu_level_sessions set expires_at=now()-interval '1 minute' where token_sha256=repeat('e',64);
 if public.beagu_locker_writer_v1(repeat('e',64)) is not null then raise exception 'expired access';end if;
 raise notice 'PASS existing Lv3 registration, Lv2 preservation, legacy ownership, read/write split, moderation, revocation and ACL';
end $test$;
