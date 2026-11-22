-- Stage38 isolated staging schema ONLY. No school records copied from production.
CREATE TABLE IF NOT EXISTS public.schools (
 school_id text PRIMARY KEY,school_code text,school_name text NOT NULL,sido text NOT NULL,
 support_office text,establishment text,address text,homepage text,
 status text NOT NULL DEFAULT '운영',updated_at timestamptz NOT NULL DEFAULT now(),
 education_office_code text,education_office text,school_kind text,
 source text NOT NULL DEFAULT 'manual',last_synced_at timestamptz,sido_standard text
);
CREATE TABLE IF NOT EXISTS public.beagu_school_report_yearly (
 school_id text NOT NULL REFERENCES public.schools(school_id),survey_year smallint NOT NULL,
 percentile numeric,publication_status text NOT NULL DEFAULT 'PENDING',
 privacy_reviewed boolean NOT NULL DEFAULT false,source_status text NOT NULL DEFAULT 'NO_PUBLISHED_VALUE',
 source_version text NOT NULL DEFAULT 'unassigned',updated_at timestamptz NOT NULL DEFAULT now(),
 valid_observation_count integer,unique_respondents_reviewed boolean NOT NULL DEFAULT false,
 school_identity_reviewed boolean NOT NULL DEFAULT false,small_cell_reviewed boolean NOT NULL DEFAULT false,
 differencing_reviewed boolean NOT NULL DEFAULT false,manual_release_approved boolean NOT NULL DEFAULT false,
 manual_release_by text,manual_release_at timestamptz,release_evidence text,
 legacy_2025_eight_domain_mean numeric,percentile_method text,
 PRIMARY KEY(school_id,survey_year)
);
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beagu_school_report_yearly ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schools,public.beagu_school_report_yearly FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.schools,public.beagu_school_report_yearly TO service_role;
-- Intentionally no fake sort view: real view depends on verified facts, percentile, and view totals.
