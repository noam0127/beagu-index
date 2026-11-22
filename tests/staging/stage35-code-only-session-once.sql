-- v1.1.0 stage 35: ONLY isolated staging Supabase ycwuugggqbunlbwuzvbx.
-- NEVER APPLY as a general supabase/migrations production migration.
-- The synthetic Lv2 session has no linked account or personal information.
DO $$ BEGIN
  IF to_regclass('stage_private.fake_schools') IS NULL THEN
    RAISE EXCEPTION 'STOP: staging-only marker absent';
  END IF;
END $$;

INSERT INTO public.beagu_level_sessions
 (token_sha256,access_level,created_at,expires_at,identity_campaign,identity_visitor_id)
VALUES
 (encode(extensions.digest(repeat('4',64),'sha256'),'hex'),
  2,clock_timestamp(),clock_timestamp()+interval '12 minutes',NULL,NULL)
ON CONFLICT(token_sha256) DO UPDATE
 SET access_level=2,created_at=EXCLUDED.created_at,
 expires_at=EXCLUDED.expires_at,identity_campaign=NULL,identity_visitor_id=NULL;

SELECT access_level,expires_at>clock_timestamp() AS active,
       identity_visitor_id IS NULL AS has_no_member_identity
FROM public.beagu_level_sessions
WHERE token_sha256=encode(extensions.digest(repeat('4',64),'sha256'),'hex');

-- Cleanup run after isolated HTTP tests, confirmed by zero rows:
-- DELETE FROM public.beagu_level_sessions
-- WHERE token_sha256=encode(extensions.digest(repeat('4',64),'sha256'),'hex');
