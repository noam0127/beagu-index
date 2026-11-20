-- Stage 4: idempotent, transaction-serialized Post-it posting.
-- Existing content and RLS remain unchanged. Service_role alone may call
-- these invoker-rights functions after the Edge Function verifies both proofs.
alter table public.beagu_postit_posts
  add column if not exists client_request_id uuid;
alter table public.beagu_postit_comments
  add column if not exists client_request_id uuid;
create unique index if not exists beagu_postit_posts_request_unique
  on public.beagu_postit_posts(author_uid,client_request_id)
  where client_request_id is not null;
create unique index if not exists beagu_postit_comments_request_unique
  on public.beagu_postit_comments(author_uid,client_request_id)
  where client_request_id is not null;

create or replace function public.beagu_postit_create_post_v2(
  p_actor uuid, p_request_id uuid, p_subject_type text,
  p_school_id text, p_game_slug text, p_comparison_selection text, p_body text
) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare
  v_id uuid;
  v_count bigint;
  v_latest timestamptz;
  v_limit integer;
begin
  if p_actor is null or p_request_id is null or p_body is null
     or pg_catalog.char_length(pg_catalog.btrim(p_body)) not between 1 and 200
     or p_subject_type is null or p_subject_type not in ('school','game','comparison') then
    return pg_catalog.jsonb_build_object('error','INVALID_POST');
  end if;
  -- One transaction at a time for each writer across devices/tabs. The
  -- unique nonce additionally handles retries after an uncertain response.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_actor::text), 20261121);
  select id into v_id
  from public.beagu_postit_posts
  where author_uid=p_actor and client_request_id=p_request_id;
  if found then
    return pg_catalog.jsonb_build_object('id',v_id,'replayed',true);
  end if;
  select max_daily_posts into v_limit from public.beagu_postit_settings where id=1;
  if v_limit is null then return pg_catalog.jsonb_build_object('error','POST_RATE_LIMIT'); end if;
  select count(*) filter(where created_at >= pg_catalog.date_trunc('day',pg_catalog.now(),'Asia/Seoul')),
         max(created_at)
  into v_count,v_latest
  from public.beagu_postit_posts where author_uid=p_actor;
  if v_count >= v_limit or
     (v_latest is not null and v_latest > pg_catalog.clock_timestamp()-interval '90 seconds') then
    return pg_catalog.jsonb_build_object('error','POST_RATE_LIMIT');
  end if;
  insert into public.beagu_postit_posts(
    author_uid,client_request_id,subject_type,school_id,
    game_slug,comparison_selection,body
  ) values(
    p_actor,p_request_id,p_subject_type,p_school_id,
    p_game_slug,p_comparison_selection,p_body
  ) returning id into v_id;
  return pg_catalog.jsonb_build_object('id',v_id,'replayed',false);
end;
$fn$;
revoke all on function public.beagu_postit_create_post_v2(uuid,uuid,text,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.beagu_postit_create_post_v2(uuid,uuid,text,text,text,text,text)
  to service_role;

create or replace function public.beagu_postit_create_comment_v2(
  p_actor uuid, p_request_id uuid, p_post_id uuid, p_body text
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
    post_id,author_uid,client_request_id,body
  ) values(p_post_id,p_actor,p_request_id,p_body)
  returning id into v_id;
  return pg_catalog.jsonb_build_object('id',v_id,'replayed',false);
end;
$fn$;
revoke all on function public.beagu_postit_create_comment_v2(uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.beagu_postit_create_comment_v2(uuid,uuid,uuid,text)
  to service_role;

comment on function public.beagu_postit_create_post_v2(uuid,uuid,text,text,text,text,text)
  is 'Server-only atomic daily quota, per-author cooldown and idempotent post insert.';
comment on function public.beagu_postit_create_comment_v2(uuid,uuid,uuid,text)
  is 'Server-only atomic daily quota, per-author cooldown and idempotent comment insert.';
