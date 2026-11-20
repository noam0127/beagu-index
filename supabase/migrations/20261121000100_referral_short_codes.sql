alter table beagu_private.challenge_referral_profiles add column short_code text
  constraint challenge_referral_short_format check (short_code ~ '^[A-Za-z0-9_-]{8}$'),
  add constraint challenge_referral_short_unique unique (short_code);

create function public.beagu_referral_short_issue(p_hash text) returns text
language plpgsql security definer set search_path = '' as $$
declare code text;
begin
  select short_code into strict code from beagu_private.challenge_referral_profiles
    where campaign='2026' and referral_token_sha256=p_hash and not disabled for update;
  if code is not null then return code; end if;
  for attempt in 1..10 loop
    code := translate(encode(extensions.gen_random_bytes(6),'base64'),'+/','-_');
    begin
      update beagu_private.challenge_referral_profiles set short_code=code
        where campaign='2026' and referral_token_sha256=p_hash and not disabled;
      return code;
    exception when unique_violation then null;
    end;
  end loop;
  raise exception 'Short code allocation failed';
end $$;

create function public.beagu_referral_short_resolve(p_code text)
returns table(visitor uuid, identity_code text, token_hash text)
language sql stable security definer set search_path = '' as $$
  select p.visitor_id, c.identity_code, p.referral_token_sha256
  from beagu_private.challenge_referral_profiles p
  join beagu_private.challenge_identity_codes c using (campaign,visitor_id)
  where p.campaign='2026' and p.short_code=p_code and not p.disabled
    and exists (select 1 from beagu_private.challenge_referral_settings where name='public_enabled' and enabled)
$$;
revoke all on function public.beagu_referral_short_issue(text), public.beagu_referral_short_resolve(text) from public,anon,authenticated;
grant execute on function public.beagu_referral_short_issue(text), public.beagu_referral_short_resolve(text) to service_role;
