\set ON_ERROR_STOP on
-- Disposable only: invoke the actual service-role session/claim/save SQL contract.
set role service_role;
do $$
declare sid uuid:='11111111-1111-4111-8111-111111111120'; actor text:=repeat('d',64);
 result jsonb:='{"version":"4.0","game":"teacher_run_retirement_v4","difficulty":"normal","baseScore":1000,"score":3000,"survivalSeconds":190,"age":62,"victory":true,"bossIds":["confusion"],"hits":2}';
 rows jsonb; before_points bigint; after_points bigint;
begin
 select points into before_points from public.beagu_school_game_points(array['1234567']);
 if not public.run4_candidate_start(sid,actor,'1234567','normal',42,clock_timestamp()) then raise exception 'session start';end if;
 if public.run4_candidate_claim(sid,actor) or public.run4_candidate_save(sid,actor,result) then raise exception 'early save';end if;
 update public.arcade_run4_sessions_candidate set started_at=clock_timestamp()-interval '191 seconds' where id=sid;
 if public.run4_candidate_claim(sid,repeat('e',64)) then raise exception 'foreign claim';end if;
 if not public.run4_candidate_claim(sid,actor) then raise exception 'claim';end if;
 if public.run4_candidate_claim(sid,actor) then raise exception 'duplicate claim';end if;
 if public.run4_candidate_save(sid,repeat('e',64),result) then raise exception 'foreign write';end if;
 if public.run4_candidate_save(sid,actor,jsonb_set(result,'{score}','99999')) then raise exception 'forged score';end if;
 if not public.run4_candidate_save(sid,actor,result) then raise exception 'verified save';end if;
 if public.run4_candidate_save(sid,actor,result) then raise exception 'duplicate save';end if;
 if (select count(*) from public.arcade_run4_records_candidate where session_id=sid and verification_status='verified' and score=3000)<>1 then raise exception 'verified store';end if;
 if (select count(*) from public.beagu_arcade_archive_v11115 where session_id=sid and score=3000)<>1 then raise exception 'archive once';end if;
 rows:=public.beagu_run_unified_records_v11120(null,1,true);
 if rows#>>'{0,score}'<>'3000' or rows#>>'{0,schoolId}'<>'1234567' or rows#>>'{0,details,bossCount}'<>'1' then raise exception 'unified ranking';end if;
 rows:=public.run4_candidate_list('normal','retired');
 if rows#>>'{0,score}'<>'3000' or (rows->0) ?| array['actor_hash','session_id','result','replay_seed','school_id'] then raise exception 'official board';end if;
 select points into after_points from public.beagu_school_game_points(array['1234567']);
 if after_points is distinct from before_points+3000 then raise exception 'points delta';end if;
 raise notice 'PASS actual SQL session, claim, verified save, archive, combined and official ranking, exactly-once points';
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.run4_candidate_save(uuid,text,jsonb)','execute') or has_function_privilege('authenticated','public.run4_candidate_claim(uuid,text)','execute') then raise exception 'public write exposure';end if;
end $$;
