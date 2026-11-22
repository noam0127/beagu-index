-- Stage 38: isolated STAGING only (ycwuugggqbunlbwuzvbx).
-- Recreates the public admin audit event contract from production catalog metadata.
-- No production records are transferred; no browser access is granted.
CREATE TABLE IF NOT EXISTS public.beagu_admin_audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_user_id uuid,
 event_type text NOT NULL CHECK(length(event_type) BETWEEN 3 AND 64),
 outcome text NOT NULL CHECK(outcome IN ('success','denied','error')),
 details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(details)='object'),
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS beagu_admin_audit_events_recent_idx ON public.beagu_admin_audit_events(occurred_at DESC);
ALTER TABLE public.beagu_admin_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.beagu_admin_audit_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.beagu_admin_audit_events TO service_role;
REVOKE ALL ON SEQUENCE public.beagu_admin_audit_events_id_seq FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SEQUENCE public.beagu_admin_audit_events_id_seq TO service_role;

-- Existing staging default grants may be broader than expected.
REVOKE UPDATE,DELETE,TRUNCATE ON public.beagu_admin_audit_events FROM service_role;
