-- Staging-only experiment cleanup. No user or production records involved.
REVOKE SELECT ON TABLE public.arcade_game_scores FROM anon;
DROP POLICY IF EXISTS beagu_stage_arcade_anon_deny_all ON public.arcade_game_scores;
DROP TABLE IF EXISTS public.beagu_stage_rest_route_probe_20261123;
NOTIFY pgrst, 'reload schema';