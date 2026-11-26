-- ISOLATED CANDIDATE ONLY. DO NOT APPLY. No INSERT/UPDATE/DELETE or fabricated evidence.
-- Existing actual schema was inspected read-only on 2026-11-26.
-- This preflight deliberately returns NULL for unverified checks: its output cannot authorize
-- a school until real automated source/risk verification is connected. No school approval
-- or positive per-school evidence record is required/consulted.
create or replace function public.beagu_2026_vi13_v14_checks(p_ids text[],p_generated_at text,p_level integer)
returns jsonb language sql stable security invoker set search_path='' as $v14$
with snapshot as (
 select values_json from beagu_private.beagu_2026_vi13_sheet_snapshot_v1
 where singleton and generated_at>=now()-interval '48 hours'
 and values_json->0->>1=p_generated_at
 and p_level=2 and cardinality(p_ids) between 1 and 20
 and not exists(select 1 from unnest(p_ids) u(id) where id is null or id !~ '^[A-Z0-9]{7}$')
), source_rows as (
 select j from snapshot cross join lateral jsonb_array_elements(values_json) with ordinality t(j,i)
 where i>2 and j->>0=any(p_ids)
), checks as (
 select j->>0 as school_id, jsonb_build_object(
  'percentile',(j->>3)::numeric,
  'identity',coalesce(s.school_id is not null and s.school_name=j->>1 and s.status='운영',false),
  'sourceAgreement',null::boolean, -- aggregate alone cannot prove source-row agreement
  'notice',null::boolean, -- current survey notice compatibility not verified
  'smallSample',null::boolean, -- no automatic rule/source confirmed
  'reidentification',null::boolean,
  'priorCombination',null::boolean,
  'manipulation',case when (j->>7)::int>0 then false else null::boolean end,
  'blocked',(
   exists(select 1 from beagu_private.beagu_2026_civic_publication_hold h where h.school_id=j->>0 and h.active)
   or exists(select 1 from beagu_private.beagu_2026_civic_feedback f where f.school_id=j->>0 and f.status in ('PENDING','REVIEWING'))
   or exists(select 1 from beagu_private.beagu_2026_percentile_v13_decisions d where d.school_id=j->>0 and d.access_level=2 and d.decision is distinct from 'APPROVE')
   or exists(select 1 from beagu_private.beagu_2026_level_release_approvals l where l.access_level=2 and l.approved is false)
   or exists(select 1 from beagu_private.beagu_2026_auto_review_status a where a.school_id=j->>0 and a.survey_year=2026 and a.technical_status is distinct from 'TECHNICAL_CHECK_PASSED')
  )
 ) as checks
 from source_rows left join public.schools s on s.school_id=j->>0
)
select jsonb_build_object('generatedAt',p_generated_at,'schools',coalesce(jsonb_object_agg(school_id,checks),'{}'::jsonb)) from checks
$v14$;
revoke all on function public.beagu_2026_vi13_v14_checks(text[],text,integer) from public,anon,authenticated;
grant execute on function public.beagu_2026_vi13_v14_checks(text[],text,integer) to service_role;
-- The optional auto-exception table is absent from the live schema; if later installed,
-- its HOLD and REAGGREGATE must also be checked before any positive activation.
