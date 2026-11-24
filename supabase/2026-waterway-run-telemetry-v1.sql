-- Apply only in approved backend release, before admin status SQL.
begin;
-- Two bounded private records, independent of the survey snapshot and approval.
create table if not exists beagu_private.beagu_2026_waterway_runs_v1 (
 slot text primary key check(slot in ('latest','failure')),
 finished_at timestamptz not null,
 payload jsonb not null,
 received_at timestamptz not null default now()
);
alter table beagu_private.beagu_2026_waterway_runs_v1 enable row level security;
revoke all on beagu_private.beagu_2026_waterway_runs_v1 from public,anon,authenticated;
grant select,insert,update on beagu_private.beagu_2026_waterway_runs_v1 to service_role;
create or replace function public.beagu_2026_waterway_record_run_v1(p_run jsonb)
returns void language plpgsql security invoker set search_path='' as $record$
declare t timestamptz;
begin
 if p_run->>'kind' is distinct from 'WATERWAY_RUN_V1' or jsonb_typeof(p_run->'stages') is distinct from 'array'
 or pg_column_size(p_run)>8192 then raise exception 'invalid heartbeat'; end if;
 t:=(p_run->>'finished_at')::timestamptz;
 if t is null or abs(extract(epoch from (now()-t)))>1800 then raise exception 'invalid heartbeat time'; end if;
 insert into beagu_private.beagu_2026_waterway_runs_v1 as old(slot,finished_at,payload)
 values('latest',t,p_run)
 on conflict(slot) do update set finished_at=excluded.finished_at,payload=excluded.payload,received_at=now()
 where old.finished_at<excluded.finished_at;
 if exists(select 1 from jsonb_array_elements(p_run->'stages') s where s->>'status'='ERROR') then
   insert into beagu_private.beagu_2026_waterway_runs_v1 as old(slot,finished_at,payload)
   values('failure',t,p_run)
   on conflict(slot) do update set finished_at=excluded.finished_at,payload=excluded.payload,received_at=now()
   where old.finished_at<excluded.finished_at;
 end if;
end $record$;
revoke all on function public.beagu_2026_waterway_record_run_v1(jsonb) from public,anon,authenticated;
grant execute on function public.beagu_2026_waterway_record_run_v1(jsonb) to service_role;

commit;
