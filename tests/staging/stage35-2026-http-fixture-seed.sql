-- Staging-only, synthetic approval windows: no real school or teacher data.
DO $$ BEGIN
 IF to_regclass('stage_private.fake_schools') IS NULL THEN
  RAISE EXCEPTION 'STAGING ONLY fixture marker missing';
 END IF;
END $$;

INSERT INTO public.beagu_metric_catalog
(survey_year,question_id,access_level,verified,label,meaning,interpretation,
 direction,unit,spatial_scope,value_type,minimum,maximum)
VALUES
(2026,'percentile',1,true,'검증용 백분위','가상 승인 공개 지표',
 '테스트 전용 수치','higher','%','가상 학교','number',0,100)
ON CONFLICT(survey_year,question_id) DO UPDATE SET
 verified=EXCLUDED.verified;

-- All six IDs are fictitious TST identifiers. Approval age is calculated
-- relative to NOW at fixture creation, not to the original survey submission.
INSERT INTO public.beagu_release_metrics_v2
(school_id,survey_year,question_id,access_level,value,release_version,
 approval_status,privacy_status,identity_reviewed,question_reviewed,
 small_cell_reviewed,differencing_reviewed,approved_at,approved_by,approval_evidence)
SELECT x.id,2026,'percentile',1,'42.5','stage35-test-only','APPROVED',
 'PASSED',true,true,x.small_cell_reviewed,true,
 now()-make_interval(hours=>x.age_hours),'synthetic-reviewer','FAKE_QA_REVIEW'
FROM (VALUES
 ('TST0001',5,true),
 ('TST0002',7,true),
 ('TST0003',25,true),
 ('TST0004',25,true),
 ('TST0005',25,false),
 ('TST0006',7,true)
) AS x(id,age_hours,small_cell_reviewed)
ON CONFLICT (school_id,question_id) DO UPDATE SET
 approved_at=EXCLUDED.approved_at,small_cell_reviewed=EXCLUDED.small_cell_reviewed,
 approval_status=EXCLUDED.approval_status,privacy_status=EXCLUDED.privacy_status;

INSERT INTO public.beagu_2026_results_snapshot
(school_id,approved_at,approval_status,privacy_reviewed,questions)
SELECT x.id,now()-make_interval(hours=>x.age_hours),
 x.approval_status,x.privacy_reviewed,
 '[{"id":"Q01","valid":true,"invalid":0}]'::jsonb
FROM (VALUES
 ('TST0001',5,'APPROVED',true),
 ('TST0002',7,'APPROVED',true),
 ('TST0003',25,'APPROVED',true),
 ('TST0004',25,'PENDING',true),
 ('TST0005',25,'APPROVED',true),
 ('TST0006',7,'APPROVED',false)
) AS x(id,age_hours,approval_status,privacy_reviewed)
ON CONFLICT (school_id) DO UPDATE SET
 approved_at=EXCLUDED.approved_at,
 approval_status=EXCLUDED.approval_status,
 privacy_reviewed=EXCLUDED.privacy_reviewed,
 questions=EXCLUDED.questions;

-- Deterministic 15-minute sessions for one-time HTTP tests.
INSERT INTO public.beagu_level_sessions(token_sha256,access_level,created_at,expires_at)
VALUES
(encode(extensions.digest(repeat('6',64),'sha256'),'hex'),1,now(),now()+interval '15 minutes'),
(encode(extensions.digest(repeat('7',64),'sha256'),'hex'),2,now(),now()+interval '15 minutes')
ON CONFLICT(token_sha256) DO UPDATE SET
 access_level=EXCLUDED.access_level,
 created_at=EXCLUDED.created_at,expires_at=EXCLUDED.expires_at;

SELECT (SELECT count(*) FROM public.beagu_release_metrics_v2) AS fake_metrics,
 (SELECT count(*) FROM public.beagu_2026_results_snapshot) AS fake_snapshots,
 (SELECT count(*) FROM public.beagu_level_sessions
  WHERE token_sha256 IN
  (encode(extensions.digest(repeat('6',64),'sha256'),'hex'),
   encode(extensions.digest(repeat('7',64),'sha256'),'hex'))) AS live_test_sessions;
