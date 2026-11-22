-- Stage35 staging-only negative ownership UPDATE and valid-owner removal.
-- Uses actual Post-it creation RPC; all data is rolled back transactionally.
BEGIN;
DO $test$
DECLARE a uuid := '11111111-1111-4111-8111-111111111111';
        b uuid := '22222222-2222-4222-8222-222222222222';
        made jsonb; commented jsonb; post_id uuid; comment_id uuid;
        altered integer;
BEGIN
 IF to_regclass('stage_private.fake_schools') IS NULL THEN RAISE EXCEPTION 'NOT STAGING'; END IF;
 IF EXISTS(SELECT 1 FROM public.beagu_postit_posts)
  OR EXISTS(SELECT 1 FROM public.beagu_postit_comments)
 THEN RAISE EXCEPTION 'NONEMPTY STAGING POST FIXTURES'; END IF;
 made:=public.beagu_postit_create_post_v2(a,gen_random_uuid(),'game',NULL,'teacher-volleyball',NULL,'Synthetic private ownership');
 IF made->>'id' IS NULL THEN RAISE EXCEPTION 'POST SETUP FAILED'; END IF;
 post_id:=(made->>'id')::uuid;
 commented:=public.beagu_postit_create_comment_v2(a,gen_random_uuid(),post_id,'Synthetic private comment');
 IF commented->>'id' IS NULL THEN RAISE EXCEPTION 'COMMENT SETUP FAILED'; END IF;
 comment_id:=(commented->>'id')::uuid;
 UPDATE public.beagu_postit_posts SET status='removed' WHERE id=post_id AND author_uid=b;
 GET DIAGNOSTICS altered = ROW_COUNT;
 IF altered<>0 THEN RAISE EXCEPTION 'FAIL: other author removed post'; END IF;
 UPDATE public.beagu_postit_comments SET status='removed' WHERE id=comment_id AND author_uid=b;
 GET DIAGNOSTICS altered = ROW_COUNT;
 IF altered<>0 THEN RAISE EXCEPTION 'FAIL: other author removed comment'; END IF;
 UPDATE public.beagu_postit_comments SET status='removed' WHERE id=comment_id AND author_uid=a;
 GET DIAGNOSTICS altered = ROW_COUNT;
 IF altered<>1 THEN RAISE EXCEPTION 'FAIL: correct author could not remove comment'; END IF;
 UPDATE public.beagu_postit_posts SET status='removed' WHERE id=post_id AND author_uid=a;
 GET DIAGNOSTICS altered = ROW_COUNT;
 IF altered<>1 THEN RAISE EXCEPTION 'FAIL: correct author could not remove post'; END IF;
 IF (SELECT status FROM public.beagu_postit_posts WHERE id=post_id) <> 'removed'
  OR (SELECT status FROM public.beagu_postit_comments WHERE id=comment_id) <> 'removed'
 THEN RAISE EXCEPTION 'FAIL: removal status not applied'; END IF;
END $test$;
ROLLBACK;
SELECT (SELECT count(*) FROM public.beagu_postit_posts) AS posts_remaining,
 (SELECT count(*) FROM public.beagu_postit_comments) AS comments_remaining,
 (SELECT count(*) FROM public.beagu_postit_reactions) AS reactions_remaining;