do $$
declare actor uuid:='00000000-0000-0000-0000-000000000001'; sess uuid:='00000000-0000-0000-0000-000000000002'; result jsonb;
begin
 if has_function_privilege('anon','public.beagu_2026_set_level_final_approval(integer,uuid,uuid,text)','execute') then raise exception 'anon approval permission'; end if;
 if (public.beagu_2026_level_release_status()->0->>'eligible_schools')::int<>0 then raise exception 'mismatch eligible'; end if;
 begin
   perform public.beagu_2026_set_level_final_approval(0,actor,sess,'APPROVE');
   raise exception 'unexpected approval';
 exception when others then if sqlerrm<>'no fully approved school results available' then raise; end if; end;
 update beagu_private.beagu_2026_auto_review_status set source_response_rows=1;
 begin
   perform public.beagu_2026_set_level_final_approval(0,actor,actor,'APPROVE');
   raise exception 'unexpected no-MFA approval';
 exception when others then if sqlerrm<>'owner and active MFA required' then raise; end if; end;
 result:=public.beagu_2026_set_level_final_approval(2,actor,sess,'APPROVE');
 if not public.beagu_2026_level_school_published('A000001',2) or public.beagu_2026_level_school_published('A000001',1) or public.beagu_2026_level_school_published('A000001',0) then raise exception 'tier isolation failed'; end if;
 perform public.beagu_2026_set_level_final_approval(0,actor,sess,'APPROVE');
 if not public.beagu_2026_level_school_published('A000001',0) or public.beagu_2026_level_school_published('A000001',1) then raise exception 'independent tier decision failed'; end if;
 update beagu_private.beagu_2026_auto_review_status set source_response_rows=2;
 if public.beagu_2026_level_school_published('A000001',0) or public.beagu_2026_level_school_published('A000001',2) then raise exception 'mismatch after approval leaked'; end if;
 if (public.beagu_2026_level_release_status()->2->>'released_schools')::int<>0 then raise exception 'mismatch released count'; end if;
 update beagu_private.beagu_2026_auto_review_status set source_response_rows=1;
 perform public.beagu_2026_set_level_final_approval(2,actor,sess,'REVOKE');
 if public.beagu_2026_level_school_published('A000001',2) or not public.beagu_2026_level_school_published('A000001',0) then raise exception 'independent revocation failed'; end if;
 update beagu_private.beagu_2026_publication_basis_review set personal_data_reviewed=false;
 if public.beagu_2026_level_school_published('A000001',0) then raise exception 'privacy gate bypass'; end if;
 raise notice 'PASS: source counts, owner MFA, independent tier approval and revocation, privacy gate';
end $$;
