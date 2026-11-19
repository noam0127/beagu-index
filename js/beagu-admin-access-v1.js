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

  function show(section, message, error = false) {
    for (const id of sections) $(id).hidden = id !== section;
    notice.textContent = message;
    notice.classList.toggle("error", error);
  }
  function warn(message) {
    notice.textContent = message;
    notice.classList.add("error");
  }
  function busy(value) {
    pending = value;
    document.querySelectorAll("button").forEach(button => { button.disabled = value; });
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
  async function authorized() {
    const proof = await gate("verify");
    if (!proof.permitted || !proof.mfa_verified) throw new Error("mfa_required");
    $("adminPassword").value = "";
    $("adminTotp").value = "";
    show("adminDashboard", "관리자 인증 완료 · 권한: " + proof.role);
  }
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
  async function logout() {
    if (pending) return;
    busy(true);
    try {
      await auth.signOut();
      activeFactorId = "";
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
