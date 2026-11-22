/* Verify the real Post-it Auth event handlers choose the current site origin.
 * Fully mocked Supabase Auth; no users, emails, DB calls or network requests.
 */
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const src=fs.readFileSync("js/postit-account-v1.js","utf8");
const html=fs.readFileSync("postit.html","utf8");
const challenge=fs.readFileSync("js/challenge-member-auth-v1.js","utf8");
assert.doesNotThrow(()=>new vm.Script(src));
assert.match(html,/js\/postit-account-v1\.js\?v=/);
assert.match(challenge,/emailRedirectTo:new URL\('challenge.html',location.href\).href/);

class FakeElement {
 constructor(id){
  this.id=id;this.value="";this.checked=false;this.hidden=false;this.disabled=false;
  this.textContent="";this.dataset={};this.listeners={};this.classList={add(){},remove(){}};
 }
 addEventListener(type,fn){this.listeners[type]=fn;}
 fire(type,event={}){const cb=this.listeners[type];assert(cb,"no "+type+" handler for "+this.id);return cb(event);}
}
const flows=[
 "https://baegu-index-v110-sandbox.onrender.com/postit.html",
 "https://baegu-index-v110-sandbox.onrender.com/postit.html?ref=test#signup",
 "https://an-independent.onrender.com/postit.html?from=challenge",
 "https://baeguindex.com/postit.html?ref=legacy"
];
async function flush(){for(let i=0;i<20;i++)await Promise.resolve();}
async function run(href){
 const elements=new Map();
 const $=id=>{if(!elements.has(id))elements.set(id,new FakeElement(id));return elements.get(id);};
 let lastSignup=null,lastOAuth=null,signupCount=0,signinCount=0;
 const client={auth:{
  async getSession(){return {data:{session:null},error:null};},
  async getUser(){return {data:{user:null},error:null};},
  async signUp(options){signupCount++;lastSignup=options;return {error:null};},
  async signInWithPassword(){signinCount++;return {error:null};},
  async signInWithOAuth(options){lastOAuth=options;return {error:null};},
  async signOut(){return {error:null};},
  onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}}
 }};
 const sandbox={
   supabaseClient:client,window:{supabaseClient:client,dispatchEvent() {},
      addEventListener(){}},document:{getElementById:$},
   location:{href},URL,console,
   sessionStorage:{getItem(){return null;}},
   localStorage:{getItem(){return null;}},
   fetch(){throw Error("Unexpected network request during account redirect test")},
   CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail}}
 };
 vm.runInNewContext(src,sandbox);
 await flush();
 $('postitAccountEmail').value="example@school.test";
 $('postitAccountPassword').value="example-password-123";
 $('postitAccountSignup').fire("click");
 await flush();
 const expected=new URL("postit.html",href).href;
 assert.equal(signupCount,1,href+" signup");
 assert.equal(lastSignup.email,"example@school.test");
 assert.equal(lastSignup.options.emailRedirectTo,expected,
   "Signup redirect must return to exactly the origin where it started");
 assert.equal(lastSignup.options.data.beagu_sms_opt_in,false);
 assert.equal(lastSignup.options.data.beagu_sms_phone,null);
 assert(!lastSignup.options.emailRedirectTo.includes("?"),
   "Marketing query params must not be carried into the verification link");
 $('postitAccountEmail').value="example@school.test";
 $('postitAccountPassword').value="example-password-123";
 $('postitSmsConsent').checked=true;
 $('postitSmsPhone').value="010-1234-5678";
 $('postitAccountSignup').fire("click");
 await flush();
 assert.equal(signupCount,2);
 assert.equal(lastSignup.options.emailRedirectTo,expected);
 assert.equal(lastSignup.options.data.beagu_sms_opt_in,true);
 assert.equal(lastSignup.options.data.beagu_sms_phone,"01012345678");
 $('postitAccountGoogle').fire("click");
 await flush();
 assert.equal(lastOAuth.provider,"google");
 assert.equal(lastOAuth.options.redirectTo,expected);
 $('postitAccountForm').fire("submit",{preventDefault(){}});
 await flush();
 assert.equal(signinCount,1,"existing password login is unchanged");
 console.log("PASS: "+new URL(href).hostname+
  " password signup and OAuth redirect to same-origin /postit.html, no external requests");
}
(async()=>{for(const href of flows)await run(href)})().catch(err=>{
 console.error(err);process.exitCode=1;
});
