\set ON_ERROR_STOP on
-- Run after locker-room-postgres-v11125.sql in the same disposable DB.
\ir ../docs/v1.11.25-locker-replies-preview.sql
set role service_role;
do $reply$
declare
 a uuid:='92000000-0000-4000-8000-000000000001';
 b uuid:='92000000-0000-4000-8000-000000000002';
 c uuid:='92000000-0000-4000-8000-000000000003';
 d uuid:='92000000-0000-4000-8000-000000000004';
 p uuid; other uuid; root uuid; reply uuid; own uuid; nonce uuid:=gen_random_uuid(); r jsonb; original_alias text;
begin
 insert into public.beagu_postit_posts(author_uid,subject_type,body) values(a,'general','reply fixture') returning id,locker_nickname into p,original_alias;
 insert into public.beagu_postit_posts(author_uid,subject_type,body) values(b,'general','other fixture') returning id into other;
 r:=public.beagu_postit_create_comment_v3(b,gen_random_uuid(),p,'root',null);root:=(r->>'id')::uuid;
 if root is null then raise exception 'root creation %',r;end if;
 r:=public.beagu_postit_create_comment_v3(a,nonce,p,'reply',root);reply:=(r->>'id')::uuid;
 if reply is null then raise exception 'reply creation %',r;end if;
 if not exists(select 1 from public.beagu_postit_comments where id=reply and parent_id=root and author_uid=a and locker_nickname=original_alias) then raise exception 'thread nickname / owner lost';end if;
 if (public.beagu_postit_create_comment_v3(a,nonce,p,'retry',root)->>'replayed') is distinct from 'true' then raise exception 'retry failed';end if;
 if public.beagu_postit_create_comment_v3(c,gen_random_uuid(),p,'nested',reply)->>'error' is distinct from 'INVALID_PARENT' then raise exception 'nested reply accepted';end if;
 if public.beagu_postit_create_comment_v3(c,gen_random_uuid(),other,'cross post',root)->>'error' is distinct from 'INVALID_PARENT' then raise exception 'cross-thread accepted';end if;
 if (select count(*) from public.beagu_locker_notifications_list_v1(a) where comment_id=root and kind='comment')<>1 then raise exception 'post alert missing';end if;
 if (select count(*) from public.beagu_locker_notifications_list_v1(b) where comment_id=reply and kind='reply')<>1 then raise exception 'reply alert missing';end if;
 if exists(select 1 from public.beagu_locker_notifications_list_v1(c)) or public.beagu_locker_notification_read_v1(c,reply) then raise exception 'foreign notification access';end if;
 -- Model separate HTTP requests: a STABLE list function sees the snapshot
 -- taken at the start of its statement, not another function's side effect
 -- in the same SQL expression.
 if not public.beagu_locker_notification_read_v1(b,reply) then raise exception 'read mark write failed';end if;
 if not exists(select 1 from public.beagu_locker_notifications_list_v1(b) where comment_id=reply and is_read) then raise exception 'read mark missing';end if;
 insert into public.beagu_postit_comments(post_id,author_uid,body) values(p,a,'self comment') returning id into own;
 if exists(select 1 from public.beagu_locker_notifications_v1 where comment_id=own) then raise exception 'self notification';end if;
 insert into public.beagu_postit_comments(post_id,author_uid,body,parent_id) values(p,b,'self reply',root) returning id into own;
 if exists(select 1 from public.beagu_locker_notifications_v1 where comment_id=own) then raise exception 'self reply notification';end if;
 update public.beagu_postit_comments set status='hidden' where id=root;
 if exists(select 1 from public.beagu_locker_notifications_list_v1(b) where comment_id=reply) or exists(select 1 from public.beagu_locker_visible_comments_v1 where id=reply) then raise exception 'hidden root leaked';end if;
 if public.beagu_postit_create_comment_v3(c,gen_random_uuid(),p,'hidden root reply',root)->>'error' is distinct from 'INVALID_PARENT' then raise exception 'hidden root reply accepted';end if;
 update public.beagu_postit_comments set status='published' where id=root;
 update public.beagu_postit_posts set status='removed' where id=p;
 if exists(select 1 from public.beagu_locker_notifications_list_v1(a) where post_id=p) or exists(select 1 from public.beagu_locker_notifications_list_v1(b) where post_id=p) or public.beagu_locker_notification_read_v1(b,reply) then raise exception 'removed post alert leaked';end if;
 if public.beagu_postit_create_comment_v3(d,gen_random_uuid(),p,'removed post reply',root)->>'error' is distinct from 'POST_UNAVAILABLE' then raise exception 'removed post reply accepted';end if;
end $reply$;
reset role;
do $acl$
begin
 if has_table_privilege('anon','public.beagu_locker_notifications_v1','select')
 or has_table_privilege('authenticated','public.beagu_locker_visible_comments_v1','select')
 or has_function_privilege('anon','public.beagu_locker_notification_actor_v1(text)','execute')
 or has_function_privilege('authenticated','public.beagu_locker_notifications_list_v1(uuid)','execute')
 or has_function_privilege('anon','public.beagu_postit_create_comment_v3(uuid,uuid,uuid,text,uuid)','execute')
 then raise exception 'new feature ACL regression';end if;
 if exists(select 1 from public.beagu_postit_comments where body='comment' and parent_id is not null) then raise exception 'legacy comments moved';end if;
 raise notice 'PASS one-level replies, thread alias, idempotency, self exclusion, hidden/removed suppression, recipient scope and ACL';
end $acl$;
