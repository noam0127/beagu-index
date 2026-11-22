-- Stage 35 isolated test: execute real production-equivalent INVOKER RPCs.
-- Transaction rolls back even on success; no real Auth users or school data.
BEGIN;
DO $qa$
DECLARE
 a uuid := '11111111-1111-4111-8111-111111111111';
 b uuid := '22222222-2222-4222-8222-222222222222';
 rid_a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 rid_b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 comm_a uuid := 'aaaaaaaa-aaaa-4ccc-8ccc-aaaaaaaaaaaa';
 comm_b uuid := 'bbbbbbbb-bbbb-4ccc-8ccc-bbbbbbbbbbbb';
 ra jsonb; ra2 jsonb; rb jsonb; rlimit jsonb;
 ca jsonb; ca2 jsonb; cb jsonb; climit jsonb;
 pa uuid; pb uuid;
BEGIN
 IF to_regclass('stage_private.fake_schools') IS NULL
 THEN RAISE EXCEPTION 'STOP: not isolated staging'; END IF;
 IF (SELECT COUNT(*) FROM auth.users) <> 0 THEN RAISE EXCEPTION 'STOP: nonempty Auth user fixture'; END IF;
 IF (SELECT COUNT(*) FROM public.beagu_postit_posts) <> 0
 OR (SELECT COUNT(*) FROM public.beagu_postit_comments) <> 0
 THEN RAISE EXCEPTION 'STOP: unexpected pre-existing post data'; END IF;
 IF has_function_privilege('anon','public.beagu_postit_create_post_v2(uuid,uuid,text,text,text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'FAIL: public RPC privilege leaked'; END IF;
 ra:=public.beagu_postit_create_post_v2(a,rid_a,'game',NULL,'teacher-volleyball',NULL,'QA test post A');
 IF ra->>'error' IS NOT NULL OR COALESCE((ra->>'replayed')::boolean,true) OR (ra->>'id') IS NULL
 THEN RAISE EXCEPTION 'FAIL: A post creation'; END IF;
 pa:=(ra->>'id')::uuid;
 ra2:=public.beagu_postit_create_post_v2(a,rid_a,'game',NULL,'teacher-volleyball',NULL,'QA test post A');
 IF (ra2->>'id')::uuid IS DISTINCT FROM pa OR (ra2->>'replayed')::boolean IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'FAIL: same-author request-id replay'; END IF;
 rb:=public.beagu_postit_create_post_v2(b,rid_b,'game',NULL,'teacher-volleyball',NULL,'QA test post B');
 IF rb->>'error' IS NOT NULL OR (rb->>'id') IS NULL THEN RAISE EXCEPTION 'FAIL: B post creation'; END IF;
 pb:=(rb->>'id')::uuid;
 IF pa=pb THEN RAISE EXCEPTION 'FAIL: A and B posts collided'; END IF;
 rlimit:=public.beagu_postit_create_post_v2(a,gen_random_uuid(),'game',NULL,'teacher-volleyball',NULL,'QA extra A post');
 IF rlimit->>'error' IS DISTINCT FROM 'POST_RATE_LIMIT'
 THEN RAISE EXCEPTION 'FAIL: daily/90-second post rate limiter'; END IF;
 ca:=public.beagu_postit_create_comment_v2(a,comm_a,pb,'QA A comment on B');
 IF ca->>'error' IS NOT NULL OR (ca->>'id') IS NULL THEN RAISE EXCEPTION 'FAIL: A comment'; END IF;
 ca2:=public.beagu_postit_create_comment_v2(a,comm_a,pb,'QA A comment on B');
 IF ca2->>'id' IS DISTINCT FROM ca->>'id' OR (ca2->>'replayed')::boolean IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'FAIL: same-author comment idempotency'; END IF;
 cb:=public.beagu_postit_create_comment_v2(b,comm_b,pa,'QA B comment on A');
 IF cb->>'error' IS NOT NULL OR (cb->>'id') IS NULL THEN RAISE EXCEPTION 'FAIL: B comment'; END IF;
 climit:=public.beagu_postit_create_comment_v2(a,gen_random_uuid(),pb,'QA A duplicate rapid comment');
 IF climit->>'error' IS DISTINCT FROM 'COMMENT_RATE_LIMIT'
 THEN RAISE EXCEPTION 'FAIL: comment rate limiter'; END IF;
 IF (SELECT count(*) FROM public.beagu_postit_posts WHERE status='published' AND author_uid IN (a,b)) <> 2
 THEN RAISE EXCEPTION 'FAIL: two distinct published posts'; END IF;
 IF (SELECT count(*) FROM public.beagu_postit_comments WHERE status='published' AND author_uid IN (a,b)) <> 2
 THEN RAISE EXCEPTION 'FAIL: two distinct published comments'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.beagu_postit_posts WHERE id=pa AND author_uid=a)
 OR NOT EXISTS(SELECT 1 FROM public.beagu_postit_posts WHERE id=pb AND author_uid=b)
 OR NOT EXISTS(SELECT 1 FROM public.beagu_postit_comments WHERE id=(ca->>'id')::uuid AND author_uid=a AND post_id=pb)
 OR NOT EXISTS(SELECT 1 FROM public.beagu_postit_comments WHERE id=(cb->>'id')::uuid AND author_uid=b AND post_id=pa)
 THEN RAISE EXCEPTION 'FAIL: stored post or comment author ownership'; END IF;
END $qa$;
ROLLBACK;
SELECT (SELECT count(*) FROM public.beagu_postit_posts) AS posts_after_rollback,
 (SELECT count(*) FROM public.beagu_postit_comments) AS comments_after_rollback,
 (SELECT count(*) FROM auth.users) AS auth_users_after_rollback;