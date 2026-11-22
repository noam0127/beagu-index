-- Stage35: reproduce the Post-it removal preflight/update race.
-- Isolated staging only, transactional ROLLBACK of all synthetic rows.
BEGIN;
DO $test$
DECLARE
  a uuid := '11111111-1111-4111-8111-111111111111';
  b uuid := '22222222-2222-4222-8222-222222222222';
  id_stale uuid; id_ok uuid; created jsonb;
  preflight_status text; changed uuid;
BEGIN
  IF to_regclass('stage_private.fake_schools') IS NULL THEN
    RAISE EXCEPTION 'STOP: not isolated staging';
  END IF;
  IF EXISTS(SELECT 1 FROM public.beagu_postit_posts)
    OR EXISTS(SELECT 1 FROM auth.users) THEN
    RAISE EXCEPTION 'STOP: staging fixture unexpectedly not empty';
  END IF;
  created := public.beagu_postit_create_post_v2(
    a,gen_random_uuid(),'game',NULL,'teacher-volleyball',NULL,'Race-test stale post');
  IF created->>'id' IS NULL THEN RAISE EXCEPTION 'FAIL: create stale fixture'; END IF;
  id_stale := (created->>'id')::uuid;
  -- Emulate target() preflight finding a published record.
  SELECT status INTO preflight_status
    FROM public.beagu_postit_posts WHERE id=id_stale AND author_uid=a;
  IF preflight_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'FAIL: preflight row not published';
  END IF;
  -- Emulate an intervening moderation/report or concurrent deletion.
  UPDATE public.beagu_postit_posts SET status='hidden' WHERE id=id_stale;
  changed := NULL;
  UPDATE public.beagu_postit_posts SET status='removed'
    WHERE id=id_stale AND author_uid=a AND status='published'
    RETURNING id INTO changed;
  IF changed IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: stale removal unexpectedly changed a hidden post';
  END IF;
  IF (SELECT status FROM public.beagu_postit_posts WHERE id=id_stale) <> 'hidden' THEN
    RAISE EXCEPTION 'FAIL: hidden status overwritten';
  END IF;
  created := public.beagu_postit_create_post_v2(
    b,gen_random_uuid(),'game',NULL,'teacher-volleyball',NULL,'Another author post');
  IF created->>'id' IS NULL THEN RAISE EXCEPTION 'FAIL: create other-owner fixture'; END IF;
  id_ok := (created->>'id')::uuid;
  changed := NULL;
  UPDATE public.beagu_postit_posts SET status='removed'
    WHERE id=id_ok AND author_uid=a AND status='published'
    RETURNING id INTO changed;
  IF changed IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: other author removal succeeded';
  END IF;
  changed := NULL;
  UPDATE public.beagu_postit_posts SET status='removed'
    WHERE id=id_ok AND author_uid=b AND status='published'
    RETURNING id INTO changed;
  IF changed IS DISTINCT FROM id_ok THEN
    RAISE EXCEPTION 'FAIL: rightful author could not remove published post';
  END IF;
  changed := NULL;
  UPDATE public.beagu_postit_posts SET status='removed'
    WHERE id=id_ok AND author_uid=b AND status='published'
    RETURNING id INTO changed;
  IF changed IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: repeat removal unexpectedly modified row';
  END IF;
END $test$;
ROLLBACK;
SELECT (SELECT count(*) FROM public.beagu_postit_posts) AS remaining_post_rows,
       (SELECT count(*) FROM auth.users) AS remaining_auth_users;