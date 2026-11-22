#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict");
const game=fs.readFileSync(path.resolve(__dirname,"../games/nangam-schoolband-v08/index.html"),"utf8");
const begin=game.indexOf("const SCHOOL_TIER_THRESHOLDS=");
const end=game.indexOf("function showSchool(){",begin);
assert(begin>=0&&end>begin,"school safety functions exist");
const code=game.slice(begin,end)+";globalThis.__school19={tierFromApprovedPercentile,normalizePublicSchool,schoolIdentityText};";
const ctx=vm.createContext({TIERS:["easy","normal","hard","very_hard","extreme"],Date});
new vm.Script(code).runInContext(ctx);const {tierFromApprovedPercentile:t,normalizePublicSchool:n,schoolIdentityText:label}=ctx.__school19;
let total=0;function check(run){run();total++;}
for(const [value,expected] of [[0,"easy"],[19.999,"easy"],[20,"normal"],[39.999,"normal"],[40,"hard"],[59.999,"hard"],[60,"very_hard"],[79.999,"very_hard"],[80,"extreme"],[100,"extreme"],[-1,null],[101,null],[null,null],["80",null],[NaN,null]])check(()=>assert.equal(t(value),expected));
const row={school_id:"S00001",school_name:"같은이름초",region:"부산",district:"연제",school_code:"A12",eligible:true,difficulty:"hard",source_year:2026};
check(()=>assert.equal(n(row,row.school_id).difficulty,"hard"));
check(()=>assert.equal(n({...row,public_approved:false},row.school_id).publication_state,"unapproved"));
check(()=>assert.equal(n({...row,publication_status:"pending"},row.school_id).eligible,false));
check(()=>assert.equal(n({...row,eligible:false},row.school_id).difficulty,null));
check(()=>assert.equal(n({...row,source_year:null},row.school_id).difficulty,null));
check(()=>assert.equal(n({...row,source_year:2026,public_approved:true,percentile:20},row.school_id).difficulty,"normal"));
check(()=>assert.equal(n({...row,public_approved:true,percentile:80},row.school_id).difficulty,"extreme"));
check(()=>assert.equal(n({...row,public_approved:true,percentile:-1},row.school_id).difficulty,"hard"));
check(()=>assert.equal(n({...row,difficulty:"invalid"},row.school_id).difficulty,null));
check(()=>assert.throws(()=>n(row,"OTHER"),/school_identity_mismatch/));
check(()=>assert.throws(()=>n({...row,school_id:""},""),/school_identity_mismatch/));
check(()=>assert.match(label(row),/학교코드 A12 · ID S00001/));
check(()=>assert(game.includes("normalizePublicSchool(d.school,s.school_id)")));
check(()=>assert(game.includes("schoolIdentityText({school_id:String(s.school_id)")));
console.log("PASS schoolband stage019:",total,"isolated boundary, permission, ID, unlisted and UI wiring assertions");
