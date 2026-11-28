'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
for(const file of ['js/visit-stats.js','js/beagu-presence-games-v1.js','js/beagu-admin-access-v1.js']){
  new vm.Script(read(file),{filename:file});
}
const sql=read('supabase/migrations/20261120_admin_hourly_live_presence.sql');
const edge=read('supabase/functions/beagu-admin-dashboard-v1/index.ts');
const html=read('admin.html');
assert.match(sql,/create table if not exists beagu_private\.beagu_live_presence_v1/);
assert.match(sql,/enable row level security/);
assert.match(sql,/revoke all on beagu_private\.beagu_live_presence_v1 from public, anon, authenticated/);
assert.match(sql,/grant execute on function public\.beagu_presence_ping_v1\(uuid,text\) to anon,authenticated,service_role/);
assert.match(sql,/revoke all on function public\.beagu_admin_live_traffic_v1\(text\) from public,anon,authenticated/);
assert.match(sql,/last_seen_at >= v_now - interval '5 minutes'/);
assert.match(sql,/generate_series\(0,23\)/);
assert.match(edge,/if\(live!==true\)return send/);
assert.match(edge,/if\(input\.action==="live_traffic"\)/);
assert.match(edge,/beagu_admin_live_traffic_v1/);
assert.match(html,/id="adminOnlineCount"/);
assert.match(html,/id="adminHourlyChart"/);
assert.match(read('js/beagu-admin-access-v1.js'),/30000/);
assert.match(read('js/visit-stats.js'),/presencePing/);
for(const page of ['index.html','search.html','search-lv1.html','statistics.html','challenge.html','result.html','school-report.html']){
  assert.match(read(page),/js\/visit-stats\.js\?v=112061-stability/);
}
for(const page of ['teacher-run.html','teacher-volleyball.html']){
  assert.match(read(page),/js\/beagu-presence-games-v1\.js\?v=20261120-gateway2/);
}
console.log('Admin hourly/live traffic static validation passed');
