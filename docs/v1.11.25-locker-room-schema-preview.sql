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


-- Counts are only returned by the authenticated Edge handler. No public access.
create or replace function public.beagu_postit_school_counts_v1(p_ids text[])
returns table(school_id text, post_count bigint)
language sql stable security invoker set search_path='' as $fn$
  select p.school_id, count(*) from public.beagu_postit_posts p
  where cardinality(p_ids) between 1 and 50
    and p.school_id=any(p_ids) and p.status='published'
  group by p.school_id
$fn$;
revoke all on function public.beagu_postit_school_counts_v1(text[]) from public,anon,authenticated;
grant execute on function public.beagu_postit_school_counts_v1(text[]) to service_role;

-- Thread-local aliases and private operator binding; legacy rows stay anonymous.
create table if not exists public.beagu_locker_operator_v1(
 singleton boolean primary key default true check(singleton),
 author_uid uuid not null unique,
 admin_user_id uuid not null
);
create table if not exists public.beagu_locker_aliases_v1(
 post_id uuid not null references public.beagu_postit_posts(id) on delete cascade deferrable initially deferred,
 author_uid uuid not null,
 nickname text not null,
 is_operator boolean not null default false,
 primary key(post_id,author_uid), unique(post_id,nickname)
);
alter table public.beagu_locker_operator_v1 enable row level security;
alter table public.beagu_locker_aliases_v1 enable row level security;
revoke all on public.beagu_locker_operator_v1,public.beagu_locker_aliases_v1 from public,anon,authenticated;
-- Binding is provisioned only in a separately authorized trusted admin procedure.
revoke all on public.beagu_locker_operator_v1 from service_role;
grant select on public.beagu_locker_operator_v1 to service_role;
grant select,insert on public.beagu_locker_aliases_v1 to service_role;
alter table public.beagu_postit_posts add column if not exists locker_nickname text;
alter table public.beagu_postit_posts add column if not exists locker_operator boolean not null default false;
alter table public.beagu_postit_comments add column if not exists locker_nickname text;
alter table public.beagu_postit_comments add column if not exists locker_operator boolean not null default false;

create or replace function public.beagu_locker_allocate_alias_v1(p_post uuid,p_actor uuid)
returns table(nickname text,is_operator boolean)
language plpgsql security invoker set search_path='' as $fn$
declare
 v_name text; v_base text; v_operator boolean; v_current_owner boolean; v_n integer:=1;
 v_positions text[]:=array['아웃사이드 히터','아포짓 스파이커','미들 블로커','세터','리베로'];
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_post::text),20261125);
 -- Check the binding again for every insertion, including existing aliases.
 select exists(select 1 from public.beagu_locker_operator_v1 o
  join public.beagu_admin_accounts a on a.user_id=o.admin_user_id
  where o.author_uid=p_actor and a.role='owner' and a.enabled=true) into v_current_owner;
 select a.nickname,a.is_operator into v_name,v_operator from public.beagu_locker_aliases_v1 a where a.post_id=p_post and a.author_uid=p_actor;
 if found then
  if v_operator and not v_current_owner then raise exception 'OPERATOR_BINDING_REVOKED' using errcode='42501';end if;
  return query select v_name,v_operator;return;
 end if;
 v_operator:=v_current_owner;
 if v_operator and not exists(select 1 from public.beagu_locker_aliases_v1 a where a.post_id=p_post and a.nickname='카리브해매너티') then
  v_name:='카리브해매너티';
 else
  v_operator:=false;
  v_base:=v_positions[1+floor(random()*5)::integer];v_name:=v_base;
  while exists(select 1 from public.beagu_locker_aliases_v1 a where a.post_id=p_post and a.nickname=v_name) loop
   v_n:=v_n+1;v_name:=v_base||' '||v_n::text;
  end loop;
 end if;
 insert into public.beagu_locker_aliases_v1(post_id,author_uid,nickname,is_operator) values(p_post,p_actor,v_name,v_operator);
 return query select v_name,v_operator;
end $fn$;
revoke all on function public.beagu_locker_allocate_alias_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.beagu_locker_allocate_alias_v1(uuid,uuid) to service_role;
create or replace function public.beagu_locker_alias_on_insert_v1()
returns trigger language plpgsql security invoker set search_path='' as $fn$
declare v_thread uuid;
begin
 if TG_TABLE_NAME='beagu_postit_posts' then v_thread:=new.id;else v_thread:=new.post_id;end if;
 select a.nickname,a.is_operator into new.locker_nickname,new.locker_operator from public.beagu_locker_allocate_alias_v1(v_thread,new.author_uid) a;
 return new;
end $fn$;
revoke all on function public.beagu_locker_alias_on_insert_v1() from public,anon,authenticated;
grant execute on function public.beagu_locker_alias_on_insert_v1() to service_role;
drop trigger if exists beagu_locker_alias_post_v1 on public.beagu_postit_posts;
create trigger beagu_locker_alias_post_v1 before insert on public.beagu_postit_posts for each row execute function public.beagu_locker_alias_on_insert_v1();
drop trigger if exists beagu_locker_alias_comment_v1 on public.beagu_postit_comments;
create trigger beagu_locker_alias_comment_v1 before insert on public.beagu_postit_comments for each row execute function public.beagu_locker_alias_on_insert_v1();

-- Defense in depth: nickname and operator marker must agree. The legacy
-- null/false combination stays valid without touching historical content.
alter table public.beagu_locker_aliases_v1 add constraint beagu_locker_alias_format_v1 check (
 (is_operator and nickname='카리브해매너티')
 or (not is_operator and nickname ~ '^(아웃사이드 히터|아포짓 스파이커|미들 블로커|세터|리베로)( [2-9]| [1-9][0-9]+)?)
);
alter table public.beagu_postit_posts add constraint beagu_locker_post_alias_format_v1 check (
 (locker_operator and locker_nickname is not null and locker_nickname='카리브해매너티')
 or (not locker_operator and (locker_nickname is null or locker_nickname ~ '^(아웃사이드 히터|아포짓 스파이커|미들 블로커|세터|리베로)( [2-9]| [1-9][0-9]+)?))
);
alter table public.beagu_postit_comments add constraint beagu_locker_comment_alias_format_v1 check (
 (locker_operator and locker_nickname is not null and locker_nickname='카리브해매너티')
 or (not locker_operator and (locker_nickname is null or locker_nickname ~ '^(아웃사이드 히터|아포짓 스파이커|미들 블로커|세터|리베로)( [2-9]| [1-9][0-9]+)?))
);
-- The service API may still change status (moderation/deletion), but it
-- must not rewrite an existing identity or transfer its author ownership.
create or replace function public.beagu_locker_identity_immutable_v1()
returns trigger language plpgsql security invoker set search_path='' as $fn$
begin
 if new.id is distinct from old.id or new.author_uid is distinct from old.author_uid
    or new.locker_nickname is distinct from old.locker_nickname
    or new.locker_operator is distinct from old.locker_operator then
  raise exception 'LOCKER_IDENTITY_IMMUTABLE' using errcode='42501';
 end if;
 if TG_TABLE_NAME='beagu_postit_comments' then
  if new.post_id is distinct from old.post_id then raise exception 'LOCKER_THREAD_IMMUTABLE' using errcode='42501'; end if;
 end if;
 return new;
end $fn$;
revoke all on function public.beagu_locker_identity_immutable_v1() from public,anon,authenticated;
grant execute on function public.beagu_locker_identity_immutable_v1() to service_role;
create trigger beagu_locker_identity_post_v1 before update on public.beagu_postit_posts for each row execute function public.beagu_locker_identity_immutable_v1();
create trigger beagu_locker_identity_comment_v1 before update on public.beagu_postit_comments for each row execute function public.beagu_locker_identity_immutable_v1();

commit;
