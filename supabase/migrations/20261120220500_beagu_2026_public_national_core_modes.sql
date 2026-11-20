-- Unattended PUBLIC 2026 national trends, WITHOUT school identification.
-- Only modal choices from pooled verified-catalogue Q01-Q11 and Q13.
-- No school rows, counts, personal facts, sensitive Q31, free text, or small cells.
create or replace function public.beagu_2026_public_national_core_modes()
returns jsonb language sql stable security definer set search_path='' as $fn$
with base as (
 select s.school_id, j.q->>'id' as qid,
  (j.q->>'valid')::integer as valid,
  (j.q->>'invalid')::integer as invalid,
  j.q->'counts' as counts
 from public.beagu_2026_results_snapshot s
 cross join lateral jsonb_array_elements(s.questions) j(q)
 where s.school_match_status='EXACT_REGION_OFFICE_NAME'
   and j.q->>'id' in ('Q01','Q02','Q03','Q04','Q05','Q06','Q07',
                      'Q08','Q09','Q10','Q11','Q13')
   and (j.q->>'row')::integer=-1
   and (j.q->>'invalid')::integer=0
   and (j.q->>'valid')::integer>0
),
cohorts as (
 select qid,count(distinct school_id)::integer as schools,
  sum(valid)::integer as respondents
 from base group by qid
 having count(distinct school_id)>=100 and sum(valid)>=200
),
choices as (
 select b.qid,(a.ord-1)::integer as choice_index,
  sum(a.value::integer)::integer as responses
 from base b
 cross join lateral jsonb_array_elements_text(b.counts) with ordinality a(value,ord)
 group by b.qid,a.ord
),
ranked as (
 select c.qid,c.choice_index,c.responses,k.respondents,
  row_number() over(partition by c.qid order by c.responses desc,c.choice_index asc) as rnk,
  lead(c.responses) over(partition by c.qid order by c.responses desc,c.choice_index asc) as runner_up
 from choices c inner join cohorts k on k.qid=c.qid
),
output as (
 select qid,choice_index from ranked where rnk=1
  and responses>=30 and responses*5>=respondents
  and responses>coalesce(runner_up,0)
)
select jsonb_build_object(
 'year',2026,
 'scope','NATIONAL_POOLED_VOLUNTARY_RESPONDENTS',
 'representative',false,
 'minimum_cohort_responses',200,
 'items',coalesce(
    (select jsonb_agg(jsonb_build_object('question_id',qid,'mode_option_index',choice_index)
       order by qid) from output),'[]'::jsonb)
);
$fn$;
revoke all on function public.beagu_2026_public_national_core_modes() from public;
grant execute on function public.beagu_2026_public_national_core_modes() to anon,authenticated,service_role;
