-- STAGING ONLY. Never apply to production!
-- Expose ONLY the REST route; explicitly prohibit any anonymous data access.
-- The restrictive policy remains an unconditional deny if future permissive
-- policies are added. service_role bypasses RLS for server-authenticated API.
CREATE POLICY beagu_stage_arcade_anon_deny_all ON public.arcade_game_scores
  AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
GRANT SELECT ON TABLE public.arcade_game_scores TO anon;
NOTIFY pgrst, 'reload schema';