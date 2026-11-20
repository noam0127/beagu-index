-- Keep complete snapshot replacement atomic without writing schools whose
-- reviewed content has not changed.
create or replace function public.beagu_2026_replace_results_snapshot(p_snapshot jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare
 snapshot_time timestamptz;
 previous_time timestamptz;
 school_ids text[];
begin
 if p_snapshot->>'source_spreadsheet_id' is distinct from '1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4'
   or p_snapshot->>'official_start_day' is distinct from '2026-11-01'
   or p_snapshot->>'schema_version' is distinct from '1'
   or jsonb_typeof(p_snapshot->'schools') is distinct from 'array' then
   raise exception 'invalid snapshot';
 end if;
 snapshot_time:=(p_snapshot->>'snapshot_at')::timestamptz;
 if snapshot_time is null or snapshot_time>now()+interval '5 minutes' then
   raise exception 'invalid timestamp';
 end if;

 perform pg_advisory_xact_lock(2026,5017);
 select snapshot_at into previous_time from beagu_private.beagu_2026_results_sync where singleton;
 if previous_time is not null and snapshot_time<previous_time then
   raise exception 'stale snapshot';
 end if;

 insert into public.beagu_2026_results_snapshot as existing
   (school_id,school_response_rows,school_match_status,questions,payload_sha256,source_snapshot_at)
 select payload->>'school_id',(payload->>'school_response_rows')::integer,
   payload->>'school_match_status',payload->'questions',
   encode(extensions.digest(payload::text,'sha256'),'hex'),snapshot_time
 from jsonb_array_elements(p_snapshot->'schools') as school(payload)
 order by payload->>'school_id'
 on conflict(school_id) do update set
   school_response_rows=excluded.school_response_rows,
   school_match_status=excluded.school_match_status,
   questions=excluded.questions,payload_sha256=excluded.payload_sha256,
   source_snapshot_at=excluded.source_snapshot_at,updated_at=now(),
   approval_status='WITHHELD',approved_by=null,approved_at=null,
   approval_evidence=null,approved_payload_sha256=null
 where existing.payload_sha256 is distinct from excluded.payload_sha256;

 school_ids:=array(select payload->>'school_id'
   from jsonb_array_elements(p_snapshot->'schools') as school(payload));
 delete from public.beagu_2026_results_snapshot r where not (r.school_id=any(school_ids));

 insert into beagu_private.beagu_2026_results_sync(singleton,snapshot_at,totals)
 values(true,snapshot_time,p_snapshot->'totals')
 on conflict(singleton) do update set snapshot_at=excluded.snapshot_at,totals=excluded.totals;
 return cardinality(school_ids);
end $$;

revoke all on function public.beagu_2026_replace_results_snapshot(jsonb) from public,anon,authenticated;
grant execute on function public.beagu_2026_replace_results_snapshot(jsonb) to service_role;
