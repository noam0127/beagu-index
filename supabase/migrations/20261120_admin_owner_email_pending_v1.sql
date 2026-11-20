-- Safely reserve an operator-approved Gmail address without creating Auth
-- users or sharing secrets in ChatGPT/GitHub. This migration holds no personal
-- address; the operator approval row is added separately in the private DB.
create table if not exists beagu_private.beagu_admin_owner_approvals_v1(
 email text primary key check(email=lower(btrim(email)) and length(email) between 3 and 254),
 approved_at timestamptz not null default now(),
 activated_at timestamptz,
 activated_user uuid references auth.users(id) on delete set null,
 note text not null default 'email verified by connected provider'
);
alter table beagu_private.beagu_admin_owner_approvals_v1 enable row level security;
revoke all on beagu_private.beagu_admin_owner_approvals_v1
 from public,anon,authenticated;
-- This deployment uses verified Supabase Auth signup and direct, explicit
-- owner approval. Revoke the prior one-time-code claim path while it is idle.
revoke execute on function public.beagu_admin_claim_invite_v1(text)
 from authenticated,anon,public;
