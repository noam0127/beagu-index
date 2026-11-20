-- Accelerate both public school-name search and arcade school suggestions.
-- Partial trigram index covers only operating schools and does not alter row visibility.
create extension if not exists pg_trgm with schema extensions;
create index if not exists schools_operating_name_trgm_idx
  on public.schools using gin (school_name extensions.gin_trgm_ops)
  where status='운영';
