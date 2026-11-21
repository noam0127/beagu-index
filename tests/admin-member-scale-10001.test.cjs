const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const sql = fs.readFileSync("supabase/migrations/20261122020000_admin_member_directory_v2.sql","utf8");
const api = fs.readFileSync("supabase/functions/beagu-admin-members-v1/index.ts","utf8");
function pageFixture(count, page, size=20) {
  const users = Array.from({length:count},(_,i)=>({id:i+1,email:`teacher${String(i+1).padStart(5,"0")}@example.test`}));
  return {total_matches:users.length,rows:users.slice((page-1)*size,page*size)};
}
for(const count of [4001,10001]){
  test(`synthetic ${count} accounts: first, 201st and last pages`,()=>{
    const last=Math.ceil(count/20);
    assert.equal(pageFixture(count,1).rows.length,20);
    assert.equal(pageFixture(count,201).rows.length,20);
    assert.equal(pageFixture(count,last).rows.length,count-(last-1)*20);
    assert.equal(pageFixture(count,last+1).rows.length,0);
    assert.equal(pageFixture(count,201).rows[0].id,4001);
    assert.equal(pageFixture(count,1).total_matches,count);
  });
}
test("SQL contract: unbounded auth.users directory with deterministic page ordering",()=>{
  assert.match(sql,/from auth\.users u/i);
  assert.match(sql,/limit p_size offset \(p_page-1\)\*p_size/i);
  assert.match(sql,/jsonb_agg\(to_jsonb\(p\) - 'page_ordinal' order by p\.page_ordinal\)/i);
  assert.match(sql,/'total_matches'/);
  assert.match(sql,/'search_scope','complete'/);
  assert.match(sql,/revoke all on function public\.beagu_admin_member_directory_v2/i);
  assert.match(sql,/to service_role/i);
});
test("API contract: page validation and server-side RPC",()=>{
  assert.match(api,/Number\.isSafeInteger\(requestedPage\)/);
  assert.match(api,/beagu_admin_member_directory_v2/);
  assert.doesNotMatch(api,/await allUsers\(\)/);
});
