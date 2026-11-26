-- OFFLINE REVIEW ONLY. Existing comments remain top-level; no historical notifications.
begin;
alter table public.beagu_postit_comments add column parent_id uuid references public.beagu_postit_comments(id) on delete restrict;
create index beagu_locker_comment_parent_v1 on public.beagu_postit_comments(parent_id);
create or replace function public.beagu_locker_parent_guard_v1()
returns trigger language plpgsql security invoker set search_path='' as $fn$
begin
 if TG_OP='UPDATE' then
  if new.parent_id is distinct from old.parent_id then raise exception 'PARENT_IMMUTABLE' using errcode='42501';end if;
  return new;
 end if;
 perform 1 from public.beagu_postit_posts where id=new.post_id and status='published' for share;
 if not found then raise exception 'POST_UNAVAILABLE' using errcode='23514';end if;
 if new.parent_id is not null then
  perform 1 from public.beagu_postit_comments where id=new.parent_id and post_id=new.post_id and parent_id is null and status='published' for share;
  if not found then raise exception 'INVALID_PARENT' using errcode='23514';end if;
 end if;
 return new;
end $fn$;
revoke all on function public.beagu_locker_parent_guard_v1() from public,anon,authenticated;
grant execute on function public.beagu_locker_parent_guard_v1() to service_role;
create trigger beagu_locker_parent_insert_v1 before insert on public.beagu_postit_comments for each row execute function public.beagu_locker_parent_guard_v1();
create trigger beagu_locker_parent_update_v1 before update on public.beagu_postit_comments for each row execute function public.beagu_locker_parent_guard_v1();
create view public.beagu_locker_visible_comments_v1 with (security_invoker=true) as
 select c.* from public.beagu_postit_comments c
 join public.beagu_postit_posts p on p.id=c.post_id and p.status='published'
 left join public.beagu_postit_comments root on root.id=c.parent_id
 where c.status='published' and (c.parent_id is null or (root.status='published' and root.post_id=c.post_id and root.parent_id is null));
revoke all on public.beagu_locker_visible_comments_v1 from public,anon,authenticated;
grant select on public.beagu_locker_visible_comments_v1 to service_role;

create table public.beagu_locker_notifications_v1(
 comment_id uuid primary key references public.beagu_postit_comments(id) on delete cascade,
 recipient_uid uuid not null,
 created_at timestamptz not null default now(),
 read_at timestamptz
);
create index beagu_locker_notifications_recipient_v1 on public.beagu_locker_notifications_v1(recipient_uid,created_at desc);
alter table public.beagu_locker_notifications_v1 enable row level security;
revoke all on public.beagu_locker_notifications_v1 from public,anon,authenticated,service_role;
grant select,insert,update on public.beagu_locker_notifications_v1 to service_role;
create or replace function public.beagu_locker_notify_comment_v1()
returns trigger language plpgsql security invoker set search_path='' as $fn$
declare recipient uuid;
begin
 if new.status<>'published' then return new;end if;
 if new.parent_id is null then
  select author_uid into recipient from public.beagu_postit_posts where id=new.post_id;
 else
  select author_uid into recipient from public.beagu_postit_comments where id=new.parent_id;
 end if;
 if recipient is not null and recipient<>new.author_uid then
  insert into public.beagu_locker_notifications_v1(comment_id,recipient_uid) values(new.id,recipient) on conflict do nothing;
 end if;
 return new;
end $fn$;
revoke all on function public.beagu_locker_notify_comment_v1() from public,anon,authenticated;
grant execute on function public.beagu_locker_notify_comment_v1() to service_role;
create trigger beagu_locker_notify_insert_v1 after insert on public.beagu_postit_comments for each row execute function public.beagu_locker_notify_comment_v1();
-- Actor resolution is supplied by the existing Lv3 account adapter.
create or replace function public.beagu_locker_notifications_list_v1(p_actor uuid)
returns table(comment_id uuid,post_id uuid,kind text,created_at timestamptz,is_read boolean)
language sql stable security invoker set search_path='' as $fn$
 select n.comment_id,c.post_id,case when c.parent_id is null then 'comment' else 'reply' end,n.created_at,n.read_at is not null
 from public.beagu_locker_notifications_v1 n join public.beagu_locker_visible_comments_v1 c on c.id=n.comment_id
 where n.recipient_uid=p_actor order by n.created_at desc,n.comment_id limit 50
$fn$;
revoke all on function public.beagu_locker_notifications_list_v1(uuid) from public,anon,authenticated;
grant execute on function public.beagu_locker_notifications_list_v1(uuid) to service_role;
create or replace function public.beagu_locker_notification_read_v1(p_actor uuid,p_comment uuid)
returns boolean language plpgsql security invoker set search_path='' as $fn$
begin
 update public.beagu_locker_notifications_v1 n set read_at=coalesce(n.read_at,now())
 where n.recipient_uid=p_actor and n.comment_id=p_comment
 and exists(select 1 from public.beagu_locker_visible_comments_v1 c where c.id=n.comment_id);
 return found;
end $fn$;
revoke all on function public.beagu_locker_notification_read_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.beagu_locker_notification_read_v1(uuid,uuid) to service_role;
create or replace function public.beagu_postit_create_comment_v3(
  p_actor uuid, p_request_id uuid, p_post_id uuid, p_body text, p_parent_id uuid
) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare
  v_id uuid;
  v_count bigint;
  v_latest timestamptz;
  v_limit integer;
begin
  if p_actor is null or p_request_id is null or p_post_id is null or p_body is null
     or pg_catalog.char_length(pg_catalog.btrim(p_body)) not between 1 and 150 then
    return pg_catalog.jsonb_build_object('error','INVALID_COMMENT');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_actor::text), 20261121);
  select id into v_id
  from public.beagu_postit_comments
  where author_uid=p_actor and client_request_id=p_request_id;
  if found then
    return pg_catalog.jsonb_build_object('id',v_id,'replayed',true);
  end if;
  if not exists(
    select 1 from public.beagu_postit_posts where id=p_post_id and status='published'
  ) then return pg_catalog.jsonb_build_object('error','POST_UNAVAILABLE'); end if;
  if p_parent_id is not null and not exists(select 1 from public.beagu_postit_comments where id=p_parent_id and post_id=p_post_id and parent_id is null and status='published') then
    return pg_catalog.jsonb_build_object('error','INVALID_PARENT');
  end if;
  select max_daily_comments into v_limit from public.beagu_postit_settings where id=1;
  if v_limit is null then return pg_catalog.jsonb_build_object('error','COMMENT_RATE_LIMIT'); end if;
  select count(*) filter(where created_at >= pg_catalog.date_trunc('day',pg_catalog.now(),'Asia/Seoul')),
         max(created_at)
  into v_count,v_latest
  from public.beagu_postit_comments where author_uid=p_actor;
  if v_count >= v_limit or
     (v_latest is not null and v_latest > pg_catalog.clock_timestamp()-interval '30 seconds') then
    return pg_catalog.jsonb_build_object('error','COMMENT_RATE_LIMIT');
  end if;
  insert into public.beagu_postit_comments(
    post_id,author_uid,client_request_id,body,parent_id
  ) values(p_post_id,p_actor,p_request_id,p_body,p_parent_id)
  returning id into v_id;
  return pg_catalog.jsonb_build_object('id',v_id,'replayed',false);
end;
$fn$;
revoke all on function public.beagu_postit_create_comment_v3(uuid,uuid,uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.beagu_postit_create_comment_v3(uuid,uuid,uuid,text,uuid)
  to service_role;

commit;
