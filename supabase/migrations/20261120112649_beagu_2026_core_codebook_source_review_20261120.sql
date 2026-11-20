-- Source/choice/scoring verification only; never approves a school or respondent disclosure.
-- Production migration already applied via Supabase on 2026-11-20 11:26:49 UTC.
-- Reviewed against 2026 response-sheet headers and observed options,
-- canonical questionnaire v1.2 and Apps Script scorer (CI PR #132).
-- Q12/13 '기타' is excluded from scoring; free text remains private.
DO $verify$
DECLARE matching_count integer;
DECLARE changed_count integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.beagu_release_metrics_v2 WHERE survey_year=2026 AND approval_status='APPROVED')
     OR EXISTS (SELECT 1 FROM public.beagu_2026_results_snapshot WHERE approval_status='APPROVED')
     OR EXISTS (SELECT 1 FROM public.beagu_school_report_yearly WHERE survey_year=2026 AND publication_status='PUBLISHED')
  THEN RAISE EXCEPTION 'stop: 2026 release approvals exist; audit impact before verifying codebook'; END IF;

  WITH expected(question_id,label,direction,options,scoring) AS (VALUES
  ('Q01','교직원 친목·체육·회식에 참여하지 않겠다는 선택이 자연스럽게 받아들여진다.','정방향','["① 전혀 그렇지 않다","② 그렇지 않다","③ 보통이다","④ 그렇다","⑤ 매우 그렇다","⑥ 판단하기 어렵다"]'::jsonb,'{"① 전혀 그렇지 않다":0,"② 그렇지 않다":25,"③ 보통이다":50,"④ 그렇다":75,"⑤ 매우 그렇다":100,"⑥ 판단하기 어렵다":null}'::jsonb),
('Q02','연가·조퇴를 사용할 때 관리자에게 직접 찾아가 보고해야 한다.','역방향','["① 전혀 그렇지 않다","② 그렇지 않다","③ 보통이다","④ 그렇다","⑤ 매우 그렇다","⑥ 판단하기 어렵다"]'::jsonb,'{"① 전혀 그렇지 않다":100,"② 그렇지 않다":75,"③ 보통이다":50,"④ 그렇다":25,"⑤ 매우 그렇다":0,"⑥ 판단하기 어렵다":null}'::jsonb),
('Q03','병가 사용 시 정해진 복무 절차 외의 허락을 받거나 사용 자제를 요구받는다.','역방향','["① 전혀 그렇지 않다","② 그렇지 않다","③ 보통이다","④ 그렇다","⑤ 매우 그렇다","⑥ 판단하기 어렵다"]'::jsonb,'{"① 전혀 그렇지 않다":100,"② 그렇지 않다":75,"③ 보통이다":50,"④ 그렇다":25,"⑤ 매우 그렇다":0,"⑥ 판단하기 어렵다":null}'::jsonb),
('Q04','관리자나 다수와 다른 의견을 말하면 불이익이나 관계상의 압박이 걱정된다.','역방향','["① 전혀 그렇지 않다","② 그렇지 않다","③ 보통이다","④ 그렇다","⑤ 매우 그렇다","⑥ 판단하기 어렵다"]'::jsonb,'{"① 전혀 그렇지 않다":100,"② 그렇지 않다":75,"③ 보통이다":50,"④ 그렇다":25,"⑤ 매우 그렇다":0,"⑥ 판단하기 어렵다":null}'::jsonb),
('Q05','수업·평가·학급 운영에서 전문적 판단보다 기존 관행을 따르도록 요구받는다.','역방향','["① 전혀 그렇지 않다","② 그렇지 않다","③ 보통이다","④ 그렇다","⑤ 매우 그렇다","⑥ 판단하기 어렵다"]'::jsonb,'{"① 전혀 그렇지 않다":100,"② 그렇지 않다":75,"③ 보통이다":50,"④ 그렇다":25,"⑤ 매우 그렇다":0,"⑥ 판단하기 어렵다":null}'::jsonb),
('Q06','업무·보직 배정 기준이 구성원에게 공유되어 있다.','정방향','["① 전혀 그렇지 않다","② 그렇지 않다","③ 보통이다","④ 그렇다","⑤ 매우 그렇다","⑥ 판단하기 어렵다"]'::jsonb,'{"① 전혀 그렇지 않다":0,"② 그렇지 않다":25,"③ 보통이다":50,"④ 그렇다":75,"⑤ 매우 그렇다":100,"⑥ 판단하기 어렵다":null}'::jsonb),
('Q07','업무·보직 배정 기준이 사람에 따라 달라지지 않고 일관되게 적용된다.','정방향','["① 전혀 그렇지 않다","② 그렇지 않다","③ 보통이다","④ 그렇다","⑤ 매우 그렇다","⑥ 판단하기 어렵다"]'::jsonb,'{"① 전혀 그렇지 않다":0,"② 그렇지 않다":25,"③ 보통이다":50,"④ 그렇다":75,"⑤ 매우 그렇다":100,"⑥ 판단하기 어렵다":null}'::jsonb),
('Q08','신규·전입·저연차라는 이유만으로 특정 업무(학년·교과 교육과정 계획 포함)를 우선 맡긴다.','역방향','["① 전혀 그렇지 않다","② 그렇지 않다","③ 보통이다","④ 그렇다","⑤ 매우 그렇다","⑥ 판단하기 어렵다"]'::jsonb,'{"① 전혀 그렇지 않다":100,"② 그렇지 않다":75,"③ 보통이다":50,"④ 그렇다":25,"⑤ 매우 그렇다":0,"⑥ 판단하기 어렵다":null}'::jsonb),
('Q09','업무 배정이나 학교 운영 결정에 이의를 제기하면 조정·재검토를 받을 수 있다.','정방향','["① 전혀 그렇지 않다","② 그렇지 않다","③ 보통이다","④ 그렇다","⑤ 매우 그렇다","⑥ 판단하기 어렵다"]'::jsonb,'{"① 전혀 그렇지 않다":0,"② 그렇지 않다":25,"③ 보통이다":50,"④ 그렇다":75,"⑤ 매우 그렇다":100,"⑥ 판단하기 어렵다":null}'::jsonb),
('Q10','심각한 학부모 민원·갈등이 생기면 관리자 등 학교 차원에서 함께 대응한다.','정방향','["① 전혀 그렇지 않다","② 그렇지 않다","③ 보통이다","④ 그렇다","⑤ 매우 그렇다","⑥ 판단하기 어렵다"]'::jsonb,'{"① 전혀 그렇지 않다":0,"② 그렇지 않다":25,"③ 보통이다":50,"④ 그렇다":75,"⑤ 매우 그렇다":100,"⑥ 판단하기 어렵다":null}'::jsonb),
('Q11','교사 혼자 감당하기 어려운 학생지도 문제가 생기면 관리자 등이 함께 대응한다.','정방향','["① 전혀 그렇지 않다","② 그렇지 않다","③ 보통이다","④ 그렇다","⑤ 매우 그렇다","⑥ 판단하기 어렵다"]'::jsonb,'{"① 전혀 그렇지 않다":0,"② 그렇지 않다":25,"③ 보통이다":50,"④ 그렇다":75,"⑤ 매우 그렇다":100,"⑥ 판단하기 어렵다":null}'::jsonb),
('Q12','방학 중 교사 근무조·당번을 어떻게 운영합니까?','범주형 환산','["① 운영하지 않는다","② 희망자만 참여한다","③ 희망과 관계없이 배정하지만 조정할 수 있다","④ 희망과 관계없이 배정하고 조정하기 어렵다","⑤ 잘 모르겠다"]'::jsonb,'{"① 운영하지 않는다":100,"② 희망자만 참여한다":100,"③ 희망과 관계없이 배정하지만 조정할 수 있다":50,"④ 희망과 관계없이 배정하고 조정하기 어렵다":0,"⑤ 잘 모르겠다":null}'::jsonb),
('Q13','성별·나이를 이유로 비공식 업무를 맡기는 일이 있습니까?','범주형 환산','["① 그런 일이 없다","② 요청은 있지만 자유롭게 거절할 수 있다","③ 거절하면 눈치나 부담을 준다","④ 사실상 거절하기 어렵다","⑤ 판단하기 어렵다"]'::jsonb,'{"① 그런 일이 없다":100,"② 요청은 있지만 자유롭게 거절할 수 있다":100,"③ 거절하면 눈치나 부담을 준다":25,"④ 사실상 거절하기 어렵다":0,"⑤ 판단하기 어렵다":null}'::jsonb)
  )
  SELECT count(*) INTO matching_count FROM expected e JOIN public.beagu_metric_catalog c
  ON c.survey_year=2026 AND c.question_id=e.question_id
  AND c.label=e.label AND c.direction=e.direction
  AND c.options=e.options AND c.scoring=e.scoring
  AND c.access_level=1 AND c.value_type='number'
  AND c.minimum=0 AND c.maximum=100
  AND c.verified=false AND c.verification_evidence IS NULL;

  IF matching_count<>13 OR
    (SELECT count(*) FROM public.beagu_metric_catalog WHERE survey_year=2026 AND question_id ~ '^Q(0[1-9]|1[0-3])$')<>13
  THEN RAISE EXCEPTION 'abort: codebook changed since reviewed or expected 13 questions missing (matched %)',matching_count;
  END IF;

  UPDATE public.beagu_metric_catalog SET
      verified=true,
      verification_evidence='2026-11-20 SOURCE/SCORING ONLY: 2026 official Google Form response sheet header Q01-Q13 13/13; canonical questionnaire 수정5 v1.2 vs DB labels/options/scoring 13/13; Apps Script direction and category-score contract CI PR #132 passed; 19 Q12/Q13 non-whitelist values withheld. No publication approval, percentile-method validation, respondent consent or privacy clearance is implied.'
  WHERE survey_year=2026 AND question_id ~ '^Q(0[1-9]|1[0-3])$' AND verified=false;
  GET DIAGNOSTICS changed_count=ROW_COUNT;
  IF changed_count<>13 THEN RAISE EXCEPTION 'abort: modified % rows instead of 13',changed_count; END IF;
END
$verify$;
