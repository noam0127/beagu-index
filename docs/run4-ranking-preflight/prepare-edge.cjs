"use strict";
// Generate a review-only ESM bundle in a new directory; no deployment.
const fs=require("node:fs"),path=require("node:path");
const dest=path.resolve(process.argv[2]||"");
if(!process.argv[2]||fs.existsSync(dest))throw Error("new directory required");
fs.mkdirSync(dest,{recursive:true});
const read=name=>fs.readFileSync(path.join(__dirname,name),"utf8"),write=(name,s)=>fs.writeFileSync(path.join(dest,name),s);
function replace(s,a,b){if(s.split(a).length!==2)throw Error("source shape changed: "+a);return s.replace(a,b);}
write("replay-protocol.mjs",replace(read("replay-protocol.cjs"),"module.exports={validateReplay,MAX_TICKS,TIERS};","export {validateReplay,MAX_TICKS,TIERS};"));
let boundary=replace(read("server-boundary.cjs"),'require("./replay-protocol.cjs").validateReplay(replay)','validateReplay(replay)');
boundary=replace(boundary,"module.exports={createBoundary};","export {createBoundary};");
write("server-boundary.mjs",'import {validateReplay} from "./replay-protocol.mjs";\n'+boundary);
write("record-policy.mjs",fs.readFileSync(path.join(__dirname,"../../js/teacher-run-4-records-v1.js"),"utf8")+"\nexport const policy=globalThis.BeaguRun4Records;\n");
for(const p of ["gateway.mjs","supabase-bridge.mjs","edge-entry.mjs"])write(p,read(p));
console.log("Prepared Edge modules only; no deployed function or secret.");
