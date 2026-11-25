\set ON_ERROR_STOP on
set role anon;
do $$
declare v uuid:='11111111-1111-4111-8111-111111111111'; r jsonb;
begin
 r:=public.beagu_record_school_view_v2('1234567','00000000-0000-4000-8000-000000000001',v,'search_confirmed');
 if r->>'views'<>'42' or r->>'counted'<>'true' then raise exception 'search not counted';end if;
 r:=public.beagu_record_school_view_v2('1234567','00000000-0000-4000-8000-000000000002',v,'school_selected');
 if r->>'views'<>'42' or r->>'counted'<>'false' then raise exception 'duplicate search';end if;
 r:=public.beagu_record_school_view_v2('1234567','00000000-0000-4000-8000-000000000002',v,'detail_viewed');
 if r->>'views'<>'43' or r->>'counted'<>'true' then raise exception 'separate detail';end if;
 r:=public.beagu_record_school_view_v2('1234567','00000000-0000-4000-8000-000000000003',v,'detail_viewed');
 if r->>'views'<>'43' or r->>'counted'<>'false' then raise exception 'duplicate detail';end if;
 if public.beagu_record_school_view_v2('1234567','00000000-0000-4000-8000-000000000004',v,'school_selected') is not null then raise exception 'report miscounted as search';end if;
 if public.beagu_record_school_view_v2('1234567','00000000-0000-4000-8000-000000000001',v,'detail_viewed') is not null then raise exception 'forged event';end if;
 r:=public.beagu_record_school_view_v2('7654321','00000000-0000-4000-8000-000000000005','22222222-2222-4222-8222-222222222222','detail_viewed');
 if r->>'views'<>'0' or r->>'counted'<>'false' then raise exception 'admin exclusion';end if;
end$$;
reset role;
do $$begin
 if (select views from public.beagu_school_view_totals where school_id='1234567')<>43 then raise exception 'legacy total changed incorrectly';end if;
 if has_table_privilege('anon','beagu_private.school_search_view_daily_v2','SELECT') then raise exception 'private table exposed';end if;
 raise notice 'PASS legacy totals, independent daily categories, duplicate and forged-event denial, administrator exclusion';
end$$;

do $$begin
 if (select count(*) from beagu_private.school_combined_view_activity_v2)<>2 then raise exception 'ranking activity diverged from accepted increments';end if;
 if has_function_privilege('anon','public.beagu_school_interest_rankings_v2()','EXECUTE') then raise exception 'rank permission';end if;
end$$;
insert into beagu_private.school_combined_view_activity_v2(school_id,action_id,view_kind,counted_at) values
 ('1234567','00000000-0000-4000-8000-000000000010','search',now()-interval '73 hours'),
 ('7654321','00000000-0000-4000-8000-000000000011','detail',now()-interval '145 hours'),
 ('7654321','00000000-0000-4000-8000-000000000012','search',now()-interval '1 hour');
set role service_role;
do $$declare r jsonb;begin
 r:=public.beagu_school_interest_rankings_v2();
 if r#>>'{rising,0,school_id}'<>'1234567' or r#>>'{rising,0,visitors}'<>'2' or r#>>'{rising,0,growth}'<>'1' or r#>>'{rising,1,visitors}'<>'1' then raise exception 'combined growth calculation %',r;end if;
 raise notice 'PASS rising ranking uses same accepted increments, 72h windows, deterministic ties, no old-window activity';
end$$;
reset role;
