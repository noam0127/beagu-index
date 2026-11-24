/* Admin login is separate from the Lv.0/1/2 participation-code system.
 * No visit-stats, school-search telemetry, or game scripts are loaded on this page.
 * The server alone decides administrative membership and requires an AAL2 token.
 */
(() => {
  "use strict";
  const api = SUPABASE_URL + "/functions/v1/beagu-admin-access";
  const auth = supabaseClient.auth;
  const $ = (id) => document.getElementById(id);
  const notice = $("adminNotice");
  const sections = ["adminLogin","adminMfa","adminDashboard"];
  let activeFactorId = "";
  let pending = false;
  let period='7d',scale='day',dashboard=null,requestSeq=0,liveSeq=0,liveTimer=null;

  function show(section, message, error = false) {
    for (const id of sections) $(id).hidden = id !== section;
    if(section!=="adminDashboard")window.BeaguHomeNoticeAdmin?.reset();
    notice.textContent = message;
    notice.classList.toggle("error", error);
  }
  function warn(message) {
    notice.textContent = message;
    notice.classList.add("error");
  }
  function busy(value) {
    pending = value;
    document.querySelectorAll("button").forEach(button => { if(!button.closest("#adminHomeNoticeSection"))button.disabled = value; });
  }
  async function gate(action) {
    const {data, error} = await auth.getSession();
    const token = data?.session?.access_token;
    if (error || !token) throw new Error("session_required");
    const response = await fetch(api, {
      method:"POST", cache:"no-store",
      headers: {
        "Authorization":"Bearer " + token,
        "apikey":SUPABASE_PUBLISHABLE_KEY,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({action})
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(json.error || "admin_gate_unavailable");
      err.status = response.status;
      throw err;
    }
    return json;
  }
  const num=v=>v==null?"미수집":Number.isFinite(Number(v))?Number(v).toLocaleString("ko-KR"):"미수집";
  const make=(tag,cls="",txt)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(txt!==undefined)el.textContent=String(txt);return el};
  const errMessage="통계 API에 연결하지 못했습니다. 관리자 인증 상태와 서버 설정을 확인해 주세요.";
  function fill(kind,info){
    document.querySelectorAll("[data-"+kind+"]").forEach(el=>{
      const k=el.dataset[kind],v=info?.[k];
      el.textContent=kind==="search"&&k==="conversion_rate"?(v==null?"계산 불가":num(v)+"%"):
        num(v);
    });
  }
  function keyFor(day){
    if(scale==="day")return day;
    if(scale==="month")return day.slice(0,7);
    const d=new Date(day+"T00:00:00Z");
    if(Number.isNaN(d.getTime()))return day;
    d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
    return d.toISOString().slice(0,10);
  }
  function renderChart(id,rows,metric){
    const root=$(id);root.replaceChildren();
    const groups=new Map();
    for(const d of rows||[]){
      const day=String(d.day||"");
      if(!/^\d{4}-\d{2}-\d{2}$/.test(day))continue;
      const k=keyFor(day);groups.set(k,(groups.get(k)||0)+(Number(d[metric])||0));
    }
    const values=[...groups].sort((a,b)=>a[0].localeCompare(b[0])).slice(-60);
    if(!values.length){root.append(make("p","empty","해당 기간의 기록이 없습니다."));return;}
    const max=Math.max(1,...values.map(x=>x[1]));
    for(const [day,count] of values){
      const col=make("div","bar-col"),bar=make("div","bar-rect");
      bar.style.height=Math.max(2,Math.round(count/max*120))+"px";
      col.title=day+" · "+num(count)+"건";col.setAttribute("aria-label",col.title);
      col.append(bar);root.append(col);
    }
  }
  function renderRanks(){
    const root=$("adminSchoolRanking");root.replaceChildren();
    if(!dashboard)return;
    const mode=$("adminSchoolRankingMode").value;
    const rows=mode==="views"?dashboard.school_views?.top:mode==="selected"?dashboard.top_selected:mode==="searched"?dashboard.top_searched:
      mode==="detailed"?dashboard.top_detailed:dashboard.game_schools;
    const field=mode==="views"?"views":mode==="played"?"plays":"hits";
    const term=$("adminSchoolRankingSearch").value.trim().toLocaleLowerCase("ko");
    const matched=(rows||[]).filter(x=>String(x.school_name||"").toLocaleLowerCase("ko").includes(term))
      .sort((a,b)=>(Number(b[field])||0)-(Number(a[field])||0));
    if(!matched.length){root.append(make("p","empty",term?"일치하는 학교가 없습니다.":"해당 기간에 저장된 학교별 기록이 없습니다."));return;}
    matched.forEach((v,i)=>{
      const row=make("div","rank-line");
      row.append(make("span","rank-number",String(i+1).padStart(2,"0")),
        make("span","rank-school",v.school_name||v.school_id||"학교 미등록"),
        make("span","rank-count",num(v[field])+"회"));root.append(row);
    });
  }
  function renderGames(){
    const root=$("adminGameCards");root.replaceChildren();
    const named=[["선생님배구","volleyball"],["험난한 교직생활","teacher_run"],["나의 OO한 학급일지","visual_novel"]];
    for(const [name,code] of named){
      const card=make("article","game-stat");card.append(make("h4","",name));
      const data=(dashboard?.games||[]).find(g=>g.game===code);
      if(code==="visual_novel"){card.append(make("p","empty","영구 이용 통계 미수집"));root.append(card);continue;}
      card.append(make("strong","game-value",num(data?.plays??0)+"회"));
      const details=make("dl");
      for(const [k,v] of [["완료한 게임",num(data?.completed??0)+"회"],
        ["완료율",data?.completion_rate==null?"계산 불가":num(data.completion_rate)+"%"],
        ["완료 게임 평균 시간",data?.average_seconds==null?"기록 없음":num(data.average_seconds)+"초"]]){
        details.append(make("dt","",k),make("dd","",v));
      }
      card.append(details);root.append(card);
    }
    const list=$("adminGameDifficulty");list.replaceChildren();
    const rows=dashboard?.game_difficulty||[];
    if(!rows.length)list.append(make("p","empty","난이도별 기록이 없습니다."));
    rows.forEach(row=>list.append(make("span","pill",row.difficulty+" · "+num(row.plays)+"회")));
  }
  function renderScores(){
    const root=$("adminGameScores");root.replaceChildren();
    const now=Date.now();
    const today=new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Seoul"});
    const scores=(dashboard?.retained_game_scores||[]).filter(row=>{
      const t=Date.parse(row.created_at);
      if(!Number.isFinite(t))return false;
      if(period==="today")return new Date(t).toLocaleDateString("sv-SE",{timeZone:"Asia/Seoul"})===today;
      if(period==="7d")return now-t<=7*86400000;
      if(period==="30d")return now-t<=30*86400000;
      return true;
    }).sort((a,b)=>Number(b.score)-Number(a.score)).slice(0,15);
    if(!scores.length){root.append(make("p","empty","현재 기간에 보관된 최고점 기록이 없습니다."));return;}
    const names={volleyball:"선생님배구",volleyball_25:"선생님배구",teacher_run:"험난한 교직생활",teacher_run_retirement:"험난한 교직생활"};
    scores.forEach((v,i)=>{
      const line=make("div","rank-line");
      line.append(make("span","rank-number",i+1),
        make("span","rank-school",(names[v.game]||"게임")+" · "+(v.school_name||"학교 미등록")),
        make("span","rank-count",num(v.score)+"점"));root.append(line);
    });
  }
  function renderAudit(){
    const root=$("adminAudit");root.replaceChildren();
    const rows=dashboard?.security?.recent||[];
    if(!rows.length){root.append(make("p","empty","해당 기간에 관리자 감사 기록이 없습니다."));return;}
    rows.forEach(entry=>{
      const line=make("div","audit-line");
      const when=entry.occurred_at?new Date(entry.occurred_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",hour12:false}):"기록 시간 없음";
      line.append(make("span","event",String(entry.event_type)+" · "+String(entry.outcome)),make("time","muted",when));
      root.append(line);
    });
  }
  function showLiveTraffic(data){
    const count=Number(data?.active_browsers_5m);
    $("adminOnlineCount").textContent=Number.isSafeInteger(count)&&count>=0?num(count)+"명":"집계 확인 불가";
    const root=$("adminHourlyChart");root.replaceChildren();
    const slots=new Map((Array.isArray(data?.hourly_visits)?data.hourly_visits:[]).map(row=>[Number(row.hour),Number(row.views)||0]));
    const max=Math.max(1,...slots.values());
    for(let hour=0;hour<24;hour++){
      const views=Math.max(0,slots.get(hour)||0);
      const col=make("div","bar-col");
      const rect=make("div","bar-rect");
      rect.style.height=(views?Math.max(2,Math.round(views/max*116)):0)+"px";
      const label=make("small","hour-label",String(hour).padStart(2,"0"));
      col.title=hour+"시–"+(hour+1)+"시 · "+num(views)+"회";
      col.setAttribute("aria-label",col.title);
      col.append(rect,label);root.append(col);
    }
    const when=data?.as_of?new Date(data.as_of).toLocaleTimeString("ko-KR",{timeZone:"Asia/Seoul",hour12:false}):"시각 확인 불가";
    $("adminLiveAsOf").textContent="최근 갱신 "+when+" · 30초마다 자동 확인 · 동시 접속은 5분 활동 기준 추정치";
  }
  const perfPages={
    'index':'홈','search':'학교검색 Lv.0','search-lv1':'학교검색 Lv.1',
    'statistics':'학교비교','school-report':'학교 상세','result':'조사결과',
    'challenge':'챌린지','volleyball':'선생님배구','teacher-run':'험난한 교직생활'
  };
  const perfActions={
    'navigation':'페이지 로딩','school_search':'학교 검색',
    'school_selection':'학교 선택','compare_directory':'비교 목록'
  };
  function renderPerformance(data){
    const root=$("adminPerfRows");
    root.replaceChildren();
    if(!data||!Array.isArray(data.rows)){
      const line=make("tr"),cell=make("td","empty","측정 자료를 가져오지 못했습니다.");
      cell.colSpan=7;line.append(cell);root.append(line);
      $("adminPerfAsOf").textContent="속도 통계 확인 불가 · 다음 자동 갱신에서 재시도합니다.";
      return;
    }
    const rows=data.rows.filter(item=>item && typeof item.page==='string' &&
      typeof item.operation==='string' && Number.isSafeInteger(Number(item.samples)) &&
      Number(item.samples)>0);
    if(!rows.length){
      const line=make("tr"),cell=make("td","empty","아직 수집된 성능 표본이 없습니다.");
      cell.colSpan=7;line.append(cell);root.append(line);
    }
    const ms=value=>Number.isFinite(Number(value))&&value!=null?
      Math.round(Number(value)).toLocaleString("ko-KR")+"ms":"—";
    rows.sort((a,b)=>String(a.page).localeCompare(String(b.page))||
      String(a.operation).localeCompare(String(b.operation)));
    for(const item of rows){
      const row=make("tr");
      row.append(make("td","perf-page",perfPages[item.page]||item.page),
        make("td","",perfActions[item.operation]||item.operation),
        make("td","",num(item.samples)),
        make("td","",ms(item.p50_ms)),
        make("td","",ms(item.p90_ms)),
        make("td","",ms(item.p99_ms)));
      const rate=item.operation==='navigation'?"측정 안 함":
        (Number.isFinite(Number(item.failure_rate))?Number(item.failure_rate).toFixed(1)+"%":"—");
      row.append(make("td","perf-rate",rate));
      root.append(row);
    }
    const when=data.as_of?new Date(data.as_of).toLocaleTimeString("ko-KR",
      {timeZone:"Asia/Seoul",hour12:false}):"시각 확인 불가";
    $("adminPerfAsOf").textContent="최근 측정 갱신 "+when+
      " · 측정 표본 "+num(rows.reduce((sum,item)=>sum+Number(item.samples),0))+
      "건 · 적은 표본의 P99는 참고용";
  }
  function renderTelemetryHealth(data){
    const fields=["guard_attempts","guard_allowed","guard_source_limited","guard_id_rotation_limited","saved_visits_24h"];
    for(const field of fields){
      const el=document.querySelector('[data-telemetry="'+field+'"]');
      if(el)el.textContent=data&&data[field]!=null?num(data[field]):"확인 불가";
    }
    const status=$("adminTelemetryAsOf");
    const monitor=$("adminTelemetryHourlyStatus");
    if(!data){
      status.textContent="보호 통계를 가져올 수 없습니다. 다음 갱신에서 재시도합니다.";
      monitor.textContent="자동 점검 상태 확인 불가 · 실시간 접속과는 별도로 확인이 필요합니다.";
      return;
    }
    const attempts=Number(data.guard_attempts);
    const last=data.latest_saved_visit?
      new Date(data.latest_saved_visit).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",hour12:false}):
      "지난 24시간 방문 저장 기록 없음";
    const sample=Number.isSafeInteger(attempts)&&attempts>=30?"":" · 아직 적은 계측 표본";
    status.textContent="최근 저장 방문: "+last+" · 24시간 검사 합계"+sample;
    const m=data.hourly_monitor;
    if(!m||!m.checked_at){
      monitor.textContent="자동 점검 예정 · 완료된 시간대의 첫 평가를 기다립니다.";
      return;
    }
    const elapsed=Date.now()-Date.parse(m.checked_at);
    const when=new Date(m.window_start).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",hour12:false});
    if(!Number.isFinite(elapsed)||elapsed>150*60000){
      monitor.textContent="자동 점검 지연 · 마지막 검사 "+when+" 시작 시간대";
      return;
    }
    const types=Array.isArray(m.alert_codes)?m.alert_codes:[];
    if(m.status==="warning"){
      const reasons=[];
      if(types.includes("rejections"))reasons.push("요청 제한 비율 증가");
      if(types.includes("visit_gap_suspected"))reasons.push("통과한 방문 대비 저장 기록 누락 의심");
      monitor.textContent="확인 필요 · "+(reasons.join(" · ")||"통계 이상")+" · "+when+" 시작 시간대 (확정된 장애나 오탐은 아님)";
    }else if(m.status==="normal"){
      monitor.textContent="표본 기준 내 이상 신호 없음 · "+when+" 시작 시간대 · HTTP 5xx는 별도 점검";
    }else{
      monitor.textContent="표본 부족 · "+when+" 시작 시간대 · 장애 없음으로 확정하지 않음";
    }
  }
  async function refreshLiveTraffic(){
    if(document.hidden||$("adminDashboard").hidden)return;
    const seq=++liveSeq,requestedPeriod=period;
    const {data,error}=await auth.getSession();
    if(error||!data?.session?.access_token)throw Error("session_required");
    const response=await fetch(SUPABASE_URL+"/functions/v1/beagu-admin-dashboard-v1",{
      method:"POST",cache:"no-store",
      headers:{"Content-Type":"application/json","apikey":SUPABASE_PUBLISHABLE_KEY,
               "Authorization":"Bearer "+data.session.access_token},
      body:JSON.stringify({action:"live_traffic",period:requestedPeriod})
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.traffic)throw Error("traffic_unavailable");
    if(seq!==liveSeq||requestedPeriod!==period)return;
    showLiveTraffic(payload.traffic);
    renderPerformance(payload.performance);
    renderTelemetryHealth(payload.telemetry_health);
  }
  function refreshLiveSafely(){
    void refreshLiveTraffic().catch(()=>{
      $("adminLiveAsOf").textContent="실시간 통계를 갱신하지 못했습니다. 연결과 관리자 인증을 확인하세요.";
      $("adminOnlineCount").textContent="확인 불가";
      $("adminPerfAsOf").textContent="속도 통계를 갱신하지 못했습니다. 다음 갱신에서 재시도합니다.";
      renderTelemetryHealth(null);
    });
  }
  function renderReferralFunnel(data){
    const root=$("adminReferralFunnelRows");
    root.replaceChildren();
    const status=$("adminReferralFunnelStatus");
    if(!data||!Array.isArray(data.rows)){
      const tr=make("tr"),td=make("td","empty","추천 링크 통계 조회 실패 · 다시 확인해 주세요.");
      td.colSpan=7;tr.append(td);root.append(tr);
      status.textContent="추천 링크 통계 서버를 확인하지 못했습니다.";
      return;
    }
    const term=$("adminReferralCodeSearch").value.trim().toLowerCase();
    const rows=data.rows.filter(x=>x&&typeof x.code==="string"&&
      x.code.toLowerCase().includes(term));
    if(!rows.length){
      const tr=make("tr"),td=make("td","empty",
        term?"해당하는 전용코드가 없습니다.":"전용 링크 발급 기록이 없습니다.");
      td.colSpan=7;tr.append(td);root.append(tr);
    }
    for(const x of rows){
      const tr=make("tr");
      for(const value of [
        x.code, num(x.opened),num(x.proof_issued),num(x.handoffs),
        num(x.credited),num(x.form_events),num(x.lifetime_valid)
      ])tr.append(make("td","",value));
      root.append(tr);
    }
    const when=data.as_of?new Date(data.as_of).toLocaleString("ko-KR",
      {timeZone:"Asia/Seoul",hour12:false}):"시각 확인 불가";
    const note=data.period==="all"?" · 접속 기록은 최근 30일만":"";
    status.textContent="집계 "+when+" · "+num(rows.length)+"개 코드 표시"+note+
      " · 과거 링크 접속 이력은 소급하지 않습니다.";
  }
  function displayDashboard(data){
    dashboard=data;
    for(const [name,object] of [["site",data.site],["search",data.search],["view",data.school_views],
      ["level",data.levels],["challenge",data.challenge],["security",data.security]])fill(name,object);
    renderChart("adminVisitChart",data.visit_trend,"views");
    renderChart("adminSearchChart",data.search_trend,"searches");
    renderChart("adminGameChart",data.game_trend,"plays");
    renderRanks();renderGames();renderScores();renderAudit();renderReferralFunnel(data.referral_funnel);
    $("adminDataAsOf").textContent="집계 시각: "+new Date(data.as_of).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",hour12:false})+" · 개인정보 비표시";
  }
  async function loadMetrics(){
    const seq=++requestSeq;
    $("adminDataAsOf").textContent="통계를 불러오는 중입니다.";
    const {data,error}=await auth.getSession();
    if(error||!data?.session?.access_token)throw new Error("session_required");
    const response=await fetch(SUPABASE_URL+"/functions/v1/beagu-admin-dashboard-v1",{
      method:"POST",cache:"no-store",
      headers:{"Content-Type":"application/json","apikey":SUPABASE_PUBLISHABLE_KEY,"Authorization":"Bearer "+data.session.access_token},
      body:JSON.stringify({action:"dashboard",period})
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){const ex=new Error(payload.error||"dashboard_unavailable");ex.status=response.status;throw ex;}
    if(seq!==requestSeq)return;
    if(!payload.analytics||typeof payload.analytics!=="object")throw Error("invalid_response");
    displayDashboard(payload.analytics);
    refreshLiveSafely();
  }
  document.querySelectorAll("[data-period]").forEach(button=>button.addEventListener("click",async()=>{
    period=button.dataset.period;
    document.querySelectorAll("[data-period]").forEach(btn=>btn.setAttribute("aria-pressed",String(btn===button)));
    try{await loadMetrics()}catch{warn(errMessage);}
  }));
  document.querySelectorAll("[data-scale]").forEach(button=>button.addEventListener("click",()=>{
    scale=button.dataset.scale;
    document.querySelectorAll("[data-scale]").forEach(btn=>btn.setAttribute("aria-pressed",String(btn===button)));
    if(dashboard){
      renderChart("adminVisitChart",dashboard.visit_trend,"views");
      renderChart("adminSearchChart",dashboard.search_trend,"searches");
      renderChart("adminGameChart",dashboard.game_trend,"plays");
    }
  }));
  $("adminSchoolRankingMode").addEventListener("change",renderRanks);
  $("adminSchoolRankingSearch").addEventListener("input",renderRanks);
  $("adminReferralCodeSearch").addEventListener("input",()=>{
    if(dashboard)renderReferralFunnel(dashboard.referral_funnel);
  });
  $("adminReferralFunnelReload").addEventListener("click",()=>{
    void loadMetrics().catch(()=>{$("adminReferralFunnelStatus").textContent=
      "새로고침 실패 · 관리자 인증 또는 서버 연결을 확인해 주세요.";});
  });
  async function authorized() {
    const proof = await gate("verify");
    if (!proof.permitted || !proof.mfa_verified) throw new Error("mfa_required");
    $("adminPassword").value = "";
    $("adminTotp").value = "";
    show("adminDashboard", "관리자 인증 완료 · 권한: " + proof.role);
    window.Beagu2026ReviewAdmin?.mount(proof.role);
     window.BeaguCivicAdmin?.mount(proof.role);
    window.BeaguMembersAdmin?.mount(proof.role);
    window.BeaguHomeNoticeAdmin?.mount(proof.role);
    await loadMetrics();
    if(liveTimer===null)liveTimer=window.setInterval(()=>{
      if(!document.hidden&&!$("adminDashboard").hidden)refreshLiveSafely();
    },30000);
  }
  document.addEventListener("visibilitychange",()=>{
    if(!document.hidden&&!$("adminDashboard").hidden)refreshLiveSafely();
  });
  async function chooseFactor() {
    const {data, error} = await auth.mfa.listFactors();
    if (error) throw error;
    const verified = (data?.totp || []).filter(f => f.status === "verified");
    $("adminQrWrap").hidden = true;
    $("adminEnroll").hidden = verified.length > 0;
    $("adminMfaForm").hidden = verified.length === 0;
    activeFactorId = verified[0]?.id || "";
    $("adminMfaIntro").textContent = verified.length
      ? "등록된 인증 앱에서 생성된 6자리 코드를 입력해 주세요."
      : "관리자 접근에는 인증 앱 등록이 필요합니다. 인증 앱 등록하기를 눌러 진행하세요.";
    show("adminMfa", "2단계 인증을 완료해야 관리자 화면에 접근할 수 있습니다.");
  }
  async function restore() {
    const {data} = await auth.getSession();
    if (!data?.session) {
      show("adminLogin", "관리자 계정으로 로그인해 주세요.");
      return;
    }
    try {
      const status = await gate("status");
      if (!status.permitted) throw new Error("access_denied");
      if (status.mfa_required) await chooseFactor();
      else await authorized();
    } catch (error) {
      if (error.status === 401 || error.status === 403 || error.message === "access_denied") {
        await auth.signOut();
        show("adminLogin", "관리자 계정으로 로그인해 주세요. 계정의 권한을 확인할 수 없습니다.", true);
      } else {
        show("adminLogin", "인증 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.", true);
      }
    }
  }
  $("adminLoginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (pending) return;
    busy(true);
    try {
      const email = $("adminEmail").value.trim();
      const password = $("adminPassword").value;
      const { error } = await auth.signInWithPassword({email,password});
      $("adminPassword").value = "";
      if (error) throw new Error("invalid_credentials");
      await restore();
    } catch (error) {
      warn(error.message === "invalid_credentials"
        ? "이메일 또는 비밀번호를 확인해 주세요."
        : "로그인할 수 없습니다. 관리자 권한이나 인증 설정을 확인해 주세요.");
    } finally { busy(false); }
  });
  $("adminEnroll").addEventListener("click", async () => {
    if (pending) return;
    busy(true);
    try {
      const {data,error} = await auth.mfa.enroll({factorType:"totp",friendlyName:"배구지수 관리자"});
      if (error || !data?.id) throw error || Error("enroll_failed");
      activeFactorId = data.id;
      const qr = data.totp?.qr_code || "";
      if (!qr.startsWith("data:image/svg+xml")) throw Error("invalid_qr");
      $("adminQr").src = qr;
      $("adminQrWrap").hidden = false;
      $("adminEnroll").hidden = true;
      $("adminMfaForm").hidden = false;
      notice.textContent = "인증 앱에 등록한 뒤 표시된 6자리 코드를 입력해 주세요.";
      notice.classList.remove("error");
    } catch { warn("인증 앱을 등록할 수 없습니다. 관리자에게 설정을 확인해 주세요."); }
    finally { busy(false); }
  });
  $("adminMfaForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (pending) return;
    const code = $("adminTotp").value.trim();
    if (!/^[0-9]{6}$/.test(code) || !activeFactorId) {
      warn("인증 앱의 6자리 숫자를 입력해 주세요.");return;
    }
    busy(true);
    try {
      const {error} = await auth.mfa.challengeAndVerify({factorId:activeFactorId,code});
      if (error) throw error;
      await authorized();
    } catch {
      $("adminTotp").value = "";
      warn("2단계 인증이 완료되지 않았습니다. 코드를 확인하고 다시 시도해 주세요.");
    } finally {busy(false);}
  });
  $("adminPasswordChangeForm").addEventListener("submit",async event=>{
    event.preventDefault();
    if(pending)return;
    const first=$("adminNewPassword"),second=$("adminConfirmPassword"),status=$("adminPasswordFeedback");
    const password=first.value;
    if(password.length<16||password!==second.value){
      status.textContent="16자 이상인 같은 비밀번호를 두 칸에 입력해 주세요.";
      return;
    }
    busy(true);status.textContent="변경 요청 중입니다.";
    try{
      await gate("verify");
      const {error}=await auth.updateUser({password});
      if(error)throw error;
      status.textContent="비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용하세요.";
      first.value="";second.value="";
    }catch{
      status.textContent="비밀번호를 변경하지 못했습니다. 다시 인증한 뒤 시도해 주세요.";
      first.value="";second.value="";
    }finally{busy(false);}
  });

  async function logout() {
    if (pending) return;
    busy(true);
    try {
      await auth.signOut();
      activeFactorId = "";
      dashboard=null;requestSeq++;
      $("adminReferralFunnelRows").replaceChildren();
      $("adminReferralFunnelStatus").textContent="인증 후 표시됩니다.";
      $("adminReferralCodeSearch").value="";
      window.Beagu2026ReviewAdmin?.reset();
       window.BeaguCivicAdmin?.reset();
      window.BeaguMembersAdmin?.reset();
      $("adminPassword").value = "";
      $("adminTotp").value = "";
      $("adminQrWrap").hidden = true;
      show("adminLogin", "로그아웃했습니다.");
    } finally {busy(false);}
  }
  $("adminLogout").addEventListener("click", logout);
  $("adminMfaLogout").addEventListener("click", logout);
  void restore();
})();
