#!/usr/bin/env node
"use strict";
// Stage 022: code/data-only checks. NO rights outreach, paid APIs, listening or audio-quality judgement.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const ROOT=path.resolve(__dirname,".."),charts=path.join(ROOT,"games/nangam-schoolband-v08/charts");
const trust=JSON.parse(fs.readFileSync(path.join(charts,"song-intake-rights.v1.json"),"utf8"));
const POL=require("./schoolband-rights-policy-v1.cjs"),I=require("./schoolband-stage022-intake.cjs"),
 ARR=require("./schoolband-rock-arranger-v1.cjs"),MIDI=require("./schoolband-music-events-v1.cjs");
const GAME=fs.readFileSync(path.join(ROOT,"games/nangam-schoolband-v08/index.html"),"utf8");
const clone=x=>JSON.parse(JSON.stringify(x));
let checked=0;
function good(fn,label){fn();checked++;}
function bad(fn,code){assert.throws(fn,e=>!!e&&e.code===code,"expected "+code);checked++;}
const today="2026-11-23";
good(()=>assert.equal(trust.public_release_enabled,false),"publication disabled");
good(()=>assert.equal(trust.allow_external_permission_requests,false),"outreach disabled");
good(()=>assert.equal(trust.records.length,2),"two original sources only");
good(()=>assert.equal(GAME.includes("const REGISTERED_ANTHEMS=Object.freeze({});"),true),"no public school anthem");
const record=trust.records[0],buffer=I.readTrustedSource(record.source_path);
const sig=I.gitBlobSha1(buffer);
good(()=>assert.equal(sig,record.source_git_blob_sha1),"file digest bound to trusted manifest");
const req={song_id:record.song_id,school_id:null,source_kind:record.source_kind,
 source_path:record.source_path,source_git_blob_sha1:sig,public_release:false};
const allow=(t=trust,r=req,date=today)=>POL.authorizePrivateIntake(t,r,date);
good(()=>assert.equal(allow().route,"private_conversion_candidate"),"original private intake allowed");
good(()=>assert.equal(allow().publication_allowed,false),"public release never authorized");
good(()=>assert.equal(I.createPrivatePlan(record.song_id).generated,false),"intake accepts source in memory");
good(()=>assert.equal(I.createPrivatePlan(trust.records[1].song_id).allowed,true),"second original intake");
good(()=>assert.equal(I.validateSourceFormat(buffer,"events_json",record.source_path),true),"JSON format sniffing");
bad(()=>allow(trust,{...req,song_id:"school-unknown-123"}),"untrusted_source");
bad(()=>allow(trust,{...req,source_git_blob_sha1:"0".repeat(40)}),"source_digest_mismatch");
bad(()=>allow(trust,{...req,source_path:"games/nangam-schoolband-v08/charts/other.json"}),"source_path_mismatch");
bad(()=>allow(trust,{...req,school_id:"12345678"}),"school_identity_mismatch");
bad(()=>allow(trust,{...req,public_release:true}),"publication_not_allowed");
bad(()=>allow({...trust,records:[...trust.records,clone(record)]}),"untrusted_source");
bad(()=>allow({...trust,public_release_enabled:true}),"invalid_trust_registry");
function altered(setup){const x=clone(trust);setup(x.records[0]);return x;}
bad(()=>allow(altered(x=>x.review_state="pending")),"not_previously_approved");
bad(()=>allow(altered(x=>x.revoked_at="2026-11-20")),"approval_revoked");
bad(()=>allow(altered(x=>x.valid_until="2026-11-22")),"approval_expired");
bad(()=>allow(altered(x=>x.valid_from="2026-11-24")),"not_yet_valid");
bad(()=>allow(altered(x=>x.scopes=["internal_playtest"])),"conversion_scope_missing");
bad(()=>allow(altered(x=>x.components.composition="not_used")),"composition_required");
bad(()=>allow(altered(x=>x.components.sound_recording="uncleared")),"component_uncleared_sound_recording");
bad(()=>allow(altered(x=>x.components.composition="precleared")),"nonoriginal_internal_claim");
bad(()=>allow(altered(x=>x.song_id="unregistered-fake"),{...req,song_id:"unregistered-fake"}),"nonoriginal_internal_claim");
bad(()=>allow(altered(x=>x.source_path="../outside.json")),"source_path_mismatch");
bad(()=>allow(trust,req,"2026-02-30"),"invalid_review_date");
const pre={...clone(record),song_id:"school-precleared-test",school_id:"S000001",
 source_kind:"musicxml",source_path:"games/nangam-schoolband-v08/charts/test.musicxml",
 source_git_blob_sha1:"a".repeat(40),review_state:"approved_precleared",
 evidence_ref:"existing:test-only-synthetic-01",valid_from:"2026-01-01",valid_until:"2027-01-01",
 components:{composition:"precleared",lyrics:"not_used",arrangement:"precleared",sound_recording:"not_used"}};
const synthetic={...trust,records:[pre]};
const received={song_id:pre.song_id,school_id:pre.school_id,source_kind:pre.source_kind,
 source_path:pre.source_path,source_git_blob_sha1:pre.source_git_blob_sha1,public_release:false};
good(()=>assert.equal(allow(synthetic,received).route,"quarantine_for_format_parser"),"synthetic existing clearance only quarantined");
bad(()=>allow(synthetic,{...received,school_id:"S000002"}),"school_identity_mismatch");
bad(()=>allow({...synthetic,records:[{...pre,evidence_ref:"self-declared"}]},received),"existing_clearance_evidence_required");
bad(()=>allow({...synthetic,records:[{...pre,valid_until:null}]},received),"existing_clearance_evidence_required");
bad(()=>allow({...synthetic,records:[{...pre,revoked_at:"2026-01-01"}]},received),"approval_revoked");
bad(()=>allow({...synthetic,records:[{...pre,components:{...pre.components,arrangement:"unknown"}}]},received),"component_uncleared_arrangement");
good(()=>assert.equal(I.validateSourceFormat(Buffer.from("MThd\\x00\\x00\\x00\\x06\\x00\\x00\\x00\\x01\\x01\\xe0".replace(/\\x([0-9a-f]{2})/gi,(_,h)=>String.fromCharCode(parseInt(h,16)),"binary"),"binary"),"midi","games/nangam-schoolband-v08/charts/a.mid"),true),"MIDI header");
assert.throws(()=>I.validateSourceFormat(Buffer.from("not-midi"),"midi","games/nangam-schoolband-v08/charts/a.mid"),/invalid_midi_header/);checked++;
good(()=>assert.equal(I.validateSourceFormat(Buffer.from('<score-partwise version="4.0"></score-partwise>'),"musicxml","games/nangam-schoolband-v08/charts/test.musicxml"),true),"MusicXML header");
assert.throws(()=>I.validateSourceFormat(Buffer.from('<!DOCTYPE html><score-partwise/>'),"musicxml","games/nangam-schoolband-v08/charts/test.musicxml"),/invalid_musicxml_header/);checked++;
good(()=>assert.equal(I.validateSourceFormat(Buffer.from("%PDF-1.7\n..."),"score_pdf","games/nangam-schoolband-v08/charts/test.pdf"),true),"PDF header");
assert.throws(()=>I.validateSourceFormat(Buffer.from("EXE!!"),"score_pdf","games/nangam-schoolband-v08/charts/test.pdf"),/invalid_score_pdf_header/);checked++;
const fakeRights={sourceId:"unverified-school",status:"approved",publicRelease:false,
 scopes:["convert_to_game"],permissionRecordId:"claimed-approval",validUntil:"2099-12-31"};
assert.throws(()=>ARR.rightsGate({songId:fakeRights.sourceId,rights:fakeRights}),/external_requires_stage022_trusted_registry/);checked++;
assert.throws(()=>MIDI.rightsGate(fakeRights),/external_requires_stage022_trusted_registry/);checked++;
assert.throws(()=>I.createPrivatePlan("nonexistent-school"),/untrusted_song/);checked++;
const privateGenerated=I.createPrivatePlan(record.song_id,{generate:true});
good(()=>assert.equal(privateGenerated.generated,true),"fully generated private chart in memory only");
good(()=>assert.equal(privateGenerated.chart_count,20),"20 offline chart combinations");
good(()=>assert.equal(privateGenerated.publication_allowed,false),"private conversion cannot publish");
console.log("PASS Stage022 rights intake:",checked,
 "checks; source bound by Git blob hash, revoked/expired/untrusted rejected, 20 charts private.");
