-- QA STAGING ONLY ycwuugggqbunlbwuzvbx; never apply to production.
-- No operational spreadsheet rows, referral events or reviewer accounts copied.
-- Preserve TST####-only school identifiers and deny-all RLS.
ALTER TABLE public.beagu_2026_results_snapshot
  ADD COLUMN IF NOT EXISTS school_response_rows integer NOT NULL DEFAULT 0
  CHECK (school_response_rows>=0);
CREATE TABLE IF NOT EXISTS beagu_private.beagu_2026_auto_review_status(
  source_spreadsheet_id text NOT NULL,
  school_id text NOT NULL REFERENCES public.schools(school_id),
  survey_year smallint NOT NULL DEFAULT 2026 CHECK(survey_year=2026),
  source_response_rows integer NOT NULL CHECK(source_response_rows>=0),
  technical_status text NOT NULL CHECK(technical_status IN
    ('PRELAUNCH_EXCLUDED','NO_OFFICIAL_DATA','NEEDS_SCHOOL_CHECK',
     'NEEDS_QUESTION_CHECK','TECHNICAL_CHECK_PASSED')),
  publication_status text NOT NULL DEFAULT 'WITHHELD' CHECK(publication_status='WITHHELD'),
  reasons text[] NOT NULL DEFAULT ARRAY[]::text[],
  matching_core_questions integer NOT NULL DEFAULT 0 CHECK(matching_core_questions BETWEEN 0 AND 13),
  verified_catalog_questions integer NOT NULL DEFAULT 0 CHECK(verified_catalog_questions BETWEEN 0 AND 13),
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(source_spreadsheet_id,school_id)
);
CREATE TABLE IF NOT EXISTS beagu_private.beagu_2026_quality_reviews(
  school_id text PRIMARY KEY REFERENCES public.schools(school_id) ON DELETE CASCADE,
  payload_sha256 text NOT NULL CHECK(payload_sha256~'^[a-f0-9]{64}$'),
  quality_status text NOT NULL CHECK(quality_status IN('AUTO_PASS','REVIEW_REQUIRED')),
  reasons text[] NOT NULL DEFAULT '{}'::text[],
  evidence_scope text NOT NULL DEFAULT 'AGGREGATE_ONLY' CHECK(evidence_scope='AGGREGATE_ONLY'),
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS beagu_private.beagu_2026_results_approval_audit(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id text NOT NULL,
  payload_sha256 text NOT NULL CHECK(payload_sha256~'^[a-f0-9]{64}$'),
  action text NOT NULL,
  actor text NOT NULL,
  evidence jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS beagu_private.beagu_2026_basis_review_events(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id text NOT NULL REFERENCES public.schools(school_id),
  payload_sha256 text NOT NULL CHECK(payload_sha256~'^[a-f0-9]{64}$'),
  action text NOT NULL CHECK(action IN('PENDING','REJECTED')),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  notice_source_ref text,
  notice_digest_sha256 text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  notes text NOT NULL CHECK(length(notes) BETWEEN 12 AND 500)
);
CREATE TABLE IF NOT EXISTS beagu_private.challenge_referral_quality_reviews(
  event_sha256 text PRIMARY KEY CHECK(event_sha256~'^[a-f0-9]{64}$'),
  respondent_visitor_id uuid,
  quality_status text NOT NULL CHECK(quality_status IN('AUTO_PASS','REVIEW_REQUIRED','MANUALLY_APPROVED','REJECTED')),
  signals text[] NOT NULL DEFAULT '{}'::text[],
  form_quality_attested boolean NOT NULL DEFAULT false,
  reviewer_user_id uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  notes text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stage_quality_manual_requires_review CHECK (
    quality_status NOT IN ('MANUALLY_APPROVED','REJECTED') OR
    (reviewer_user_id IS NOT NULL AND reviewed_at IS NOT NULL AND length(coalesce(notes,''))>=12)
  )
);
CREATE TABLE IF NOT EXISTS beagu_private.challenge_referral_quality_audit(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_sha256 text NOT NULL CHECK(event_sha256~'^[a-f0-9]{64}$'),
  action text NOT NULL CHECK(action IN('QUALITY_FLAGGED','QUALITY_RECOVERED',
    'OWNER_APPROVED','OWNER_REJECTED','FLAGGED','CLEARED','REJECTED','REVOKED')),
  actor_user_id uuid REFERENCES auth.users(id),
  reason_codes text[] NOT NULL DEFAULT '{}'::text[],
  recorded_at timestamptz NOT NULL DEFAULT now(),
  note text
);
ALTER TABLE beagu_private.beagu_2026_auto_review_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE beagu_private.beagu_2026_quality_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE beagu_private.beagu_2026_results_approval_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE beagu_private.beagu_2026_basis_review_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE beagu_private.challenge_referral_quality_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE beagu_private.challenge_referral_quality_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beagu_private.beagu_2026_auto_review_status FROM PUBLIC,anon,authenticated;
REVOKE ALL ON beagu_private.beagu_2026_quality_reviews FROM PUBLIC,anon,authenticated;
REVOKE ALL ON beagu_private.beagu_2026_results_approval_audit FROM PUBLIC,anon,authenticated;
REVOKE ALL ON beagu_private.beagu_2026_basis_review_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON beagu_private.challenge_referral_quality_reviews FROM PUBLIC,anon,authenticated;
REVOKE ALL ON beagu_private.challenge_referral_quality_audit FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';