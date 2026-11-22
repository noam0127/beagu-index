// Pure, fail-closed member-ownership decision used by the Post-it Edge API.
// Inputs MUST originate from verified Supabase Auth, the server-issued Lv2
// session, and the service-role-only member account table respectively.
// Never authorize from request body user IDs, editable JWT user metadata,
// or the possession of a transferable participation code alone.
// An administrative temporary ban does NOT by itself revoke all prior
// Supabase sessions. Reject suspended/soft-deleted accounts independently
// even if a valid access token is still presented to the Edge API.
export function eligiblePostitAuthUser(account, nowMs=Date.now()) {
  if(!account||typeof account.id!=="string"||!account.id||
     account.is_anonymous===true||!account.email_confirmed_at||
     account.deleted_at)return false;
  if(account.banned_until!=null&&account.banned_until!==""){
    if(typeof account.banned_until!=="string")return false;
    const until=Date.parse(account.banned_until);
    if(!Number.isFinite(until)||until>nowMs)return false;
  }
  return true;
}
export function resolveVerifiedPostitOwner(account, viewer, record) {
  if(!eligiblePostitAuthUser(account))return null;
  if(!viewer||!Number.isInteger(viewer.level)||viewer.level<2||
     typeof viewer.visitor!=="string"||!viewer.visitor||
     typeof viewer.id!=="string"||!viewer.id)return null;
  if(!record||record.status!=="active"||
     record.auth_user_id!==account.id||
     record.identity_visitor_id!==viewer.visitor||
     record.author_uid!==viewer.id)return null;
  return {
    level:viewer.level, id:record.author_uid,
    visitor:viewer.visitor, authId:account.id
  };
}
