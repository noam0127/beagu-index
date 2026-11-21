-- Stage34: read-only verified retrieval of 10,001 synthetic accounts.
-- Protect this entire script as isolated PostgreSQL CI only.
do $perm$
begin
 if has_function_privilege('anon',
   'public.beagu_admin_member_directory_v3(integer,text,text)','EXECUTE')
 or has_function_privilege('authenticated',
   'public.beagu_admin_member_directory_v3(integer,text,text)','EXECUTE')
 or not has_function_privilege('service_role',
   'public.beagu_admin_member_directory_v3(integer,text,text)','EXECUTE')
 then raise exception 'member directory RPC is not service-role-only';
 end if;
end $perm$;

set role service_role;
do $qa$
declare
  r jsonb; r200 jsonb; r201 jsonb; r500 jsonb; r501 jsonb;
  started timestamptz:=pg_catalog.clock_timestamp();
begin
 r:=public.beagu_admin_member_directory_v3(1,'all','');
 if r->>'total_matches'<>'10001'
  or r->>'total_users_scanned'<>'10001'
  or r->>'total_admins_scanned'<>'1'
  or r->>'unconfirmed_scanned'<>'2500'
  or r->>'suspended_scanned'<>'1000'
  or r->>'truncated'<>'false'
  or r->>'page_size'<>'20'
  or pg_catalog.jsonb_array_length(r->'rows')<>20
 then raise exception '10,001-account real totals or 20-row limit failed: %',r;
 end if;
 if r->'rows'->0->>'email'<>'teacher10001@example.test' then
  raise exception 'first page order/PII projection wrong';
 end if;

 -- Exactly the boundary that failed with the legacy 4,000-auth-user scan.
 r200:=public.beagu_admin_member_directory_v3(200,'all','');
 r201:=public.beagu_admin_member_directory_v3(201,'all','');
 if pg_catalog.jsonb_array_length(r200->'rows')<>20
  or pg_catalog.jsonb_array_length(r201->'rows')<>20
  or r201->'rows'->0->>'email'<>'teacher06001@example.test'
  or r200->'rows'->19->>'id'=r201->'rows'->0->>'id'
 then raise exception '4,000/4,001 boundary skips or repeats rows';
 end if;

 r500:=public.beagu_admin_member_directory_v3(500,'all','');
 r501:=public.beagu_admin_member_directory_v3(501,'all','');
 if pg_catalog.jsonb_array_length(r500->'rows')<>20
  or pg_catalog.jsonb_array_length(r501->'rows')<>1
  or r501->'rows'->0->>'email'<>'teacher00001@example.test'
  or pg_catalog.jsonb_array_length(
    public.beagu_admin_member_directory_v3(502,'all','')->'rows')<>0
 then raise exception '10,000/10,001 boundary skips, repeats or truncates';
 end if;

 r:=public.beagu_admin_member_directory_v3(1,'unconfirmed','');
 if r->>'total_matches'<>'2500'
   or pg_catalog.jsonb_array_length(r->'rows')<>20
   or pg_catalog.jsonb_array_length(
     public.beagu_admin_member_directory_v3(126,'unconfirmed','')->'rows')<>0
 then raise exception 'unconfirmed filter across 10k users failed';
 end if;
 r:=public.beagu_admin_member_directory_v3(376,'confirmed','');
 if r->>'total_matches'<>'7501'
    or pg_catalog.jsonb_array_length(r->'rows')<>1
 then raise exception 'confirmed final-page count failed';
 end if;
 r:=public.beagu_admin_member_directory_v3(451,'active','');
 if r->>'total_matches'<>'9001'
   or pg_catalog.jsonb_array_length(r->'rows')<>1
 then raise exception 'active filter final-page count failed';
 end if;
 r:=public.beagu_admin_member_directory_v3(50,'suspended','');
 if r->>'total_matches'<>'1000'
   or pg_catalog.jsonb_array_length(r->'rows')<>20
 then raise exception 'suspended filter failed';
 end if;
 r:=public.beagu_admin_member_directory_v3(1,'all','teacher00001');
 if r->>'total_matches'<>'1'
   or r->'rows'->0->>'email'<>'teacher00001@example.test'
 then raise exception 'search in the entire 10k population failed';
 end if;
 if public.beagu_admin_member_directory_v3(1,'all','TEACHER00001')->>'total_matches'<>'1'
 or public.beagu_admin_member_directory_v3(1,'all','%')->>'total_matches'<>'0'
 then raise exception 'literal case-insensitive search or wildcard exclusion failed';
 end if;

 -- The list RPC may never copy full Auth metadata into one API response.
 r:=public.beagu_admin_member_directory_v3(1,'all','');
 if exists (
   select 1 from pg_catalog.jsonb_object_keys(r->'rows'->0) as k(key)
   where k.key not in (
     'id','email','email_confirmed_at','created_at',
     'last_sign_in_at','banned_until'
   )
 ) then raise exception 'nonallowlisted Auth key in 20-record projection';end if;
 raise notice 'Stage34 synthetic: 10,001 Auth user directory and filters verified in % ms',
   1000*pg_catalog.date_part('epoch',(pg_catalog.clock_timestamp()-started));
end $qa$;
reset role;

select 'PASS: stage34 4,001st/10,001st users, exact 20-row pages, case-insensitive literal search, status filters, service_role only' as result;
