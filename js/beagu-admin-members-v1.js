/* Admin member directory. Browser holds no service-role credentials. */
(() => {
  "use strict";
  const api = SUPABASE_URL + "/functions/v1/beagu-admin-members-v1";
  const $ = id => document.getElementById(id);
  let ready = false, role = "", search = "", page = 1, memberStatus = "all", memberSort = "newest";
  let total = 0, pageSize = 20, selectedId = "", serial = 0, pending = false;
  const text = (id, value) => { $(id).textContent = value; };
  const node = (tag, cls, value) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (value != null) e.textContent = String(value);
    return e;
  };
  const date = value => {
    if (!value) return "기록 없음";
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? "기록 없음" :
      parsed.toLocaleString("ko-KR", {timeZone:"Asia/Seoul",hour12:false});
  };
  // Display-only masking; server authorization is enforced separately.
  function maskEmail(value) {
    const email = String(value || "");
    const at = email.lastIndexOf("@");
    if (at < 1) return "이메일 없음";
    if (email.slice(1, at) === "***") return email;
    return email.slice(0, 1) + "***" + email.slice(at);
  }
  function smsStatus(item) {
    if (item.sms_status === "consented")
      return item.sms_phone_verified ? "수신 동의 · 번호 확인" : "수신 동의 · 번호 미인증";
    if (item.sms_status === "withdrawn") return "동의 철회";
    if (item.sms_status === "not_consented") return "동의 안 함";
    return "동의 기록 없음";
  }
  async function request(action, args = {}) {
    const {data, error} = await supabaseClient.auth.getSession();
    if (error || !data?.session?.access_token) throw new Error("session_required");
    const response = await fetch(api, {
      method:"POST", cache:"no-store",
      headers: {
        "Content-Type":"application/json",
        "apikey":SUPABASE_PUBLISHABLE_KEY,
        "Authorization":"Bearer " + data.session.access_token,
      },
      body:JSON.stringify({action,...args}),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      const err = new Error(result.error || "member_service_unavailable");
      err.status = response.status;
      throw err;
    }
    return result.data;
  }
  function status(message, error = false) {
    text("adminMembersStatus", message);
    $("adminMembersStatus").classList.toggle("admin-members-error", error);
  }
  function showRows(rows) {
    const body = $("adminMembersRows");
    body.replaceChildren();
    if (!rows.length) {
      const tr = node("tr"), td = node("td", "empty", "해당하는 회원이 없습니다.");
      td.colSpan = 6;
      tr.append(td);body.append(tr);return;
    }
    for (const member of rows) {
      const tr = node("tr");
      const email = node("td");
      email.append(node("strong", "member-email", maskEmail(member.email)),
        node("small", "member-id", "회원 식별번호 비공개"));
      const memberType = member.is_admin ? "관리자" : "일반 회원";
      tr.append(email, node("td", "", memberType),
        node("td", "", member.email_confirmed ? "인증 완료" : "이메일 미인증"),
        node("td", "", member.lv2_account_linked ? "계정 연결됨" : "연결 기록 없음"),
        node("td", "", member.is_suspended ? "이용 정지" : "정상"));
      const action = node("td");
      const button = node("button", "secondary member-mini-action", "상세");
      button.type = "button";
      button.addEventListener("click", () => { void showDetail(member.id); });
      action.append(button);tr.append(action);
      body.append(tr);
    }
  }
  async function refresh() {
    if (!role) return;
    const seq = ++serial;
    status("회원 목록을 불러오는 중입니다.");
    $("adminMembersPrev").disabled = true;
    $("adminMembersNext").disabled = true;
    $("adminMemberDetailPanel").hidden = true;
    selectedId = "";
    try {
      const data = await request("list", {page,search,status:memberStatus,sort:memberSort});
      if (seq !== serial || !role) return;
      total = data.total_matches;
      pageSize = data.page_size;
      text("adminMembersTotal", Number(data.total_users_scanned).toLocaleString("ko-KR"));
      text("adminMembersAdminCount", Number(data.total_admins_scanned).toLocaleString("ko-KR"));
      text("adminMembersUnconfirmed", Number(data.unconfirmed_scanned).toLocaleString("ko-KR"));
      text("adminMembersSuspended", Number(data.suspended_scanned).toLocaleString("ko-KR"));
      for (const [id, field] of [
        ["adminMembersConfirmed","confirmed_scanned"],
        ["adminMembersRecentLogin","recent_login_30d"],
        ["adminMembersLinked","linked_member_accounts"],
        ["adminChallengeCodes","challenge_2026_codes"],
        ["adminReferralProfiles","challenge_2026_referral_profiles"],
        ["adminVerifiedReferrers","challenge_2026_verified_referrers"],
      ]) {
        const value = data[field];
        text(id, Number.isSafeInteger(Number(value)) && value != null && Number(value) >= 0
          ? Number(value).toLocaleString("ko-KR") : "—");
      }
      showRows(data.rows || []);
      const pages = Math.max(1, Math.ceil(total / pageSize));
      text("adminMembersPage", page + " / " + pages);
      $("adminMembersPrev").disabled = page <= 1;
      $("adminMembersNext").disabled = page >= pages;
      const scanned = Number(data.total_users_scanned).toLocaleString("ko-KR");
      status(total.toLocaleString("ko-KR") + "명 검색됨 · 인증 계정 " + scanned + "개 조회" +
        (data.truncated ? " · 최대 4,000개 계정 내 검색 · 전체 회원 통계 아님" : "") +
        " · 참여코드 발급자 수와는 다릅니다.");
    } catch {
      if (seq !== serial || !role) return;
      showRows([]);
      total = 0;
      text("adminMembersPage", "— / —");
      status("회원 목록을 불러오지 못했습니다. 관리자 인증 상태 또는 연결을 확인해 주세요.", true);
    }
  }
  function row(label, value) {
    const line = node("div","admin-member-detail-line");
    line.append(node("dt","",label),node("dd","",value));
    return line;
  }
  function populateDetails(info) {
    const panel = $("adminMemberDetailPanel"), root = $("adminMemberDetail");
    root.replaceChildren();
    const member = info.profile;
    const dl = node("dl","admin-member-details");
    dl.append(
      row("이메일", maskEmail(member.email)),
      row("회원 ID", "개인정보 보호를 위해 숨김"),
      row("계정 유형", member.is_admin ? "관리자 · " + member.admin_role : "일반 회원"),
      row("이메일 인증", member.email_confirmed ? "완료" : "미완료"),
      row("계정 생성", date(member.created_at)),
      row("최근 로그인", date(member.last_sign_in_at)),
      row("계정 상태", member.is_suspended ? "이용 정지 · " + date(member.banned_until) + "까지" : "정상"),
      row("챌린지 계정 연결", member.lv2_account_linked ? "계정 연결됨 · " + date(member.lv2_linked_at) : "연결 기록 없음"),
      row("문자 안내", smsStatus(member))
    );
    const challenge = info.challenge;
    const challengeTitle = node("h5","","2026 챌린지 연결 정보");
    root.append(dl, challengeTitle);
    const challengeDetails = node("dl","admin-member-details");
    if (!challenge) {
      challengeDetails.append(row("조회 상태","조회 API 미적용 · 서버 업데이트 후 확인"));
    } else if (!challenge.linked) {
      challengeDetails.append(row("추천 권한 검증","Lv2 확인 불가 · Lv1 여부는 별도 인증 기록 확인 필요"));
    } else {
      const ordinal = Number(challenge.participant_no);
      const referrals = Number(challenge.valid_referrals);
      const level = Number(challenge.access_level);
      challengeDetails.append(
        row("추천 권한 검증","유효 추천으로 Lv2 확인"),
        row("챌린지 순번",Number.isSafeInteger(ordinal) && ordinal > 0 ? ordinal.toLocaleString("ko-KR") + "번" : "확인 불가"),
        row("추천 접근 레벨",Number.isInteger(level) && level >= 2 ? "Lv." + level : "확인 불가"),
        row("유효 추천 수",Number.isSafeInteger(referrals) && referrals >= 0 ? referrals.toLocaleString("ko-KR") + "건" : "확인 불가")
      );
    }
    root.append(challengeDetails);
    const logTitle = node("h5","","최근 회원 관리 기록");
    root.append(logTitle);
    const history = info.moderation_history || [];
    if (!history.length) root.append(node("p","subtle","기록 없음"));
    else for (const event of history) {
      const details = event.details || {};
      root.append(node("p","admin-member-history",
        date(event.occurred_at) + " · " + event.event_type +
        (typeof details.reason === "string" ? " · 사유: " + details.reason : "")));
    }
    const canModerate = role === "owner" && !member.is_admin;
    $("adminMemberModeration").hidden = !canModerate;
    $("adminMemberSuspend24").hidden = member.is_suspended;
    $("adminMemberSuspend7").hidden = member.is_suspended;
    $("adminMemberRestore").hidden = !member.is_suspended;
    text("adminMemberActionStatus",canModerate
      ? "정지는 새 로그인에 적용됩니다. 이미 발급된 세션·참여코드까지 즉시 무효화하지 않습니다."
      : "계정 상태를 조회할 수 있습니다. 관리자 계정은 이 메뉴에서 정지할 수 없습니다.");
    panel.hidden = false;
  }
  async function showDetail(id) {
    selectedId = id;
    $("adminMemberDetailPanel").hidden = false;
    text("adminMemberActionStatus","회원 상세 정보를 확인하는 중입니다.");
    try {
      const info = await request("detail",{user_id:id});
      if (!role || selectedId !== id) return;
      populateDetails(info);
    } catch {
      if (selectedId === id)
        text("adminMemberActionStatus","상세 정보를 불러오지 못했습니다. 다시 시도해 주세요.");
    }
  }
  async function moderate(operation) {
    if (pending || role !== "owner" || !selectedId) return;
    const reason = $("adminMemberReason").value.trim();
    if (reason.length < 8 || reason.length > 200) {
      text("adminMemberActionStatus","처리 사유를 8~200자로 입력해 주세요.");return;
    }
    const label = operation === "suspend_24h" ? "24시간 정지" :
      operation === "suspend_7d" ? "7일 정지" : "정지 해제";
    if (!window.confirm("선택한 회원에 대해 '" + label + "' 작업을 실행할까요?")) return;
    pending = true;
    for (const button of document.querySelectorAll("[data-member-operation]")) button.disabled = true;
    text("adminMemberActionStatus",label + " 처리 중입니다.");
    try {
      const result = await request("moderate", {user_id:selectedId,operation,reason});
      $("adminMemberReason").value = "";
      await showDetail(selectedId);
      await refresh();
      text("adminMemberActionStatus",result.audit_recorded === true
        ? label + " 처리 완료 · 감사 기록 저장"
        : label + " 적용됨 · 감사 기록 저장 실패: 추가 조치 전 관리자 점검 필요");
    } catch {
      text("adminMemberActionStatus","처리를 확인하지 못했습니다. 상태 및 감사 기록을 다시 조회해 주세요.");
    } finally {
      pending = false;
      for (const button of document.querySelectorAll("[data-member-operation]")) button.disabled = false;
    }
  }
  function prepareListeners() {
    if (ready) return;
    ready = true;
    $("adminMembersFilter").addEventListener("change", () => {
      memberStatus = $("adminMembersFilter").value;page = 1;void refresh();
    });
    $("adminMembersSort").addEventListener("change", () => {
      memberSort = $("adminMembersSort").value;page = 1;void refresh();
    });
    $("adminMembersSearchForm").addEventListener("submit", event => {
      event.preventDefault();search = $("adminMembersSearch").value.trim();page = 1;
      selectedId = "";$("adminMemberDetailPanel").hidden = true;
      void refresh();
    });
    $("adminMembersClear").addEventListener("click", () => {
      $("adminMembersSearch").value = "";search = "";page = 1;
      memberStatus = "all";memberSort = "newest";
      $("adminMembersFilter").value = memberStatus;
      $("adminMembersSort").value = memberSort;
      selectedId = "";$("adminMemberDetailPanel").hidden = true;
      void refresh();
    });
    $("adminMembersReload").addEventListener("click",() => {void refresh();});
    $("adminMembersPrev").addEventListener("click",() => {
      if (page <= 1) return;page--;void refresh();
    });
    $("adminMembersNext").addEventListener("click",() => {
      if (page * pageSize >= total) return;page++;void refresh();
    });
    $("adminMemberClose").addEventListener("click",() => {
      selectedId = "";$("adminMemberDetailPanel").hidden = true;
    });
    document.querySelectorAll("[data-member-operation]").forEach(button => {
      button.addEventListener("click",()=>{void moderate(button.dataset.memberOperation);});
    });
  }
  function mount(adminRole) {
    role = String(adminRole || "");
    prepareListeners();
    page = 1;search = "";memberStatus = "all";memberSort = "newest";selectedId = "";
    $("adminMembersFilter").value = memberStatus;
    $("adminMembersSort").value = memberSort;
    $("adminMembersSearch").value = "";
    $("adminMemberDetailPanel").hidden = true;
    void refresh();
  }
  function reset() {
    role = "";serial++;selectedId = "";page = 1;search = "";total = 0;
    $("adminMemberDetailPanel").hidden = true;
    $("adminMembersRows").replaceChildren();
    for (const id of ["adminMembersTotal","adminMembersAdminCount",
      "adminMembersUnconfirmed","adminMembersSuspended",
      "adminMembersConfirmed","adminMembersRecentLogin","adminMembersLinked",
      "adminChallengeCodes","adminReferralProfiles","adminVerifiedReferrers"]) text(id,"—");
    status("관리자 인증 후 표시됩니다.");
  }
  window.BeaguMembersAdmin = {mount,reset};
})();
