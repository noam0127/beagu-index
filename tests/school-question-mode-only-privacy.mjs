import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
const read = path => readFileSync(path, 'utf8');
const edge = read('supabase/functions/beagu-level-api/index.ts');
const lv1 = read('js/level-search.js');
const report = read('school-report.html');
const compare = read('js/statistics-compare.js');
const sql = read('supabase/migrations/20261118_verified_2025_checkbox_modes.sql');

assert.match(edge, /const level=Number\(session\.access_level\);\s*if\(level<1\)/);
assert.match(edge, /\.from\('beagu_school_question_aggregates_v2'\)/);
assert.match(edge, /\.from\('beagu_school_question_modes_supplement_v1'\)/);
assert.match(edge, /SOURCE_VERIFIED_UNIQUE_MODE/);
assert.match(edge, /schoolQuestionModes=\[\.\.\.modeIndex\.values\(\)\]/);
assert.match(edge, /return send\(\{school_id:id,level,rows,schoolQuestionModes,participationYears\}/);
assert.doesNotMatch(edge, /schoolDistributions|roundedDistribution:/,
  'No school percentages or distribution arrays may leave the API');
assert.doesNotMatch(edge, /\.select\('[^']*source_rows/,
  'Raw source row counts must remain private');
assert.match(lv1, /data\.schoolQuestionModes/);
assert.match(lv1, /vetted\.get\(id\)\|\|null/);
assert.doesNotMatch(lv1, /beagu-question-distribution|roundedDistribution/,
  'Lv.1 search must show only one most-selected option');
assert.match(report, /r\.schoolQuestionModes/);
assert.doesNotMatch(report, /roundedDistribution|className='distribution'/,
  'The standalone report must not render any school distribution');
assert.match(compare, /data\?\.schoolQuestionModes/);
assert.doesNotMatch(compare, /schoolDistributions/);
assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
assert.match(sql, /REVOKE ALL ON .* FROM PUBLIC, anon, authenticated/);
assert.match(sql, /valid_rows integer NOT NULL CHECK \(valid_rows >= 1\)/);
assert.doesNotThrow(() => new Script(lv1));
console.log('PASS: school modes only, verified checkbox supplement, no distribution/percentages in Lv1 API or UI.');
