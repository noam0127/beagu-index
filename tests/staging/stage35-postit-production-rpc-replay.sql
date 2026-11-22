-- Stage 35: isolated reproduction of audited production INVOKER RPC bodies.
-- No production objects are changed or queried during this SQL application.
DO $$ BEGIN IF to_regclass('stage_private.fake_schools') IS NULL
 THEN RAISE EXCEPTION 'STOP: staging only'; END IF; END $$;

CREATE OR REPLACE FUNCTION public.beagu_postit_create_comment_v2(p_actor uuid, p_request_id uuid, p_post_id uuid, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.beagu_postit_create_post_v2(p_actor uuid, p_request_id uuid, p_subject_type text, p_school_id text, p_game_slug text, p_comparison_selection text, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;
REVOKE ALL ON FUNCTION public.beagu_postit_create_post_v2(uuid,uuid,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.beagu_postit_create_comment_v2(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_postit_create_post_v2(uuid,uuid,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.beagu_postit_create_comment_v2(uuid,uuid,uuid,text) TO service_role;
SELECT p.proname,p.prosecdef AS security_definer,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_exec,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('beagu_postit_create_post_v2','beagu_postit_create_comment_v2') ORDER BY p.proname;