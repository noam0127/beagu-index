// Stage35: read-only, server-authoritative Lv3 eligibility.
// A transferable Lv2 participation code plus an arbitrary Auth login
// is NOT enough. The account must be email-verified, active and linked
// to the exact 2026 earned visitor through the server-protected table.
export function isVerifiedLv3Member(session, user, member, eligibleUser) {
  if(!session||Number(session.access_level)!==2||
     session.identity_campaign!=='2026'||
     typeof session.identity_visitor_id!=='string'||
     !session.identity_visitor_id)return false;
  if(!eligibleUser||!eligibleUser(user))return false;
  if(!member||member.status!=='active'||
     member.auth_user_id!==user.id||
     member.identity_visitor_id!==session.identity_visitor_id||
     typeof member.author_uid!=='string'||!member.author_uid)return false;
  return true;
}
