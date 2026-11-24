"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=path.resolve(__dirname,"../../.."),dest=path.resolve(process.argv[2]||"");
if(!process.argv[2]||fs.existsSync(dest)||dest===root||root.startsWith(dest+path.sep))throw Error("choose a new build directory");
fs.mkdirSync(dest,{recursive:true});
function copy(src,target=src){const out=path.join(dest,target);fs.mkdirSync(path.dirname(out),{recursive:true});fs.copyFileSync(path.join(root,src),out);}
const html=fs.readFileSync(path.join(root,"teacher-run-4-preview.html"),"utf8");
copy("teacher-run-4-preview.html","game/teacher-run-4-preview.html");
for(const m of html.matchAll(/(?:src|href)="((?:js|styles)\/[a-zA-Z0-9_.-]+)\?[^"]*"|(?:src|href)="((?:js|styles)\/[a-zA-Z0-9_.-]+)"/g)){
 const file=m[1]||m[2];if(file==="js/supabase-config.js")continue;copy(file,"game/"+file);
}
for(const name of ["replay-engine.cjs","replay-protocol.cjs","replay-worker.cjs"])copy("docs/run4-ranking-preflight/"+name,name);
for(const name of ["Dockerfile","package.json","package-lock.json","factory.cjs","server.cjs","smoke.cjs"])copy("docs/run4-ranking-preflight/cloud-run/"+name,name);
const hashes={};function scan(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())scan(p);else hashes[path.relative(dest,p)]=crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");}}
scan(dest);fs.writeFileSync(path.join(dest,"artifact.json"),JSON.stringify({version:"4.0",files:hashes},null,2));
console.log("Prepared allowlisted context; no real Supabase config, repository history, database or keys.");
