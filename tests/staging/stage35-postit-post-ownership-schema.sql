-- Stage 35: exact shape of Post-it core tables for isolated Auth A/B E2E.
-- ONLY ycwuugggqbunlbwuzvbx; STOP if staging marker missing.
DO $$ BEGIN IF to_regclass('stage_private.fake_schools') IS NULL
 THEN RAISE EXCEPTION 'STOP: staging only'; END IF; END $$;

CREATE TABLE IF NOT EXISTS public.beagu_postit_settings (
 id smallint PRIMARY KEY DEFAULT 1 CHECK (id=1),
 minimum_write_level smallint NOT NULL DEFAULT 2 CHECK (minimum_write_level BETWEEN 0 AND 2),
 max_daily_posts smallint NOT NULL DEFAULT 3 CHECK(max_daily_posts BETWEEN 1 AND 50),
 max_daily_comments smallint NOT NULL DEFAULT 12 CHECK(max_daily_comments BETWEEN 1 AND 100),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.beagu_postit_settings(id,minimum_write_level,max_daily_posts,max_daily_comments)
VALUES(1,2,3,12) ON CONFLICT(id) DO UPDATE SET minimum_write_level=2,max_daily_posts=3,max_daily_comments=12;

CREATE TABLE IF NOT EXISTS public.beagu_postit_posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id text,
 author_uid uuid NOT NULL,
 body text NOT NULL CHECK(char_length(btrim(body)) BETWEEN 1 AND 200),
 status text NOT NULL DEFAULT 'published' CHECK(status IN ('published','hidden','removed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 subject_type text NOT NULL DEFAULT 'school',
 game_slug text,
 comparison_selection text,
 client_request_id uuid,
 CONSTRAINT postit_qa_subject_valid CHECK (
  (subject_type='school' AND school_id IS NOT NULL AND game_slug IS NULL AND comparison_selection IS NULL)
  OR (subject_type='game' AND game_slug IN ('teacher-volleyball','teacher-run','teacher-class-diary-play') AND comparison_selection IS NULL)
  OR (subject_type='comparison' AND school_id IS NULL AND game_slug IS NULL AND comparison_selection IS NOT NULL AND length(comparison_selection) BETWEEN 12 AND 120)
 )
);
CREATE UNIQUE INDEX IF NOT EXISTS beagu_postit_posts_request_unique
 ON public.beagu_postit_posts(author_uid,client_request_id) WHERE client_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.beagu_postit_comments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id uuid NOT NULL REFERENCES public.beagu_postit_posts(id) ON DELETE CASCADE,
 author_uid uuid NOT NULL,
 body text NOT NULL CHECK(char_length(btrim(body)) BETWEEN 1 AND 150),
 status text NOT NULL DEFAULT 'published' CHECK(status IN ('published','hidden','removed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 client_request_id uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS beagu_postit_comments_request_unique
 ON public.beagu_postit_comments(author_uid,client_request_id) WHERE client_request_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.beagu_postit_reactions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 author_uid uuid NOT NULL,
 target_type text NOT NULL CHECK(target_type IN ('post','comment')),
 target_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('like','report')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(author_uid,target_type,target_id,kind)
);
ALTER TABLE public.beagu_postit_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beagu_postit_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beagu_postit_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beagu_postit_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.beagu_postit_settings,public.beagu_postit_posts,
 public.beagu_postit_comments,public.beagu_postit_reactions
 FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.beagu_postit_settings,
 public.beagu_postit_posts,public.beagu_postit_comments,
 public.beagu_postit_reactions TO service_role;
SELECT c.relname,c.relrowsecurity AS rls,
 has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
 has_table_privilege('authenticated',c.oid,'DELETE') AS authenticated_delete
FROM pg_class c WHERE c.oid IN (
 'public.beagu_postit_settings'::regclass,'public.beagu_postit_posts'::regclass,
 'public.beagu_postit_comments'::regclass,'public.beagu_postit_reactions'::regclass)
ORDER BY 1;
