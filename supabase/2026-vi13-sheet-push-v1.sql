-- Candidate only. Separate private aggregate history, no survey-row or publication changes.
create table if not exists beagu_private.beagu_2026_vi13_sheet_snapshot_v1(
 singleton boolean primary key default true check(singleton),
 generated_at timestamptz not null,
 values_json jsonb not null
);
alter table beagu_private.beagu_2026_vi13_sheet_snapshot_v1 enable row level security;
revoke all on beagu_private.beagu_2026_vi13_sheet_snapshot_v1 from public,anon,authenticated;
grant select,insert,update on beagu_private.beagu_2026_vi13_sheet_snapshot_v1 to service_role;
create or replace function public.beagu_2026_vi13_sheet_store_v1(p_values jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare m jsonb; incoming timestamptz; previous beagu_private.beagu_2026_vi13_sheet_snapshot_v1%rowtype;
begin
 if jsonb_typeof(p_values) is distinct from 'array' then raise exception 'invalid snapshot';end if;
 m:=p_values->0;
 if jsonb_array_length(p_values) not between 606 and 10002 or m->>0 is distinct from 'VI13_SYNC_V1' or
 m->>4 is distinct from 'VERTICAL_EXACT_VI13_MIN9_A4_P2_R1_V1' or m->>6 is distinct from 'PRIVATE' or
 (m->>2)::int<>jsonb_array_length(p_values)-2 or (m->>3)::int<724 then raise exception 'invalid snapshot';end if;
 incoming:=(m->>1)::timestamptz;
 if incoming is null or incoming>now()+interval '1 minute' or incoming<now()-interval '48 hours' then raise exception 'invalid snapshot time';end if;
 perform pg_advisory_xact_lock(2026,22113);
 select * into previous from beagu_private.beagu_2026_vi13_sheet_snapshot_v1 where singleton;
 if found then
  if incoming=previous.generated_at and p_values=previous.values_json then return false;end if;
  if incoming<=previous.generated_at then raise exception 'stale or conflicting snapshot';end if;
  if exists(select 1 from jsonb_array_elements(previous.values_json) with ordinality o(r,i)
    left join lateral (select n.r from jsonb_array_elements(p_values) with ordinality n(r,i) where n.i>2 and n.r->>0=o.r->>0 limit 1) n on true
    where o.i>2 and (n.r is null or (n.r->>5)::int<(o.r->>5)::int or
      (n.r->>6)::numeric<(o.r->>6)::numeric or (n.r->>6)::numeric-(o.r->>6)::numeric>((n.r->>5)::int-(o.r->>5)::int)*36036000::numeric))
    then raise exception 'snapshot regression';end if;
 end if;
 insert into beagu_private.beagu_2026_vi13_sheet_snapshot_v1(singleton,generated_at,values_json) values(true,incoming,p_values)
 on conflict(singleton) do update set generated_at=excluded.generated_at,values_json=excluded.values_json;
 return true;
end $$;
create or replace function public.beagu_2026_vi13_sheet_read_v1()
returns jsonb language sql stable security invoker set search_path='' as $$
 select values_json from beagu_private.beagu_2026_vi13_sheet_snapshot_v1 where singleton and generated_at>=now()-interval '48 hours'
$$;
revoke all on function public.beagu_2026_vi13_sheet_store_v1(jsonb),public.beagu_2026_vi13_sheet_read_v1() from public,anon,authenticated;
grant execute on function public.beagu_2026_vi13_sheet_store_v1(jsonb),public.beagu_2026_vi13_sheet_read_v1() to service_role;
