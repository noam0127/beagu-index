-- Reviewed patch only. Caller must open transaction, load temporary input, and explicitly commit.
-- No persistent function, grants, deletes, inserts into production tables, or directory changes.
LOCK TABLE public.schools IN SHARE MODE;
LOCK TABLE public.beagu_2026_official_school_profiles IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE verified_schoolinfo_patch ON COMMIT DROP AS
SELECT p.school_id,i.disclosure_code,
 jsonb_build_object('student_count',i.student_count,'student_reference_year',2026,
  'elementary_certified_counts',i.qualified,'schoolinfo_2026_patch_sha256',i.source_digest) AS patch
FROM schoolinfo_input i
JOIN public.beagu_2026_official_school_profiles p ON p.disclosure_code=i.disclosure_code AND p.source_year=2026
JOIN public.schools s ON s.school_id=p.school_id
WHERE s.status='운영' AND s.sido_standard<>'재외한국학교'
 AND s.school_name=i.school_name AND p.profile->>'school_name'=i.school_name
 AND p.profile->>'closed'='N' AND p.profile->>'suspended'='N'
 AND p.teacher_total=i.staff_total AND p.profile->>'teacher_total'=i.staff_total::text
 AND p.profile->>'male_teachers'=i.staff_male::text AND p.profile->>'female_teachers'=i.staff_female::text;
DO $guard$
DECLARE n integer; expected integer; held text[];
BEGIN
 SELECT count(*) INTO n FROM verified_schoolinfo_patch;
 SELECT expected_ready INTO STRICT expected FROM schoolinfo_control;
 IF n<>expected OR (SELECT count(DISTINCT school_id) FROM verified_schoolinfo_patch)<>n
  OR (SELECT count(DISTINCT disclosure_code) FROM verified_schoolinfo_patch)<>n THEN RAISE EXCEPTION 'SCHOOLINFO_MAPPING_DRIFT'; END IF;
 SELECT coalesce(array_agg(i.disclosure_code ORDER BY i.disclosure_code),ARRAY[]::text[]) INTO held
 FROM schoolinfo_input i WHERE NOT EXISTS(SELECT 1 FROM verified_schoolinfo_patch v WHERE v.disclosure_code=i.disclosure_code);
 IF held IS DISTINCT FROM (SELECT expected_held FROM schoolinfo_control) THEN RAISE EXCEPTION 'SCHOOLINFO_HELD_SET_DRIFT'; END IF;
 IF EXISTS(SELECT 1 FROM verified_schoolinfo_patch v JOIN public.beagu_2026_official_school_profiles p USING(school_id)
 WHERE p.source_year=2026 AND (
  (p.profile ? 'elementary_certified_counts' AND p.profile->'elementary_certified_counts' IS DISTINCT FROM v.patch->'elementary_certified_counts')
  OR (p.profile->>'student_reference_year'='2026' AND p.profile->'student_count' IS DISTINCT FROM v.patch->'student_count')
  OR (p.profile ? 'schoolinfo_2026_patch_sha256' AND p.profile->'schoolinfo_2026_patch_sha256' IS DISTINCT FROM v.patch->'schoolinfo_2026_patch_sha256')
 )) THEN RAISE EXCEPTION 'SCHOOLINFO_EXISTING_2026_CONFLICT'; END IF;
END $guard$;
-- Backup the exact changed field state in transaction output; operator must keep
-- a separately verified encrypted DB backup before any approved production apply.
WITH changed AS (
 UPDATE public.beagu_2026_official_school_profiles p SET profile=p.profile||v.patch
 FROM verified_schoolinfo_patch v WHERE p.school_id=v.school_id AND p.source_year=2026
 AND p.disclosure_code=v.disclosure_code AND NOT (p.profile @> v.patch)
 RETURNING p.school_id
) SELECT count(*) AS changed_profiles FROM changed;
DO $verify$
BEGIN
 IF EXISTS(SELECT 1 FROM verified_schoolinfo_patch v LEFT JOIN public.beagu_2026_official_school_profiles p
 ON p.school_id=v.school_id AND p.disclosure_code=v.disclosure_code AND p.source_year=2026
 WHERE p.school_id IS NULL OR NOT (p.profile @> v.patch)) THEN RAISE EXCEPTION 'SCHOOLINFO_POSTCHECK_FAILED'; END IF;
END $verify$;
SELECT count(*) AS verified_profiles FROM verified_schoolinfo_patch;
