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
const embedded=html.match(/<script type="application\\/json" id="embeddedCatalog">([\\s\\S]*?)<\\/script>/);
assert.ok(embedded,'Questionnaire metadata is required');
const catalog=JSON.parse(embedded[1]);
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
console.log('School report JS syntax, UI bindings and public/private separation: PASS');
