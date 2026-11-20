-- Cut over public telemetry to the verified, rate-limited Edge gateway.
-- Prerequisites: PR #149 on main, deployed GitHub Pages scripts, active
-- beagu-telemetry-v2 function, successful POST visit and ping tests.
-- These changes affect only anonymous telemetry writes; regular navigation
-- and school searches continue even if telemetry is unavailable.
revoke all on function public.beagu_record_visit(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.beagu_presence_ping_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.beagu_record_visit(uuid,uuid,text) to service_role;
grant execute on function public.beagu_presence_ping_v1(uuid,text) to service_role;
comment on function public.beagu_record_visit(uuid,uuid,text)
  is 'Internal telemetry writer. Public browsers must call beagu-telemetry-v2 Edge gateway.';
comment on function public.beagu_presence_ping_v1(uuid,text)
  is 'Internal presence writer. Public browsers must call beagu-telemetry-v2 Edge gateway.';
-- Rollback if required (run separately, not part of this migration):
-- grant execute on function public.beagu_record_visit(uuid,uuid,text) to anon,authenticated;
-- grant execute on function public.beagu_presence_ping_v1(uuid,text) to anon,authenticated;
