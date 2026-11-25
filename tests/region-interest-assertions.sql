\set ON_ERROR_STOP on
do $$begin
 if has_table_privilege('anon','beagu_private.region_search_interest_v1','SELECT') or has_table_privilege('authenticated','beagu_private.region_search_interest_v1','INSERT') then raise exception 'private events exposed';end if;
end$$;
set role anon;
do $$declare v uuid:='11111111-1111-1111-1111-111111111111';r jsonb;begin
 if public.beagu_record_region_interest_v1('부산','',v) or public.beagu_record_region_interest_v1('경기','부산광역시북부교육지원청',v) then raise exception 'invalid pair';end if;
 if not public.beagu_record_region_interest_v1('부산','부산광역시북부교육지원청',v) then raise exception 'valid pair rejected';end if;
 if public.beagu_record_region_interest_v1('부산','부산광역시북부교육지원청',v) then raise exception 'duplicate counted';end if;
 if not public.beagu_record_region_interest_v1('부산','부산광역시북부교육지원청','22222222-2222-2222-2222-222222222222') then raise exception 'second visitor rejected';end if;
 perform public.beagu_record_region_interest_v1('경기','경기도광명교육지원청',v);
 r:=public.beagu_region_interest_top5_v1();
 if jsonb_array_length(r)<>2 or r#>>'{0,region}'<>'부산' or r#>>'{1,office}'<>'경기도광명교육지원청' or (r->0)-array['region','office']<>'{}'::jsonb then raise exception 'rank or privacy failure';end if;
end$$;
reset role;
insert into beagu_private.region_search_interest_v1(region,office,visitor_digest,hour_bucket,counted_at) values('서울','서울특별시강남서초교육지원청','old',now()-interval '80 hours',now()-interval '80 hours');
do $$begin if jsonb_array_length(public.beagu_region_interest_top5_v1())<>2 then raise exception 'old event counted';end if;end$$;
insert into beagu_private.school_view_admin_exclusions select encode(extensions.digest('33333333-3333-3333-3333-333333333333:fixture-only:school-views-v1','sha256'),'hex');
set role anon;
do $$declare v uuid:='11111111-1111-1111-1111-111111111111';begin
 if public.beagu_record_region_interest_v1('부산','부산광역시북부교육지원청','33333333-3333-3333-3333-333333333333') then raise exception 'excluded visitor counted';end if;
 perform public.beagu_record_region_interest_v1('서울','서울특별시강남서초교육지원청',v);
 perform public.beagu_record_region_interest_v1('강원','강원특별자치도강릉교육지원청',v);
 perform public.beagu_record_region_interest_v1('경남','창원교육지원청(마산센터)',v);
 perform public.beagu_record_region_interest_v1('인천','인천광역시서부교육지원청',v);
 if jsonb_array_length(public.beagu_region_interest_top5_v1())<>5 then raise exception 'top five limit';end if;
end$$;
reset role;
select 'PASS valid pair only, repeated pair deduplicated, 72h, top five, admin exclusion, no private events exposed' as result;
