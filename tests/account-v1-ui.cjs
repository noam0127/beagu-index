const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const read=p=>fs.readFileSync(p,"utf8");
const src=read("js/beagu-account-v1.js"),html=read("account.html");
for(const id of ["accountSignup","accountLogin","accountFormal","accountGoogle","accountFormalLogin","accountLogout","accountNickname"])assert.ok(html.includes('id="'+id+'"'));
assert.match(read("index.html"),/href="account\.html"/);
assert.match(read("js/beagu-participation-auth-v2.js"),/href="account\.html"/);
assert.match(read("supabase/functions/beagu-level-api/index.ts"),/beagu_account_level_session_allowed_v1/);
const map=new Map(),store=new Map(),local=new Map([["beagu-referral-device-secret-v1","a".repeat(64)]]);
const node=id=>{if(!map.has(id))map.set(id,{hidden:false,textContent:"",elements:{password:{value:"test"},account_id:{value:""}},disabled:false});return map.get(id)};
const storage=m=>({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)});
const calls=[],account="00000000-0000-0000-0000-000000000001",nickname="Il|ǀ∣❘I",token="b".repeat(64),nextToken="c".repeat(64);
let formal=false;
const client={auth:{getSession:async()=>({data:{session:{access_token:"fixture-token"}}}),signInWithOAuth:async()=>({}),signOut:async()=>({})}};
const context={document:{getElementById:node,querySelectorAll:()=>[]},window:{supabaseClient:client},sessionStorage:storage(store),localStorage:storage(local),location:{href:"https://baeguindex.com/account.html"},URL,FormData:class{constructor(f){this.data=f.data}get(k){return this.data[k]}},fetch:async(_url,opts)=>{
 const b=JSON.parse(opts.body);calls.push({body:b,headers:opts.headers});
 let data;
 if(b.action==="signup")data={account_id:account};
 else if(b.action==="password_login")data={account_id:account,nickname,token,level:2};
 else if(b.action==="formal_link"){assert.equal(opts.headers["X-Beagu-Session"],token);assert.equal(opts.headers.Authorization,"Bearer fixture-token");formal=true;data={formal:true,account_id:account};}
 else if(b.action==="formal_login"){assert.equal(formal,true);data={formal:true,account_id:account,nickname,token:nextToken,level:2};}
 else if(b.action==="logout"){assert.equal(opts.headers["X-Beagu-Session"],nextToken);data={ok:true};}
 else throw Error("unexpected call "+b.action);
 return {ok:true,json:async()=>data};
}};
const settle=()=>new Promise(r=>setImmediate(r));
const submit=async(id,data)=>{const f=node(id);f.data=data;f.onsubmit({preventDefault(){},currentTarget:f});await settle();await settle();};
(async()=>{
 vm.runInNewContext(src,context);
 await submit("accountSignup",{code:"SYNTHETIC-CODE",password:"test-password-123"});
 assert.equal(node("accountLogin").elements.account_id.value,account);
 assert.equal(node("accountSignup").elements.password.value,"");
 await submit("accountLogin",{account_id:account,password:"test-password-123"});
 assert.equal(store.get("beagu-level-session-v1"),token);
 assert.ok(node("accountNickname").textContent.includes(nickname));
 await submit("accountFormal",{code:"SYNTHETIC-CODE"});
 assert.equal(store.get("beagu-level-session-v1"),nextToken);
 assert.ok(node("accountNickname").textContent.includes(nickname));
 node("accountLogout").onclick();await settle();await settle();
 assert.equal(store.has("beagu-level-session-v1"),false);assert.equal(store.has("beagu-account-session-v1"),false);
 assert.equal(node("accountNickname").hidden,true);
 assert.equal(calls[0].body.deviceSecret,"a".repeat(64));
 console.log("PASS account UI: signup, password clearing, login, original-device formal conversion, nickname and logout");
})().catch(e=>{console.error(e);process.exitCode=1});
