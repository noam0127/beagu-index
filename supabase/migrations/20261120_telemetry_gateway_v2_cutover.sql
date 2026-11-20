-- Cutover executed on production after PR #149 GitHub Pages deploy and asset parity.
-- The service-role-only gateway continues to invoke the existing RPCs.
-- Anonymous callers cannot bypass source throttling via PostgREST.
revoke execute on function public.beagu_record_visit(uuid,uuid,text)
  from public,anon,authenticated;
revoke execute on function public.beagu_presence_ping_v1(uuid,text)
  from public,anon,authenticated;
grant execute on function public.beagu_record_visit(uuid,uuid,text)
  to service_role;
grant execute on function public.beagu_presence_ping_v1(uuid,text)
  to service_role;
