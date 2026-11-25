\set ON_ERROR_STOP on
do $t$begin
 if has_function_privilege('anon','public.beagu_2026_edited_read_v1(text[],integer)','EXECUTE') or has_function_privilege('authenticated','public.beagu_2026_edited_publish_v1(uuid,uuid,jsonb)','EXECUTE') then raise exception 'private RPC exposed';end if;
end$t$;
set role service_role;
do $t$declare a uuid:='11111111-1111-1111-1111-111111111111';s uuid:='22222222-2222-2222-2222-222222222222';r jsonb;rows jsonb:='[{"school_id":"1000001","percentile":82.34,"questions":[{"questionId":"Q01","row":-1,"values":["보통이다"]}]},{"school_id":"1000002","percentile":3.5,"questions":[]}]';f uuid;sha text;
begin
 if public.beagu_2026_edited_read_v1(array['1000001'],2)->>'active'<>'false' then raise exception 'unexpected edition';end if;
 begin perform public.beagu_2026_edited_publish_v1(a,null,rows);raise exception 'unexpected allowed';exception when others then if sqlerrm='unexpected allowed' then raise;end if;end;
 r:=public.beagu_2026_edited_publish_v1(a,s,rows);if r->>'schools'<>'2' then raise exception 'upload failed';end if;
 r:=public.beagu_2026_edited_read_v1(array['1000001','1000002'],1);
 if r#>>'{schools,1000001,percentile}'<>'82.34' or r#>>'{schools,1000002,percentile}'<>'3.5' or r#>>'{schools,1000001,questions,0,values,0}'<>'보통이다' then raise exception 'final values changed';end if;
 if public.beagu_2026_edited_read_v1(array['1000001'],0)->'schools'<>'{}'::jsonb then raise exception 'Lv0 disclosure';end if;
 begin perform public.beagu_2026_edited_publish_v1(a,s,jsonb_set(rows,'{0,questions,0,questionId}','"Q31"'));raise exception 'unexpected allowed';exception when others then if sqlerrm='unexpected allowed' then raise;end if;end;
 begin perform public.beagu_2026_edited_publish_v1(a,s,jsonb_set(rows,'{0,school_id}','"9999999"'));raise exception 'unexpected allowed';exception when others then if sqlerrm='unexpected allowed' then raise;end if;end;
 if public.beagu_2026_edited_read_v1(array['1000001'],2)#>>'{schools,1000001,percentile}'<>'82.34' then raise exception 'rejected file changed visible edition';end if;
end$t$;
reset role;
insert into beagu_private.beagu_2026_civic_feedback(id,school_id,kind,category,detail,status) values('33333333-3333-3333-3333-333333333333','1000001','REPORT','OTHER','synthetic report detail','REVIEWING');
set role service_role;
do $t$declare a uuid:='11111111-1111-1111-1111-111111111111';s uuid:='22222222-2222-2222-2222-222222222222';f uuid:='33333333-3333-3333-3333-333333333333';sha text;r jsonb;begin
 r:=public.beagu_2026_civic_hold_context(a,s,f);sha:=r->>'snapshot_sha';
 perform public.beagu_2026_civic_hold_school(a,s,f,sha,'synthetic hold review');
 if public.beagu_2026_edited_read_v1(array['1000001'],2)->'schools'<>'{}'::jsonb then raise exception 'hold not applied';end if;
 perform public.beagu_2026_edited_publish_v1(a,s,'[{"school_id":"1000001","percentile":77.5,"questions":[]}]');
 if public.beagu_2026_edited_read_v1(array['1000001','1000002'],2)->'schools'<>'{}'::jsonb then raise exception 'upload bypassed hold or retained omitted school';end if;
 r:=public.beagu_2026_civic_hold_context(a,s,f);sha:=r->>'snapshot_sha';
 perform public.beagu_2026_civic_resume_school(a,s,f,sha,'synthetic corrected edition');
 if public.beagu_2026_edited_read_v1(array['1000001'],2)#>>'{schools,1000001,percentile}'<>'77.5' then raise exception 'resume failed';end if;
end$t$;
reset role;
do $t$begin
 if not exists(select 1 from public.beagu_edited_school_rows where survey_year=2025 and display_values='{"old":12}') or (select count(*) from public.beagu_edited_school_rows where survey_year=2026 and release_status='REJECTED')<>2 then raise exception 'old rows lost';end if;
 raise notice 'PASS final values unchanged, immediate Lv1/Lv2, deny Lv0 and Q31, owner MFA, invalid upload atomic, replacement, existing hold and resume, old edition preservation';
end$t$;
