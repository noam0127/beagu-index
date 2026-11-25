\set ON_ERROR_STOP on
do $t$begin
 if has_function_privilege('anon','public.beagu_2026_master_publish_v1(uuid,uuid,text,jsonb,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.beagu_2026_master_values_v1(text[],integer)','EXECUTE') then raise exception 'private RPC exposed';end if;
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

-- Use a new version of the fixture without removing the existing hold history.
insert into beagu_private.beagu_2026_auto_preflight values
('1000001','fixture-v3',0,1,now()-interval '1 day',now()-interval '1 day',true,true,true,false),
('1000002','fixture-v3',100,1,now()-interval '1 day',now()-interval '1 day',true,true,true,false);
set role service_role;
do $t$declare a uuid:='11111111-1111-4111-8111-111111111111';s uuid:='22222222-2222-4222-8222-222222222222';r jsonb;old_id bigint;new_id bigint;
 rows jsonb:='[{"school_id":"1000001","observations":1,"sum_units":360360,"percentile":0},{"school_id":"1000002","observations":1,"sum_units":720720,"percentile":100}]';
 refs jsonb:=jsonb_build_array(jsonb_build_object('school_id','1000001','payload_sha256',repeat('a',64)),jsonb_build_object('school_id','1000002','payload_sha256',repeat('b',64)));
begin
 select batch_id into old_id from beagu_private.master_2026_pointer_v1 where singleton;
 begin perform public.beagu_2026_master_publish_v1(a,s,'fixture-v3',rows,jsonb_set(refs,'{0,payload_sha256}',to_jsonb(repeat('c',64))));raise exception 'unexpected allowed';exception when others then if sqlerrm='unexpected allowed' then raise;end if;end;
 if (select batch_id from beagu_private.master_2026_pointer_v1 where singleton)<>old_id then raise exception 'stale question hash changed state';end if;
 r:=public.beagu_2026_master_publish_v1(a,s,'fixture-v3',rows,refs);new_id:=(r->>'batch_id')::bigint;
 if r->>'question_eligible'<>'1' or r->>'question_blocked'<>'1' then raise exception 'question evidence gate';end if;
 if public.beagu_2026_master_questions_v1('1000001',1) is distinct from '[{"id":"Q01","invalid":0}]'::jsonb or public.beagu_2026_master_questions_v1('1000001',2) is distinct from '[{"id":"Q01","invalid":0}]'::jsonb or public.beagu_2026_master_questions_v1('1000001',0) is not null or public.beagu_2026_master_questions_v1('1000002',2) is not null then raise exception 'question projection';end if;
 perform public.beagu_2026_master_restore_v1(a,s,old_id,new_id);
 if public.beagu_2026_master_questions_v1('1000001',2) is not null then raise exception 'question restore failed';end if;
 perform public.beagu_2026_master_restore_v1(a,s,new_id,old_id);
end$t$;
reset role;
insert into beagu_private.beagu_2026_civic_publication_hold values ('1000001',true,now());
set role service_role;
do $t$begin
 if public.beagu_2026_master_questions_v1('1000001',1) is not null or public.beagu_2026_master_questions_v1('1000001',2) is not null then raise exception 'post-upload question hold ignored';end if;
 raise notice 'PASS exact question hash, atomic batch, immediate Lv1/Lv2, no Lv0, Q31/Q51 excluded, evidence required, restore and later hold';
end$t$;
reset role;
