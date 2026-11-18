-- Extend existing arcade score/session validations to the five difficulty tiers.
-- Preserve the three legacy values for existing games and scores.
ALTER TABLE public.arcade_game_sessions
  DROP CONSTRAINT arcade_game_sessions_difficulty_check;
ALTER TABLE public.arcade_game_sessions
  ADD CONSTRAINT arcade_game_sessions_difficulty_check
  CHECK (difficulty IN ('easy','normal','hard','very_hard','extreme'));
ALTER TABLE public.arcade_game_scores
  DROP CONSTRAINT arcade_game_scores_difficulty_check;
ALTER TABLE public.arcade_game_scores
  ADD CONSTRAINT arcade_game_scores_difficulty_check
  CHECK (difficulty IN ('easy','normal','hard','very_hard','extreme'));
