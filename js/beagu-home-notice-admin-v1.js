/* Homepage footer notice editor; called only after the existing admin MFA gate. */
(() => {
  "use strict";
  const el = id => document.getElementById(id);
  const endpoint = SUPABASE_URL + "/functions/v1/beagu-home-notice-v1";
  const form = el("adminHomeNoticeForm");
  if (!form) return;
  const input = el("adminHomeNoticeText");
  const preview = el("adminHomeNoticePreview");
  const count = el("adminHomeNoticeCount");
  const status = el("adminHomeNoticeStatus");
  const updated = el("adminHomeNoticeUpdated");
  const save = el("adminHomeNoticeSave");
  const cancel = el("adminHomeNoticeReset");
  let saved = "", revision = null, loading = false, mounted = false, loadSequence = 0;
  const fail = text => { status.textContent = text; status.classList.add("error"); };
  const info = text => { status.textContent = text; status.classList.remove("error"); };
  const render = () => {
    const value = input.value;
    const dirty = value !== saved;
    preview.textContent = value || "본문 미입력";
    count.textContent = value.length.toLocaleString("ko-KR") + " / 1000자";
    save.disabled = loading || revision == null || !dirty || !value.trim() || value.length > 1000;
    cancel.disabled = loading || !dirty;
  };
  const read = async () => {
    const response = await fetch(endpoint, {
      method: "GET", cache: "no-store",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || typeof data.body !== "string" || !Number.isSafeInteger(data.revision))
      throw Error("read_failed");
    return data;
  };
  const mount = async () => {
    mounted = true;
    const seq = ++loadSequence;
    loading = true; revision = null;
    info("현재 게시 중인 공지를 불러오는 중입니다.");
    render();
    try {
      const data = await read();
      if (!mounted || seq !== loadSequence) return;
      saved = data.body;
      revision = data.revision;
      input.value = saved;
      updated.textContent = data.updated_at
        ? "마지막 저장: " + new Date(data.updated_at).toLocaleString("ko-KR") : "";
      info("현재 게시 중인 문구입니다. 수정 후 저장하면 홈에 반영됩니다.");
    } catch {
      if (mounted && seq === loadSequence) fail("공지사항을 불러오지 못했습니다. 화면을 새로고침해 주세요.");
    } finally {
      if (mounted && seq === loadSequence) { loading = false; render(); }
    }
  };
  const reset = () => {
    mounted = false;
    ++loadSequence;
    saved = ""; revision = null; loading = false;
    input.value = "";
    updated.textContent = "";
    info("관리자 인증 후 공지를 불러옵니다.");
    render();
  };
  input.addEventListener("input", render);
  cancel.addEventListener("click", () => {
    input.value = saved;
    info("저장하지 않은 수정을 취소했습니다.");
    render();
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (loading || revision == null || !input.value.trim() || input.value.length > 1000
        || input.value === saved) return;
    const noticeBody = input.value.replace(/\r\n?/g, "\n").trim();
    const requestRevision = revision;
    const { data, error } = await supabaseClient.auth.getSession();
    if (error || !data?.session?.access_token) { fail("관리자 로그인이 만료됐습니다. 다시 로그인해 주세요."); return; }
    loading = true;
    info("서버에 저장하는 중입니다.");
    render();
    try {
      const response = await fetch(endpoint, {
        method: "POST", cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_PUBLISHABLE_KEY,
          "Authorization": "Bearer " + data.session.access_token
        },
        body: JSON.stringify({ action: "save", body: noticeBody, revision: requestRevision })
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 409) {
        fail("다른 곳에서 공지가 먼저 수정되었습니다. 새로고침 후 다시 작성해 주세요.");
        return;
      }
      if (!response.ok || typeof result.body !== "string" || !Number.isSafeInteger(result.revision))
        throw Error(result.error || "save_failed");
      saved = result.body;
      revision = result.revision;
      input.value = saved;
      updated.textContent = result.updated_at
        ? "마지막 저장: " + new Date(result.updated_at).toLocaleString("ko-KR") : "";
      info("공지사항이 저장되었습니다. 홈을 새로 열면 변경된 문구가 표시됩니다.");
    } catch (e) {
      fail(e?.message === "mfa_required" ? "2단계 인증이 필요합니다. 다시 로그인해 주세요."
        : "저장에 실패했습니다. 네트워크와 관리자 인증 상태를 확인해 주세요.");
    } finally {
      loading = false;
      render();
    }
  });
  window.BeaguHomeNoticeAdmin = { mount, reset };
  render();
})();
