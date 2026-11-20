-- Lv.1 sorting snapshot stores ONLY the already-approved fields of the existing
-- public.beagu_lv1_school_sort_index view, never raw teacher responses.
-- Direct clients cannot read it: RLS enabled, no anon/authenticated policies,
-- no anon/authenticated grants. Backend service_role reads authorized queries.
create table if not exists public.beagu_lv1_school_sort_cache_v1 as
select * from public.beagu_lv1_school_sort_index with no data;
alter table public.beagu_lv1_school_sort_cache_v1
  add constraint beagu_lv1_school_sort_cache_v1_pkey primary key (school_id);
alter table public.beagu_lv1_school_sort_cache_v1 enable row level security;
revoke all on public.beagu_lv1_school_sort_cache_v1 from public, anon, authenticated;
grant select on public.beagu_lv1_school_sort_cache_v1 to service_role;
create index if not exists lv1_sort_cache_region_office_idx
  on public.beagu_lv1_school_sort_cache_v1 (sido_standard,support_office);
create index if not exists lv1_sort_cache_name_idx
  on public.beagu_lv1_school_sort_cache_v1 (school_name);
create index if not exists lv1_sort_cache_name_trgm_idx
  on public.beagu_lv1_school_sort_cache_v1 using gin (school_name extensions.gin_trgm_ops);

create table if not exists beagu_private.beagu_lv1_sort_refresh_status_v1 (
 id smallint primary key check(id=1), refreshed_at timestamptz not null,
 records integer not null, changed_rows integer not null
);
alter table beagu_private.beagu_lv1_sort_refresh_status_v1 enable row level security;
revoke all on beagu_private.beagu_lv1_sort_refresh_status_v1 from public,anon,authenticated;

create or replace function beagu_private.refresh_lv1_school_sort_cache_v1()
returns integer
language plpgsql security definer set search_path=''
as $fn$
declare
 affected integer:=0;
 removed integer:=0;
 total_count integer:=0;
begin
 if not pg_catalog.pg_try_advisory_xact_lock(20261120,5) then
   return 0;
 end if;
 -- Unchanged rows are NOT rewritten every five minutes. A single transaction
 -- keeps the previous consistent snapshot available to readers until commit.
 insert into public.beagu_lv1_school_sort_cache_v1 as target
  (school_id,school_name,sido,sido_standard,support_office,address,establishment,school_kind,status,beagu_percentile_2025,student_count,student_reference_year,housing_price_won,junior_teacher_ratio,male_teacher_ratio,view_count)
 select school_id,school_name,sido,sido_standard,support_office,address,establishment,school_kind,status,beagu_percentile_2025,student_count,student_reference_year,housing_price_won,junior_teacher_ratio,male_teacher_ratio,view_count
 from public.beagu_lv1_school_sort_index
 where true
 on conflict (school_id) do update set
   school_name=excluded.school_name,
  sido=excluded.sido,
  sido_standard=excluded.sido_standard,
  support_office=excluded.support_office,
  address=excluded.address,
  establishment=excluded.establishment,
  school_kind=excluded.school_kind,
  status=excluded.status,
  beagu_percentile_2025=excluded.beagu_percentile_2025,
  student_count=excluded.student_count,
  student_reference_year=excluded.student_reference_year,
  housing_price_won=excluded.housing_price_won,
  junior_teacher_ratio=excluded.junior_teacher_ratio,
  male_teacher_ratio=excluded.male_teacher_ratio,
  view_count=excluded.view_count
 where
 (target.school_name,target.sido,target.sido_standard,target.support_office,target.address,target.establishment,target.school_kind,target.status,target.beagu_percentile_2025,target.student_count,target.student_reference_year,target.housing_price_won,target.junior_teacher_ratio,target.male_teacher_ratio,target.view_count) is distinct from
 (excluded.school_name,excluded.sido,excluded.sido_standard,excluded.support_office,excluded.address,excluded.establishment,excluded.school_kind,excluded.status,excluded.beagu_percentile_2025,excluded.student_count,excluded.student_reference_year,excluded.housing_price_won,excluded.junior_teacher_ratio,excluded.male_teacher_ratio,excluded.view_count);
 get diagnostics affected = row_count;
 delete from public.beagu_lv1_school_sort_cache_v1 t
 where not exists (
   select 1 from public.schools s
   where s.school_id=t.school_id and s.status='운영'
 );
 get diagnostics removed = row_count;
 select count(*) into total_count from public.beagu_lv1_school_sort_cache_v1;
 if total_count < 6000 or total_count > 12000 then
   raise exception 'Lv.1 sort snapshot count abnormal: %', total_count;
 end if;
 insert into beagu_private.beagu_lv1_sort_refresh_status_v1(id,refreshed_at,records,changed_rows)
 values (1,pg_catalog.now(),total_count,affected+removed)
 on conflict (id) do update
   set refreshed_at=excluded.refreshed_at,records=excluded.records,
       changed_rows=excluded.changed_rows;
 return affected+removed;
end
$fn$;
revoke all on function beagu_private.refresh_lv1_school_sort_cache_v1() from public,anon,authenticated;

-- Initialize and check before enabling the reader in the Edge API.
select beagu_private.refresh_lv1_school_sort_cache_v1();
-- The existing pg_cron extension already powers other scheduled tasks.
select cron.schedule('beagu-lv1-sort-cache-refresh-v1', '*/5 * * * *',
  'select beagu_private.refresh_lv1_school_sort_cache_v1();');
