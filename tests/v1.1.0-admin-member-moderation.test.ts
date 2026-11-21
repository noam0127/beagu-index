import { moderationInput,moderationAuditDetails,memberStatusMatches,
  selectMemberStatus,validUUID } from "../supabase/functions/_shared/beagu-member-management-v2.ts";
import { assertEquals,assert,assertMatch } from "jsr:@std/assert@1.0.11";

const id="11111111-1111-4111-8111-111111111111";
const request="44444444-4444-4444-8444-444444444444";
const good={user_id:id,operation:"suspend_24h",reason:"반복적인 운영정책 위반에 따른 기간 한정 처리",request_id:request};
Deno.test("owner moderation requires typed UUID, bounded reason and operation",()=>{
 const parsed=moderationInput(good);
 assert(parsed);
 assertEquals(parsed.userId,id);
 assertEquals(parsed.requestId,request);
 assertEquals(parsed.duration,"24h");
 assertEquals(moderationInput({...good,operation:"delete_user"}),null);
 assertEquals(moderationInput({...good,request_id:"forged"}),null);
 assertEquals(moderationInput({...good,user_id:"wrong"}),null);
 assertEquals(moderationInput({...good,reason:"짧음"}),null);
 assertEquals(moderationInput({...good,reason:"x".repeat(201)}),null);
});
Deno.test("reasons never contain emails, contact numbers, bearer tokens or links",()=>{
 for(const reason of [
  "신고자 이메일 user@example.com 정보 포함",
  "010-1234-5678 유출 방지를 위한 처리",
  "https://private.invalid/logs 주소 포함",
  "Bearer credential-should-not-be-in-audit-event",
  "a".repeat(60)+" 위험한 로그값",
 ]){
  assertEquals(moderationInput({...good,reason}),null);
 }
});
Deno.test("restore request has no ban duration and reason is trimmed",()=>{
 const p=moderationInput({...good,operation:"restore",reason:"   학생 및 운영규칙 위반 상태의 해제 점검   "});
 assert(p);
 assertEquals(p.duration,"none");
 assertEquals(p.reason,"학생 및 운영규칙 위반 상태의 해제 점검");
});
Deno.test("status filter normalization fails closed to all",()=>{
 for(const type of ["all","confirmed","unconfirmed","active","suspended"])
  assertEquals(selectMemberStatus(type),type);
 assertEquals(selectMemberStatus("admin"),"all");
 assertEquals(selectMemberStatus({role:"owner"}),"all");
});
Deno.test("email confirmation and effective ban status are evaluated server-side",()=>{
 const now=Date.parse("2026-11-21T15:00:00Z");
 const confirmed={email_confirmed_at:"2026-11-01T00:00:00Z",banned_until:"2026-11-22T00:00:00Z"};
 assertEquals(memberStatusMatches(confirmed,"confirmed",now),true);
 assertEquals(memberStatusMatches(confirmed,"unconfirmed",now),false);
 assertEquals(memberStatusMatches(confirmed,"suspended",now),true);
 assertEquals(memberStatusMatches(confirmed,"active",now),false);
 assertEquals(memberStatusMatches({email_confirmed_at:null,banned_until:"2025-01-01T00:00:00Z"},"active",now),true);
 assertEquals(memberStatusMatches({email_confirmed_at:null},"unconfirmed",now),true);
});
Deno.test("audit details are bounded and avoid browser secrets",()=>{
 const details=moderationAuditDetails(id,good.reason,"suspend_7d",request,"168h");
 assertEquals(details.target_user_id,id);
 assertEquals(details.operation,"suspend_7d");
 assertEquals(details.request_id,request);
 assertEquals(details.duration,"168h");
 assertEquals(Object.keys(details).sort(),["duration","operation","reason","request_id","target_user_id"]);
 assert(!JSON.stringify(details).includes("token"));
});
Deno.test("member Edge function checks owner/MFA before listing or mutation",async()=>{
 const code=await Deno.readTextFile("supabase/functions/beagu-admin-members-v1/index.ts");
 assertMatch(code,/beagu_admin_active_mfa_session/);
 assertMatch(code,/db\.auth\.getUser\(token\)/);
 assertMatch(code,/if\(actor\.role!=="owner"\)throw new HttpError\(403,"owner_required"\)/);
 assertMatch(code,/await audit\(actor\.id,"member_moderation_requested"[\s\S]*?"pending"\)/);
 assert(code.indexOf('await audit(actor.id,"member_moderation_requested"') <
   code.indexOf("db.auth.admin.updateUserById(id"));
 assertMatch(code,/error\.code==="23505"/);
 assertMatch(code,/updateError/);
 assertMatch(code,/body_too_large/);
 assertMatch(code,/beagu_admin_member_sms_status_v2/);
 assert(!code.includes("beagu_admin_member_sms_status_v1"));
 assert(!code.includes("phone_e164"));
});
