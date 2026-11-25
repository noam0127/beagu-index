\set ON_ERROR_STOP on
do $$begin
 if has_table_privilege('anon','public.beagu_school_likes_v1','SELECT') or has_table_privilege('authenticated','public.beagu_school_likes_v1','INSERT') or has_function_privilege('anon','public.beagu_school_like_add_v1(text,text)','EXECUTE') or has_function_privilege('authenticated','public.beagu_school_like_actor_v1(text)','EXECUTE') then raise exception 'unexpected public privileges'; end if;
end$$;
set role service_role;
do $$
declare r jsonb; t text;
begin
 r:=public.beagu_school_like_state_v1(array['0000025'],'');
 if r->>'canLike'<>'false' or (r#>>'{schools,0,likes}')::int<>0 then raise exception 'anonymous counts';end if;
 foreach t in array array['',repeat('d',64),repeat('e',64),repeat('f',64)] loop
  if public.beagu_school_like_add_v1('0000025',t)->>'error'<>'LV2_INDIVIDUAL_CODE_REQUIRED' then raise exception 'unauthorized';end if;
 end loop;
 r:=public.beagu_school_like_add_v1('0000025',repeat('a',64));
 if r#>>'{schools,0,likes}'<>'1' or r#>>'{schools,0,liked}'<>'true' then raise exception 'first like';end if;
 r:=public.beagu_school_like_add_v1('0000025',repeat('b',64));
 if r#>>'{schools,0,likes}'<>'1' then raise exception 'cross device duplicate';end if;
 r:=public.beagu_school_like_add_v1('0000025',repeat('c',64));
 if r#>>'{schools,0,likes}'<>'2' then raise exception 'second participant';end if;
 r:=public.beagu_school_like_add_v1('0000024',repeat('a',64));
 if r#>>'{schools,0,likes}'<>'1' then raise exception 'per school';end if;
 if public.beagu_school_like_add_v1('0000026',repeat('a',64))->>'error'<>'INVALID_SCHOOL' then raise exception 'closed school';end if;
 r:=public.beagu_school_like_search_v1('','부산','동래','desc',0);
 if r->>'total'<>'25' or r#>>'{schools,0,school_id}'<>'0000025' or r#>>'{schools,1,school_id}'<>'0000024' or jsonb_array_length(r->'schools')<>20 then raise exception 'global order';end if;
 r:=public.beagu_school_like_search_v1('','부산','동래','desc',1);
 if jsonb_array_length(r->'schools')<>5 or r#>>'{schools,0,school_id}'='0000025' then raise exception 'pagination';end if;
 r:=public.beagu_school_like_search_v1('','부산','동래','asc',0);
 if r#>>'{schools,0,like_count}'<>'0' then raise exception 'ascending';end if;
 r:=public.beagu_school_like_state_v1(array['0000025'],'');
 if r#>>'{schools,0,liked}'<>'false' or r#>>'{schools,0,likes}'<>'2' or r::text like '%visitor_id%' then raise exception 'public projection';end if;
end$$;
reset role;
delete from public.fixture_earned where visitor='11111111-1111-4111-8111-111111111111';
set role service_role;
do $$begin if public.beagu_school_like_add_v1('0000023',repeat('a',64))->>'error'<>'LV2_INDIVIDUAL_CODE_REQUIRED' then raise exception 'revoked code';end if;end$$;
reset role;
