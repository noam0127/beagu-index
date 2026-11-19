-- Hardened replacement for the existing challenge UUID-only issuer.
-- Prepared only: production Edge issuer is NOT replaced in phase 1.
create table if not exists beagu_private.challenge_device_claims(
  campaign text not null default '2026',
  visitor_id uuid not null,
  device_secret_sha256 text not null check (device_secret_sha256 ~ '^[0-9a-f]{64}$'),
  claimed_at timestamptz not null default now(),
  primary key(campaign,visitor_id)
);
alter table beagu_private.challenge_device_claims enable row level security;
revoke all on beagu_private.challenge_device_claims from public,anon,authenticated;

create or replace function public.beagu_issue_challenge_identity_bound(
  p_visitor uuid, p_device_hash text, p_existing_code text default null
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare stored_hash text;
        stored_code text;
begin
 if p_visitor is null or p_device_hash !~ '^[a-f0-9]{64}$'
 then raise exception 'invalid device' using errcode='22023'; end if;
 -- Avoid first-claimer races and never release an existing code by UUID alone.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_visitor::text),2604);
 select device_secret_sha256 into stored_hash
 from beagu_private.challenge_device_claims
 where campaign='2026' and visitor_id=p_visitor;
 if found then
   if stored_hash<>p_device_hash
   then raise exception 'device proof mismatch' using errcode='28000'; end if;
 else
   select identity_code into stored_code from beagu_private.challenge_identity_codes
   where campaign='2026' and visitor_id=p_visitor;
   if stored_code is not null and
      (p_existing_code is null or stored_code<>p_existing_code)
   then raise exception 'legacy proof required' using errcode='28000'; end if;
   insert into beagu_private.challenge_device_claims(campaign,visitor_id,device_secret_sha256)
   values('2026',p_visitor,p_device_hash);
 end if;
 return public.beagu_issue_challenge_identity(p_visitor);
end $$;
revoke all on function public.beagu_issue_challenge_identity_bound(uuid,text,text)
from public,anon,authenticated;
grant execute on function public.beagu_issue_challenge_identity_bound(uuid,text,text)
to service_role;
