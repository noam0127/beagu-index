// Thread-scoped pseudonyms. Never expose the private author identifier.
export const POSITIONS=Object.freeze(["아웃사이드 히터","아포짓 스파이커","미들 블로커","세터","리베로"]);
export async function threadPositions(secret,postId,rootAuthor,chronologicalAuthors){
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const labels=new Map(), counts=new Map();
 for(const author of [rootAuthor,...chronologicalAuthors]){
  if(!author||labels.has(author))continue;
  const mac=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode("postit-position-v1:"+postId+":"+author)));
  const role=POSITIONS[new DataView(mac.buffer).getUint32(0)%POSITIONS.length];
  const n=(counts.get(role)||0)+1;counts.set(role,n);
  labels.set(author,{nickname:role+(n>1?" "+n:""),is_post_author:author===rootAuthor});
 }
 return labels;
}
