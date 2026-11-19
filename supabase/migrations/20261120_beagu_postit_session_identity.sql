-- Lv2 writers are verified by the existing beagu-level-api session.
-- Anonymous public view and pseudonymous user identity do not require an
-- unrelated Supabase Auth account. Only the server derives actor UUIDs.
ALTER TABLE public.beagu_postit_posts DROP CONSTRAINT IF EXISTS beagu_postit_posts_author_uid_fkey;
ALTER TABLE public.beagu_postit_comments DROP CONSTRAINT IF EXISTS beagu_postit_comments_author_uid_fkey;
ALTER TABLE public.beagu_postit_reactions DROP CONSTRAINT IF EXISTS beagu_postit_reactions_author_uid_fkey;
COMMENT ON COLUMN public.beagu_postit_posts.author_uid IS
'Pseudonymous stable actor UUID derived server-side from verified Lv2 identity, not exposed in public API.';
COMMENT ON COLUMN public.beagu_postit_comments.author_uid IS
'Server-derived pseudonymous actor ID, not shown to the public.';
COMMENT ON COLUMN public.beagu_postit_reactions.author_uid IS
'Server-derived pseudonymous actor ID, limited to one vote per target per actor.';