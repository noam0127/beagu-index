\set ON_ERROR_STOP on
insert into public.beagu_lv1_office_directory select 'fixture','office'||i from generate_series(1,12) i;
insert into beagu_private.region_search_interest_v1(region,office,visitor_digest,hour_bucket,counted_at)
select 'fixture','office'||i,'digest'||j,now(),now() from generate_series(1,12) i cross join lateral generate_series(1,i+3) j;
insert into beagu_private.region_search_interest_v1 values ('invalid','invalid','private-digest',now(),now());
set role anon;
do $$ declare r jsonb;begin
 r:=public.beagu_region_interest_top10_v1();
 if jsonb_array_length(r)<>10 or r#>>'{0,office}'<>'office12' or r#>>'{9,office}'<>'office3' then raise exception 'top10 wrong: %',r;end if;
 if exists(select 1 from jsonb_array_elements(r) e where e-array['region','office']<>'{}'::jsonb) then raise exception 'private field';end if;
 if jsonb_array_length(public.beagu_region_interest_top5_v1())<>5 then raise exception 'legacy regression';end if;
end $$;
reset role;
