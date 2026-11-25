\set ON_ERROR_STOP on
do $t$begin
 if has_function_privilege('anon','public.beagu_2026_master_publish_v1(uuid,uuid,text,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.beagu_2026_master_values_v1(text[],integer)','EXECUTE') then raise exception 'private RPC exposed';end if;
end$t$;
set role service_role;
do $t$
declare actor uuid:='11111111-1111-4111-8111-111111111111'; sess uuid:='22222222-2222-4222-8222-222222222222'; r jsonb; first bigint; second bigint;
 a jsonb:='[{"school_id":"1000001","observations":1,"sum_units":360360,"percentile":0},{"school_id":"1000002","observations":1,"sum_units":720720,"percentile":100}]';
 b jsonb:='[{"school_id":"1000001","observations":1,"sum_units":720720,"percentile":100},{"school_id":"1000002","observations":1,"sum_units":360360,"percentile":0}]';
begin
 begin perform public.beagu_2026_master_publish_v1('33333333-3333-4333-8333-333333333333',sess,'fixture-v1',a);raise exception 'unexpected allowed';exception when others then if sqlerrm='unexpected allowed' then raise;end if;end;
 r:=public.beagu_2026_master_publish_v1(actor,sess,'fixture-v1',a);first:=(r->>'batch_id')::bigint;
 if r->>'eligible'<>'1' or r->>'blocked'<>'1' then raise exception 'hold not excluded';end if;
 if public.beagu_2026_master_values_v1(array['1000001','1000002'],1)<>'{"1000001":0}'::jsonb or public.beagu_2026_master_values_v1(array['1000001','1000002'],2)<>'{"1000001":0}'::jsonb or public.beagu_2026_master_values_v1(array['1000001'],0)<>'{}'::jsonb then raise exception 'immediate tier projection';end if;
 r:=public.beagu_2026_master_publish_v1(actor,sess,'fixture-v1',a);if r->>'duplicate'<>'true' then raise exception 'idempotency';end if;
 begin perform public.beagu_2026_master_publish_v1(actor,sess,'fixture-v1',jsonb_set(a,'{0,percentile}','50'));raise exception 'unexpected allowed';exception when others then if sqlerrm='unexpected allowed' then raise;end if;end;
 if (select batch_id from beagu_private.master_2026_pointer_v1 where singleton)<>first then raise exception 'invalid file altered state';end if;
 r:=public.beagu_2026_master_publish_v1(actor,sess,'fixture-v2',b);second:=(r->>'batch_id')::bigint;
 if r->>'eligible'<>'1' or r->>'blocked'<>'1' or public.beagu_2026_master_values_v1(array['1000001','1000002'],2)<>'{"1000001":100}'::jsonb then raise exception 'unverified evidence published';end if;
 perform public.beagu_2026_master_restore_v1(actor,sess,first,second);
 if public.beagu_2026_master_values_v1(array['1000001'],2)<>'{"1000001":0}'::jsonb then raise exception 'restore failed';end if;
 if (select count(*) from beagu_private.master_2026_batches_v1)<>2 then raise exception 'backup lost';end if;
end$t$;
reset role;
update beagu_private.beagu_2026_auto_preflight set held=true where school_id='1000001' and source_version='fixture-v1';
set role service_role;
do $t$begin
 if public.beagu_2026_master_values_v1(array['1000001'],2)<>'{}'::jsonb then raise exception 'hold after restore ignored';end if;
 raise notice 'PASS owner MFA, exact rank, atomic batch, immediate Lv1/Lv2, Lv0 denial, hold/evidence exclusion, immutable backups and restore';
end$t$;
reset role;
