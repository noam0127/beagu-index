-- Temporary, game-scoped validity check for previously issued 2026 challenge identity codes.
-- Service-role only; never return codes or use as a Level 2 session.
create or replace function public.beagu_check_class_diary_guest_code(p_code text)
returns boolean language sql stable security definer set search_path = ''
as $$
 select p_code is not null and pg_catalog.length(p_code) between 10 and 29
 and exists (select 1 from beagu_private.challenge_identity_codes c
             where c.campaign='2026' and c.identity_code=p_code)
$$;
revoke all on function public.beagu_check_class_diary_guest_code(text) from public, anon, authenticated;
grant execute on function public.beagu_check_class_diary_guest_code(text) to service_role;
comment on function public.beagu_check_class_diary_guest_code(text) is 'Server-only check of preissued challenge codes for fictional Class Diary guest access; not Lv2 authorization.';
