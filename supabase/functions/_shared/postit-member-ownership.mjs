// Pure, fail-closed member-ownership decision used by the Post-it Edge API.
// Inputs MUST originate from verified Supabase Auth, the server-issued Lv2
// session, and the service-role-only member account table respectively.
// Never authorize from request body user IDs, editable JWT user metadata,
// or the possession of a transferable participation code alone.
export function resolveVerifiedPostitOwner(account, viewer, record) {
  if(!account||typeof account.id!=="string"||!account.id||
     account.is_anonymous===true||!account.email_confirmed_at)return null;
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
