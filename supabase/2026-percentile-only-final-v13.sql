-- Isolated percentile-only final decision. Install AFTER v1.3 review SQL.
-- Does not change annual candidates, legacy metrics, question snapshots or tier approvals.
create table if not exists beagu_private.beagu_2026_percentile_v13_decisions(
 id bigint generated always as identity primary key,
 school_id text not null references public.schools(school_id) on delete restrict,
 access_level integer not null check(access_level in (1,2)),
 source_version text not null,
 decision text not null check(decision in ('APPROVE','REVOKE')),
 percentile numeric not null check(percentile between 0 and 100),
 valid_observations integer not null check(valid_observations>=1),
 percentile_method text not null,
 candidate_updated_at timestamptz not null,
 scope_reviewed_at timestamptz not null,
 school_reviewed_at timestamptz not null,
 teacher_total integer not null check(teacher_total>0),
 teacher_source_sha256 text not null,
 actor uuid not null,
 decided_at timestamptz not null default clock_timestamp()
);
alter table beagu_private.beagu_2026_percentile_v13_decisions enable row level security;
revoke all on beagu_private.beagu_2026_percentile_v13_decisions from public,anon,authenticated;
grant select,insert on beagu_private.beagu_2026_percentile_v13_decisions to service_role;
grant usage,select on sequence beagu_private.beagu_2026_percentile_v13_decisions_id_seq to service_role;
create index if not exists beagu_2026_percentile_v13_decisions_latest on beagu_private.beagu_2026_percentile_v13_decisions(school_id,access_level,id desc);
create or replace view beagu_private.beagu_2026_percentile_v13_current
 with (security_invoker=true) as
 select a.school_id,a.source_version,a.percentile,a.valid_observation_count as valid_observations,
 a.percentile_method,a.updated_at as candidate_updated_at,c.reviewed_at as scope_reviewed_at,
 r.reviewed_at as school_reviewed_at,p.teacher_total,p.source_sha256 as teacher_source_sha256
 from public.beagu_school_report_yearly a
 join beagu_private.beagu_2026_percentile_scope_v13 c on c.source_version=a.source_version
 join beagu_private.beagu_2026_percentile_school_review_v13 r on r.school_id=a.school_id and r.source_version=a.source_version
 join public.beagu_2026_official_school_profiles p on p.school_id=a.school_id
 where a.survey_year=2026 and a.publication_status='WITHHELD'
 and a.percentile between 0 and 100 and a.valid_observation_count>=1 and p.teacher_total>0
 and c.decision='COMPATIBLE' and c.notice_compatible and c.anonymous_scope_reviewed
 and r.percentile=a.percentile and r.valid_observations=a.valid_observation_count
 and r.percentile_method=a.percentile_method and r.teacher_total=p.teacher_total
 and r.teacher_source_sha256=p.source_sha256 and r.reviewed_at>=a.updated_at
 and r.technical_reviewed and r.school_identity_reviewed and r.unique_respondents_reviewed
 and r.personal_data_reviewed and r.small_sample_reviewed and r.reidentification_reviewed and r.prior_data_combination_reviewed
 and not exists(select 1 from beagu_private.beagu_2026_civic_publication_hold h where h.school_id=a.school_id and h.active);
revoke all on beagu_private.beagu_2026_percentile_v13_current from public,anon,authenticated;
grant select on beagu_private.beagu_2026_percentile_v13_current to service_role;
create or replace function public.beagu_2026_percentile_v13_decide(
 p_school text,p_version text,p_expected_percentile numeric,p_expected_observations integer,
 p_level integer,p_actor uuid,p_session uuid,p_action text,p_confirmation text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c beagu_private.beagu_2026_percentile_v13_current; d beagu_private.beagu_2026_percentile_v13_decisions;
begin
 if p_actor is null or p_session is null or not exists(select 1 from public.beagu_admin_accounts a where a.user_id=p_actor and a.role='owner' and a.enabled)
 or not coalesce(public.beagu_admin_active_mfa_session(p_actor,p_session),false) then raise exception 'owner MFA required'; end if;
 if p_school is null or p_school !~ '^[A-Z0-9]{7}$' or p_version is null or p_level is null or p_level not in (1,2)
 or p_action is null or p_action not in ('APPROVE','REVOKE') or p_confirmation is distinct from (p_action||'_PERCENTILE_ONLY')
 then raise exception 'explicit percentile-only decision required'; end if;
 perform pg_advisory_xact_lock(2026,hashtext(p_school||':'||p_level::text));
 if p_action='APPROVE' then
  select * into strict c from beagu_private.beagu_2026_percentile_v13_current where school_id=p_school and source_version=p_version;
  if c.percentile is distinct from p_expected_percentile or c.valid_observations is distinct from p_expected_observations
  then raise exception 'candidate changed'; end if;
  insert into beagu_private.beagu_2026_percentile_v13_decisions(school_id,access_level,source_version,decision,percentile,valid_observations,percentile_method,candidate_updated_at,scope_reviewed_at,school_reviewed_at,teacher_total,teacher_source_sha256,actor)
  values(c.school_id,p_level,c.source_version,'APPROVE',c.percentile,c.valid_observations,c.percentile_method,c.candidate_updated_at,c.scope_reviewed_at,c.school_reviewed_at,c.teacher_total,c.teacher_source_sha256,p_actor);
 else
  select * into strict d from beagu_private.beagu_2026_percentile_v13_decisions where school_id=p_school and access_level=p_level order by id desc limit 1;
  if d.source_version is distinct from p_version or d.percentile is distinct from p_expected_percentile or d.valid_observations is distinct from p_expected_observations or d.decision<>'APPROVE'
  then raise exception 'approval changed or already revoked'; end if;
  insert into beagu_private.beagu_2026_percentile_v13_decisions(school_id,access_level,source_version,decision,percentile,valid_observations,percentile_method,candidate_updated_at,scope_reviewed_at,school_reviewed_at,teacher_total,teacher_source_sha256,actor)
  values(d.school_id,p_level,d.source_version,'REVOKE',d.percentile,d.valid_observations,d.percentile_method,d.candidate_updated_at,d.scope_reviewed_at,d.school_reviewed_at,d.teacher_total,d.teacher_source_sha256,p_actor);
 end if;
 return jsonb_build_object('ok',true,'scope','PERCENTILE_ONLY','level',p_level,'decision',p_action);
end $$;
-- Only the authorized server API may request 1..20 school IDs. Never return metadata,
-- respondent counts, raw answers or approval evidence. Lv1 has the existing 24h delay.
create or replace function public.beagu_2026_percentile_v13_values(p_ids text[],p_level integer)
returns jsonb language sql stable security invoker set search_path='' as $$
 with latest as (
 select distinct on (d.school_id) d.* from beagu_private.beagu_2026_percentile_v13_decisions d
 where p_level in (1,2) and cardinality(p_ids) between 1 and 20
 and not exists(select 1 from unnest(p_ids) x where x is null or x !~ '^[A-Z0-9]{7}$')
 and d.school_id=any(p_ids) and d.access_level=p_level order by d.school_id,d.id desc
 )
 select coalesce(jsonb_object_agg(c.school_id,c.percentile),'{}'::jsonb)
 from latest d join beagu_private.beagu_2026_percentile_v13_current c using(school_id,source_version,percentile,valid_observations,percentile_method,candidate_updated_at,scope_reviewed_at,school_reviewed_at,teacher_total,teacher_source_sha256)
 where d.decision='APPROVE' and d.decided_at<=now()
 and (p_level=2 or d.decided_at<=now()-interval '24 hours')
 and not exists(select 1 from beagu_private.beagu_2026_civic_publication_hold h where h.school_id=d.school_id and h.updated_at>=d.decided_at)
 -- A subsequent existing tier decision invalidates this separate approval, never reopens it.
 and not exists(select 1 from beagu_private.beagu_2026_level_release_approvals l where l.access_level=d.access_level and l.updated_at>=d.decided_at)
$$;
revoke all on function public.beagu_2026_percentile_v13_decide(text,text,numeric,integer,integer,uuid,uuid,text,text),public.beagu_2026_percentile_v13_values(text[],integer) from public,anon,authenticated;
grant execute on function public.beagu_2026_percentile_v13_decide(text,text,numeric,integer,integer,uuid,uuid,text,text),public.beagu_2026_percentile_v13_values(text[],integer) to service_role;
