-- Automatic percentile-only publication. No survey rows or historical decisions are changed.
-- Existing exact school review OR independently verified, snapshot-bound pipeline evidence is required.
-- Neither an unverified notice nor structural correctness establishes privacy.
create table if not exists beagu_private.beagu_2026_auto_exception(
 school_id text primary key references public.schools(school_id),
 action text not null check(action in ('HOLD','REAGGREGATE')),
 source_version text not null, candidate_updated_at timestamptz not null,
 actor uuid not null,reason text not null check(length(reason) between 12 and 500),
 updated_at timestamptz not null default clock_timestamp()
);
create table if not exists beagu_private.beagu_2026_auto_exception_audit(
 id bigint generated always as identity primary key,school_id text not null references public.schools(school_id),
 action text not null,source_version text not null,candidate_updated_at timestamptz not null,
 actor uuid not null,reason text not null,created_at timestamptz not null default clock_timestamp()
);
alter table beagu_private.beagu_2026_auto_exception enable row level security;
alter table beagu_private.beagu_2026_auto_exception_audit enable row level security;
revoke all on beagu_private.beagu_2026_auto_exception,beagu_private.beagu_2026_auto_exception_audit from public,anon,authenticated;
grant select,insert,update on beagu_private.beagu_2026_auto_exception to service_role;
grant select,insert on beagu_private.beagu_2026_auto_exception_audit to service_role;
grant usage,select on sequence beagu_private.beagu_2026_auto_exception_audit_id_seq to service_role;
-- A trusted verifier may supply this exact evidence. No public/admin-browser write route.
-- Do not create evidence merely from an observation count or a successful numeric calculation.
create table if not exists beagu_private.beagu_2026_auto_evidence(
 school_id text references public.schools(school_id) on delete restrict,source_version text not null,
 percentile numeric not null check(percentile between 0 and 100),
 valid_observations integer not null check(valid_observations>=1),percentile_method text not null,
 candidate_updated_at timestamptz not null,teacher_total integer not null check(teacher_total>0),
 teacher_source_sha256 text not null check(teacher_source_sha256 ~ '^[a-f0-9]{64}$'),
 evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$'),
 technical_verified boolean not null default false,school_identity_verified boolean not null default false,
 -- Historical evidence fields retained for compatibility; not publication gates.
 distinct_respondents_verified boolean not null default false,personal_data_verified boolean not null default false,
 small_sample_verified boolean not null default false,reidentification_verified boolean not null default false,
 prior_combination_verified boolean not null default false,verified_at timestamptz not null default clock_timestamp(),
 primary key(school_id,source_version)
);
alter table beagu_private.beagu_2026_auto_evidence enable row level security;
revoke all on beagu_private.beagu_2026_auto_evidence from public,anon,authenticated;
grant select,insert,update on beagu_private.beagu_2026_auto_evidence to service_role;
create or replace view beagu_private.beagu_2026_auto_preflight with(security_invoker=true) as
select a.school_id,a.source_version,a.percentile,a.valid_observation_count,a.updated_at,
 p.teacher_total,
 coalesce(c.decision='COMPATIBLE' and c.notice_compatible and c.anonymous_scope_reviewed,false) as scope_ok,
 coalesce(a.percentile between 0 and 100 and a.valid_observation_count>=1 and a.percentile_method='PERCENT_RANK_ASC_EXACT_MEAN_VI13_MIN9_A4_P2_R1' and p.teacher_total>0 and p.source_sha256 ~ '^[a-f0-9]{64}$' and a.valid_observation_count<=p.teacher_total,false) as structure_ok,
 -- Legacy exact reviews are reusable, never manufacture privacy/identity assertions.
 (r.school_id is not null or e.school_id is not null) as exact_evidence_ok,
 greatest(a.updated_at,c.reviewed_at,r.reviewed_at,e.verified_at) as eligible_since,
 (h.school_id is not null or x.school_id is not null) as held,
 x.action as exception_action
from public.beagu_school_report_yearly a
left join public.beagu_2026_official_school_profiles p using(school_id)
left join beagu_private.beagu_2026_percentile_scope_v13 c on c.source_version=a.source_version
-- Reuse real prior technical/mapping and anonymity-risk evidence without requiring individual identity/PII attestations.
left join beagu_private.beagu_2026_percentile_school_review_v13 r on r.school_id=a.school_id and r.source_version=a.source_version
 and r.percentile=a.percentile and r.valid_observations=a.valid_observation_count
 and r.percentile_method=a.percentile_method and r.teacher_total=p.teacher_total and r.teacher_source_sha256=p.source_sha256
 and r.reviewed_at>=a.updated_at and r.technical_reviewed and r.school_identity_reviewed
 and r.small_sample_reviewed and r.reidentification_reviewed and r.prior_data_combination_reviewed
 and not exists(select 1 from beagu_private.beagu_2026_civic_publication_hold old where old.school_id=a.school_id and (old.active or old.updated_at>=r.reviewed_at))
left join beagu_private.beagu_2026_auto_evidence e on e.school_id=a.school_id and e.source_version=a.source_version and e.percentile=a.percentile and e.valid_observations=a.valid_observation_count and e.percentile_method=a.percentile_method and e.candidate_updated_at=a.updated_at and e.teacher_total=p.teacher_total and e.teacher_source_sha256=p.source_sha256 and e.verified_at>=a.updated_at and e.technical_verified and e.school_identity_verified and e.small_sample_verified and e.reidentification_verified and e.prior_combination_verified
and not exists(select 1 from beagu_private.beagu_2026_civic_publication_hold old where old.school_id=a.school_id and old.updated_at>=e.verified_at)
left join beagu_private.beagu_2026_civic_publication_hold h on h.school_id=a.school_id and h.active
left join beagu_private.beagu_2026_auto_exception x on x.school_id=a.school_id
where a.survey_year=2026 and a.publication_status='WITHHELD';
revoke all on beagu_private.beagu_2026_auto_preflight from public,anon,authenticated;
grant select on beagu_private.beagu_2026_auto_preflight to service_role;
-- No per-school final approval click. Exact evidence and common scope remain mandatory.
create or replace function public.beagu_2026_auto_percentiles(p_ids text[],p_level integer)
returns jsonb language sql stable security invoker set search_path='' as $$
select coalesce(jsonb_object_agg(a.school_id,a.percentile),'{}'::jsonb)
from beagu_private.beagu_2026_auto_preflight a
where p_level=2 and cardinality(p_ids) between 1 and 20
and not exists(select 1 from unnest(p_ids) i where i is null or i !~ '^[A-Z0-9]{7}$')
and a.school_id=any(p_ids) and a.scope_ok and a.structure_ok and a.exact_evidence_ok and not a.held
and a.eligible_since<=now()
-- Never resurrect explicit withdrawal, and never supersede existing per-tier decisions.
and not exists(select 1 from beagu_private.beagu_2026_percentile_v13_decisions d where d.school_id=a.school_id and d.access_level=p_level)
and not exists(select 1 from beagu_private.beagu_2026_level_release_approvals l where l.access_level=p_level and (not coalesce(l.approved,false) or l.updated_at>=a.eligible_since))
$$;
create or replace function public.beagu_2026_auto_hidden_ids(p_ids text[])
returns text[] language sql stable security invoker set search_path='' as $$
select coalesce(array_agg(school_id),'{}'::text[]) from beagu_private.beagu_2026_auto_exception where cardinality(p_ids) between 1 and 20 and school_id=any(p_ids)
$$;
-- Independent, private reaggregation run history. Never replaces annual candidates.
create table if not exists beagu_private.beagu_2026_vi13_runs(
 id bigint generated always as identity primary key, source_started_at timestamptz not null unique,
 received_at timestamptz not null default clock_timestamp(), school_count integer not null,
 observations integer not null, unmatched integer not null, invalid integer not null,
 excluded integer not null, suspect integer not null, payload_sha256 text not null,
 candidates jsonb not null
);
alter table beagu_private.beagu_2026_vi13_runs enable row level security;
revoke all on beagu_private.beagu_2026_vi13_runs from public,anon,authenticated;
grant select,insert on beagu_private.beagu_2026_vi13_runs to service_role;
grant usage,select on sequence beagu_private.beagu_2026_vi13_runs_id_seq to service_role;
create or replace function public.beagu_2026_vi13_stage(p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare rows jsonb; started timestamptz; n int; obs int; rid bigint; ranked jsonb; fingerprint text;
begin
 if jsonb_typeof(p_payload) is distinct from 'object' or p_payload->>'kind' is distinct from 'VI13_REAGGREGATE_V1' or p_payload->>'source_spreadsheet_id' is distinct from '1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4' then raise exception 'source invalid';end if;
 rows:=p_payload->'schools';started:=(p_payload->>'started_at')::timestamptz;
 if jsonb_typeof(rows) is distinct from 'array' or started is null or started>now()+interval '1 minute' or started<now()-interval '1 day' then raise exception 'invalid snapshot';end if;
 n:=jsonb_array_length(rows);
 if n<1 or n>10000 or exists(select 1 from jsonb_array_elements(rows) e where jsonb_typeof(e) is distinct from 'object' or not (e ?& array['school_id','observations','sum_units','flags']) or (select count(*) from jsonb_object_keys(e))<>4 or e->>'school_id' !~ '^[A-Z0-9]{7}$' or e->>'observations' !~ '^[1-9][0-9]{0,4}$' or e->>'sum_units' !~ '^[0-9]{1,13}$' or e->>'flags' !~ '^[0-9]{1,5}$') then raise exception 'invalid aggregate';end if;
 if exists(select 1 from jsonb_to_recordset(rows) x(school_id text,observations int,sum_units numeric,flags int) where x.sum_units>36036000::numeric*x.observations or x.flags>x.observations or not exists(select 1 from public.schools s where s.school_id=x.school_id)) or (select count(distinct e->>'school_id') from jsonb_array_elements(rows) e)<>n then raise exception 'invalid cohort';end if;
 if exists(select 1 from unnest(array['unmatched','invalid','excluded','suspect']) k where coalesce(p_payload->>k,'') !~ '^[0-9]{1,5}$') then raise exception 'invalid diagnostics';end if;
 select sum(x.observations),jsonb_agg(jsonb_build_object('school_id',x.school_id,'observations',x.observations,'sum_units',x.sum_units,'flags',x.flags,'percentile',case when n=1 then 0 else 100::numeric*(select count(*) from jsonb_to_recordset(rows) y(school_id text,observations int,sum_units numeric,flags int) where y.sum_units*x.observations<x.sum_units*y.observations)/(n-1) end) order by x.school_id)
 into obs,ranked from jsonb_to_recordset(rows) x(school_id text,observations int,sum_units numeric,flags int);
 if obs>50000 then raise exception 'observation limit';end if;
 fingerprint:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(2026,26013);
 if exists(select 1 from beagu_private.beagu_2026_vi13_runs where source_started_at=started and payload_sha256<>fingerprint) then raise exception 'snapshot conflict';end if;
 insert into beagu_private.beagu_2026_vi13_runs(source_started_at,school_count,observations,unmatched,invalid,excluded,suspect,payload_sha256,candidates)
 values(started,n,obs,(p_payload->>'unmatched')::int,(p_payload->>'invalid')::int,(p_payload->>'excluded')::int,(p_payload->>'suspect')::int,fingerprint,ranked) on conflict(source_started_at) do nothing returning id into rid;
 return jsonb_build_object('ok',true,'schools',n,'observations',obs,'staged',true,'publication_changed',false);
end $$;
revoke all on function public.beagu_2026_vi13_stage(jsonb) from public,anon,authenticated;
grant execute on function public.beagu_2026_vi13_stage(jsonb) to service_role;

-- A completed private computation is not a publication decision. Keep holds until independently resolved.
create or replace view beagu_private.beagu_2026_vi13_request_state with(security_invoker=true) as
select x.school_id,x.updated_at as requested_at,r.id as run_id,r.source_started_at,
 case when r.id is null then 'PENDING'
 when exists(select 1 from jsonb_array_elements(r.candidates) j where j->>'school_id'=x.school_id) then 'STAGED'
 else 'NO_MATCH' end as state
from beagu_private.beagu_2026_auto_exception x
left join lateral (select id,source_started_at,candidates from beagu_private.beagu_2026_vi13_runs
 where source_started_at>=x.updated_at order by source_started_at desc limit 1) r on true
where x.action='REAGGREGATE';
revoke all on beagu_private.beagu_2026_vi13_request_state from public,anon,authenticated;
grant select on beagu_private.beagu_2026_vi13_request_state to service_role;
create or replace function public.beagu_2026_vi13_pending()
returns integer language sql stable security invoker set search_path='' as $vi13_pending$
select count(*)::integer from beagu_private.beagu_2026_vi13_request_state where state='PENDING'
$vi13_pending$;
revoke all on function public.beagu_2026_vi13_pending() from public,anon,authenticated;
grant execute on function public.beagu_2026_vi13_pending() to service_role;

create or replace function public.beagu_2026_auto_admin_status(p_actor uuid,p_session uuid,p_offset integer)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if p_actor is null or p_session is null or not exists(select 1 from public.beagu_admin_accounts where user_id=p_actor and role='owner' and enabled) or not coalesce(public.beagu_admin_active_mfa_session(p_actor,p_session),false) then raise exception 'owner MFA required';end if;
 if p_offset is null or p_offset not between 0 and 20000 then raise exception 'invalid offset';end if;
 return jsonb_build_object(
 'total',(select count(*) from beagu_private.beagu_2026_auto_preflight),
 'qa_count_match',(select count(*) from beagu_private.beagu_2026_auto_preflight a where exists(select 1 from beagu_private.beagu_2026_auto_review_status t where t.school_id=a.school_id and t.source_spreadsheet_id='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4' and t.survey_year=2026 and t.technical_status='TECHNICAL_CHECK_PASSED' and t.source_response_rows=a.valid_observation_count)),
 'reaggregation',(select jsonb_build_object('started_at',source_started_at,'schools',school_count,'observations',observations,'unmatched',unmatched,'invalid',invalid,'suspect',suspect) from beagu_private.beagu_2026_vi13_runs order by source_started_at desc limit 1),
 'reaggregation_pending',public.beagu_2026_vi13_pending(),
 'reaggregation_staged',(select count(*) from beagu_private.beagu_2026_vi13_request_state where state='STAGED'),
 'reaggregation_no_match',(select count(*) from beagu_private.beagu_2026_vi13_request_state where state='NO_MATCH'),
 'structural_pass',(select count(*) from beagu_private.beagu_2026_auto_preflight where structure_ok),
 'scope_pending',(select count(*) from beagu_private.beagu_2026_auto_preflight where not scope_ok),
 'auto_ready',(select count(*) from beagu_private.beagu_2026_auto_preflight where scope_ok and structure_ok and exact_evidence_ok and not held),
 'review_required',(select count(*) from beagu_private.beagu_2026_auto_preflight where not structure_ok or not exact_evidence_ok or held),
 'auto_lv1',0, -- Lv.1 2026 survey publication is disabled, including aged candidates.
 'auto_lv2',(select count(*) from beagu_private.beagu_2026_auto_preflight a where a.scope_ok and a.structure_ok and a.exact_evidence_ok and not a.held and a.eligible_since<=now() and not exists(select 1 from beagu_private.beagu_2026_percentile_v13_decisions d where d.school_id=a.school_id and d.access_level=2) and not exists(select 1 from beagu_private.beagu_2026_level_release_approvals l where l.access_level=2 and (not coalesce(l.approved,false) or l.updated_at>=a.eligible_since))),
 'source_versions',(select coalesce(jsonb_agg(distinct source_version),'[]'::jsonb) from beagu_private.beagu_2026_auto_preflight),
 'reports',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (select f.id,f.school_id,s.school_name,f.kind,f.detail,f.status,a.source_version,a.updated_at from beagu_private.beagu_2026_civic_feedback f join public.schools s using(school_id) left join beagu_private.beagu_2026_auto_preflight a using(school_id) where f.status in ('PENDING','REVIEWING') order by f.created_at desc limit 50) t),
 'suspects',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (select a.school_id,s.school_name,a.source_version,a.updated_at,a.exception_action,(select rs.state from beagu_private.beagu_2026_vi13_request_state rs where rs.school_id=a.school_id) as reaggregation_state,array_remove(array[case when not a.structure_ok then 'STRUCTURE' end,case when not a.exact_evidence_ok then 'EVIDENCE_UNVERIFIED' end,case when a.held then 'HELD' end],null) reasons from beagu_private.beagu_2026_auto_preflight a join public.schools s using(school_id) where not a.structure_ok or not a.exact_evidence_ok or a.held order by a.held desc,a.structure_ok,a.school_id offset p_offset limit 50) t));
end $$;
-- New reports may be sent for any catalogued school. No participation existence leak.
create or replace function public.beagu_2026_simple_report(p_school text,p_detail text,p_actor_hash text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare answer uuid;
begin
 if p_school is null or p_school !~ '^[A-Z0-9]{7}$' or p_actor_hash is null or p_actor_hash !~ '^[a-f0-9]{64}$' or length(trim(coalesce(p_detail,''))) not between 12 and 500 or p_detail ~ '[<>[:cntrl:]]' or not exists(select 1 from public.schools where school_id=p_school) then raise exception 'invalid report';end if;
 perform pg_advisory_xact_lock(hashtext(p_actor_hash));perform pg_advisory_xact_lock(2026,hashtext(p_school||':report'));
 if (select count(*) from beagu_private.beagu_2026_civic_feedback where actor_hash=p_actor_hash and created_at>now()-interval '24 hours')>=5 or (select count(*) from beagu_private.beagu_2026_civic_feedback where school_id=p_school and created_at>now()-interval '24 hours')>=80 then raise exception 'rate limited';end if;
 insert into beagu_private.beagu_2026_civic_feedback(school_id,kind,category,question_id,detail,actor_hash,verified_visitor) values(p_school,'REPORT','OTHER',null,trim(p_detail),p_actor_hash,null) returning id into answer;
 return answer;
end $$;
create or replace function public.beagu_2026_auto_admin_action(p_actor uuid,p_session uuid,p_school text,p_version text,p_updated timestamptz,p_feedback uuid,p_action text,p_reason text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.beagu_school_report_yearly; f beagu_private.beagu_2026_civic_feedback;
begin
 if p_actor is null or p_session is null or not exists(select 1 from public.beagu_admin_accounts where user_id=p_actor and role='owner' and enabled) or not coalesce(public.beagu_admin_active_mfa_session(p_actor,p_session),false) then raise exception 'owner MFA required';end if;
 if p_action is null or p_action not in ('NORMAL','HOLD','REAGGREGATE') or length(trim(coalesce(p_reason,''))) not between 12 and 500 or p_reason ~ '[<>[:cntrl:]]' then raise exception 'invalid action';end if;
 if p_feedback is not null then select * into strict f from beagu_private.beagu_2026_civic_feedback where id=p_feedback and school_id=p_school and status in ('PENDING','REVIEWING') for update;end if;
 if p_action='NORMAL' then
  if p_feedback is null then raise exception 'report required';end if;
  update beagu_private.beagu_2026_civic_feedback set status='NO_CHANGE',decision_reason=trim(p_reason),decision_by=p_actor,updated_at=clock_timestamp() where id=p_feedback;
  insert into beagu_private.beagu_2026_civic_feedback_audit(feedback_id,actor_id,action,reason) values(p_feedback,p_actor,'NO_CHANGE',trim(p_reason));
  return jsonb_build_object('ok',true,'action',p_action,'publication_changed',false);
 end if;
 select * into strict a from public.beagu_school_report_yearly where school_id=p_school and survey_year=2026;
 if a.source_version is distinct from p_version or a.updated_at is distinct from p_updated then raise exception 'candidate changed';end if;
 insert into beagu_private.beagu_2026_auto_exception(school_id,action,source_version,candidate_updated_at,actor,reason) values(p_school,p_action,p_version,p_updated,p_actor,trim(p_reason))
 on conflict(school_id) do update set action=excluded.action,source_version=excluded.source_version,candidate_updated_at=excluded.candidate_updated_at,actor=excluded.actor,reason=excluded.reason,updated_at=clock_timestamp();
 insert into beagu_private.beagu_2026_auto_exception_audit(school_id,action,source_version,candidate_updated_at,actor,reason) values(p_school,p_action,p_version,p_updated,p_actor,trim(p_reason));
 if p_feedback is not null then
 update beagu_private.beagu_2026_civic_feedback set status='REVIEWING',decision_reason=trim(p_reason),decision_by=p_actor,updated_at=clock_timestamp() where id=p_feedback;
 insert into beagu_private.beagu_2026_civic_feedback_audit(feedback_id,actor_id,action,reason) values(p_feedback,p_actor,p_action,trim(p_reason));
 end if;
 return jsonb_build_object('ok',true,'action',p_action,'reaggregation_pending',p_action='REAGGREGATE');
end $$;
revoke all on function public.beagu_2026_auto_percentiles(text[],integer),public.beagu_2026_auto_hidden_ids(text[]),public.beagu_2026_auto_admin_status(uuid,uuid,integer),public.beagu_2026_simple_report(text,text,text),public.beagu_2026_auto_admin_action(uuid,uuid,text,text,timestamptz,uuid,text,text) from public,anon,authenticated;
grant execute on function public.beagu_2026_auto_percentiles(text[],integer),public.beagu_2026_auto_hidden_ids(text[]),public.beagu_2026_auto_admin_status(uuid,uuid,integer),public.beagu_2026_simple_report(text,text,text),public.beagu_2026_auto_admin_action(uuid,uuid,text,text,timestamptz,uuid,text,text) to service_role;
