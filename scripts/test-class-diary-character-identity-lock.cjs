'use strict';
/**
 * Current official photo identity is the exact asset in main, not a generated face.
 * Review-only guard: never replaces runtime assets or pretends to approve a new person.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/class-diary-character-identity-lock-v1.json'),'utf8'));
assert.equal(manifest.schema,'class-diary-character-identity-lock/v1');
assert.equal(manifest.productionAssetChangesAllowed,false);
assert.equal(manifest.qaPolicy.releaseStatus,'blocked');
assert.equal(manifest.canonical.length,4);
const known={jiyoon:'female-jiyoon-thigh-v4.webp',hyunwoo:'hyunwoo-poses-v2.webp',dogyeom:'dogyeom-poses-v2.webp',taeo:'taeo-poses-v2.webp'};
const seen=new Set();
for(const item of manifest.canonical){
 assert(!seen.has(item.id),'duplicate canonical identity '+item.id);
 seen.add(item.id);
 assert(item.file.endsWith(known[item.id]),'unexpected original source '+item.file);
 assert(item.approvedSource && !item.independentGeneratedImagesApproved);
 const image=fs.readFileSync(path.join(root,item.file));
 const prefix=Buffer.concat([Buffer.from('blob '+image.length+' '),Buffer.from([0])]); // Git blob header ends with NUL.
 const sha=crypto.createHash('sha1').update(prefix).update(image).digest('hex');
 assert.equal(sha,item.gitBlobSha,'canonical source changed; require manual identity review: '+item.id);
}
const male=fs.readFileSync(path.join(root,'js/class-diary-male-natural-v2.js'),'utf8');
const female=fs.readFileSync(path.join(root,'js/class-diary-female-hq-v1.js'),'utf8');
for(const id of ['hyunwoo','dogyeom','taeo'])assert(male.includes(known[id]));
assert(female.includes(known.jiyoon));
for(const asset of manifest.reviewArtifacts){
 assert.notEqual(asset.status,'approved');
 assert.equal(asset.notInRepo,true);
}
console.log('PASS identity-lock: 4 original faces unchanged; generated drafts are unapproved and not connected');
