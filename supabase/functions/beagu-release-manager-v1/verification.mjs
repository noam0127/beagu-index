// Isolate-local read cache only. Never authorizes registration or publication.
export const transientVerificationReasons=new Set(["github_unavailable","github_rate_limited","release_service_unavailable"]);
export function githubReason(error){return ["github_unavailable","github_rate_limited","github_access_denied"].includes(error?.message)?error.message:"github_unavailable";}
export function createGitHubReader({baseUrl,token="",fetcher=fetch,clock=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 let blockedUntil=0;
 return async function read(path){
  if(clock()<blockedUntil)throw Error("github_rate_limited");
  for(let attempt=0;attempt<2;attempt++){
   let response;
   try{response=await fetcher(baseUrl+path,{headers:{"Accept":"application/vnd.github+json","User-Agent":"beaguindex-release-v1",...(token?{"Authorization":"Bearer "+token}:{})},signal:AbortSignal.timeout(4500)});}
   catch{if(attempt===0){await sleep(750);continue;}throw Error("github_unavailable");}
   if(response.ok){try{return await response.json();}catch{throw Error("github_unavailable");}}
   const retry=response.headers.get("retry-after"), remaining=response.headers.get("x-ratelimit-remaining");
   let rate=response.status===429||(response.status===403&&(retry!==null||remaining==="0"));
   if(response.status===403&&!rate){try{rate=/rate limit|secondary limit|abuse detection/i.test(String((await response.json()).message||""));}catch{}}
   if(rate){
    const retryMs=retry===null?0:(/^\d+$/.test(retry)?Number(retry)*1000:Date.parse(retry)-clock());
    const resetMs=remaining==="0"?Number(response.headers.get("x-ratelimit-reset"))*1000-clock():0;
    blockedUntil=clock()+Math.max(60000,Number.isFinite(retryMs)?retryMs:0,Number.isFinite(resetMs)?resetMs:0);
    throw Error("github_rate_limited");
   }
   if(response.status>=500&&attempt===0){await sleep(750);continue;}
   throw Error(response.status===401||response.status===403?"github_access_denied":"github_unavailable");
  }
  throw Error("github_unavailable");
 };
}
export function createStatusVerifier({verify,clock=Date.now,ttl=60000,maxEntries=16}){
 const cache=new Map(),pending=new Map();
 const key=s=>JSON.stringify([s.production_sha,s.draft_sha,s.draft_version,s.draft_summary]);
 const eligible=s=>!!s.production_sha&&!!s.draft_sha&&s.production_sha!==s.draft_sha;
 const result=(ready,reason=null,checkedAt=null)=>({ready,reason,checkedAt});
 function remember(s,candidate){
  if(!eligible(s)||!candidate||"error" in candidate||candidate.version!==s.draft_version||candidate.summary!==s.draft_summary)return;
  const k=key(s);cache.delete(k);cache.set(k,clock());
  while(cache.size>maxEntries)cache.delete(cache.keys().next().value);
 }
 function invalidate(s){cache.delete(key(s));}
 async function check(s,full){
  if(!eligible(s))return result(full?false:null);
  const k=key(s),time=cache.get(k);
  if(time!==undefined&&clock()-time<ttl)return result(true,null,time);
  cache.delete(k);
  if(!full)return result(null);
  if(pending.has(k))return pending.get(k);
  const promise=(async()=>{try{
   const c=await verify(s.production_sha,s.draft_sha);
   if("error" in c)return result(false,c.error||"direct_candidate_invalid");
   if(c.version!==s.draft_version||c.summary!==s.draft_summary)return result(false,"direct_version_mismatch");
   remember(s,c);return result(true,null,cache.get(k));
  }catch(e){return result(false,githubReason(e));}finally{pending.delete(k);}})();
  pending.set(k,promise);return promise;
 }
 return {check,remember,invalidate};
}
