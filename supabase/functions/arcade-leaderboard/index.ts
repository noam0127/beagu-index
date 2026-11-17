// Public arcade ranking API. All database access is server-side through the service key.
// User-entered names are restricted to 2–8 ASCII letters. No profile or school information is requested.
const SUPA_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BASE = SUPA_URL + "/rest/v1/";
const ALLOWED_ORIGINS = new Set(["https://baeguindex.com","https://www.baeguindex.com","https://noam0127.github.io"]);
const VALID_GAMES = new Set(["volleyball","teacher_run"]);
const encoder = new TextEncoder();
const CACHE = "no-store";
type Game = "volleyball" | "teacher_run";
type Entry = { nickname: string; score: number; created_at: string };
type Session = { id: string; game: Game; ip_hash: string; started_at: string; submitted_at: string | null };

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
  const q = new URLSearchParams({select:"nickname,score,created_at",game:"eq."+game,order:"score.desc,created_at.asc",limit:"10"});
  const list = await db("arcade_game_scores?" + q);
  return list.map((e:Entry)=>({nickname:e.nickname,score:e.score,created_at:e.created_at}));
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
function scoreFromVolleyball(result: any): number {
  const p = result?.player, c = result?.cpu, spikes = result?.spikes;
  if (!int(p,0,99) || !int(c,0,99) || !int(spikes,0,300)) throw new Error("invalid_stats");
  if (Math.max(p,c)<7 || Math.abs(p-c)<2) throw new Error("invalid_match");
  return p*120 + Math.min(60,spikes)*25 +
    (p>c ? 600 + Math.max(0,7-c)*30 : 0);
}
function scoreFromRun(result: any, elapsed: number): number {
  const s = result?.score, day = result?.day, victory=result?.victory;
  if (!int(s,1,100000) || !int(day,1,5) || typeof victory !== "boolean") throw new Error("invalid_stats");
  if (victory && (day!==5 || elapsed<100)) throw new Error("invalid_duration");
  if (s>Math.min(100000,Math.floor(elapsed*220+4000))) throw new Error("invalid_score");
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
      const game=new URL(req.url).searchParams.get("game");
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
      const since=new Date(Date.now()-15*60*1000).toISOString();
      const q=new URLSearchParams({select:"id",ip_hash:"eq."+hash,started_at:"gte."+since,limit:"40"});
      const recent=await db("arcade_game_sessions?"+q);
      if(recent.length>=40)return error("too_many_plays",429,origin);
      const rows=await db("arcade_game_sessions","POST",{game,ip_hash:hash},"return=representation");
      return json({session:rows[0].id},200,origin);
    }
    if(payload.action!=="submit")return error("unknown_action",400,origin);
    const sessionId=payload.session, nickname=payload.nickname;
    if(typeof sessionId!=="string"||!/^[0-9a-f-]{36}$/i.test(sessionId))return error("invalid_session",400,origin);
    if(typeof nickname!=="string"||!/^[A-Z]{2,8}$/.test(nickname))return error("invalid_name",400,origin);
    const qs=new URLSearchParams({select:"id,game,ip_hash,started_at,submitted_at",id:"eq."+sessionId,limit:"1"});
    const rows=await db("arcade_game_sessions?"+qs) as Session[];
    const session=rows[0];
    if(!session || session.game!==game || session.ip_hash!==hash || session.submitted_at)return error("session_expired",409,origin);
    const elapsed=(Date.now()-Date.parse(session.started_at))/1000;
    if(elapsed<4||elapsed>3600)return error("invalid_duration",400,origin);
    let score:number;
    try {
      score=game==="volleyball" ? scoreFromVolleyball(payload.stats) : scoreFromRun(payload.stats,elapsed);
    } catch(e) {return error(e instanceof Error?e.message:"invalid_stats",400,origin);}
    const existing=await top(game);
    if(existing.length>=10 && score<=existing[9].score){
      return json({ranked:false,score,top10:existing},200,origin);
    }
    const patchQ=new URLSearchParams({id:"eq."+session.id,submitted_at:"is.null",select:"id"});
    const marked=await db("arcade_game_sessions?"+patchQ,"PATCH",{submitted_at:new Date().toISOString()},"return=representation");
    if(!marked?.length)return error("session_expired",409,origin);
    await db("arcade_game_scores","POST",{session_id:session.id,game,nickname,score},"return=minimal");
    const board=await top(game);
    const rank=board.findIndex(e=>e.nickname===nickname&&e.score===score)+1;
    return json({ranked:rank>0,rank,score,top10:board},200,origin);
  }catch(e){
    console.error("arcade_error",e instanceof Error?e.message:"unknown");
    return error("service_unavailable",503,origin);
  }
});