DO $$ BEGIN
 IF has_function_privilege('anon','public.beagu_historical_mean_ranked_schools_v1(text,text,text,text,integer)','execute')
 OR has_function_privilege('authenticated','public.beagu_historical_mean_ranked_schools_v1(text,text,text,text,integer)','execute')
 OR NOT has_function_privilege('service_role','public.beagu_historical_mean_ranked_schools_v1(text,text,text,text,integer)','execute')
 THEN RAISE EXCEPTION 'historical rank grants'; END IF;
END $$;
SET ROLE service_role;
DO $$
DECLARE d jsonb; a jsonb; p jsonb; last_page jsonb;
BEGIN
 d:=public.beagu_historical_mean_ranked_schools_v1('','부산','','desc',0);
 a:=public.beagu_historical_mean_ranked_schools_v1('','부산','','asc',0);
 p:=public.beagu_historical_mean_ranked_schools_v1('','부산','','desc',1);
 last_page:=public.beagu_historical_mean_ranked_schools_v1('','부산','','desc',2);
 IF (d->>'total')::int<>45 OR jsonb_array_length(d->'schools')<>20 OR jsonb_array_length(p->'schools')<>20 OR jsonb_array_length(last_page->'schools')<>5 THEN RAISE EXCEPTION 'pagination'; END IF;
 IF d->'schools'->0->>'school_id'<>'T000002' OR (d->'schools'->0->>'historical_mean')::numeric<>90
 OR d->'schools'->1->>'school_id'<>'T000005'
 OR d->'schools'->2->>'school_id'<>'T000001'
 OR abs((d->'schools'->2->>'historical_mean')::numeric-200::numeric/3)>0.00001
 OR (d->'schools'->3->>'historical_mean')::numeric<>0 THEN RAISE EXCEPTION 'shared approved values'; END IF;
 IF a->'schools'->0->>'school_id'<>'T000003' OR a->'schools'->4->'historical_mean' IS DISTINCT FROM 'null'::jsonb OR d->'schools'->4->'historical_mean' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'null last'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(d->'schools') x JOIN jsonb_array_elements(p->'schools') y ON x->>'school_id'=y->>'school_id') THEN RAISE EXCEPTION 'overlapping pages'; END IF;
 IF (public.beagu_historical_mean_ranked_schools_v1('','부산','없는청','asc',0)->>'total')::int<>0 THEN RAISE EXCEPTION 'office filter'; END IF;
 RAISE NOTICE 'PASS: historical mean, approved common 2026, zero, null, pagination, office filtering and grants';
END $$;
