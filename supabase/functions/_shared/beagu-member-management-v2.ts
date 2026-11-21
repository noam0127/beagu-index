// Pure server-side validation for the MFA-only member manager.
// Absolutely no user_metadata, tokens, SMS phone or credentials belong here.
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export type ModerationOperation="suspend_24h"|"suspend_7d"|"restore";
export type MemberStatus="all"|"confirmed"|"unconfirmed"|"suspended"|"active";
export type ModerationInput={userId:string;operation:ModerationOperation;reason:string;requestId:string;duration:"24h"|"168h"|"none"};

export function validUUID(value:unknown):value is string {
  return typeof value==="string"&&UUID.test(value);
}
export function selectMemberStatus(value:unknown):MemberStatus {
  return ["all","confirmed","unconfirmed","suspended","active"].includes(String(value))
    ?String(value) as MemberStatus:"all";
}
export function moderationInput(value:Record<string,unknown>):ModerationInput|null {
  const userId=value.user_id,requestId=value.request_id;
  const operation=value.operation;
  const reason=typeof value.reason==="string"?value.reason.trim():"";
  if(!validUUID(userId)||!validUUID(requestId)||
    !["suspend_24h","suspend_7d","restore"].includes(String(operation))||
    reason.length<8||reason.length>200||
    /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|01[016789][- ]?\d{3,4}[- ]?\d{4}|https?:\/\/|Bearer\s|[A-Za-z0-9._-]{50,})/i.test(reason))return null;
  return {userId,requestId,operation:operation as ModerationOperation,reason,
    duration:operation==="suspend_24h"?"24h":operation==="suspend_7d"?"168h":"none"};
}
export function memberStatusMatches(
  user:{email_confirmed_at?:string|null;banned_until?:string|null},
  status:MemberStatus,now:number
):boolean {
 const confirmed=Boolean(user.email_confirmed_at);
 const banned=Boolean(user.banned_until&&Date.parse(user.banned_until)>now);
 switch(status){
  case "confirmed":return confirmed;
  case "unconfirmed":return !confirmed;
  case "suspended":return banned;
  case "active":return !banned;
  default:return true;
 }
}
export function moderationAuditDetails(
  target:string,reason:string,operation:ModerationOperation,requestId:string,duration:string
):Record<string,string>{
 return {target_user_id:target,reason,operation,request_id:requestId,duration};
}
