-- QA ONLY. Project ycwuugggqbunlbwuzvbx, never production.
-- No data copied. Null values are intentionally fail-closed at classifier.
ALTER TABLE public.beagu_release_metrics_v2
  ADD COLUMN IF NOT EXISTS n_valid integer,
  ADD COLUMN IF NOT EXISTS teacher_count integer;
-- Raw numbers remain on server; classifier may only return an approved type.
ALTER TABLE public.beagu_release_metrics_v2
  ADD CONSTRAINT beagu_stage_culture_n_valid_nonnegative
  CHECK (n_valid IS NULL OR n_valid >= 0);
ALTER TABLE public.beagu_release_metrics_v2
  ADD CONSTRAINT beagu_stage_culture_teacher_count_nonnegative
  CHECK (teacher_count IS NULL OR teacher_count >= 0);
