'use strict';
/* Static, read-only consistency checks for school-to-story planning metadata. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(base,name),'utf8'));
const matrix = read('data/CLASS_DIARY_EVENT_VARIABLE_MATRIX.json').matrix;
const questions = [
  ...read('data/BEAGU_2023_2025_VARIABLE_DICTIONARY.json').entries,
  ...read('data/BEAGU_2026_VARIABLE_DICTIONARY.json').entries
];
assert.equal(questions.length,128,'question entries');
assert.equal(new Set(questions.map(x=>x.id)).size,128,'unique year-qualified question IDs');
assert.equal(matrix.length,20,'hand-reviewed story mappings');
const questionIds = new Set(questions.map(x=>x.id));
const world = require('../js/class-diary-world-v1.js');
const allowedFacts = new Set([...world.NUMERIC_KEYS,...world.CATEGORY_KEYS]);
const ids = new Set();
for(const item of matrix){
  assert(!ids.has(item.id),'duplicate matrix ID '+item.id);
  ids.add(item.id);
  assert(item.title && item.guardrail,'missing title or ethical guardrail');
  assert(item.activation==='FICTION_DEFAULT; VERIFIED_CONTEXT_OPTIONAL');
  assert(item.evidencePolicy.includes('APPROVED_ONLY'));
  assert(Array.isArray(item.episodes) && item.episodes.length);
  for(const episode of item.episodes)assert(Number.isInteger(episode)&&episode>=1&&episode<=36,'episode range');
  for(const id of item.surveyQuestionIds)assert(questionIds.has(id),'unknown question '+id);
  for(const key of [...item.allFacts,...item.anyFacts])assert(allowedFacts.has(key),'unknown approved fact key '+key);
}
console.log('PASS: 128 source questions, 20 story mappings, valid IDs, keys and ethical safeguards');
