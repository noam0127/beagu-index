import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=readFileSync(new URL("../js/locker-school-links-v11125.js",import.meta.url),"utf8");
let token="a".repeat(64),level="2",calls=[],pending=null;
class Elem{
 constructor(){this.dataset={};this.children=[];this.hidden=false;this.isConnected=true;}
 append(el){this.children.push(el);}
 querySelector(sel){return this.children.find(el=>sel==="[data-locker-read]"&&"lockerRead" in el.dataset);}
}
const hosts=[];
const doc={createElement:()=>new Elem(),getElementById:()=>({dataset:{level}}),querySelectorAll:()=>hosts,addEventListener(){}};
const win={addEventListener(){}};
const get=async(url,opts)=>{calls.push({url,opts});if(pending)await pending;return {ok:true,json:async()=>({counts:{A123456:3}})}};
const {create,href,refresh}=new Function("document","window","sessionStorage","fetch","URL",src.replace("refresh:refreshAll","refresh")+"\nreturn window.BeaguLockerSchoolLinks;")(doc,win,{getItem:()=>token},get,URL);
assert.equal(href("A123456",true),"postit.html?school_id=A123456&compose=1");
assert.equal(href("../bad"),"postit.html");
const a=create("A123456"),b=create("B123456"),d=create("A123456",true);
hosts.push(a,b,d);
assert.equal(a.hidden,true);assert.equal(d.children[1].textContent,"라커룸에서 이 학교 이야기하기");
await refresh();
assert.equal(calls.length,1);assert.match(calls[0].url,/A123456%2CB123456/);
assert.equal(a.hidden,false);assert.equal(b.hidden,true);assert.equal(a.children[0].textContent,"학교 이야기 3개");
assert.equal(d.children[0].textContent,"라커룸에서 학교 이야기 모아보기 3개");
level="1";await refresh();assert.equal(a.hidden,true);assert.equal(d.children[0].hidden,true);assert.equal(d.children[1].hidden,false);
level="2";let unblock;pending=new Promise(r=>unblock=r);const request=refresh();token="b".repeat(64);unblock();await request;assert.equal(a.hidden,true);
console.log("school story links: batch, permission, exact navigation and stale response checks passed");
