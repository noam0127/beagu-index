-- Real migration + isolated synthetic records. No production data.
insert into beagu_private.beagu_2026_civic_feedback(id,school_id,kind,category,detail,actor_hash,status) values('00000000-0000-0000-0000-000000000003','A000001','REPORT','PRIVACY','Synthetic privacy review request',repeat('a',64),'REVIEWING');
select public.beagu_2026_set_level_final_approval(2,'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','APPROVE');
do $$ declare a uuid:='00000000-0000-0000-0000-000000000001'; sess uuid:='00000000-0000-0000-0000-000000000002'; f uuid:='00000000-0000-0000-0000-000000000003'; begin
 if not public.beagu_2026_level_school_published('A000001',2) then raise exception 'fixture not published'; end if;
 begin perform public.beagu_2026_civic_hold_school(a,a,f,repeat('a',64),'Synthetic privacy review reason'); raise exception 'unauthorized hold'; exception when others then if sqlerrm<>'owner MFA required' then raise; end if; end;
 begin perform public.beagu_2026_civic_hold_school(a,sess,f,repeat('b',64),'Synthetic privacy review reason'); raise exception 'stale hold accepted'; exception when others then if sqlerrm<>'snapshot changed' then raise; end if; end;
 perform public.beagu_2026_civic_hold_school(a,sess,f,repeat('a',64),'Synthetic privacy review reason');
 if public.beagu_2026_level_school_published('A000001',2) then raise exception 'held data visible'; end if;
 if (public.beagu_2026_level_release_status()->2->>'eligible_schools')::int<>0 then raise exception 'held school eligible'; end if;
 begin perform public.beagu_2026_civic_resume_school(a,sess,f,repeat('a',64),'Synthetic privacy review reason'); raise exception 'stale resume'; exception when others then if sqlerrm<>'fresh exact snapshot approval and QA required' then raise; end if; end;
 if has_function_privilege('anon','public.beagu_2026_civic_hold_context(uuid,uuid,uuid)','execute') then raise exception 'history exposed'; end if;
end $$;
-- simulate fresh QA, basis review and school approval in the isolated database.
update beagu_private.beagu_2026_auto_review_status set checked_at=clock_timestamp();
update beagu_private.beagu_2026_publication_basis_review set reviewed_at=clock_timestamp();
update public.beagu_2026_results_snapshot set approval_status='APPROVED',approved_payload_sha256=payload_sha256,approved_by='00000000-0000-0000-0000-000000000001',approved_at=clock_timestamp();
select public.beagu_2026_civic_resume_school('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003',repeat('a',64),'Fresh synthetic review complete');
do $$ begin
 if public.beagu_2026_level_school_published('A000001',2) then raise exception 'old tier approval resurrected'; end if;
 if (select count(*) from beagu_private.beagu_2026_civic_feedback_audit where action in ('PUBLICATION_HOLD','PUBLICATION_HOLD_LIFTED'))<>2 then raise exception 'missing audit'; end if;
end $$;
select public.beagu_2026_set_level_final_approval(2,'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','APPROVE');
do $$ begin
 if not public.beagu_2026_level_school_published('A000001',2) or public.beagu_2026_level_school_published('A000001',0) or public.beagu_2026_level_school_published('A000001',1) then raise exception 'fresh tier release failed'; end if;
 raise notice 'PASS civic hold: unauthorized and stale denial, privacy revalidation, history, fresh tier approval';
end $$;
