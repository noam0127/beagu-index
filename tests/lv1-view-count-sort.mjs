import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const read=path=>readFileSync(path,'utf8');
const lv1=read('search-lv1.html');
const lv0=read('search.html');
const script=read('js/level-search.js');
const server=read('supabase/functions/beagu-level-api/index.ts');
const sql=read('supabase/migrations/20261120_lv1_school_sort_view_count.sql');
const counts=read('js/school-view-counts-v1.js');

assert.doesNotThrow(()=>new Script(script));
assert.match(lv1,/<option value="view_count"[^>]*>조회수<\/option>/);
assert.doesNotMatch(lv0,/<option value="view_count"/,'Lv.0 cannot sort by views');
assert.match(lv1,/js\/level-search\.js\?v=20261120-views-sort1/);
assert.match(lv1,/js\/school-view-counts-v1\.js/);
assert.match(script,/const SORTS=new Set\(\[[^\]]*'view_count'\]\)/);
assert.match(script,/ranked_schools'.*\{searchText:q,region,office,sort,direction,page\}/);
assert.match(server,/if\(Number\(session\.access_level\)<1\)return send\(\{error:'ACCESS_DENIED'\},403,origin\)/);
assert.match(server,/const sorts=new Set\(\[[^\]]*'view_count'\]\)/);
assert.match(server,/male_teacher_ratio,view_count'\,\{count:'exact'\}/);
assert.ok(server.indexOf('let sorted=query.order(sort,')<server.indexOf('.range(from,from+19)'),
  'SQL order is applied before pagination');
assert.match(sql,/WITH \(security_invoker = true\)/);
assert.match(sql,/COALESCE\(svc\.views, 0::bigint\) AS view_count/);
assert.match(sql,/LEFT JOIN (?:public\.)?beagu_school_view_totals svc/);
assert.match(sql,/REVOKE ALL ON public\.beagu_lv1_school_sort_index FROM PUBLIC, anon, authenticated/);
assert.match(sql,/GRANT SELECT ON public\.beagu_lv1_school_sort_index TO service_role/);
assert.match(counts,/beagu_record_school_view/);

// Execute the existing Lv.1 dropdown and direction handlers with stub controls.
const start=script.indexOf("  $('regionSort').addEventListener('change'");
const end=script.indexOf("  $('searchInput').addEventListener('input'",start);
assert.ok(start>0&&end>start,'Lv.1 sort handlers must be present');
const callbacks={};
const select={value:'school_name',addEventListener(type,fn){callbacks['select:'+type]=fn;}};
const direction={textContent:'↑',addEventListener(type,fn){callbacks['arrow:'+type]=fn;}};
const $=id=>id==='regionSort'?select:id==='regionSortDirection'?direction:null;
const queries=[];
let readDirection=()=>undefined;
const updateSortDirection=()=>{direction.textContent=readDirection()==='desc'?'↓':'↑';};
const init=new Function('SORTS','$','search','updateSortDirection',
  "let sortDirection='asc';\n"+script.slice(start,end)+"\nreturn ()=>sortDirection;");
readDirection=init(new Set(['school_name','address','view_count']),$,async reset=>queries.push(reset),updateSortDirection);
select.value='view_count';
callbacks['select:change']();
assert.equal(readDirection(),'desc','View count defaults to most viewed first');
assert.equal(direction.textContent,'↓');
assert.deepEqual(queries,[true]);
callbacks['arrow:click']();
assert.equal(readDirection(),'asc','Ascending is still available');
assert.equal(direction.textContent,'↑');
assert.deepEqual(queries,[true,true]);
select.value='school_name';
callbacks['select:change']();
assert.equal(readDirection(),'asc','Other sorts preserve current direction');
console.log('PASS: Level 1 view sorting, descending default, toggle, access gate and protected totals');
