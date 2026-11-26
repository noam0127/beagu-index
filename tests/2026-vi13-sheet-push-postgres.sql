-- Synthetic only, disposable database.
grant usage on schema beagu_private to service_role;
do $$
declare v jsonb; next_v jsonb; broken jsonb; ts timestamptz:=now()-interval '1 minute'; rejected boolean;
begin
 if has_function_privilege('anon','public.beagu_2026_vi13_sheet_store_v1(jsonb)','execute') or
 has_function_privilege('authenticated','public.beagu_2026_vi13_sheet_read_v1()','execute') or
 not has_function_privilege('service_role','public.beagu_2026_vi13_sheet_store_v1(jsonb)','execute') then raise exception 'incorrect privileges';end if;
 select jsonb_build_array(jsonb_build_array('VI13_SYNC_V1',ts,604,724,'VERTICAL_EXACT_VI13_MIN9_A4_P2_R1_V1',797,'PRIVATE',''),
 '["school_id","school_name","region","percentile","rank","observations","sum_units","flags"]'::jsonb)
 ||jsonb_agg(jsonb_build_array((7000000+i)::text,'fixture','fixture',round(100::numeric*(603-i)/603,1),i+1,case when i<120 then 2 else 1 end,(case when i<120 then 2 else 1 end)*i*1000,0) order by i)
 into v from generate_series(0,603) i;
 if not public.beagu_2026_vi13_sheet_store_v1(v) then raise exception 'first push rejected';end if;
 if public.beagu_2026_vi13_sheet_read_v1() is distinct from v then raise exception 'private read mismatch';end if;
 if public.beagu_2026_vi13_sheet_store_v1(v) then raise exception 'retry not idempotent';end if;
 next_v:=jsonb_set(v,'{0,1}',to_jsonb(ts+interval '10 seconds'));
 if not public.beagu_2026_vi13_sheet_store_v1(next_v) then raise exception 'new snapshot rejected';end if;
 rejected:=false;begin perform public.beagu_2026_vi13_sheet_store_v1(v);exception when others then rejected:=true;end;
 if not rejected then raise exception 'stale snapshot accepted';end if;
 broken:=jsonb_set(jsonb_set(next_v,'{0,1}',to_jsonb(ts+interval '20 seconds')),'{2,0}','"9999999"'::jsonb);
 rejected:=false;begin perform public.beagu_2026_vi13_sheet_store_v1(broken);exception when others then rejected:=true;end;
 if not rejected or public.beagu_2026_vi13_sheet_read_v1() is distinct from next_v then raise exception 'regression or last-good loss';end if;
 raise notice 'PASS VI13 private grants, idempotency, stale and regression guards';
end $$;
set role service_role;
do $check$ begin if jsonb_array_length(public.beagu_2026_vi13_sheet_read_v1()) is distinct from 606 then raise exception 'service role read failed'; end if; end $check$;
reset role;
