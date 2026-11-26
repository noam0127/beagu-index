-- ISOLATED CANDIDATE ONLY. DO NOT APPLY. No INSERT/UPDATE/DELETE or fabricated evidence.
-- Existing actual schema was inspected read-only on 2026-11-26.
-- Read-only exact reconstruction of eligible single-input or complete-response marginals.
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
), core as (
 select j,r.school_response_rows n,r.source_snapshot_at,q->>'id' id,
   (q->>'valid')::int valid,(q->>'invalid')::int invalid,q->'counts' counts
 from source_rows
 join public.beagu_2026_results_snapshot r on r.school_id=j->>0
 join beagu_private.beagu_2026_auto_review_status t on t.school_id=r.school_id and t.survey_year=2026
  and t.source_spreadsheet_id='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4'
 cross join lateral jsonb_array_elements(r.questions) q
 where r.school_response_rows=(j->>5)::int and r.school_match_status='EXACT_REGION_OFFICE_NAME'
  and t.technical_status='TECHNICAL_CHECK_PASSED' and t.source_response_rows=r.school_response_rows
  and t.matching_core_questions=13 and t.verified_catalog_questions=13 and t.checked_at>=r.source_snapshot_at
  and q->>'id' ~ '^Q(0[1-9]|1[0-3])
 select j->>0 as school_id, jsonb_build_object(
  'percentile',(j->>3)::numeric,
  'identity',coalesce(s.school_id is not null and s.school_name=j->>1 and s.status='운영',false),
  'scoreAgreement',v.score_agreement,
  -- Old data can prove an equal score, not the identity or currency of underlying rows.
  'sourceAgreement',case when v.source_snapshot_at>=p_generated_at::timestamptz then v.score_agreement else null::boolean end,
  'notice',null::boolean, -- current survey notice compatibility not verified
  'smallSample',null::boolean, -- no automatic rule/source confirmed
  'reidentification',null::boolean,
  'priorCombination',null::boolean,
  'manipulation',case when (j->>7)::int>0 or v.extreme_pattern then false else null::boolean end,
  'blocked',(
   exists(select 1 from beagu_private.beagu_2026_civic_publication_hold h where h.school_id=j->>0 and h.active)
   or exists(select 1 from beagu_private.beagu_2026_civic_feedback f where f.school_id=j->>0 and f.status in ('PENDING','REVIEWING'))
   or exists(select 1 from beagu_private.beagu_2026_percentile_v13_decisions d where d.school_id=j->>0 and d.access_level=2 and d.decision is distinct from 'APPROVE')
   or exists(select 1 from beagu_private.beagu_2026_level_release_approvals l where l.access_level=2 and l.approved is false)
   or exists(select 1 from beagu_private.beagu_2026_auto_review_status a where a.school_id=j->>0 and a.survey_year=2026 and a.technical_status is distinct from 'TECHNICAL_CHECK_PASSED')
  )
 ) as checks
 from source_rows left join public.schools s on s.school_id=j->>0
 left join score_check v on v.school_id=j->>0
)
select jsonb_build_object('generatedAt',p_generated_at,'schools',coalesce(jsonb_object_agg(school_id,checks),'{}'::jsonb)) from checks
$v14$;
revoke all on function public.beagu_2026_vi13_v14_checks(text[],text,integer) from public,anon,authenticated;
grant execute on function public.beagu_2026_vi13_v14_checks(text[],text,integer) to service_role;
-- The optional auto-exception table is absent from the live schema; if later installed,
-- its HOLD and REAGGREGATE must also be checked before any positive activation.
 and q->>'row'='-1'
), scored as (
 select *,case when jsonb_typeof(counts)='array' and jsonb_array_length(counts)=6 then (counts->>5)::int end sixth,
 case when id in ('Q12','Q13') then (counts->>4)::int else (counts->>5)::int end unknown_count,
 case when id in ('Q01','Q06','Q07','Q09','Q10','Q11') then 25*(counts->>1)::int+50*(counts->>2)::int+75*(counts->>3)::int+100*(counts->>4)::int
 when id in ('Q02','Q03','Q04','Q05','Q08') then 100*(counts->>0)::int+75*(counts->>1)::int+50*(counts->>2)::int+25*(counts->>3)::int
 when id='Q12' then 100*((counts->>0)::int+(counts->>1)::int)+50*(counts->>2)::int
 when id='Q13' then 100*((counts->>0)::int+(counts->>1)::int)+25*(counts->>2)::int end score
 from core
), grouped as (
 select j,n,source_snapshot_at,count(*) questions,count(distinct id) unique_questions,
 bool_and(valid=n and invalid=0 and sixth is not null and (id not in ('Q12','Q13') or sixth=0)
   and (select coalesce(sum(x::int),-1)=valid and bool_and(x::int between 0 and valid) from jsonb_array_elements_text(counts) x)) complete,
 sum(valid-unknown_count) answered,sum(score) total,
 sum(valid-unknown_count) filter(where id in ('Q01','Q02','Q03','Q04','Q05','Q12','Q13')) autonomy,
 sum(valid-unknown_count) filter(where id in ('Q06','Q07','Q08','Q09')) procedure,
 sum(valid-unknown_count) filter(where id in ('Q10','Q11')) respect,
 -- A sufficient warning signal only, not a finding of manipulation.
 (count(*) filter(where id ~ '^Q(0[1-9]|1[01])
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
 and (counts->>0)::int=n)=11
  or count(*) filter(where id ~ '^Q(0[1-9]|1[01])
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
 and (counts->>4)::int=n)=11) extreme_pattern
 from scored group by j,n,source_snapshot_at
), score_check as (
 select j->>0 school_id,source_snapshot_at,extreme_pattern,
 case when questions=13 and unique_questions=13 and complete and
  ((n=1 and answered>=9 and autonomy>=4 and procedure>=2 and respect>=1) or answered=13*n)
 then (case when n=1 then total::numeric*360360/nullif(answered,0) else total::numeric*360360/13 end)=(j->>6)::numeric
 else null end score_agreement
 from grouped
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
