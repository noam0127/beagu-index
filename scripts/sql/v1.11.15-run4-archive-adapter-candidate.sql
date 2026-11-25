-- REVIEW ONLY after verified 4.0 schema/store and archive. No client/local records accepted.
begin;
lock table public.arcade_run4_records_candidate in share row exclusive mode;
create or replace function public.beagu_archive_run4_v11115() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.verification_status='verified' then
 insert into public.beagu_arcade_archive_v11115(game,session_id,school_id,school_name,difficulty,score,created_at,outcome,details)
 select 'teacher_run_retirement_v4',new.session_id,s.school_id,sch.school_name,s.difficulty,new.score,new.submitted_at,case when new.victory then 'retired' else 'retired_early' end,
 jsonb_build_object('outcome',case when new.victory then 'retired' else 'retired_early' end,'endAge',24+new.survival_seconds/5,'playedSeconds',new.survival_seconds,'baseScore',new.base_score,'bossCount',new.boss_count,'hits',new.result->'hits')
 from public.arcade_run4_sessions_candidate s left join public.schools sch on sch.school_id=s.school_id where s.id=new.session_id and s.school_id is not null
 on conflict do nothing;
 end if;return new;
end $$;
revoke all on function public.beagu_archive_run4_v11115() from public,anon,authenticated;
grant execute on function public.beagu_archive_run4_v11115() to service_role;
insert into public.beagu_arcade_archive_v11115(game,session_id,school_id,school_name,difficulty,score,created_at,outcome,details)
select 'teacher_run_retirement_v4',r.session_id,s.school_id,sch.school_name,s.difficulty,r.score,r.submitted_at,case when r.victory then 'retired' else 'retired_early' end,
jsonb_build_object('outcome',case when r.victory then 'retired' else 'retired_early' end,'endAge',24+r.survival_seconds/5,'playedSeconds',r.survival_seconds,'baseScore',r.base_score,'bossCount',r.boss_count,'hits',r.result->'hits')
from public.arcade_run4_records_candidate r join public.arcade_run4_sessions_candidate s on s.id=r.session_id left join public.schools sch on sch.school_id=s.school_id where r.verification_status='verified' and s.school_id is not null on conflict do nothing;
drop trigger if exists aa_beagu_archive_run4_v11115 on public.arcade_run4_records_candidate;
create trigger aa_beagu_archive_run4_v11115 after insert or update of verification_status on public.arcade_run4_records_candidate for each row execute function public.beagu_archive_run4_v11115();
commit;
