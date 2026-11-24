// Private reviewer endpoint. No authentication by participation code.
// Reads are allowed only for allowlisted Supabase Auth AAL2 sessions.
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.58.0";
const url=Deno.env.get("SUPABASE_URL")||"";
const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const origins=new Set(["https://baeguindex.com","https://www.baeguindex.com"]);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers=(o:string)=>({
 "Access-Control-Allow-Origin":origins.has(o)?o:"https://baeguindex.com",
 "Access-Control-Allow-Headers":"authorization,apikey,content-type",
 "Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin",
 "Cache-Control":"private,no-store","X-Content-Type-Options":"nosniff"
});
const send=(o:string,status:number,payload:Record<string,unknown>)=>
 new Response(JSON.stringify(payload),{status,headers:{...headers(o),"Content-Type":"application/json;charset=utf-8"}});
function claimsOf(jwt:string):{sub?:string;aal?:string;session_id?:string}|null{
 try{
  const raw=jwt.split(".")[1];if(!raw)return null;
  return JSON.parse(atob(raw.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(raw.length/4)*4,"=")));
 }catch{return null;}
}
Deno.serve(async(request:Request)=>{
 const origin=request.headers.get("origin")||"";
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
 if(request.method!=="POST")return send(origin,405,{error:"method_not_allowed"});
 if(origin&&!origins.has(origin))return send(origin,403,{error:"origin_not_allowed"});
 if(Number(request.headers.get("content-length")||0)>4096)return send(origin,413,{error:"request_too_large"});
 const match=/^Bearer ([A-Za-z0-9._-]+)$/.exec(request.headers.get("authorization")||"");
 if(!match)return send(origin,401,{error:"authentication_required"});
 const jwt=match[1];
 const {data:authData,error:authError}=await db.auth.getUser(jwt);
 const actor=authData?.user?.id||"";
 const claims=claimsOf(jwt);
 if(authError||!actor||claims?.sub!==actor||!claims.session_id||!uuid.test(claims.session_id))
  return send(origin,401,{error:"authentication_required"});
 let input:Record<string,unknown>;
 try{
  const text=await request.text();if(text.length>4096)throw Error();
  input=JSON.parse(text);
 }catch{return send(origin,400,{error:"invalid_request"});}
 if(!input||typeof input!=="object"||Array.isArray(input))return send(origin,400,{error:"invalid_request"});
 if(!["queue","pipeline","level_decision","bulk_verified","hold","basis_review","finalize","referral_quality_queue","referral_quality_resolve"].includes(String(input.action||"")))return send(origin,400,{error:"invalid_action"});
 try{
  const {data:account,error:accountError}=await db.from("beagu_admin_accounts")
   .select("role,enabled").eq("user_id",actor).maybeSingle();
  if(accountError)return send(origin,503,{error:"authorization_unavailable"});
  if(!account?.enabled)return send(origin,403,{error:"access_denied"});
  if(claims.aal!=="aal2")return send(origin,403,{error:"mfa_required"});
  const {data:active,error:sessionError}=await db.rpc("beagu_admin_active_mfa_session",
   {p_user:actor,p_session:claims.session_id});
  if(sessionError||active!==true)return send(origin,401,{error:"active_mfa_session_required"});

  if(input.action==="queue"){
   const status=typeof input.filter==="string"?input.filter:"all";
   const page=Number(input.page??0);
   if(!["all","quality","technical","question","school","prelaunch","approved","held","single","single_technical","awaiting_basis"].includes(status)||
     !Number.isSafeInteger(page)||page<0||page>500)return send(origin,400,{error:"invalid_filters"});
   const {data,error}=await db.rpc("beagu_2026_admin_review_queue",
     {p_filter:status,p_limit:20,p_offset:page*20});
   if(error||!data){console.error("review_queue_unavailable",error?.code||"unknown");
     return send(origin,503,{error:"review_queue_unavailable"});}
   return send(origin,200,{...data,page,filter:status});
  }
  if(input.action==="pipeline"){
    // The status contains bounded counts only. No school-level details,
    // raw response text, event hashes, or public approval side effects.
    const [pipeline,levelStatus]=await Promise.all([
      db.rpc("beagu_2026_admin_pipeline_status"),
      db.rpc("beagu_2026_level_release_status")
    ]);
    if(pipeline.error||!pipeline.data||levelStatus.error||
       !Array.isArray(levelStatus.data)||levelStatus.data.length!==3){
      console.error("pipeline_status_unavailable",
        pipeline.error?.code||levelStatus.error?.code||"unknown");
      return send(origin,503,{error:"pipeline_status_unavailable"});
    }
    // Waterway diagnostic is optional during a staggered backend rollout.
    // Existing approval gates remain authoritative. Never fabricate missing counts.
    let waterway:unknown=null;
    try {
      const diagnostic=await db.rpc("beagu_2026_waterway_status_v1");
      if(!diagnostic.error&&diagnostic.data?.version===1)waterway=diagnostic.data;
      else console.error("waterway_status_unavailable",diagnostic.error?.code||"invalid_result");
    }catch{console.error("waterway_status_unavailable");}
    return send(origin,200,{status:pipeline.data,levels:levelStatus.data,
      waterway,waterway_status:waterway===null?"UNAVAILABLE":"OK"});
  }
  // Review decisions may only be made by the owner, never a viewer or editor.
  if(account.role!=="owner")return send(origin,403,{error:"owner_required"});
  if(input.action==="bulk_verified"){
    const preview=input.preview===true;
    const limit=input.limit===undefined?400:input.limit;
    if(typeof limit!=="number"||!Number.isInteger(limit)||limit<1||limit>400)
      return send(origin,400,{error:"invalid_bulk_limit"});
    if(!preview&&input.confirmation!=="APPROVE_VERIFIED_EXACT_SNAPSHOTS")
      return send(origin,400,{error:"missing_explicit_bulk_confirmation"});
    const {data,error}=await db.rpc("beagu_2026_owner_bulk_verified",{
      p_actor:actor,p_session:claims.session_id,p_preview:preview,p_limit:limit,
      p_confirmation:preview?null:"APPROVE_VERIFIED_EXACT_SNAPSHOTS"
    });
    if(error||!data?.ok){
      console.error("bulk_approval_rejected",error?.code||"unknown");
      return send(origin,409,{error:"bulk_approval_checks_failed"});
    }
    return send(origin,200,data);
  }
  if(input.action==="level_decision"){
    // Tier approval never changes individual school approvals or source records.
    const level=input.level;
    const decision=input.decision;
    if(typeof level!=="number"||!Number.isInteger(level)||level<0||level>2||
      !["APPROVE","REVOKE"].includes(String(decision)))
      return send(origin,400,{error:"invalid_level_decision"});
    const {data,error}=await db.rpc("beagu_2026_set_level_final_approval",{
      p_level:level,p_actor:actor,p_session:claims.session_id,p_action:decision
    });
    if(error||!data?.ok){
      console.error("level_final_decision_refused",error?.code||"unknown");
      return send(origin,409,{error:"level_approval_requires_finalized_schools_and_owner_mfa"});
    }
    return send(origin,200,data);
  }
  if(input.action==="referral_quality_queue"){
    const {data,error}=await db.rpc("beagu_referral_quality_queue");
    if(error||!data)return send(origin,503,{error:"referral_quality_queue_unavailable"});
    return send(origin,200,data);
  }
  if(input.action==="referral_quality_resolve"){
    const hash=typeof input.event_hash==="string"?input.event_hash:"";
    const decision=typeof input.decision==="string"?input.decision:"";
    const reason=typeof input.reason==="string"?input.reason.trim():"";
    if(!/^[a-f0-9]{64}$/.test(hash)||!["APPROVE","REJECT"].includes(decision)||
       reason.length<12||reason.length>500||/[<>]/.test(reason))
      return send(origin,400,{error:"invalid_referral_review"});
    const {data,error}=await db.rpc("beagu_referral_quality_resolve",{
       p_event_hash:hash,p_actor:actor,p_session:claims.session_id,
       p_decision:decision,p_reason:reason});
    if(error)return send(origin,409,{error:"review_denied_or_changed"});
    return send(origin,200,data||{ok:true,decision});
  }
  if(input.action==="finalize"){
    const id=typeof input.school_id==="string"?input.school_id:"";
    const sha=typeof input.payload_sha256==="string"?input.payload_sha256:"";
    const ref=typeof input.notice_source_ref==="string"?input.notice_source_ref.trim():"";
    const digest=typeof input.notice_digest_sha256==="string"?input.notice_digest_sha256:"";
    const when=typeof input.notice_effective_at==="string"?input.notice_effective_at:"";
    const scope=typeof input.publication_scope==="string"?input.publication_scope.trim():"";
    const notes=typeof input.notes==="string"?input.notes.trim():"";
    const type=typeof input.basis_type==="string"?input.basis_type:"";
    const checks=input.review_checks;
    const ev=input.evidence;
    const names=["distinct_respondents_reviewed","personal_data_reviewed","small_sample_reviewed",
      "reidentification_reviewed","prior_data_combination_reviewed"];
    const evidenceNames=["source_scoring","school_identity","duplicate_responses",
      "consent","small_sample","reidentification","prior_data_combination"];
    if(!/^[A-Z0-9]{7}$/.test(id)||!/^[a-f0-9]{64}$/.test(sha)||
      !["EXPLICIT_RESPONDENT_CONSENT","OTHER_DOCUMENTED_LEGAL_BASIS"].includes(type)||
      ref.length<12||ref.length>400||/[<>\r\n]/.test(ref)||
      !/^[a-f0-9]{64}$/.test(digest)||
      !/^20\d\d-\d\d-\d\dT/.test(when)||!Number.isFinite(Date.parse(when))||
      scope.length<20||scope.length>500||/[<>\r\n]/.test(scope)||
      notes.length<12||notes.length>500||/[<>]/.test(notes)||
      !checks||typeof checks!=="object"||Array.isArray(checks)||
      names.some(k=>checks[k]!==true)||
      !ev||typeof ev!=="object"||Array.isArray(ev)||
      evidenceNames.some(k=>typeof ev[k]!=="string"||
        ev[k].trim().length<10||ev[k].length>400||/[<>]/.test(ev[k])))
      return send(origin,400,{error:"final_approval_evidence_incomplete"});
    const {data,error}=await db.rpc("beagu_2026_owner_finalize_one",{
      p_school_id:id,p_expected_sha256:sha,p_actor:actor,p_session:claims.session_id,
      p_basis_type:type,p_notice_ref:ref,p_notice_digest:digest,
      p_notice_effective_at:when,p_scope:scope,p_notes:notes,
      p_review_checks:checks,p_evidence:ev
    });
    if(error){console.error("final_approval_refused",error.code||"unknown");
      return send(origin,409,{error:"final_approval_rejected_or_snapshot_changed"});}
    return send(origin,200,data||{ok:true,school_id:id});
  }
  if(input.action==="basis_review"){
    const id=typeof input.school_id==="string"?input.school_id:"";
    const sha=typeof input.payload_sha256==="string"?input.payload_sha256:"";
    const decision=typeof input.decision==="string"?input.decision:"";
    const type=typeof input.basis_type==="string"&&input.basis_type?input.basis_type:null;
    const ref=typeof input.notice_source_ref==="string"?input.notice_source_ref.trim():"";
    const digest=typeof input.notice_digest_sha256==="string"&&input.notice_digest_sha256?
      input.notice_digest_sha256:null;
    const effective=typeof input.notice_effective_at==="string"&&input.notice_effective_at?
      input.notice_effective_at:null;
    const scope=typeof input.publication_scope==="string"?input.publication_scope.trim():"";
    const notes=typeof input.notes==="string"?input.notes.trim():"";
    const reviewChecks=["distinct_respondents_reviewed","personal_data_reviewed",
      "small_sample_reviewed","reidentification_reviewed","prior_data_combination_reviewed"];
    if(!/^[A-Z0-9]{7}$/.test(id)||!/^[a-f0-9]{64}$/.test(sha)||
       !["PENDING","REJECTED"].includes(decision)||
       (type!==null&&!["EXPLICIT_RESPONDENT_CONSENT","OTHER_DOCUMENTED_LEGAL_BASIS"].includes(type))||
       ref.length>400||scope.length>500||notes.length<12||notes.length>500||
       /[<>\\r\\n]/.test(ref+scope)||/[<>]/.test(notes)||
       (digest!==null&&!/^[a-f0-9]{64}$/.test(digest))||
       (effective!==null&&(!/^20\\d\\d-\\d\\d-\\d\\dT/.test(effective)||!Number.isFinite(Date.parse(effective))))||
       reviewChecks.some(k=>input[k]!==undefined&&typeof input[k]!=="boolean"))
      return send(origin,400,{error:"invalid_basis_review"});
    const params:Record<string,unknown>={
      p_school_id:id,p_expected_sha256:sha,p_actor:actor,
      p_session:claims.session_id,p_decision:decision,p_basis_type:type,
      p_notice_ref:ref||null,p_notice_digest:digest,p_notice_effective_at:effective,
      p_scope:scope||null,p_notes:notes
    };
    for(const key of reviewChecks)params["p_"+key]=input[key]===true;
    const {error}=await db.rpc("beagu_2026_admin_record_basis_review",params);
    if(error){
      console.error("basis_review_write_failed",error.code||"unknown");
      return send(origin,409,{error:"basis_review_failed_or_snapshot_changed"});
    }
    return send(origin,200,{ok:true,school_id:id,decision,publication_approved:false});
  }
  const schoolId=typeof input.school_id==="string"?input.school_id:"";
  const sha=typeof input.payload_sha256==="string"?input.payload_sha256:"";
  const reason=typeof input.reason==="string"?input.reason.trim():"";
  if(!/^[A-Z0-9]{7}$/.test(schoolId)||!/^[a-f0-9]{64}$/.test(sha)||
    reason.length<12||reason.length>500||/[<>]/.test(reason))
   return send(origin,400,{error:"invalid_hold_decision"});
  const {error}=await db.rpc("beagu_2026_admin_hold_result",
   {p_school_id:schoolId,p_expected_sha256:sha,p_actor:actor,p_reason:reason});
  if(error){console.error("review_hold_unavailable",error.code||"unknown");
    return send(origin,409,{error:"hold_failed_or_snapshot_changed"});}
  const {error:auditError}=await db.from("beagu_admin_audit_events").insert({
   actor_user_id:actor,event_type:"admin_2026_review_hold",outcome:"success",
   details:{school_id:schoolId}
  });
  if(auditError){console.error("review_hold_audit_unavailable",auditError.code||"unknown");
    return send(origin,503,{error:"audit_unavailable"});}
  return send(origin,200,{ok:true,school_id:schoolId,decision:"WITHHELD"});
 }catch(error){
  console.error("review_api_unavailable",error instanceof Error?error.name:"unknown");
  return send(origin,503,{error:"review_api_unavailable"});
 }
});
