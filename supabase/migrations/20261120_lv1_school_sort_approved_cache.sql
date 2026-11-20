-- Lv.1 public-only school sort snapshot.
-- Source is the existing approved, service-role-only view. No raw survey rows.
-- A service-role Edge Function with a validated Lv.1 session is the only read path.
create table if not exists public.beagu_lv1_school_sort_cache as
select school_id, school_name, sido, sido_standard, support_office, address, establishment, school_kind, status, beagu_percentile_2025, student_count, student_reference_year, housing_price_won, junior_teacher_ratio, male_teacher_ratio, view_count
from public.beagu_lv1_school_sort_index with no data;

alter table public.beagu_lv1_school_sort_cache
  add constraint beagu_lv1_school_sort_cache_pk primary key (school_id);
alter table public.beagu_lv1_school_sort_cache enable row level security;
revoke all on public.beagu_lv1_school_sort_cache from public, anon, authenticated;
grant select on public.beagu_lv1_school_sort_cache to service_role;

create index if not exists beagu_lv1_cache_region_school_idx
  on public.beagu_lv1_school_sort_cache (sido_standard,school_name,school_id);
create index if not exists beagu_lv1_cache_region_office_idx
  on public.beagu_lv1_school_sort_cache (sido_standard,support_office,school_name);
create index if not exists beagu_lv1_cache_region_views_idx
  on public.beagu_lv1_school_sort_cache
  (sido_standard,view_count desc nulls last,school_name,school_id);
create index if not exists beagu_lv1_cache_region_students_idx
  on public.beagu_lv1_school_sort_cache
  (sido_standard,student_count desc nulls last,school_name,school_id);
create index if not exists beagu_lv1_cache_region_address_idx
  on public.beagu_lv1_school_sort_cache
  (sido_standard,address,school_name,school_id);
create index if not exists beagu_lv1_cache_school_name_trgm_idx
  on public.beagu_lv1_school_sort_cache using gin (school_name extensions.gin_trgm_ops);

create or replace function beagu_private.refresh_lv1_school_sort_cache_v1()
returns integer language plpgsql security definer set search_path = ''
as $$
declare source_total integer;
begin
  select count(*) into source_total from public.beagu_lv1_school_sort_index;
  -- Safety guard: do not replace healthy public data after a broken import.
  if source_total < 6000 or source_total > 15000 then
    raise exception 'Unexpected Lv1 school source count: %',source_total;
  end if;

  insert into public.beagu_lv1_school_sort_cache (school_id, school_name, sido, sido_standard, support_office, address, establishment, school_kind, status, beagu_percentile_2025, student_count, student_reference_year, housing_price_won, junior_teacher_ratio, male_teacher_ratio, view_count)
  select school_id, school_name, sido, sido_standard, support_office, address, establishment, school_kind, status, beagu_percentile_2025, student_count, student_reference_year, housing_price_won, junior_teacher_ratio, male_teacher_ratio, view_count
  from public.beagu_lv1_school_sort_index
  on conflict (school_id) do update set
    school_name = excluded.school_name,
    sido = excluded.sido,
    sido_standard = excluded.sido_standard,
    support_office = excluded.support_office,
    address = excluded.address,
    establishment = excluded.establishment,
    school_kind = excluded.school_kind,
    status = excluded.status,
    beagu_percentile_2025 = excluded.beagu_percentile_2025,
    student_count = excluded.student_count,
    student_reference_year = excluded.student_reference_year,
    housing_price_won = excluded.housing_price_won,
    junior_teacher_ratio = excluded.junior_teacher_ratio,
    male_teacher_ratio = excluded.male_teacher_ratio,
    view_count = excluded.view_count
  where (beagu_lv1_school_sort_cache.school_name, beagu_lv1_school_sort_cache.sido, beagu_lv1_school_sort_cache.sido_standard, beagu_lv1_school_sort_cache.support_office, beagu_lv1_school_sort_cache.address, beagu_lv1_school_sort_cache.establishment, beagu_lv1_school_sort_cache.school_kind, beagu_lv1_school_sort_cache.status, beagu_lv1_school_sort_cache.beagu_percentile_2025, beagu_lv1_school_sort_cache.student_count, beagu_lv1_school_sort_cache.student_reference_year, beagu_lv1_school_sort_cache.housing_price_won, beagu_lv1_school_sort_cache.junior_teacher_ratio, beagu_lv1_school_sort_cache.male_teacher_ratio, beagu_lv1_school_sort_cache.view_count)
    is distinct from (excluded.school_name, excluded.sido, excluded.sido_standard, excluded.support_office, excluded.address, excluded.establishment, excluded.school_kind, excluded.status, excluded.beagu_percentile_2025, excluded.student_count, excluded.student_reference_year, excluded.housing_price_won, excluded.junior_teacher_ratio, excluded.male_teacher_ratio, excluded.view_count);

  delete from public.beagu_lv1_school_sort_cache cache
  where not exists (
    select 1 from public.beagu_lv1_school_sort_index src
    where src.school_id=cache.school_id
  );
  return source_total;
end;
$$;
revoke all on function beagu_private.refresh_lv1_school_sort_cache_v1() from public, anon, authenticated;
select beagu_private.refresh_lv1_school_sort_cache_v1();
-- Cached views are refreshed every 15 minutes. 3-minute offset reduces cron overlap.
select cron.schedule(
  'beagu-lv1-school-sort-cache-refresh-v1',
  '3,18,33,48 * * * *',
  'select beagu_private.refresh_lv1_school_sort_cache_v1();'
);
