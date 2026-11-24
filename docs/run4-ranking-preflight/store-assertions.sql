-- Disposable test only, after store-draft.sql.
do $$ begin
 if has_schema_privilege('anon','run4_internal_candidate','USAGE') or has_function_privilege('authenticated','run4_internal_candidate.save_verified(uuid,text,jsonb)','EXECUTE') then raise exception 'public store access'; end if;
end $$;
set role service_role;
do $$
declare sid uuid:='22222222-2222-4222-8222-222222222222'; actor text:=repeat('b',64); result jsonb:='{"version":"4.0","game":"teacher_run_retirement_v4","difficulty":"normal","baseScore":1000,"score":3000,"survivalSeconds":190,"victory":true,"bossIds":["confusion"]}';
begin
 if not run4_internal_candidate.start_session(sid,actor,'1234567','normal',42,clock_timestamp()) then raise exception 'start failed'; end if;
 if run4_internal_candidate.start_session(sid,actor,'1234567','normal',42,clock_timestamp()) then raise exception 'duplicate session';end if;
 if run4_internal_candidate.save_verified(sid,actor,result) then raise exception 'early submission accepted';end if;
 update public.arcade_run4_sessions_candidate set started_at=clock_timestamp()-interval '191 seconds' where arcade_run4_sessions_candidate.id=sid;
 if run4_internal_candidate.save_verified(sid,repeat('c',64),result) then raise exception 'wrong owner';end if;
 if run4_internal_candidate.save_verified(sid,actor,jsonb_set(result,'{score}','99999')) then raise exception 'wrong score';end if;
 if not run4_internal_candidate.save_verified(sid,actor,result) then raise exception 'verified write failed';end if;
 if run4_internal_candidate.save_verified(sid,actor,result) then raise exception 'duplicate verified write';end if;
 if not exists(select 1 from public.arcade_run4_verified_candidate where score=3000 and victory) then raise exception 'missing projection';end if;
 for i in 1..39 loop
  if not run4_internal_candidate.start_session(('33333333-3333-4333-8333-'||lpad(i::text,12,'0'))::uuid,actor,'1234567','normal',i,clock_timestamp()) then raise exception 'start % prematurely limited',i;end if;
 end loop;
 if run4_internal_candidate.start_session('44444444-4444-4444-8444-444444444444',actor,'1234567','normal',42,clock_timestamp()) then raise exception 'rate limit bypass';end if;
 raise notice 'PASS transactional ranking store: ownership, time, score, duplicate, rate limit, private grants';
end $$;
reset role;
