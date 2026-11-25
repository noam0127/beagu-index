DO $$ BEGIN
 IF has_function_privilege('anon','public.beagu_official_basics_ranked_schools_v1(text,text,text,text,text,integer)','execute')
 OR has_function_privilege('authenticated','public.beagu_official_basics_ranked_schools_v1(text,text,text,text,text,integer)','execute')
 OR NOT has_function_privilege('service_role','public.beagu_official_basics_ranked_schools_v1(text,text,text,text,text,integer)','execute')
 THEN RAISE EXCEPTION 'official grants'; END IF;
END $$;
SET ROLE service_role;
DO $$
DECLARE d jsonb;a jsonb;p jsonb; k text;
BEGIN
 FOREACH k IN ARRAY ARRAY['student_count','male_teacher_ratio','junior_teacher_ratio'] LOOP
 d:=public.beagu_official_basics_ranked_schools_v1('','부산','',k,'desc',0);
 a:=public.beagu_official_basics_ranked_schools_v1('','부산','',k,'asc',0);
 p:=public.beagu_official_basics_ranked_schools_v1('','부산','',k,'desc',2);
 IF (d->>'total')::int<>45 OR d->'schools'->0->>'school_id'<>'T000002'
 OR a->'schools'->0->>'school_id'<>'T000001' OR a->'schools'->3->k IS DISTINCT FROM 'null'::jsonb
 OR d->'schools'->3->k IS DISTINCT FROM 'null'::jsonb OR jsonb_array_length(p->'schools')<>5 THEN RAISE EXCEPTION 'sort mismatch %',k; END IF;
 IF a->'schools'->0->>'official_basics_ranked'<>'true' OR (a->'schools'->0->>'male_teacher_ratio')::numeric<>26.67
 OR (a->'schools'->0->>'junior_teacher_ratio')::numeric<>26.67 OR a->'schools'->0->>'male_teacher_reference_year'<>'2026'
 OR a->'schools'->0->>'student_count'<>'10' OR a->'schools'->0->>'student_reference_year'<>'2026'
 OR a->'schools'->1->>'male_teacher_reference_year'<>'2024' OR a->'schools'->1->>'student_reference_year'<>'2024'
 THEN RAISE EXCEPTION 'snapshot mismatch %',k; END IF;
 END LOOP;
 RAISE NOTICE 'PASS official metric order, fallback, nulls, pagination, numeric type checks, certified ratios, snapshot';
END $$;
