-- v1.11.16 draft: owner-uploaded percentile snapshot, separate from survey ingestion.
-- Install only after owner approves the full release. No historical data mutation.
create table if not exists beagu_private.beagu_2026_manual_rank_snapshots(
 id bigint generated always as identity primary key,
 created_at timestamptz not null default clock_timestamp(),
 actor uuid not null,
 rows jsonb not null,
 fingerprint text not null
);
alter table beagu_private.beagu_2026_manual_rank_snapshots enable row level security;
revoke all on beagu_private.beagu_2026_manual_rank_snapshots from public,anon,authenticated;
grant select,insert on beagu_private.beagu_2026_manual_rank_snapshots to service_role;
grant usage,select on sequence beagu_private.beagu_2026_manual_rank_snapshots_id_seq to service_role;

-- Strict aggregate-only payload; never accept raw responses, Q31, identity or counts.
create or replace function public.beagu_2026_manual_rank_upload(p_actor uuid,p_session uuid,p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare n integer; f text; latest record; new_id bigint;
begin
 if not exists(select 1 from public.beagu_admin_accounts a where a.user_id=p_actor and a.enabled and a.role='owner')
 or not coalesce(public.beagu_admin_active_mfa_session(p_actor,p_session),false) then
  raise exception 'owner MFA required';
 end if;
 if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'invalid rows'; end if;
 n:=jsonb_array_length(p_rows);
 if n<1 or n>10000 then raise exception 'invalid size'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r where jsonb_typeof(r)<>'object'
 or not(r ?& array['school_id','percentile'])
 or jsonb_typeof(r->'school_id')<>'string'
 or jsonb_typeof(r->'percentile')<>'number'
 or r->>'school_id' !~ '^[A-Z0-9]{7}$') then raise exception 'invalid row'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r where
 (select count(*) from jsonb_object_keys(r))<>2 or (r->>'percentile')::numeric not between 0 and 100
 or not exists(select 1 from public.schools s where s.school_id=r->>'school_id' and s.status='운영'))
 or (select count(distinct r->>'school_id') from jsonb_array_elements(p_rows) r)<>n then
 raise exception 'unknown school, duplicate or invalid score'; end if;
 -- Normalize row order for stable idempotence.
 select jsonb_agg(r order by r->>'school_id') into p_rows from jsonb_array_elements(p_rows) r;
 f:=encode(sha256(convert_to(p_rows::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(2026,11116);
 select id,fingerprint into latest from beagu_private.beagu_2026_manual_rank_snapshots order by id desc limit 1;
 if latest.fingerprint=f then return jsonb_build_object('ok',true,'schools',n,'snapshot',latest.id,'unchanged',true);end if;
 insert into beagu_private.beagu_2026_manual_rank_snapshots(actor,rows,fingerprint)
 values(p_actor,p_rows,f) returning id into new_id;
 return jsonb_build_object('ok',true,'schools',n,'snapshot',new_id,'unchanged',false);
end $$;
revoke all on function public.beagu_2026_manual_rank_upload(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.beagu_2026_manual_rank_upload(uuid,uuid,jsonb) to service_role;

-- Only the trusted Edge Function passes the server-verified level.
-- VI13 Q01-Q13 score 100 for horizontal conditions; PERCENT_RANK_ASC: higher is better.
-- Ties use school ID as a deterministic display order, not a claim of different scores.
create or replace function public.beagu_2026_manual_home_rank(p_level integer)
returns jsonb language sql stable security invoker set search_path='' as $$
 with current_snapshot as (
  select rows,created_at from beagu_private.beagu_2026_manual_rank_snapshots order by id desc limit 1
 ), ordered as (
  select row_number() over(order by a.percentile desc,a.school_id asc) as rank,
  a.school_id,s.school_name,s.sido,s.support_office,a.percentile
  from current_snapshot c cross join lateral jsonb_to_recordset(c.rows) a(school_id text,percentile numeric)
  join public.schools s on s.school_id=a.school_id
  where s.status='운영'
  and not exists(select 1 from beagu_private.beagu_2026_civic_publication_hold h where h.school_id=a.school_id and h.active)
  and not exists(select 1 from beagu_private.beagu_2026_auto_exception e where e.school_id=a.school_id)
 ), limits as(select case p_level when 0 then 10 when 1 then 30 when 2 then 100 else 0 end n)
 select jsonb_build_object('year',2026,'limit',(select n from limits),
 'updated_at',(select created_at from current_snapshot),
 'rows',coalesce((select jsonb_agg(to_jsonb(o) order by rank) from ordered o where rank<=(select n from limits)),'[]'::jsonb))
$$;
revoke all on function public.beagu_2026_manual_home_rank(integer) from public,anon,authenticated;
grant execute on function public.beagu_2026_manual_home_rank(integer) to service_role;
