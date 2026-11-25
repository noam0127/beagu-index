CREATE TABLE public.schools(school_id text PRIMARY KEY,school_name text,status text,sido_standard text);
CREATE TABLE public.beagu_2026_official_school_profiles(school_id text PRIMARY KEY,disclosure_code text UNIQUE,source_year smallint,profile jsonb,teacher_total int,source_sha256 text);
INSERT INTO public.schools VALUES ('1234567','정상초','운영','부산'),('1234568','보류초','운영','부산');
INSERT INTO public.beagu_2026_official_school_profiles VALUES ('1234567','S000000001',2026,'{"school_name":"정상초","closed":"N","suspended":"N","teacher_total":10,"male_teachers":4,"female_teachers":6,"unrelated":"keep"}',10,'old');
