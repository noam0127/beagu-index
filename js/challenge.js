(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const status = byId('status'), capture = byId('capture'), retry = byId('retry');
  const participantNo = byId('participantNo');
  const identityCode = byId('identityCode'), copyIdentityCode = byId('copyIdentityCode');
  const identityCopyFeedback = byId('identityCopyFeedback');
  const identityEndpoint = SUPABASE_URL + '/functions/v1/beagu-challenge-identity';
  const levelSessionKey = 'beagu-level-session-v1';
  let imageUrl = null, participant = null, personalCode = null, busy = false, accessGranted = false, certificateRefreshPending = false;
  let epoch=0, certificateRevision=0, activeSession="";
  const currentSession=()=>{try{return sessionStorage.getItem(levelSessionKey)||"";}catch(_){return "";}};
  function renderMilestone(n){
    const card=byId("certificateMilestone"),title=byId("certificateMilestoneTitle");
    if(!card||!title)return;
    const special=Number.isSafeInteger(n)&&n>=100&&(n%100===0||/^([1-9])\1\1$/.test(String(n)));
    card.hidden=!special;title.textContent=special?n.toLocaleString("ko-KR")+"번째 특별한 이정표":"";
    byId("certificate")?.classList.toggle("has-milestone",special);
  }
  function invalidateImage(){certificateRevision++;capture.disabled=true;if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=null;}
  function resetIdentity(){participant=null;personalCode=null;participantNo.textContent="순번 확인 중";identityCode.textContent="고유번호 확인 중";copyIdentityCode.disabled=true;identityCopyFeedback.textContent="";renderMilestone(null);invalidateImage();}
  const deadline = (promise, ms, message) => {
    let timer;
    return Promise.race([Promise.resolve(promise), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })]).finally(() => clearTimeout(timer));
  };

  async function prepare() {
    if (!accessGranted || busy) return;
    const mine=epoch;const tokenAtStart=activeSession;
    const valid=()=>accessGranted&&epoch===mine&&currentSession()===tokenAtStart;
    busy = true;
    capture.disabled = true;
    retry.hidden = true;
    retry.disabled = true;
    try {
      if (!window.beaguVisitor) throw new Error('STORAGE_UNAVAILABLE');
      if (participant === null || personalCode === null) {
        status.textContent = '참여 순번과 고유번호를 확인하고 있습니다.';
        identityCode.textContent = '고유번호 확인 중';
        let sessionToken = '';
        try { sessionToken = sessionStorage.getItem(levelSessionKey) || ''; } catch (_) {}
        if (!sessionToken) throw new Error('레벨1 인증이 필요합니다. 다시 인증해 주세요.');
        const response = await deadline(fetch(identityEndpoint, {
          method: 'POST', cache: 'no-store',
          headers: { 'Content-Type': 'application/json', 'X-Beagu-Session': sessionToken },
          body: JSON.stringify({ action: 'issue', visitor: window.beaguVisitor })
        }), 15000, '연결이 지연되고 있습니다. 다시 시도해주세요.');
        if (!valid()) return;
        if (response.status === 401 || response.status === 403) throw new Error('레벨1 인증이 만료되었습니다. 다시 인증해 주세요.');
        if (!response.ok) throw new Error('고유번호 발급에 실패했습니다. 다시 시도해주세요.');
        const data = await response.json();
        if (!valid()) return;
        const n = Number(data.participantNo);
        const code = data.identityCode;
        if (!Number.isSafeInteger(n) || n < 1 ||
            typeof code !== 'string' || !/^(?:BG26-(?:[A-F0-9]{4}-){4}[A-F0-9]{4}|BG26-[A-HJ-NP-Z2-9]{6}-[A-HJ-NP-Z2-9]{6}|[A-HJ-NP-Z2-9]{10})$/.test(code)) {
          throw new Error('발급 결과를 확인하지 못했습니다. 다시 시도해주세요.');
        }
        participant = n;
        personalCode = code;
        participantNo.textContent = n.toLocaleString('ko-KR') + '번째';
        renderMilestone(n);
        identityCode.textContent = code;
        copyIdentityCode.disabled = byId('challengeIdentityPanel')?.dataset.referralState !== 'earned';
        identityCopyFeedback.textContent = '';
        // Referral display is separate from the certificate PNG and requires a validated session.
        window.dispatchEvent(new CustomEvent('beagu:identity-ready', {
          detail: { visitor: window.beaguVisitor, code: personalCode }
        }));
        if (window.BeaguChallengeProgress) await window.BeaguChallengeProgress.refresh();
      }
      if (!valid()) return;
      status.textContent = '인증 이미지를 준비하고 있습니다.';
      if (typeof html2canvas !== 'function') throw new Error('이미지 기능을 불러오지 못했습니다. 페이지를 새로고침해주세요.');
      if (document.fonts) await deadline(document.fonts.ready, 10000, '글꼴 로딩이 지연되고 있습니다. 다시 시도해주세요.');
      if (!valid()) return;
      // Strictly capture only public information. Never serialize the whole page.
      const root=byId('certificate');
      if(!root || root.querySelector('#identityCode,#challengeReferralLink,#challengeReferralPanel,#challengeIdentityPanel,[data-referral-secret]') ||
         (personalCode && root.textContent.includes(personalCode)))
        throw new Error('개인 코드 노출 위험으로 인증 이미지 생성을 차단했습니다.');
      const revision=certificateRevision;
      const canvas = await deadline(html2canvas(root, {
        scale: 2, backgroundColor: '#ffffff', logging: false
      }), 20000, '이미지 생성이 지연되고 있습니다. 다시 시도해주세요.');
      const blob = await deadline(new Promise(resolve => canvas.toBlob(resolve, 'image/png')), 10000, '이미지 변환에 실패했습니다. 다시 시도해주세요.');
      if (!blob) throw new Error('이미지를 생성하지 못했습니다. 다시 시도해주세요.');
      if (!valid()||revision!==certificateRevision) return;
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      imageUrl = URL.createObjectURL(blob);
      capture.disabled = false;
      status.textContent = '';
    } catch (error) {
      if(!valid())return;
      if (participant === null) participantNo.textContent = '순번 조회 실패';
      if (personalCode === null) {
        identityCode.textContent = '고유번호 발급 실패';
        copyIdentityCode.disabled = true;
      }
      status.textContent = error.message === 'STORAGE_UNAVAILABLE'
        ? '브라우저 저장 공간을 허용한 뒤 페이지를 새로고침해주세요.'
        : error.message || '처리하지 못했습니다. 다시 시도해주세요.';
      retry.hidden = false;
    } finally {
      busy = false;
      retry.disabled = false;
      if(certificateRefreshPending && accessGranted){
        certificateRefreshPending=false;
        void prepare();
      }
    }
  }

  capture.addEventListener('click', () => {
    if (!accessGranted || !imageUrl || currentSession()!==activeSession) return;
    try {
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = '2026-배구지수-챌린지.png';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      status.textContent = '이미지 저장을 요청했습니다. 브라우저의 다운로드 목록에서 확인해 주세요.';
    } catch (_) {
      status.textContent = '이미지 저장에 실패했습니다. 다시 시도해주세요.';
    }
  });

  copyIdentityCode.addEventListener('click', async () => {
    if (!accessGranted || currentSession()!==activeSession || !personalCode || byId('challengeIdentityPanel')?.dataset.referralState !== 'earned') return;
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('UNAVAILABLE');
      await navigator.clipboard.writeText(personalCode);
      const confirmedLv2 = byId('challengeIdentityPanel')?.dataset.referralState === 'earned';
      identityCopyFeedback.textContent = confirmedLv2
        ? 'Lv2 참여코드를 복사했습니다. 개인적으로 보관해 주세요.'
        : '고유번호를 복사했습니다. 개인적으로 보관해 주세요.';
    } catch (_) {
      identityCopyFeedback.textContent = '복사가 지원되지 않습니다. 번호를 길게 눌러 직접 복사해 주세요.';
    }
  });

  retry.addEventListener('click', prepare);
  // 뒤로가기로 복원되는 페이지에서는 이미지 URL을 유지합니다.
  window.addEventListener('pagehide', event => {
    if (!event.persisted && imageUrl) URL.revokeObjectURL(imageUrl);
  });
  window.addEventListener('beagu:challenge-access-revoked', () => {
    accessGranted=false;activeSession="";epoch++;certificateRefreshPending=false;resetIdentity();
    status.textContent="";retry.hidden=true;
  });
  window.addEventListener('beagu:referral-status-changed', () => {
    if(!accessGranted)return;
    invalidateImage();
    if(busy){certificateRefreshPending=true;return;}
    void prepare();
  });
  window.addEventListener('beagu:challenge-access-granted', () => {
    const token=currentSession();
    if(!token)return;
    if(token!==activeSession){epoch++;activeSession=token;resetIdentity();}
    accessGranted=true;
    if(busy){certificateRefreshPending=true;return;}
    void prepare();
  });
})();

