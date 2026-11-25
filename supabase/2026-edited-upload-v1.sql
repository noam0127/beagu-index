-- 2026 final edited workbook only. Existing 2023-25 rows never updated.
begin;
alter table public.beagu_edited_school_rows drop constraint beagu_edited_school_rows_survey_year_check;
alter table public.beagu_edited_school_rows add constraint beagu_edited_school_rows_survey_year_check check(survey_year in (2023,2024,2025,2026));
create or replace function public.beagu_2026_edited_publish_v1(p_actor uuid,p_session uuid,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $publish$
declare n integer; first_row integer;
begin
 if not exists(select 1 from public.beagu_admin_accounts where user_id=p_actor and enabled and role='owner') or not coalesce(public.beagu_admin_active_mfa_session(p_actor,p_session),false) then raise exception 'owner MFA required'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'invalid file';end if;
 n:=jsonb_array_length(p_rows);
 if n not between 1 and 7000 then raise exception 'invalid size';end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r where jsonb_typeof(r)<>'object' or not(r ?& array['school_id','percentile','questions']) or (r-array['school_id','percentile','questions'])<>'{}'::jsonb or coalesce(r->>'school_id','') !~ '^[A-Z0-9]{7}$' or jsonb_typeof(r->'percentile')<>'number' or (r->>'percentile')::numeric not between 0 and 100 or jsonb_typeof(r->'questions')<>'array') then raise exception 'invalid school row';end if;
 if (select count(distinct r->>'school_id') from jsonb_array_elements(p_rows) r)<>n then raise exception 'duplicate school';end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r where not exists(select 1 from public.schools s where s.school_id=r->>'school_id' and s.school_kind='초등학교' and s.status='운영')) then raise exception 'unknown school';end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r cross join lateral jsonb_array_elements(r->'questions') q where jsonb_typeof(q)<>'object' or not(q ?& array['questionId','row','values']) or (q-array['questionId','row','values'])<>'{}'::jsonb or coalesce(q->>'questionId','') !~ '^Q(0[1-9]|[1-4][0-9]|50)$' or q->>'questionId'='Q31' or jsonb_typeof(q->'row')<>'number' or jsonb_typeof(q->'values')<>'array' or jsonb_array_length(q->'values') not between 1 and 25) then raise exception 'invalid question';end if;
 perform pg_advisory_xact_lock(2026,11117);
 select coalesce(max(source_row),1)+1 into first_row from public.beagu_edited_school_rows where survey_year=2026;
 -- Full replacement of visible 2026 edited edition only. Previous rows retained, not deleted.
 update public.beagu_edited_school_rows set release_status='REJECTED' where survey_year=2026 and source_tab='2026 최종 편집본' and release_status='APPROVED';
 insert into public.beagu_edited_school_rows(survey_year,source_row,school_id,original_school_name,original_sido,original_support_office,source_tab,display_values,release_status,reviewed_by,reviewed_at)
 select 2026,first_row+row_number() over(order by s.school_id)-1,s.school_id,s.school_name,s.sido_standard,s.support_office,'2026 최종 편집본',jsonb_build_object('percentile',r->'percentile','questions',r->'questions'),'APPROVED',p_actor::text,clock_timestamp()
 from jsonb_array_elements(p_rows) r join public.schools s on s.school_id=r->>'school_id';
 return jsonb_build_object('ok',true,'schools',n);
end $publish$;
create or replace function public.beagu_2026_edited_read_v1(p_ids text[],p_level integer)
returns jsonb language sql stable security definer set search_path='' as $read$
 select jsonb_build_object('active',exists(select 1 from public.beagu_edited_school_rows where survey_year=2026 and source_tab='2026 최종 편집본' and release_status='APPROVED'),
 'schools',coalesce((select jsonb_object_agg(r.school_id,r.display_values) from public.beagu_edited_school_rows r
 where r.survey_year=2026 and r.source_tab='2026 최종 편집본' and r.release_status='APPROVED' and p_level in (1,2) and cardinality(p_ids) between 1 and 20 and r.school_id=any(p_ids)
 and not exists(select 1 from beagu_private.beagu_2026_civic_publication_hold h where h.school_id=r.school_id and h.active)
 and not exists(select 1 from beagu_private.beagu_2026_level_release_approvals l where l.access_level=p_level and not coalesce(l.approved,false))
 and not exists(select 1 from beagu_private.beagu_2026_percentile_v13_decisions d where d.id=(select d2.id from beagu_private.beagu_2026_percentile_v13_decisions d2 where d2.school_id=r.school_id and d2.access_level=p_level order by d2.decided_at desc,d2.id desc limit 1) and d.decision='REVOKE')
 ),'{}'::jsonb));
$read$;
revoke all on function public.beagu_2026_edited_publish_v1(uuid,uuid,jsonb),public.beagu_2026_edited_read_v1(text[],integer) from public,anon,authenticated;
grant execute on function public.beagu_2026_edited_publish_v1(uuid,uuid,jsonb),public.beagu_2026_edited_read_v1(text[],integer) to service_role;
commit;
