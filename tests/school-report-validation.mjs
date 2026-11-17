import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const html=fs.readFileSync('school-report.html','utf8');
const scripts=[...html.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/g)];
assert.ok(scripts.length>=2,'Expected catalog and application scripts');
const src=scripts.at(-1)[1];
const temp=join(tmpdir(),'beagu-school-report-syntax-'+process.pid+'.mjs');
fs.writeFileSync(temp,src);
try{
  const check=spawnSync(process.execPath,['--check',temp],{encoding:'utf8'});
  assert.equal(check.status,0,check.stderr||check.stdout);
}finally{fs.unlinkSync(temp)}
for(const item of ['id="tierSelector"','id="tierCodeForm"','id="approvedSummary"','function publicYearDB','function questionCatalogDB','function protectedReport','function loginTier','tier-locked','Lv.2']){
  assert.ok(html.includes(item),'Missing report control: '+item);
}
assert.ok(html.includes('beagu-level-api'),'Protected report must use server-side token validation');
assert.ok(!src.includes('SUPABASE_SERVICE_ROLE_KEY'),'Do not expose service role key');
const marker='<script type="application/json" id="embeddedCatalog">';
const markerAt=html.indexOf(marker);
assert.ok(markerAt>=0,'Questionnaire metadata is required');
const markerEnd=html.indexOf('</script>',markerAt);
assert.ok(markerEnd>markerAt,'Unterminated questionnaire metadata');
const catalog=JSON.parse(html.slice(markerAt+marker.length,markerEnd));
assert.equal(catalog.years['2026'].items.length,50,'2026 Q51 must not appear in public list');
assert.ok(!catalog.years['2026'].items.some(q=>q.id==='Q51'),'No free-text item in report UI');
assert.ok(html.includes('beagu_2025_empirical_percentiles'),'2025 national percentile must come from ranked DB');
const fields=JSON.parse(fs.readFileSync('lv2-edited-column-schema.json','utf8'));
for(const [year,columns] of Object.entries(fields.years)){
  assert.ok(!columns.some(c=>['narrative','legacy'].includes(c.classification)),
    'Historic open text must be excluded from '+year);
}
const percentiles=JSON.parse(fs.readFileSync('data/public-lv0-percentiles-v1.2.json','utf8'));
assert.ok(percentiles.data_version.includes('empirical-2025'),'Static public 2025 data version is outdated');
assert.equal(percentiles.rows.filter(r=>r.percentiles[2]!==null).length,1294,'Vetted 2025 release count changed unexpectedly');
const syncScript=fs.readFileSync('scripts/beagu-2026-noon-sync.gs','utf8');
assert.ok(syncScript.includes('firstOfficialResponseDay: "2026-11-01"'),'2026 prelaunch response exclusion missing');
assert.ok(syncScript.includes('getSubmittedDay(r[0])'),'2026 timestamp must be checked before aggregation');
assert.ok(!src.includes("from('beagu_school_report_official_facts')"),'Numeric facts must not be fetched by anonymous browser');
assert.ok(!src.includes("from('beagu_school_report_official_categories')"),'Categorical facts must not be fetched by anonymous browser');
assert.ok(src.includes("metric.group==='편집본 공식 학교정보'"),
  'Tiered official school summaries must be rendered only after authenticated API response');
assert.ok(src.includes("panel.hidden=state.tier!==0"),
  'Anonymous screen must not leak detailed official figures');
const lv2=fs.readFileSync('js/lv2-edited-search.js','utf8');
assert.ok(lv2.includes('const visibleFields=fields;'), 'Do not hide real reviewed 2025 fixed indicators');
assert.ok(lv2.includes("'AF','AG','AP','AR','AX','AY'"), 'Restore vetted 2024 details');
assert.ok(!lv2.includes("'AC','AE','AI','AM','AQ','AU','AY','BC','BG'"),
 'Unverified 2025 survey domain columns must not be enabled');
// Lv.1 comparison UI: the nationwide mean is the midpoint of the horizontal scale.
// Never turn categorical modes or unverified/missing numeric values into a chart.
assert.ok(src.includes("if(x.comparisonKind!=='average')return ''"),'Only approved numeric means may use a horizontal benchmark');
assert.ok(src.includes('school.unit!==national.unit'),'Units must match before positioning markers');
assert.ok(src.includes('50+35*(v.n-national.n)/extent'),'National mean must sit at the 50% horizontal midpoint');
assert.ok(html.includes('benchmark-dot nation') && html.includes('benchmark-dot region') && html.includes('benchmark-dot school'));
assert.ok(src.includes('left:50%') && src.includes("left:'+position(school)"),'Markers must move left and right on the line');
assert.ok(html.includes('benchmark-plot:before{content:"";position:absolute;left:8%;right:8%;top:50%'),'Comparison line must be horizontal');
assert.ok(html.includes('benchmark-directions') && html.includes('전국 평균보다 낮음') && html.includes('전국 평균보다 높음'),'Horizontal direction cues required');
assert.ok(html.includes('benchmark-values'),'Actual approved comparison values must remain visible at the bottom');
assert.ok(src.includes('!isSchoolOverviewRepeat(x)'),'Repeated school identity fields must be omitted from historical details');
assert.ok(src.includes("학교별 수치가 없습니다"),'Unavailable approved fields must not be fabricated');
assert.ok(src.includes('Lv.1 인증 후에는 검증된 학교별 수치'),'Level 1 scope must exceed public Level 0');
assert.ok(!html.includes('SCHOOL REPORT · 2023—2026'),'Redundant English UI labels should be removed');

// Every 2023–2026 question starts with the reference comparison when available.
assert.ok(src.includes('function questionComparisonVisual('),'Question comparison widget must be shared across selected years');
assert.ok(src.includes('row.prepend(chart)'),'Comparison must appear before the question and answer options');
assert.ok(html.includes('.question-visual-axis:before'),'Comparison must be drawn as a horizontal line');
assert.ok(src.includes("kindNation==='ordinal_mean'&&kindRegion==='ordinal_mean'"),'Do not impose an order on categorical modes');
assert.ok(src.includes("if(!isFreeText){"),'Private free-text responses must not be charted');
assert.ok(src.includes('const chart=questionComparisonVisual({'),'All four year templates must invoke the comparison chart');
assert.ok(src.includes('canonicalRegion(state.school.sido_standard||state.school.sido)'),'Use consistent approved region matching');
assert.ok(src.includes("return '광주'")&&src.includes("return '전남'"),'Preserve Gwangju and Jeonnam separate region references');
assert.ok(src.includes("nation:state.tier>=1?national:null"),'Level 0 must not expose authenticated comparison data');
assert.ok(src.includes("school:itemApproved?majority:null"),'Do not render unpublished school mode');

// Crossed-out controls are removed from every school and year report.
assert.ok(!html.includes('id="essentialBtn"')&&!html.includes('id="allBtn"'),'No two-mode switch');
assert.ok(!src.includes('state.mode'),'Every category displays all of its questions');
assert.ok(src.includes('groupItems.forEach(item=>wrap.append(renderItem(item)))'),'Render every question in the selected category');
assert.ok(!src.includes("const groups=['전체 영역'"),'Remove the redundant all-category pill');
assert.ok(src.includes("state.category=state.category===g?'전체 영역':g"),'Tapping an active category resets to all questions');
assert.ok(!html.includes('선택지에 순서가 없어 가로 위치는 표시하지 않습니다.'),'No empty-axis explanation box');
assert.ok(src.includes("root.classList.add('question-visual--values-only')"),'Comparison values remain visible without an ordinal axis');
assert.ok(src.includes("displayQuestionLabel("),'Repeated grouped-question instruction must be shortened');
assert.ok(html.includes('question-visual--values-only .question-visual-values'),'Removed notices leave no excess gap');

// UI readability: move the actual question to the beginning of its own chart.
assert.ok(src.includes('chart.prepend(questionLine)'),'Question prompt must appear at the top of comparison card');
assert.ok(src.includes("if(!locked)questionLine.querySelector('.question-value')?.remove()"),'Remove duplicated missing/approved status from the question heading');
assert.ok(html.includes('.question-visual-value{display:flex;align-items:flex-start'),'Stack question values on narrow mobile screens');
assert.ok(html.includes('.benchmark-values{grid-template-columns:1fr}'),'Avoid overlaps between long official metric values on mobile');
assert.ok(src.includes("singleSchoolFacts.has(normalizedOverviewLabel(x.label))"),'Establishment/vice principals/meal place must show school-only values');
assert.ok(src.includes("const singleSchoolFacts=new Set(['설립구분','설립유형','교감수','급식장소'])"),'All requested single-school fields must be matched regardless of spacing');
assert.ok(!src.includes("title.textContent='전국 · '"),'Remove duplicate summary title from question comparison');
assert.ok(!src.includes('검수·공개 승인된 학교별 통계가 아직 없습니다.'),'Remove repetitive missing-approval text');
assert.ok(src.includes("Number(data?.n)>=5"),'Existing privacy safeguards must not be lowered by UI changes');

// Repetitive captions are not displayed, but year cards, publication states, and privacy rules stay intact.
assert.ok(!html.includes('class="participation-notice"'),'Remove crossed-out year introduction');
assert.ok(!html.includes('class="chart-disclaimer"'),'Remove crossed-out explanatory note');
assert.ok(src.includes('for(const year of [2023,2024,2025,2026])'),'Every historical year stays selectable');
assert.ok(src.includes("year===2025?'2025 조사 참여 · 공개 결과는 별도 승인'"),'Published and participation states stay distinct');
// One response is counted as participation, not released as one respondent's answer.
assert.ok(src.includes('state.participationYears=Array.isArray(r.participationYears)'),'Receive only vetted boolean participation years from the API');
assert.ok(src.includes("year===2025?'2025 조사 참여 · 공개 결과는 별도 승인'"),'Distinguish 2025 participants from 2023-24 historical records');
assert.ok(src.includes('state.participationYears=[]'),'Clear participation on school change');
const api=fs.readFileSync('supabase/functions/beagu-level-api/index.ts','utf8');
assert.ok(api.includes(".gte('respondents',1)"),'Participation should reflect even one approved response');
assert.ok(api.includes("eq('release_status','approved')"),'Participation flag must derive from approved source');
assert.ok(api.includes('participationYears=[...new Set'),'Return only participating years, not individual responses');
assert.ok(!api.includes('participationCount:')&&!api.includes('participationRespondents:'),'Never return a raw respondent count with participation flag');

// Public 2025 participation is a school-level yes/no flag, never answers or exact N.
const participantFile=JSON.parse(fs.readFileSync('data/public-2025-participation-v1.json','utf8'));
assert.equal(participantFile.year,2025);
assert.equal(participantFile.schoolIds.length,1458,'2025 approved participating schools should not be lost');
assert.equal(new Set(participantFile.schoolIds).size,1458,'No duplicate participating schools');
assert.ok(participantFile.schoolIds.every(id=>/^\d{7}$/.test(id)),'Only school IDs can appear in the participation index');
assert.ok(!('responses' in participantFile)&&!('counts' in participantFile)&&!('answers' in participantFile));
assert.ok(src.includes('state.publicParticipationByYear[String(year)]?.has(String(state.school?.school_id))'),'Public year card should show all historic school-year records');
const historicIndex=JSON.parse(fs.readFileSync('data/public-2023-2025-school-records-v2.json','utf8'));
assert.deepEqual(Object.keys(historicIndex.schoolIdsByYear),['2023','2024','2025']);
for(const [year,count] of [['2023',2807],['2024',3284],['2025',1458]]){
 const ids=historicIndex.schoolIdsByYear[year];
 assert.equal(ids.length,count,'Historic school-year presence count for '+year);
 assert.equal(new Set(ids).size,count,'No duplicated school IDs in '+year);
 assert.ok(ids.every(id=>/^\d{7}$/.test(id)),'Only school IDs are allowed');
}
assert.ok(!('answers' in historicIndex)&&!('counts' in historicIndex)&&!('responses' in historicIndex));
assert.deepEqual(historicIndex.schoolIdsByYear['2025'],participantFile.schoolIds);
assert.ok(src.includes('data/public-2023-2025-school-records-v2.json?v=20261118'),'Public school report should load all three verified historical-year indexes');
console.log('School report JS syntax, UI bindings and public/private separation: PASS');
