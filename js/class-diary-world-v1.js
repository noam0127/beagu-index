/* 『나의 OO한 학급일지』 학교 세계 생성기 v1.
 * 서버가 Lv2 세션과 출처·공개 상태를 검증한 payload만 받는다.
 * 이 파일에는 비공개 조사 원자료, 인증 비밀값, 사용자 기록을 넣지 않는다.
 */
(function (root) {
  'use strict';
  const VERSION = 'class-diary-world/v1';
  const NUMERIC_KEYS = Object.freeze([
    'admin_employees','cafeterias','classes','classrooms',
    'district_housing_price_mean','gym_spaces','junior_teacher_ratio',
    'land_area','lead_teachers','male_teacher_ratio','playground_area',
    'school_employees','september_participation_rate','students',
    'students_per_class','teacher_support_spaces','teachers','vice_principals'
  ]);
  const CATEGORY_KEYS = Object.freeze(['establishment_type','meal_place','milk_lunch']);
  const PERCENT_KEYS = new Set([
    'junior_teacher_ratio','male_teacher_ratio','september_participation_rate'
  ]);
  const SOURCE_YEARS = Object.freeze({
    september_participation_rate: 2023,
    district_housing_price_mean: 2025
  });
  const REGION_TAGS = new Set([
    'urban_core','apartment_area','rural','mountain','coast','tidal_flat',
    'island','border','tourism','new_town','old_town','industrial'
  ]);
  const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
  function validNumber(value) {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function trim(value, max) {
    return typeof value === 'string' ? value.trim().slice(0,max) : '';
  }
  function audit(rows, keys, categorical, issues) {
    const result = {};
    const allowed = new Set(keys);
    for (const key of keys) {
      const entries = (Array.isArray(rows) ? rows : []).filter(row =>
        row && row.fact_key === key && allowed.has(row.fact_key) && row.review_status === 'APPROVED'
      ).map(row => {
        const referenceYear = validNumber(categorical ? row.reference_year : row.source_year);
        const value = categorical ? trim(row.fact_value,120) : validNumber(row.fact_value);
        return {
          value, referenceYear, surveyYear: validNumber(row.survey_year),
          unit: categorical ? null : trim(row.unit,12),
          label: trim(row.label,80)
        };
      }).filter(row => Number.isInteger(row.referenceYear) && row.referenceYear >= 2000 &&
        row.referenceYear <= 2027 && (categorical ? row.value !== '' :
          row.value !== null && row.value >= 0 && (!PERCENT_KEYS.has(key) || row.value <= 100))
      );
      if (!entries.length) { result[key] = null; continue; }
      const latest = Math.max(...entries.map(row => row.referenceYear));
      const current = entries.filter(row => row.referenceYear === latest);
      if (new Set(current.map(row => String(row.value))).size > 1) {
        issues.push({code:'CONFLICTING_APPROVED_VALUES',key,referenceYear:latest});
        result[key] = null;
        continue;
      }
      if (own(SOURCE_YEARS,key) && latest !== SOURCE_YEARS[key]) {
        issues.push({code:'UNEXPECTED_REFERENCE_YEAR',key,referenceYear:latest});
        result[key] = null;
        continue;
      }
      const chosen = current.sort((a,b) => (b.surveyYear||0)-(a.surveyYear||0))[0];
      result[key] = {
        value:chosen.value, unit:chosen.unit, label:chosen.label,
        referenceYear:chosen.referenceYear, surveyYear:chosen.surveyYear,
        sourceTable:categorical ? 'public.beagu_school_report_official_categories' :
          'public.beagu_school_report_official_facts',
        status:'APPROVED'
      };
    }
    return result;
  }
  function geography(address, sido, approvedTags) {
    const tags = [];
    const add = (id,label,source,reference) => {
      if (!tags.some(x=>x.id===id)) tags.push({id,label,source,reference});
    };
    const chunks = trim(address,240).split(/\s+/).map(x=>x.replace(/[(),]/g,''));
    for (const part of chunks) {
      if (/^[가-힣]{1,12}읍$/.test(part)) add('admin_eup','읍 소재','official_address',part);
      else if (/^[가-힣]{1,12}면$/.test(part)) add('admin_myeon','면 소재','official_address',part);
      else if (/^[가-힣]{1,12}동$/.test(part)) add('admin_dong','동 소재','official_address',part);
    }
    if (/^(서울|부산|대구|인천|광주|대전|울산)(특별시|광역시)?$/.test(trim(sido,32))) {
      add('metropolitan_administration','광역시·특별시 관할','official_sido',trim(sido,32));
    }
    for (const row of (Array.isArray(approvedTags) ? approvedTags : [])) {
      if (row && REGION_TAGS.has(row.tag) && row.review_status === 'APPROVED' &&
          row.source_type === 'official_geospatial' && trim(row.source_ref,200)) {
        add(row.tag,row.label ? trim(row.label,40) : row.tag,
          'official_geospatial',trim(row.source_ref,200));
      }
    }
    return {
      tags, unverifiedLandscape: ['urban_core','apartment_area','rural','mountain',
        'coast','tidal_flat','island','border','tourism','new_town','old_town',
        'industrial'].filter(k=>!tags.some(t=>t.id===k))
    };
  }
  function hook(id,day,kind,keys,summary) {
    return {id,day,kind,referenceKeys:keys,storyBrief:summary};
  }
  function storyHooks(basic,numbers,categories,geo,years) {
    const hooks = [];
    if (basic.scale) hooks.push(hook('school_scale',1,'setting',['students'],
      '실제 기준연도의 학생 규모에 따라 첫 교무실·학급 풍경을 달리 구성한다.'));
    if (geo.tags.length) hooks.push(hook('place',1,'setting',['address'],
      '확인된 행정·지리 태그만 풍경 묘사의 조건으로 사용한다.'));
    if (categories.establishment_type) hooks.push(hook('establishment',1,'setting',
      ['establishment_type'],'확인된 학교 설립 형태에 맞춰 제도적 배경을 구성한다.'));
    if (numbers.teachers || numbers.junior_teacher_ratio || numbers.male_teacher_ratio)
      hooks.push(hook('staff',1,'setting',
        ['teachers','junior_teacher_ratio','male_teacher_ratio'],
        '교원 구성을 배경에 반영하되 성별과 자격으로 성격이나 업무 배정을 단정하지 않는다.'));
    if (numbers.admin_employees || numbers.school_employees)
      hooks.push(hook('work_support',2,'context',
        ['admin_employees','school_employees'],
        '행정·지원 인력 수를 업무 협의의 배경 조건으로만 사용한다.'));
    if (numbers.vice_principals || numbers.lead_teachers)
      hooks.push(hook('leadership_roles',2,'context',
        ['vice_principals','lead_teachers'],
        '실제 교감·수석교사 수를 배경에 반영하지만 인물의 성격·권위와 동일시하지 않는다.'));
    if (numbers.land_area) hooks.push(hook('school_grounds',3,'setting',
      ['land_area'],'교사대지 면적은 이동 동선과 공간의 크기를 묘사할 때 참고한다.'));
    if (numbers.classes || numbers.classrooms || numbers.students_per_class)
      hooks.push(hook('class_space',3,'setting',
        ['classes','classrooms','students_per_class'],
        '학급·교실의 실제 규모를 교실의 동선과 학년 협의 장면에 활용한다.'));
    if (categories.meal_place || categories.milk_lunch || numbers.cafeterias)
      hooks.push(hook('school_meals',3,'context',
        ['meal_place','milk_lunch','cafeterias'],
        '확인된 급식 운영 형태를 점심시간 배경에 사용한다.'));
    if (numbers.september_participation_rate)
      hooks.push(hook('september_memory',4,'past',
        ['september_participation_rate'],
        '2023년 9·4 참여 기록은 과거 회상의 배경일 뿐 현재 개인의 신념이 아니다.'));
    if (numbers.gym_spaces || numbers.playground_area || numbers.teacher_support_spaces)
      hooks.push(hook('facilities',5,'setting',
        ['gym_spaces','playground_area','teacher_support_spaces'],
        '확인된 학교 공간을 행사·휴식 장면의 물리적 조건으로 사용한다.'));
    if (numbers.district_housing_price_mean)
      hooks.push(hook('housing_context',6,'background',
        ['district_housing_price_mean'],
        '행정구역의 주거 지표만 반영하며 학생·학부모의 인격이나 행동과 연결하지 않는다.'));
    if (years.length) hooks.push(hook('survey_time',7,'reflection',['publishedYears'],
      '과거 조사연도와 2027년 가상 현재를 분리해 회고한다.'));
    return hooks;
  }
  function generateWorld(payload) {
    if (!payload || payload.schemaVersion !== VERSION || !payload.school ||
        !/^[A-Z0-9]{7}$/.test(String(payload.school.school_id||''))) {
      throw new Error('INVALID_APPROVED_WORLD_INPUT');
    }
    const school = payload.school;
    const issues = [];
    const numbers = audit(payload.facts,NUMERIC_KEYS,false,issues);
    const categories = audit(payload.categories,CATEGORY_KEYS,true,issues);
    const count = numbers.students ? numbers.students.value : null;
    const scale = count === null ? null : (count <= 150 ? 'small' :
      count <= 600 ? 'medium' : 'large');
    const years = [...new Set((Array.isArray(payload.publishedYears) ?
      payload.publishedYears : []).filter(y=>Number.isInteger(y)&&y>=2023&&y<=2026))].sort();
    const basic = {
      id:trim(school.school_id,7),schoolId:trim(school.school_id,7),
      schoolCode:trim(school.school_code,32)||null,
      name:trim(school.school_name,120),sido:trim(school.sido_standard||school.sido,60),
      office:trim(school.support_office,100),address:trim(school.address,240)||null,
      schoolKind:trim(school.school_kind,50),establishment:trim(school.establishment,50),
      educationOffice:trim(school.education_office,120)||null,
      educationOfficeCode:trim(school.education_office_code,40)||null,
      homepage:trim(school.homepage,240)||null,
      originalSource:trim(school.source,120)||null,
      schoolListSyncedAt:trim(school.last_synced_at,60)||null,
      openingDate:null,studentTransfers:null,coordinates:null,
      schoolStatus:trim(school.status,40),scale,
      studentCountReferenceYear:numbers.students ? numbers.students.referenceYear : null
    };
    const geo = geography(basic.address,basic.sido,payload.verifiedRegionTags);
    if (!basic.address) issues.push({code:'ADDRESS_UNVERIFIED',key:'address'});
    if (count===null) issues.push({code:'STUDENT_COUNT_UNVERIFIED',key:'students'});
    if (!years.length) issues.push({code:'NO_APPROVED_PUBLISHED_SURVEY',key:'publishedYears'});
    for (const key of NUMERIC_KEYS) if (!numbers[key]) {
      if (!issues.some(x=>x.key===key)) issues.push({code:'MISSING_OFFICIAL_FACT',key});
    }
    for (const key of CATEGORY_KEYS) if (!categories[key])
      issues.push({code:'MISSING_OFFICIAL_CATEGORY',key});
    const hooks = storyHooks(basic,numbers,categories,geo,years);
    return {
      schemaVersion:VERSION,fictionalPresent:'2027-03-08/2027-03-14',
      sourceIsFiction:false,storyIsFiction:true,
      eligible:years.length>0 && basic.schoolKind==='초등학교' &&
        basic.schoolStatus==='운영',
      publishedYears:years,basic,numbers,categories,geography:geo,
      storyHooks:hooks,issues,
      coverage:{
        numericKnown:NUMERIC_KEYS.filter(k=>!!numbers[k]).length,
        numericTotal:NUMERIC_KEYS.length,
        categoricalKnown:CATEGORY_KEYS.filter(k=>!!categories[k]).length,
        categoricalTotal:CATEGORY_KEYS.length
      }
    };
  }
  const api = Object.freeze({VERSION,NUMERIC_KEYS,CATEGORY_KEYS,generateWorld});
  root.BeaguClassDiaryWorld = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
