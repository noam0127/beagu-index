import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
const read = path => readFileSync(path, 'utf8');
const edge = read('supabase/functions/beagu-level-api/index.ts');
const lv1 = read('js/level-search.js');
const report = read('school-report.html');
const compare = read('js/statistics-compare.js');
const sql = read('supabase/migrations/20261118_verified_2025_checkbox_modes.sql');

assert.match(edge, /const verifiedLevel=Number\(session\.access_level\);\s*const level=body\.viewLevel===undefined\?verifiedLevel:body\.viewLevel;\s*if\(typeof level!=='number'\|\|!\[1,2\]\.includes\(level\)\|\|level>verifiedLevel\)return send\(\{error:'ACCESS_DENIED'\},403,origin\)/);
assert.match(edge, /\.from\('beagu_school_question_aggregates_v2'\)/);
assert.match(edge, /\.from\('beagu_school_question_modes_supplement_v1'\)/);
assert.match(edge, /SOURCE_VERIFIED_UNIQUE_MODE/);
assert.match(edge, /schoolQuestionModes=\[\.\.\.modeIndex\.values\(\)\]/);
assert.match(edge, /return send\(\{school_id:id,level,rows,schoolQuestionModes,schoolQuestionSelections,schoolQuestionResults2026,participationYears,edited2026:edited\.data\.active===true,editedPercentile:finalRow\?\.percentile\?\?null\}/);
assert.doesNotMatch(edge, /schoolDistributions|roundedDistribution:/,
  'No school percentages or distribution arrays may leave the API');
assert.doesNotMatch(edge, /\.select\('[^']*source_rows/,
  'Raw source row counts must remain private');
assert.match(lv1, /data\.schoolQuestionModes/);
assert.match(lv1, /data\.schoolQuestionSelections/);
assert.match(edge, /beagu_school_checkbox_choices_v1/);
assert.match(edge, /SOURCE_VERIFIED_MULTI_SELECTION/);
assert.match(edge, /checkboxAllowed\[questionId\]/);
assert.match(lv1, /vetted\.get\(id\)\|\|null/);
assert.doesNotMatch(lv1, /beagu-question-distribution|roundedDistribution/,
  'Lv.1 search must not expose choice distributions or percentages');
assert.match(report, /r\.schoolQuestionModes/);
assert.doesNotMatch(report, /roundedDistribution|className='distribution'/,
  'The standalone report must not render any school distribution');
assert.match(compare, /data\?\.schoolQuestionModes/);
assert.doesNotMatch(compare, /schoolDistributions/);
assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
assert.match(sql, /REVOKE ALL ON .* FROM PUBLIC, anon, authenticated/);
assert.match(sql, /valid_rows integer NOT NULL CHECK \(valid_rows >= 1\)/);
const guard = read('supabase/migrations/20261118_checkbox_mode_parent_count_guard.sql');
assert.match(guard, /NEW\.valid_rows > parent_rows/);
assert.match(guard, /FOREIGN KEY \(school_id,survey_year\)/);
assert.match(compare, /Array\.isArray\(data\?\.schoolQuestionModes\)\?data\.schoolQuestionModes:\[\]/,
  'The school comparison must iterate over the new mode-only array');
assert.doesNotThrow(() => new Script(lv1));
console.log('PASS: verified school-level mode and checkbox labels only; no raw answers, response counts or distributions.');
