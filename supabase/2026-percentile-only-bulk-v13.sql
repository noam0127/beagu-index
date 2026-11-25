-- Candidate only. No changes to survey rows, existing decisions or question release.
-- New batches include only freshly eligible school/tier pairs with no previous decision.
create or replace function public.beagu_2026_percentile_v13_bulk(
 p_version text,p_levels integer[],p_actor uuid,p_session uuid,p_preview boolean,
 p_token text,p_confirmation text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare items jsonb; snapshot_token text; result jsonb; pair record; n integer;
begin
 if p_actor is null or p_session is null or not exists(select 1 from public.beagu_admin_accounts a where a.user_id=p_actor and a.role='owner' and a.enabled)
 or not coalesce(public.beagu_admin_active_mfa_session(p_actor,p_session),false) then raise exception 'owner MFA required';end if;
 if p_version is null or length(p_version) not between 8 and 160 or p_preview is null
 or not coalesce(p_levels=array[1] or p_levels=array[2] or p_levels=array[1,2],false)
 then raise exception 'invalid batch';end if;
 if not p_preview and (p_confirmation is distinct from 'APPROVE_REVIEWED_PERCENTILES_ONLY' or p_token is null or p_token !~ '^[a-f0-9]{64}$') then raise exception 'explicit batch confirmation required';end if;
 if not p_preview then
  -- Serialize against individual decisions using the same locks in deterministic order.
  for pair in select c.school_id,l.level from beagu_private.beagu_2026_percentile_v13_current c
   cross join unnest(p_levels) l(level) where c.source_version=p_version order by c.school_id,l.level
  loop perform pg_advisory_xact_lock(2026,hashtext(pair.school_id||':'||pair.level::text));end loop;
 end if;
 select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('access_level',l.level) order by c.school_id,l.level),'[]'::jsonb)
 into items from beagu_private.beagu_2026_percentile_v13_current c cross join unnest(p_levels) l(level)
 where c.source_version=p_version and nullif(c.percentile_method,'') is not null and c.teacher_source_sha256 ~ '^[a-f0-9]{64}$' and not exists(select 1 from beagu_private.beagu_2026_percentile_v13_decisions d where d.school_id=c.school_id and d.access_level=l.level);
 n:=jsonb_array_length(items);
 if n>2000 then raise exception 'batch too large';end if;
 snapshot_token:=encode(sha256(convert_to(jsonb_build_object('version',p_version,'levels',p_levels,'actor',p_actor,'session',p_session,'items',items)::text,'UTF8')),'hex');
 if p_preview then
  return (select jsonb_build_object('ok',true,'preview',true,'token',snapshot_token,'eligible_pairs',n,
   'eligible_schools', (select count(distinct i->>'school_id') from jsonb_array_elements(items) i),
   'lv1_pairs',(select count(*) from jsonb_array_elements(items) i where i->>'access_level'='1'),
   'lv2_pairs',(select count(*) from jsonb_array_elements(items) i where i->>'access_level'='2'),
   'candidate_schools',count(*),
   'structure_ok',count(*) filter(where a.percentile between 0 and 100 and a.valid_observation_count>=1 and nullif(a.percentile_method,'') is not null and s.school_id is not null and p.teacher_total>0 and p.source_sha256 ~ '^[a-f0-9]{64}$'),
   'single_response',count(*) filter(where a.valid_observation_count=1),
   'small_school',count(*) filter(where p.teacher_total between 1 and 9),
   'manual_review_required',count(*) filter(where not exists(select 1 from beagu_private.beagu_2026_percentile_v13_current c where c.school_id=a.school_id and c.source_version=a.source_version)),
   'previous_decision_pairs',(select count(*) from beagu_private.beagu_2026_percentile_v13_current c cross join unnest(p_levels) l(level) where c.source_version=p_version and exists(select 1 from beagu_private.beagu_2026_percentile_v13_decisions d where d.school_id=c.school_id and d.access_level=l.level)),
   'publication_approved',false)
   from public.beagu_school_report_yearly a left join public.schools s using(school_id) left join public.beagu_2026_official_school_profiles p using(school_id)
   where a.survey_year=2026 and a.source_version=p_version and a.publication_status='WITHHELD');
 end if;
 if p_token is distinct from snapshot_token or n=0 then raise exception 'preview changed or no eligible schools';end if;
 -- Use exactly the reviewed snapshot, including review times and official hash.
 -- All rows are atomic; no partial success or reactivation of withdrawn approvals.
 insert into beagu_private.beagu_2026_percentile_v13_decisions(school_id,access_level,source_version,decision,percentile,valid_observations,percentile_method,candidate_updated_at,scope_reviewed_at,school_reviewed_at,teacher_total,teacher_source_sha256,actor)
 select x.school_id,x.access_level,x.source_version,'APPROVE',x.percentile,x.valid_observations,x.percentile_method,x.candidate_updated_at,x.scope_reviewed_at,x.school_reviewed_at,x.teacher_total,x.teacher_source_sha256,p_actor
 from jsonb_to_recordset(items) x(school_id text,access_level integer,source_version text,percentile numeric,valid_observations integer,percentile_method text,candidate_updated_at timestamptz,scope_reviewed_at timestamptz,school_reviewed_at timestamptz,teacher_total integer,teacher_source_sha256 text)
 join beagu_private.beagu_2026_percentile_v13_current c using(school_id,source_version,percentile,valid_observations,percentile_method,candidate_updated_at,scope_reviewed_at,school_reviewed_at,teacher_total,teacher_source_sha256)
 where not exists(select 1 from beagu_private.beagu_2026_percentile_v13_decisions d where d.school_id=x.school_id and d.access_level=x.access_level);
 get diagnostics n=row_count;
 if n<>jsonb_array_length(items) then raise exception 'batch changed during approval';end if;
 return jsonb_build_object('ok',true,'preview',false,'approved_pairs',n,'approved_schools',(select count(distinct i->>'school_id') from jsonb_array_elements(items) i),'scope','PERCENTILE_ONLY');
end $$;
revoke all on function public.beagu_2026_percentile_v13_bulk(text,integer[],uuid,uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.beagu_2026_percentile_v13_bulk(text,integer[],uuid,uuid,boolean,text,text) to service_role;
