-- Isolated Post-it community tables. All client access is through the
-- beagu-postit-api-v1 Edge Function; no client role receives table rights.
CREATE TABLE IF NOT EXISTS public.beagu_postit_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id=1),
  minimum_write_level smallint NOT NULL DEFAULT 0 CHECK (minimum_write_level BETWEEN 0 AND 2),
  max_daily_posts smallint NOT NULL DEFAULT 3 CHECK (max_daily_posts BETWEEN 1 AND 50),
  max_daily_comments smallint NOT NULL DEFAULT 12 CHECK (max_daily_comments BETWEEN 1 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.beagu_postit_settings(id) VALUES(1) ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.beagu_postit_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id text NOT NULL REFERENCES public.schools(school_id) ON DELETE RESTRICT,
  author_uid uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'published' CHECK(status IN ('published','hidden','removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS beagu_postit_posts_created_idx ON public.beagu_postit_posts(status,created_at DESC);
CREATE INDEX IF NOT EXISTS beagu_postit_posts_school_idx ON public.beagu_postit_posts(school_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS beagu_postit_posts_author_idx ON public.beagu_postit_posts(author_uid,created_at DESC);
CREATE TABLE IF NOT EXISTS public.beagu_postit_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.beagu_postit_posts(id) ON DELETE CASCADE,
  author_uid uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 150),
  status text NOT NULL DEFAULT 'published' CHECK(status IN ('published','hidden','removed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS beagu_postit_comments_post_idx ON public.beagu_postit_comments(post_id,status,created_at);
CREATE INDEX IF NOT EXISTS beagu_postit_comments_author_idx ON public.beagu_postit_comments(author_uid,created_at DESC);
CREATE TABLE IF NOT EXISTS public.beagu_postit_reactions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  author_uid uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('post','comment')),
  target_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('like','report')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beagu_postit_reactions_unique UNIQUE(author_uid,target_type,target_id,kind)
);
CREATE INDEX IF NOT EXISTS beagu_postit_reactions_target_idx ON public.beagu_postit_reactions(target_type,target_id,kind);
ALTER TABLE public.beagu_postit_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beagu_postit_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beagu_postit_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beagu_postit_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.beagu_postit_settings,public.beagu_postit_posts,
  public.beagu_postit_comments,public.beagu_postit_reactions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.beagu_postit_settings,public.beagu_postit_posts,
  public.beagu_postit_comments,public.beagu_postit_reactions TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.beagu_postit_reactions_id_seq TO service_role;
COMMENT ON TABLE public.beagu_postit_posts IS 'Anonymous to readers; author_uid is private, never returned by public API.';
COMMENT ON TABLE public.beagu_postit_reactions IS 'Like or report per authenticated user; only server service role may query.';
