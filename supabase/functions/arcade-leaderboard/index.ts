// Public arcade ranking API. All database access is server-side through the service key.
// All submitted records are anonymous; no nickname or other name is accepted from clients.
const SUPA_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BASE = SUPA_URL + "/rest/v1/";
const ALLOWED_ORIGINS = new Set(["https://baeguindex.com","https://www.baeguindex.com","https://noam0127.github.io"]);
const VALID_GAMES = new Set(["volleyball_25","teacher_run_retirement"]);
const encoder = new TextEncoder();
const CACHE = "no-store";
type Game = "volleyball" | "teacher_run" | "volleyball_25" | "teacher_run_retirement";
type Entry = { score: number; created_at: string; school_name?: string | null; difficulty?: string | null };
type Session = { id: string; game: Game; ip_hash: string; started_at: string; submitted_at: string | null; school_id?:string; school_name?:string; difficulty?:string };

function json(data: unknown, status = 200, origin = "https://baeguindex.com"): Response {
  return new Response(JSON.stringify(data), { status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "content-type, apikey, authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin", "Cache-Control": CACHE, "X-Content-Type-Options": "nosniff"
  }});
}
function error(code: string, status: number, origin: string) { return json({error:code}, status, origin); }
function isGame(x: unknown): x is Game { return typeof x === "string" && VALID_GAMES.has(x); }
function int(x: unknown, min: number, max: number) {
  return typeof x === "number" && Number.isInteger(x) && x >= min && x <= max;
}
function restHeaders(prefer?: string): HeadersInit {
  return { "apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY,
    "Content-Type": "application/json", ...(prefer ? {"Prefer":prefer} : {}) };
}
async function db(path: string, method = "GET", body?: unknown, prefer?: string): Promise<any> {
  const response = await fetch(BASE + path, {
    method, headers: restHeaders(prefer), body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!response.ok) {
    console.error("arcade_db", method, response.status);
    throw new Error("database_unavailable");
  }
  if(response.status===204)return null;
  const raw=await response.text();return raw?JSON.parse(raw):null;
}
async function top(game: Game): Promise<Entry[]> {
  const q = new URLSearchParams({select:"score,created_at,school_name,difficulty",game:"eq."+game,order:"score.desc,created_at.asc",limit:"10"});
  const list = await db("arcade_game_scores?" + q);
  return list.map((e:Entry)=>({score:e.score,created_at:e.created_at,school_name:e.school_name??null,difficulty:e.difficulty??null}));
}

type School = { school_id:string; school_name:string; sido_standard:string };
type Difficulty = "easy"|"normal"|"hard"|"very_hard"|"extreme";
type SchoolChoice = {
 school_id:string; school_name:string; region:string; difficulty:Difficulty|null;
 eligible:boolean; missing_years:number[]; available_years:number[];
 source_year:number|null; has_index:boolean;
};
async function searchSchools(raw:string):Promise<School[]>{
 const keyword=raw.trim().replace(/[^\p{L}\p{N}\s]/gu,"").slice(0,30);
 if(keyword.length<2)return [];
 const q=new URLSearchParams({select:"school_id,school_name,sido_standard",school_kind:"eq.초등학교",status:"eq.운영",school_name:"ilike.*"+keyword+"*",order:"school_name.asc",limit:"12"});
 return await db("schools?"+q);
}
async function resolveSchool(rawId:unknown):Promise<SchoolChoice|null>{
 if(typeof rawId!=="string"||!/^[0-9A-Za-z_-]{4,32}$/.test(rawId))return null;
 const q=new URLSearchParams({select:"school_id,school_name,sido_standard",school_id:"eq."+rawId,school_kind:"eq.초등학교",status:"eq.운영",limit:"1"});
 const rows=await db("schools?"+q) as School[];
 const school=rows[0];if(!school)return null;
 // At least one published, reviewed school percentile (2023–2026) is required.
 // Average only observed years: no missing-year imputation or zero scores.
 const years=[2023,2024,2025,2026];
 const p=new URLSearchParams({
   select:"survey_year,percentile",
   school_id:"eq."+school.school_id,
   survey_year:"in.(2023,2024,2025,2026)",
   publication_status:"eq.PUBLISHED",
   privacy_reviewed:"eq.true",
   limit:"4"
 });
 const annualRows=await db("beagu_school_report_yearly?"+p) as Array<{survey_year:number;percentile:number|null}>;
 const percentiles=new Map<number,number>();
 for(const row of annualRows){
   const raw=row.percentile;
   if(raw===null||raw===undefined||raw==="")continue;
   const value=Number(raw);
   if(Number.isFinite(value)&&value>=0&&value<=100&&years.includes(Number(row.survey_year)))
     percentiles.set(Number(row.survey_year),value);
 }
 const available_years=years.filter(year=>percentiles.has(year));
 const missing_years=years.filter(year=>!percentiles.has(year));
 const eligible=available_years.length>0;
 const average=eligible?available_years.reduce((sum,year)=>sum+(percentiles.get(year)??0),0)/available_years.length:null;
 const difficulty:Difficulty|null=average===null?null:(average>=80?"extreme":average>=60?"very_hard":average>=40?"hard":average>=20?"normal":"easy");
 // Send only a tier and year availability, not unpublished scores or individual survey values.
 return {school_id:school.school_id,school_name:school.school_name,region:school.sido_standard||"",
   difficulty,eligible,missing_years,available_years,source_year:eligible?Math.max(...available_years):null,has_index:eligible};
}

async function ipHash(req: Request): Promise<string> {
  const address = (req.headers.get("cf-connecting-ip")
    || req.headers.get("x-real-ip")
    || req.headers.get("x-forwarded-for")?.split(",")[0]
    || "unknown").trim().slice(0,120);
  const key = await crypto.subtle.importKey("raw",encoder.encode(SERVICE_KEY),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const mac = await crypto.subtle.sign("HMAC",key,encoder.encode("arcade-v1:" + address));
  return [...new Uint8Array(mac)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function validatedSurvivalSeconds(result:any,elapsed:number):number {
  // Legacy cached clients without survivalSeconds continue to work without a time bonus.
  if(result?.survivalSeconds===undefined)return 0;
  const seconds=result.survivalSeconds;
  if(!int(seconds,0,3600) || seconds>Math.floor(elapsed)+2)throw new Error("invalid_survival_time");
  return seconds;
}
function scoreFromVolleyball(result: any,elapsed:number,difficulty:any): number {
  const p=result?.player, c=result?.cpu, spikes=result?.spikes;
  if(!int(p,0,99)||!int(c,0,99)||!int(spikes,0,300))throw new Error("invalid_stats");
  if(result?.knockout!==undefined && typeof result.knockout!=="boolean")throw new Error("invalid_stats");
  const knockout=result?.knockout===true;
  const matchEnded=Math.max(p,c)>=7 && Math.abs(p-c)>=2;
  if(knockout){
    // A match can now finish early when the player's last life is depleted.
    // Validate the number of lives against the school's server-verified tier.
    const livesForTier=new Map([["easy",3],["normal",2],["hard",2],["very_hard",1],["extreme",1]]);
    const requiredLives=livesForTier.get(String(difficulty));
    if(!requiredLives||result.livesLost!==requiredLives)throw new Error("invalid_lives");
    if(matchEnded)throw new Error("invalid_match");
    if(result.survivalSeconds===undefined)throw new Error("invalid_survival_time");
  }else if(!matchEnded)throw new Error("invalid_match");
  const seconds=validatedSurvivalSeconds(result,elapsed);
  return p*120+Math.min(60,spikes)*25+
    (!knockout&&p>c?600+Math.max(0,7-c)*30:0)+Math.min(900,seconds*4);
}
function scoreFromVolleyball25(result:any,elapsed:number):number {
 const player=result?.player,cpu=result?.cpu,base=result?.baseScore,
       multiplier=result?.multiplier,final=result?.finalScore,victory=result?.victory;
 if(!int(player,0,25)||!int(cpu,0,25)||!int(base,0,2500)||
    !int(multiplier,1,6)||!int(final,0,15000)||typeof victory!=="boolean")
   throw new Error("invalid_stats");
 if((player!==25&&cpu!==25)||(player===25&&cpu===25))
   throw new Error("invalid_match");
 if(victory!==(player===25))throw new Error("invalid_victory");
 // Every completed rally takes game time; time is NOT a ranking factor.
 if(elapsed<Math.max(4,(player+cpu-1)*1.2))throw new Error("invalid_duration");
 const expectedBase=Math.max(0,player*100-cpu*50);
 const expectedMultiplier=player===25?1+Math.floor((25-cpu)/5):1;
 if(base!==expectedBase||multiplier!==expectedMultiplier||final!==expectedBase*expectedMultiplier)
   throw new Error("invalid_score");
 return final;
}
function scoreFromRetirement(result:any,elapsed:number):number {
 if(result?.survivalSeconds===undefined)throw new Error("invalid_survival_time");
 const score=result?.score,base=result?.baseScore,age=result?.age,
       victory=result?.victory,seconds=validatedSurvivalSeconds(result,elapsed);
 if(!int(base,0,100000)||!int(score,1,200000)||typeof victory!=="boolean"
   ||!int(age,24,62))throw new Error("invalid_stats");
 if(age!==Math.min(62,24+Math.floor(seconds/5)))throw new Error("invalid_age");
 if(victory){
   if(age!==62||seconds!==190||elapsed<188)throw new Error("invalid_retirement");
 }else if(seconds>=190)throw new Error("invalid_retirement");
 if(score!==base*(victory?2:1))throw new Error("invalid_retirement_score");
 if(base>Math.min(100000,Math.floor(seconds*220+4000)))
   throw new Error("invalid_score");
 return score;
}
function scoreFromRun(result: any, elapsed: number): number {
  const s = result?.score, day = result?.day, victory=result?.victory;
  if (!int(s,1,100000) || !int(day,1,5) || typeof victory !== "boolean") throw new Error("invalid_stats");
  if (victory && (day!==5 || elapsed<100)) throw new Error("invalid_duration");
  if (s>Math.min(100000,Math.floor(elapsed*220+4000))) throw new Error("invalid_score");
  if(result?.survivalSeconds!==undefined){
    const seconds=validatedSurvivalSeconds(result,elapsed);
    if(!int(result.baseScore,0,100000) || result.baseScore + seconds*10!==s)throw new Error("invalid_time_bonus");
    if(victory&&seconds<100)throw new Error("invalid_duration");
  }
  return s;
}
Deno.serve(async (req:Request)=>{
  const rawOrigin=req.headers.get("Origin");
  const origin=rawOrigin&&ALLOWED_ORIGINS.has(rawOrigin)?rawOrigin:"https://baeguindex.com";
  if(rawOrigin && !ALLOWED_ORIGINS.has(rawOrigin)) return error("origin_not_allowed",403,origin);
  if(req.method==="OPTIONS") return json({},200,origin);
  if(!SERVICE_KEY||!SUPA_URL) return error("not_configured",503,origin);
  try{
    if(req.method==="GET"){
      const params=new URL(req.url).searchParams;
      if(params.has("schools"))return json({schools:await searchSchools(params.get("schools")||"")},200,origin);
      if(params.has("school_id")){const school=await resolveSchool(params.get("school_id"));return school?json({school},200,origin):error("school_not_found",404,origin);}
      const game=params.get("game");
      if(!isGame(game))return error("invalid_game",400,origin);
      return json({game,top10:await top(game)},200,origin);
    }
    if(req.method!=="POST")return error("method_not_allowed",405,origin);
    if(Number(req.headers.get("content-length")||"0")>6000)return error("payload_too_large",413,origin);
    const payload=await req.json().catch(()=>null);
    if(!payload||typeof payload!=="object")return error("invalid_body",400,origin);
    const game=payload.game;
    if(!isGame(game))return error("invalid_game",400,origin);
    const hash=await ipHash(req);
    if(payload.action==="start"){
      const selected=await resolveSchool(payload.school_id);
      if(!selected)return error("select_school",400,origin);
      if(!selected.eligible)return json({error:"school_ineligible",missing_years:selected.missing_years,reason:"no_survey_year",survey_url:"https://forms.gle/TPyCakK6Sj2zchRy7"},409,origin);
      const since=new Date(Date.now()-15*60*1000).toISOString();
      const q=new URLSearchParams({select:"id",ip_hash:"eq."+hash,started_at:"gte."+since,limit:"40"});
      const recent=await db("arcade_game_sessions?"+q);
      if(recent.length>=40)return error("too_many_plays",429,origin);
      const rows=await db("arcade_game_sessions","POST",{game,ip_hash:hash,school_id:selected.school_id,school_name:selected.school_name,difficulty:selected.difficulty,percentile_source_year:selected.source_year},"return=representation");
      return json({session:rows[0].id,school:selected},200,origin);
    }
    if(payload.action!=="submit")return error("unknown_action",400,origin);
    const sessionId=payload.session;
    if(Object.prototype.hasOwnProperty.call(payload,"nickname"))return error("nickname_not_supported",400,origin);
    if(typeof sessionId!=="string"||!/^[0-9a-f-]{36}$/i.test(sessionId))return error("invalid_session",400,origin);
    const qs=new URLSearchParams({select:"id,game,ip_hash,started_at,submitted_at,school_id,school_name,difficulty",id:"eq."+sessionId,limit:"1"});
    const rows=await db("arcade_game_sessions?"+qs) as Session[];
    const session=rows[0];
    if(!session || session.game!==game || session.ip_hash!==hash || session.submitted_at)return error("session_expired",409,origin);
    if(!session.school_id||!session.school_name||!session.difficulty)return error("school_required",409,origin);
    const currentSchool=await resolveSchool(session.school_id);
    if(!currentSchool?.eligible||currentSchool.difficulty!==session.difficulty)
      return error("school_ineligible",409,origin);
    const elapsed=(Date.now()-Date.parse(session.started_at))/1000;
    if(elapsed<4||elapsed>3600)return error("invalid_duration",400,origin);
    let score:number;
    try {
      score=game==="volleyball"?scoreFromVolleyball(payload.stats,elapsed,session.difficulty):
         game==="volleyball_25"?scoreFromVolleyball25(payload.stats,elapsed):
         game==="teacher_run_retirement"?scoreFromRetirement(payload.stats,elapsed):
         scoreFromRun(payload.stats,elapsed);
    } catch(e) {return error(e instanceof Error?e.message:"invalid_stats",400,origin);}
    const existing=await top(game);
    if(existing.length>=10 && score<=existing[9].score){
      return json({ranked:false,score,top10:existing},200,origin);
    }
    // Persist the score BEFORE consuming the session. A transient insert failure
    // must not permanently invalidate a valid finished match.
    // A unique session_id plus ignore-duplicates makes concurrent submits safe.
    const inserted=await db(
      "arcade_game_scores?on_conflict=session_id&select=created_at",
      "POST",
      {session_id:session.id,game,score,school_id:session.school_id,school_name:session.school_name,difficulty:session.difficulty},
      "resolution=ignore-duplicates,return=representation"
    ) as Array<{created_at:string}>;
    if(!inserted?.length)return error("session_expired",409,origin);
    const patchQ=new URLSearchParams({id:"eq."+session.id,submitted_at:"is.null"});
    try{
      await db("arcade_game_sessions?"+patchQ,"PATCH",{submitted_at:new Date().toISOString()},"return=minimal");
    }catch(_err){
      // The unique score is safely stored even if the completion marker fails.
      console.error("arcade_completion_marker_failed");
    }
    const board=await top(game);
    // Anonymous entries are matched using the server-issued timestamp, score and school.
    const rank=board.findIndex(e=>e.score===score&&e.created_at===inserted[0].created_at&&e.school_name===session.school_name)+1;
    return json({ranked:rank>0,rank,score,top10:board},200,origin);
  }catch(e){
    console.error("arcade_error",e instanceof Error?e.message:"unknown");
    return error("service_unavailable",503,origin);
  }
});