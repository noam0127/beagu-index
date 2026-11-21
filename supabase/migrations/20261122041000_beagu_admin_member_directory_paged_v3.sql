-- v1.1.0 Stage34: database-filtered member directory for 4,001+ and 10,001+
-- verified Auth accounts. DRAFT only; do not apply before separate encrypted
-- production backup/restore validation and isolated staging Auth/RLS tests.
--
-- Privilege: Edge function verifies current auth.uid, active AAL2/MFA
-- session, and owner role BEFORE this RPC. Grant only service_role; no client.
-- The output is a fixed 20-record Auth-user projection, NEVER raw_auth JSON.
begin;

create or replace function public.beagu_admin_member_directory_v3(
  p_page integer,
  p_filter text default 'all',
  p_search text default ''
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_page integer;
  v_filter text;
  v_search text;
  v_now timestamptz := current_timestamp;
  v_total bigint;
  v_admins bigint;
  v_unconfirmed bigint;
  v_suspended bigint;
  v_matches bigint;
  v_rows jsonb := '[]'::jsonb;
begin
  if p_page is null or p_page < 1 or p_page > 100000 then
    raise exception 'invalid_page' using errcode = '22023';
  end if;
  v_page := p_page;
  v_filter := coalesce(p_filter,'all');
  if v_filter not in ('all','confirmed','unconfirmed','suspended','active') then
    raise exception 'invalid_filter' using errcode = '22023';
  end if;
  v_search := pg_catalog.btrim(coalesce(p_search,''));
  if pg_catalog.char_length(v_search) > 100 then
    raise exception 'invalid_search' using errcode = '22023';
  end if;

  -- One exact all-account scan for totals, instead of the legacy 20*200=4,000
  -- Auth REST scan which silently omitted the 4,001st user and beyond.
  select pg_catalog.count(*),
         pg_catalog.count(*) filter (where a.user_id is not null),
         pg_catalog.count(*) filter (where u.email_confirmed_at is null),
         pg_catalog.count(*) filter (where u.banned_until > v_now)
    into v_total,v_admins,v_unconfirmed,v_suspended
    from auth.users u
    left join public.beagu_admin_accounts a on a.user_id=u.id;

  -- Literal substring search avoids treating %, _ or backslashes as SQL
  -- wildcards. Stable tie-breaker (created_at,id) prevents ambiguous pages.
  select pg_catalog.count(*)
    into v_matches
    from auth.users u
   where (v_filter='all'
     or (v_filter='confirmed' and u.email_confirmed_at is not null)
     or (v_filter='unconfirmed' and u.email_confirmed_at is null)
     or (v_filter='suspended' and u.banned_until > v_now)
     or (v_filter='active' and (u.banned_until is null or u.banned_until <= v_now)))
     and (v_search='' or
          pg_catalog.strpos(pg_catalog.lower(coalesce(u.email,'')),pg_catalog.lower(v_search))>0 or
          pg_catalog.strpos(pg_catalog.lower(u.id::text),pg_catalog.lower(v_search))>0);

  select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', page.id,
        'email', page.email,
        'email_confirmed_at', page.email_confirmed_at,
        'created_at', page.created_at,
        'last_sign_in_at', page.last_sign_in_at,
        'banned_until', page.banned_until
      ) order by page.created_at desc,page.id desc
    ),'[]'::jsonb)
    into v_rows
    from (
      select u.id,u.email,u.email_confirmed_at,u.created_at,
             u.last_sign_in_at,u.banned_until
        from auth.users u
       where (v_filter='all'
         or (v_filter='confirmed' and u.email_confirmed_at is not null)
         or (v_filter='unconfirmed' and u.email_confirmed_at is null)
         or (v_filter='suspended' and u.banned_until > v_now)
         or (v_filter='active' and (u.banned_until is null or u.banned_until <= v_now)))
         and (v_search='' or
              pg_catalog.strpos(pg_catalog.lower(coalesce(u.email,'')),pg_catalog.lower(v_search))>0 or
              pg_catalog.strpos(pg_catalog.lower(u.id::text),pg_catalog.lower(v_search))>0)
       order by u.created_at desc,u.id desc
       limit 20 offset ((v_page-1)*20)
    ) page;

  return pg_catalog.jsonb_build_object(
    'rows', v_rows,
    'page', v_page,
    'page_size', 20,
    'filter', v_filter,
    'total_matches', v_matches,
    'total_users_scanned', v_total,
    'total_admins_scanned', v_admins,
    'unconfirmed_scanned', v_unconfirmed,
    'suspended_scanned', v_suspended,
    'truncated', false
  );
end;
$fn$;

revoke all on function public.beagu_admin_member_directory_v3(integer,text,text)
  from public, anon, authenticated;
grant execute on function public.beagu_admin_member_directory_v3(integer,text,text)
  to service_role;
comment on function public.beagu_admin_member_directory_v3(integer,text,text) is
  'Owner+AAL2 Edge-only aggregate; 20-record deterministic page, literal substring filters; no 4,000-user scan cap.';
commit;
