-- STAGING ONLY. Creates the structural dependencies of the real performance
-- capture RPC without any production data. Never run against production.
DO $$ BEGIN
 IF to_regclass('stage_private.fake_schools') IS NULL THEN
  RAISE EXCEPTION 'STOP: required isolated staging marker missing';
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS beagu_private.beagu_page_perf_rate_v1(
 visitor_id uuid NOT NULL,
 page text NOT NULL,
 operation text NOT NULL,
 last_sample_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(visitor_id,page,operation)
);
CREATE TABLE IF NOT EXISTS beagu_private.beagu_page_perf_samples_v1(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 page text NOT NULL,
 operation text NOT NULL,
 duration_ms integer NOT NULL,
 succeeded boolean NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.beagu_admin_accounts(
 user_id uuid PRIMARY KEY,enabled boolean NOT NULL DEFAULT false
);
ALTER TABLE beagu_private.beagu_page_perf_rate_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE beagu_private.beagu_page_perf_samples_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beagu_admin_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE beagu_private.beagu_page_perf_rate_v1,
 beagu_private.beagu_page_perf_samples_v1,public.beagu_admin_accounts
 FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE
 beagu_private.beagu_page_perf_rate_v1,
 beagu_private.beagu_page_perf_samples_v1,public.beagu_admin_accounts
 TO service_role;
