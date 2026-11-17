-- 2026-11-18 Changwon survey areas under a single official Changwon Education Support Office.
CREATE TABLE IF NOT EXISTS beagu_private.changwon_office_reclassification_audit_20261118 (
 school_id text PRIMARY KEY REFERENCES public.schools(school_id),
 school_name text NOT NULL,
 previous_support_office text NOT NULL,
 new_support_office text NOT NULL,
 source_address text NOT NULL,
 source_note text NOT NULL DEFAULT 'Official Changwon Support Office: main office/Masan Center/Jinhae Center; based on school road address',
 changed_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON beagu_private.changwon_office_reclassification_audit_20261118 FROM PUBLIC,anon,authenticated;
DO $$
DECLARE a int; b int; c int; d int; e int;
BEGIN
 SELECT count(*),count(*) FILTER(WHERE address ~ '창원시[[:space:]]+(의창구|성산구)'),
 count(*) FILTER(WHERE address ~ '창원시[[:space:]]+마산(합포구|회원구)'),
 count(*) FILTER(WHERE address ~ '창원시[[:space:]]+진해구'),
 count(*) FILTER(WHERE address !~ '창원시[[:space:]]+(의창구|성산구|마산합포구|마산회원구|진해구)')
 INTO a,b,c,d,e FROM public.schools WHERE sido_standard='경남' AND address LIKE '%창원시%';
 IF a<>113 OR b<>50 OR c<>43 OR d<>20 OR e<>0 THEN RAISE EXCEPTION 'Unexpected geography; Changwon % % % % %', a,b,c,d,e; END IF;
 INSERT INTO beagu_private.changwon_office_reclassification_audit_20261118
 (school_id,school_name,previous_support_office,new_support_office,source_address)
 SELECT school_id,school_name,support_office,
 CASE WHEN address ~ '창원시[[:space:]]+마산(합포구|회원구)' THEN '창원교육지원청(마산센터)'
      WHEN address ~ '창원시[[:space:]]+진해구' THEN '창원교육지원청(진해센터)'
      ELSE '창원교육지원청' END,address
 FROM public.schools WHERE sido_standard='경남' AND address LIKE '%창원시%'
 ON CONFLICT(school_id) DO NOTHING;
 UPDATE public.schools SET support_office=
 CASE WHEN address ~ '창원시[[:space:]]+마산(합포구|회원구)' THEN '창원교육지원청(마산센터)'
      WHEN address ~ '창원시[[:space:]]+진해구' THEN '창원교육지원청(진해센터)'
      ELSE '창원교육지원청' END,updated_at=now()
 WHERE sido_standard='경남' AND address LIKE '%창원시%';
END $$;
