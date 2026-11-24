// Audience is derived from the verified session, never from a public request field.
const table="beagu_notice_audience_v1",scopes=["all","0","1","2"],origins=new Set(["https://baeguindex.com","https://www.baeguindex.com"]);
const fields="audience,body,published,revision,updated_at";
const cors=origin=>({"Access-Control-Allow-Origin":origins.has(origin)?origin:"https://baeguindex.com","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"apikey, authorization, content-type, x-beagu-session","Cache-Control":"no-store, private, max-age=0","Vary":"Origin, X-Beagu-Session, Authorization","X-Content-Type-Options":"nosniff"});
const reply=(o,status,origin)=>new Response(JSON.stringify(o),{status,headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8"}});
async function readInput(req){
 if(Number(req.headers.get("Content-Length")||0)>8192)throw Error("too_large");
 const reader=req.body?.getReader();if(!reader)throw Error("invalid_json");let size=0,raw="";const decoder=new TextDecoder();
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw Error("too_large");}raw+=decoder.decode(value,{stream:true});}
 const input=JSON.parse(raw+decoder.decode());if(!input||typeof input!=="object"||Array.isArray(input))throw Error("invalid_json");return input;
}
export function makeNoticeHandler({db,verifyAdmin,verifyLevel}){
 return async req=>{
  const origin=req.headers.get("Origin")||"";
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
  if(req.method!=="POST")return reply({error:"method_not_allowed"},405,origin);
  if(origin&&!origins.has(origin))return reply({error:"origin_not_allowed"},403,origin);
  let input;try{input=await readInput(req)}catch(e){return reply({error:e.message==="too_large"?"request_too_large":"invalid_json"},e.message==="too_large"?413:400,origin)}
  try{
   if(input.action==="public_read"){
    const token=(req.headers.get("X-Beagu-Session")||"").trim();
    const level=token?await verifyLevel(token):0;
    if(![0,1,2].includes(level))return reply({error:"invalid_session"},401,origin);
    const {data,error}=await db.from(table).select(fields).in("audience",["all",String(level)]).eq("published",true);
    if(error)return reply({error:"notice_unavailable"},503,origin);
    const notices=(data||[]).filter(n=>n.published===true&&["all",String(level)].includes(n.audience)).map(n=>({audience:n.audience,body:n.body,revision:n.revision}));
    return reply({level,notices},200,origin);
   }
   if(!["admin_read","admin_save","admin_hide"].includes(input.action))return reply({error:"invalid_action"},400,origin);
   const match=/^Bearer ([A-Za-z0-9._-]+)$/.exec(req.headers.get("Authorization")||"");
   if(!match)return reply({error:"authentication_required"},401,origin);
   const permitted=await verifyAdmin(match[1]);if(!permitted.userId)return reply({error:permitted.error||"access_denied"},permitted.status,origin);
   if(!scopes.includes(input.audience))return reply({error:"invalid_audience"},400,origin);
   if(input.action==="admin_read"){
    const {data,error}=await db.from(table).select(fields).eq("audience",input.audience).maybeSingle();
    return error||!data?reply({error:"notice_unavailable"},503,origin):reply(data,200,origin);
   }
   if(!Number.isSafeInteger(input.revision)||input.revision<1||input.revision>=2147483647)return reply({error:"invalid_revision"},400,origin);
   const patch={published:input.action==="admin_save",revision:input.revision+1,updated_at:new Date().toISOString(),updated_by:permitted.userId};
   if(input.action==="admin_save"){
    if(typeof input.body!=="string")return reply({error:"invalid_body"},400,origin);
    const body=input.body.replace(/\r\n?/g,"\n").trim();
    if(body.length<1||body.length>1000)return reply({error:"invalid_body"},400,origin);
    patch.body=body;
   }
   const {data,error}=await db.from(table).update(patch).eq("audience",input.audience).eq("revision",input.revision).select(fields).maybeSingle();
   if(error)return reply({error:"save_unavailable"},503,origin);
   if(!data)return reply({error:"edit_conflict"},409,origin);
   const {error:auditError}=await db.from("beagu_admin_audit_events").insert({actor_user_id:permitted.userId,event_type:"home_notice_updated",outcome:"success",details:{audience:input.audience,published:patch.published,from_revision:input.revision,to_revision:data.revision,body_length:data.body.length}});
   if(auditError)console.error("notice_audit_unavailable",auditError.code);
   return reply(data,200,origin);
  }catch{return reply({error:"service_unavailable"},503,origin)}
 };
}
