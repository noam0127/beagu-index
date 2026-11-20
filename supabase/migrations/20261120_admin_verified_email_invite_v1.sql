-- One-time email-bound administrative enrollment.
-- The invitation code is issued and delivered out-of-band. No code or email
-- address is committed to GitHub. Public clients cannot list invitations.
create table if not exists beagu_private.beagu_admin_signup_invites_v1 (
  email text primary key check (email=lower(btrim(email)) and length(email) between 3 and 254),
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 8),
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null
);
alter table beagu_private.beagu_admin_signup_invites_v1 enable row level security;
revoke all on beagu_private.beagu_admin_signup_invites_v1 from public,anon,authenticated;

-- The request is authorized by a real Supabase Auth session. Its email must
-- match the private one-time invitation, be confirmed, and the user must prove
-- possession of a separate 128-bit high-entropy code delivered to that mailbox.
-- All rights are changed atomically, inside the function's transaction.
create or replace function public.beagu_admin_claim_invite_v1(p_code text)
returns boolean language plpgsql security definer set search_path=''
as $function$
declare
  v_actor uuid := auth.uid();
  v_email text;
  v_confirmed_at timestamptz;
  v_invite beagu_private.beagu_admin_signup_invites_v1%rowtype;
begin
  if v_actor is null or p_code is null
    or p_code !~ '^[0-9a-fA-F]{32}$' then return false; end if;
  select lower(u.email),u.email_confirmed_at
    into v_email,v_confirmed_at
  from auth.users u where u.id=v_actor;
  if v_email is null or v_confirmed_at is null then return false; end if;

  select * into v_invite
  from beagu_private.beagu_admin_signup_invites_v1
  where email=v_email
  for update;
  if not found or v_invite.redeemed_at is not null
     or v_invite.expires_at<=now()
     or v_invite.failed_attempts>=8 then return false; end if;
  if v_invite.code_hash is distinct from
     encode(extensions.digest(lower(p_code),'sha256'),'hex') then
    update beagu_private.beagu_admin_signup_invites_v1
    set failed_attempts=least(8,failed_attempts+1)
    where email=v_email;
    return false;
  end if;

  -- This is a single-owner bootstrap, never a general self-promotion API.
  if exists(select 1 from public.beagu_admin_accounts
            where role='owner' and enabled=true and user_id<>v_actor)
  then return false; end if;
  insert into public.beagu_admin_accounts(user_id,role,enabled)
    values(v_actor,'owner',true)
  on conflict(user_id) do update
    set role='owner',enabled=true,updated_at=now();
  update beagu_private.beagu_admin_signup_invites_v1
    set redeemed_at=now(),redeemed_by=v_actor where email=v_email;
  return true;
end
$function$;
revoke all on function public.beagu_admin_claim_invite_v1(text)
 from public,anon,authenticated;
grant execute on function public.beagu_admin_claim_invite_v1(text)
 to authenticated;
comment on function public.beagu_admin_claim_invite_v1(text) is
'One-time verified-email admin bootstrap; requires a distinct random code and an authenticated Supabase session. No client-specified email/role.';
