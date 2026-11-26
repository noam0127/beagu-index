// v1.11.25: pure locker-room domain policy. No database or network side effects.
// Viewer and actor fields MUST be constructed from verified server-side sessions,
// never from request JSON. Existing posts without visibility metadata fail closed.
export const POSITIONS = Object.freeze(["아웃사이드 히터","아포짓 스파이커","미들 블로커","세터","리베로"]);
export const ADMIN_NAME = "카리브해매너티";
export const SCHOOL_ID = /^[A-Z0-9]{7}$/;
const SUBJECTS = new Set(["general","school","game","comparison"]);
export function validateDraft({body,schoolId=null}={}) {
  if(typeof body!=="string") throw Error("INVALID_POST");
  const text=body.trim();
  if(!text || [...text].length>300 ||
     /(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,})/i.test(text) ||
     /(?:01[016789])[- ]?\d{3,4}[- ]?\d{4}/.test(text)) throw Error("INVALID_POST");
  if(schoolId!==null && (typeof schoolId!=="string" || !SCHOOL_ID.test(schoolId))) throw Error("INVALID_SCHOOL");
  return {body:text,subject_type:schoolId?"school":"general",school_id:schoolId};
}
export function canRead(post,viewer) {
  if(!post || post.status!=="published" || !viewer || !Number.isInteger(viewer.level)) return false;
  if(!SUBJECTS.has(post.subject_type)) return false;
  // No silent migration to Lv0: general and school posts use the same existing
  // Lv2 + verified account gate until an explicitly approved policy changes it.
  const min=post.minimum_read_level===undefined?2:post.minimum_read_level;
  if(!Number.isInteger(min)||min<2||min>3) return false;
  return viewer.level>=min && viewer.accountVerified===true;
}
export function canWrite(viewer) {
  return !!viewer && Number.isInteger(viewer.level) && viewer.level>=2 &&
    viewer.accountVerified===true && typeof viewer.actorId==="string" &&
    viewer.actorId.length>0 && viewer.suspended===false;
}
export function displayName(row) {
  // author_role must come from trusted stored metadata, not a client claim.
  if(row.author_role==="operator") return ADMIN_NAME;
  const name=row.thread_alias;
  if(typeof name==="string" && POSITIONS.some(p=>name===p ||
    (name.startsWith(p+" ") && /^[2-9]$|^[1-9][0-9]+$/.test(name.slice(p.length+1))))) return name;
  return "익명";
}
export function projectPost(post,viewer) {
  if(!canRead(post,viewer)) return null;
  return {id:post.id,body:post.body,created_at:post.created_at,
    subject_type:post.subject_type,school_id:SCHOOL_ID.test(post.school_id||"")?post.school_id:null,
    nickname:displayName(post),is_operator:post.author_role==="operator",
    mine:typeof viewer.actorId==="string" && viewer.actorId===post.author_uid};
}
export function selectFeed(rows,viewer,{filter="all",schoolId=null,limit=30}={}) {
  if(!["all","school","operator"].includes(filter)) throw Error("INVALID_FILTER");
  if(schoolId!==null && !SCHOOL_ID.test(schoolId)) throw Error("INVALID_SCHOOL");
  if(!Number.isInteger(limit)||limit<1||limit>50) throw Error("INVALID_LIMIT");
  return rows.filter(p=>canRead(p,viewer))
    .filter(p=>filter!=="school" || p.subject_type==="school")
    .filter(p=>filter!=="operator" || p.author_role==="operator")
    .filter(p=>schoolId===null || p.school_id===schoolId)
    .sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))||String(b.id).localeCompare(String(a.id)))
    .slice(0,limit).map(p=>projectPost(p,viewer));
}
export function validateReply(post,parent,viewer) {
  if(!canWrite(viewer)||!canRead(post,viewer)) throw Error("POST_UNAVAILABLE");
  if(parent && (parent.status!=="published" || parent.post_id!==post.id || parent.parent_id!=null))
    throw Error("INVALID_PARENT");
  return {post_id:post.id,parent_id:parent?.id??null};
}
export function notificationRecipient(post,parent,actorId) {
  const recipient=parent?.author_uid??post.author_uid;
  return typeof recipient==="string" && recipient!==actorId?recipient:null;
}
