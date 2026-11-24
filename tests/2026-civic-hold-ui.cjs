const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("js/beagu-2026-civic-admin-v1.js","utf8");
const edge=fs.readFileSync("supabase/functions/beagu-2026-civic/index.ts","utf8");
const sql=fs.readFileSync("supabase/2026-civic-publication-hold-v1.sql","utf8");
const read=p=>fs.readFileSync(p,"utf8");
for(const action of ["admin_hold_context","admin_hold","admin_resume"]){assert.ok(source.includes(action));assert.ok(edge.includes(action));}
assert.match(edge,/const a=await adminSession\(req\);if\(!a\)return send\(origin,403/);
assert.match(sql,/h\.updated_at>l\.approved_at/);
for(const p of ["class-diary-world-v1","class-diary-story-signals-v1","arcade-leaderboard","beagu-postit-api-v1"])assert.match(read("supabase/functions/"+p+"/index.ts"),/beagu_2026_level_(school_published|released_school_ids)/);
assert.match(read("admin.html"),/civic-admin-v1\.js\?v=20261124-trust1/);
class Node{
 constructor(tag){this.tag=tag;this.children=[];this.textContent="";this.value="PENDING";this.hidden=false;this.disabled=false;this.byId={};}
 append(...x){this.children.push(...x)} replaceChildren(...x){this.children=x}
 querySelector(sel){return this.byId[sel]??=new Node("div")}
 set innerHTML(s){this.html=s}
}
const host=new Node("host"), calls=[];
let held=false;let approved="APPROVED";const snapshot="a".repeat(64);const item={id:"00000000-0000-0000-0000-000000000003",school_id:"A000001",school_name:"Synthetic",kind:"REPORT",status:"REVIEWING",category:"PRIVACY",detail:"Synthetic report"};
const window={prompt:()=>"Synthetic documented reason",confirm:()=>true};
const ctx={window,document:{getElementById:()=>host,createElement:t=>new Node(t)},supabaseClient:{auth:{getSession:async()=>({data:{session:{access_token:"fixture"}}})}},fetch:async(_url,opts)=>{
 const b=JSON.parse(opts.body);calls.push(b);assert.equal(opts.headers.Authorization,"Bearer fixture");
 let data={};
 if(b.action==="admin_list")data={items:[item]};
 else if(b.action==="admin_hold_context")data={held,school_approval:approved,hold_feedback:item.id,snapshot_sha:snapshot,history:[{action:"PUBLICATION_HOLD",reason:"Synthetic reason",created_at:"2026"}]};
 else if(b.action==="admin_hold"){assert.equal(b.snapshot_sha,snapshot);held=true;approved="WITHHELD";}
 else if(b.action==="admin_resume"){assert.equal(b.snapshot_sha,snapshot);assert.equal(approved,"APPROVED");held=false;}
 else throw Error("unexpected request");
 return {ok:true,json:async()=>data};
}};
const find=(node,label)=>node.textContent===label?node:node.children.map(x=>find(x,label)).find(Boolean);
const flush=()=>new Promise(r=>setImmediate(r));
(async()=>{
 vm.runInNewContext(source,ctx);
 window.BeaguCivicAdmin.mount("viewer");await flush();assert.equal(calls.length,0);
 window.BeaguCivicAdmin.mount("owner");await flush();const panel=host.children[0],root=panel.querySelector("#civicAdminList");
 await find(root,"공개 보류·재검증 이력").onclick();
 await find(root,"2026 자료 공개 보류").onclick();assert.equal(held,true);
 await find(root,"공개 보류·재검증 이력").onclick();assert.equal(find(root,"재검증 후 보류 해제"),undefined);
 approved="APPROVED";await find(root,"공개 보류·재검증 이력").onclick();
 await find(root,"재검증 후 보류 해제").onclick();assert.equal(held,false);
 window.BeaguCivicAdmin.reset();assert.equal(panel.hidden,true);assert.equal(root.children.length,0);
 console.log("PASS civic admin UI: role isolation, exact snapshot, hold and reviewed resume, audit controls");
})().catch(e=>{console.error(e);process.exitCode=1});
