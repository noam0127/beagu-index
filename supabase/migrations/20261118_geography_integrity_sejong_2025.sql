-- 2026-11-18: current geography for search; historical 2023-25 views remain unchanged.
-- Protect school IDs and prior year/region calculations.
UPDATE public.schools
SET support_office='창원교육지원청',updated_at=now()
WHERE sido_standard='경남' AND address LIKE '%창원시%'
AND support_office IN ('마산교육청(폐지)','진해교육청(폐지)','창원교육청(폐지)');

-- Private pre-publication location references. Never substitute a citywide price.
CREATE TABLE IF NOT EXISTS beagu_private.sejong_school_legal_dong_2025 (
 school_id text PRIMARY KEY REFERENCES public.schools(school_id),
 legal_dong_code text NOT NULL CHECK (legal_dong_code ~ '^36[0-9]{8}$'),
 mapping_source_url text NOT NULL,
 mapping_source_row integer NOT NULL CHECK(mapping_source_row >= 2),
 price_reference_year smallint NOT NULL DEFAULT 2025 CHECK(price_reference_year=2025),
 housing_price_mean_won numeric(20,2),
 contributing_housing_units integer,
 price_source_url text,
 price_status text NOT NULL DEFAULT 'UNVERIFIED'
  CHECK(price_status IN ('UNVERIFIED','VERIFIED','NO_HOUSING_DATA')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT sejong_price_integrity CHECK (
  (price_status='VERIFIED' AND housing_price_mean_won > 0
   AND contributing_housing_units > 0 AND price_source_url IS NOT NULL)
  OR (price_status <> 'VERIFIED' AND housing_price_mean_won IS NULL
   AND contributing_housing_units IS NULL)
 )
);
REVOKE ALL ON beagu_private.sejong_school_legal_dong_2025 FROM PUBLIC,anon,authenticated;

WITH source(school_name,legal_dong_code,mapping_source_row) AS (
 VALUES
 ('의랑초등학교','3611035034',1903),
 ('장기초등학교','3611035021',1904),
 ('감성초등학교','3611034023',1905),
 ('금남초등학교','3611034038',1906),
 ('소정초등학교','3611039021',1907),
 ('수왕초등학교','3611031023',1908),
 ('쌍류초등학교','3611036026',1909),
 ('연남초등학교','3611031021',1910),
 ('연동초등학교','3611032021',1911),
 ('연봉초등학교','3611036033',1912),
 ('연서초등학교','3611036029',1913),
 ('전동초등학교','3611038000',1914),
 ('전의초등학교','3611037021',1915),
 ('조치원교동초등학교','3611025024',1916),
 ('조치원대동초등학교','3611025029',1917),
 ('조치원명동초등학교','3611025026',1918),
 ('조치원신봉초등학교','3611025028',1919),
 ('세종도원초등학교','3611036021',1920),
 ('참샘초등학교','3611010600',1921),
 ('부강초등학교','3611033021',1922),
 ('한솔초등학교','3611010600',1923),
 ('양지초등학교','3611011400',1924),
 ('연양초등학교','3611011000',1925),
 ('아름초등학교','3611011300',1926),
 ('나래초등학교','3611011300',1927),
 ('도담초등학교','3611011400',1928),
 ('미르초등학교','3611010600',1929),
 ('두루초등학교','3611011200',1930),
 ('가락초등학교','3611011200',1931),
 ('으뜸초등학교','3611011200',1932),
 ('고운초등학교','3611011200',1933),
 ('온빛초등학교','3611011200',1934),
 ('종촌초등학교','3611011100',1935),
 ('늘봄초등학교','3611011400',1936),
 ('연세초등학교','3611011000',1937),
 ('다빛초등학교','3611011100',1938),
 ('소담초등학교','3611010200',1939),
 ('보람초등학교','3611010300',1940),
 ('여울초등학교','3611010300',1941),
 ('가득초등학교','3611010800',1942),
 ('새뜸초등학교','3611010800',1943),
 ('새롬초등학교','3611010800',1944),
 ('글벗초등학교','3611010200',1945),
 ('나성초등학교','3611010700',1946),
 ('솔빛초등학교','3611010100',1947),
 ('반곡초등학교','3611010100',1948),
 ('대평초등학교','3611010400',1949),
 ('새움초등학교','3611010900',1950),
 ('다정초등학교','3611010900',1951),
 ('한결초등학교','3611010900',1952),
 ('해밀초등학교','3611011600',1953),
 ('나루초등학교','3611011800',1954),
 ('집현초등학교','3611011800',1955),
 ('바른초등학교','3611011500',1956),
 ('산울초등학교','3611011500',1957)
)
INSERT INTO beagu_private.sejong_school_legal_dong_2025
(school_id,legal_dong_code,mapping_source_url,mapping_source_row)
SELECT s.school_id,x.legal_dong_code,'2025 school-level source sheet (owner-controlled)',x.mapping_source_row
FROM source x JOIN public.schools s
 ON s.school_name=x.school_name AND s.sido_standard='세종'
ON CONFLICT(school_id) DO UPDATE
 SET legal_dong_code=EXCLUDED.legal_dong_code,mapping_source_row=EXCLUDED.mapping_source_row,updated_at=now()
 WHERE beagu_private.sejong_school_legal_dong_2025.price_status <> 'VERIFIED';

DO $audit$
BEGIN
 IF (SELECT count(*) FROM beagu_private.sejong_school_legal_dong_2025) <> 55 THEN
  RAISE EXCEPTION 'Missing school/legal-dong rows for Sejong 2025';
 END IF;
END
$audit$;

-- Five 2025 district housing assessed-price averages verified against their
-- exact 10-digit legal-dong references in the user-owned 2025 reference workbook.
-- These are housing-unit price means in KRW, NOT land assessed prices per m2.
WITH verified(school_id,school_name,region,price_won,legal_dong_code) AS (
 VALUES
 ('7251243','대구율금초등학교','대구',143767562,'2714011800'),
 ('7631289','평택화양초등학교','경기',31425000,'4122037023'),
 ('7051146','서울오봉초등학교','서울',224600397,'1132010800'),
 ('7551093','중원초등학교','경기',226426196,'4113310500'),
 ('7569052','희성초등학교','경기',369905984,'4117310100')
)
INSERT INTO public.beagu_school_report_official_facts
(school_id,survey_year,fact_key,label,fact_value,unit,source_ref,review_status,source_year)
SELECT x.school_id,2025,'district_housing_price_mean','행정구역 공동주택 평균 공시가격',
 x.price_won,'원',
 '2025 school assessed-price source; verified legal-dong code '||x.legal_dong_code,
 'APPROVED',2025
FROM verified x JOIN public.schools s
 ON s.school_id=x.school_id AND s.school_name=x.school_name AND s.sido_standard=x.region
ON CONFLICT(school_id,survey_year,fact_key) DO NOTHING;

-- Audit queries for operator:
-- SELECT support_office,count(*) FROM public.schools WHERE address LIKE '%창원시%' GROUP BY 1;
-- SELECT count(*),count(distinct legal_dong_code) FROM beagu_private.sejong_school_legal_dong_2025;
-- SELECT school_name,housing_price_won FROM public.beagu_lv1_school_sort_index
--   WHERE school_id IN ('7251243','7631289','7051146','7551093','7569052');
