import {createClient} from "https://esm.sh/@supabase/supabase-js@2.58.0";
const env=(key:string)=>Deno.env.get(key) || "";
const admin=createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false}});
const archive=admin.storage.from("web-release-archives");
const repo="noam0127/beagu-index";
const actions=new Set(["list","edit","deploy","rollback","notice","cancel"]);
const headers={"access-control-allow-origin":"https://baeguindex.com","access-control-allow-methods":"POST,OPTIONS",
 "access-control-allow-headers":"authorization,apikey,content-type,x-client-info","cache-control":"no-store","content-type":"application/json"};
const reply=(v:unknown,status=200)=>new Response(JSON.stringify(v),{headers,status});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers});
 if(req.method!=="POST")return reply({error:"method"},405);
 const origin=req.headers.get("origin");
 if(origin && origin!==headers["access-control-allow-origin"])return reply({error:"origin"},403);
 const token=(req.headers.get("authorization")||"").replace(/^Bearer /,"");
 if(!token)return reply({error:"authentication_required"},401);
 try{
  const p=await req.json(),action=p.action;
  let actor=null,session=null;
  if(actions.has(action)){
   const {data,error}=await admin.auth.getUser(token);
   if(error||!data.user)return reply({error:"authentication_required"},401);
   const claims=JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
   if(claims.sub!==data.user.id||claims.aal!=="aal2"||!claims.session_id)return reply({error:"owner_mfa_required"},403);
   actor=data.user.id;session=claims.session_id;
  }else{
   const ci=["register","tested","upload","baseline"].includes(action)?"RELEASE_CANDIDATE_SECRET":
     ["claim","finish"].includes(action)?"RELEASE_PROMOTION_SECRET":"";
   if(!ci||!env(ci)||env(ci)!==token)return reply({error:"forbidden"},403);
  }
  const rpc=(name:string,input:unknown)=>admin.rpc("beagu_web_release",{p_action:name,p:input,p_actor:actor,p_session:session});
  if(action==="upload"){
   if(!/^[a-f0-9]{64}$/.test(p.digest))return reply({error:"digest"},400);
   const {data,error}=await archive.createSignedUploadUrl(p.digest+".tar");
   return error?reply({error:"storage_unavailable"},503):reply({url:data.signedUrl});
  }
  const {data,error}=await rpc(action,p);
  if(error)return reply({error:error.message},error.message==="owner_session_required"?403:409);
  if(action==="claim"){
   const {data:file,error:failure}=await archive.createSignedUrl(data.digest+".tar",600);
   if(failure)return reply({error:"archive_unavailable"},503);
   return reply({candidate:data,url:file.signedUrl});
  }
  if(action==="deploy"||action==="rollback"){
   const response=await fetch("https://api.github.com/repos/"+repo+"/actions/workflows/deploy-github-pages-direct.yml/dispatches",{
    method:"POST",headers:{Authorization:"Bearer "+env("RELEASE_GITHUB_TOKEN"),Accept:"application/vnd.github+json","User-Agent":"beagu-release"},
    body:JSON.stringify({ref:"main",inputs:{request:data.request}})});
   if(!response.ok){
    if(response.status>=400&&response.status<500)await rpc("dispatch_rejected",{request:data.request});
    return reply({error:"GitHub dispatch HTTP "+response.status,request:data.request},502);
   }
  }
  if(action==="list")return reply({...data,preview:env("RELEASE_PREVIEW_URL")});
  return reply(data);
 }catch{return reply({error:"request_incomplete_check_history"},503)}
});
