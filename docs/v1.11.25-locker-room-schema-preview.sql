-- REVIEW / OFFLINE TEST ONLY. Do not execute on production.
-- Existing table, IDs, authors, RLS, FK, status, quotas, old RPCs stay intact.
begin;
do $guard$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.beagu_postit_posts'::regclass and conname='beagu_postit_posts_body_check' and contype='c')
    or not exists(select 1 from pg_constraint where conrelid='public.beagu_postit_posts'::regclass and conname='beagu_postit_subject_valid' and contype='c')
  then raise exception 'Unexpected legacy schema: review manually'; end if;
end $guard$;
alter table public.beagu_postit_posts drop constraint beagu_postit_posts_body_check;
alter table public.beagu_postit_posts add constraint beagu_postit_posts_body_check check (char_length(btrim(body)) between 1 and 300);
alter table public.beagu_postit_posts drop constraint beagu_postit_subject_valid;
alter table public.beagu_postit_posts add constraint beagu_postit_subject_valid check (
  (subject_type='general' and school_id is null and game_slug is null and comparison_selection is null)
  or (subject_type='school' and school_id is not null and game_slug is null and comparison_selection is null)
  or (subject_type='game' and game_slug is not null and game_slug in ('teacher-volleyball','teacher-run','teacher-class-diary-play') and comparison_selection is null)
  or (subject_type='comparison' and school_id is null and game_slug is null and comparison_selection is not null and length(comparison_selection) between 12 and 120)
);
create or replace function public.beagu_postit_create_post_v3(
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
     or pg_catalog.char_length(pg_catalog.btrim(p_body)) not between 1 and 300
     or p_subject_type is null or p_subject_type not in ('general','school','game','comparison') then
    return pg_catalog.jsonb_build_object('error','INVALID_POST');
  end if;
  if not (
    (p_subject_type='general' and p_school_id is null and p_game_slug is null and p_comparison_selection is null)
    or (p_subject_type='school' and p_school_id is not null and p_game_slug is null and p_comparison_selection is null)
    or (p_subject_type='game' and p_game_slug is not null and p_game_slug in ('teacher-volleyball','teacher-run','teacher-class-diary-play') and p_comparison_selection is null)
    or (p_subject_type='comparison' and p_school_id is null and p_game_slug is null and p_comparison_selection is not null and length(p_comparison_selection) between 12 and 120)
  ) then return pg_catalog.jsonb_build_object('error','INVALID_POST'); end if;
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
revoke all on function public.beagu_postit_create_post_v3(uuid,uuid,text,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.beagu_postit_create_post_v3(uuid,uuid,text,text,text,text,text)
  to service_role;


commit;
