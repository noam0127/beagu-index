(() => {
  'use strict';
  const get = id => document.getElementById(id);
  const panel = get('challengeReferralPanel');
  const linkField = get('challengeReferralLink');
  const copyButton = get('copyChallengeReferral');
  const status = get('challengeReferralStatus');
  const progress = get('challengeReferralProgress');
  const referralCount = get('challengeReferralCount');
  const retry = get('challengeReferralRetry');
  const share = get('shareChallengeReferral'), countHint=get('challengeReferralCountHint'), meter=get('challengeMilestoneProgress');
  const heading=get('challenge-levelup-title');
  const title = get('challengeReferralTitle');
  const tag = get('challengeReferralTag');
  const identityPanel = get('challengeIdentityPanel');
  const identityTitle = get('challengeIdentityTitle');
  const identityTag = get('challengeIdentityTag');
  const identityReward = get('challengeIdentityReward');
  const copyIdentityCode = get('copyIdentityCode');
  const vipMedal = get('challengeVipMedal');
  const certificateLevelBanner = get('certificateLevelBanner');
  const certificate = get('certificate');
  const certificateMedal = get('certificateMedal');
  const certificateThanks = get('certificateThanks');
  if (![panel, linkField, copyButton, status, progress, title, tag,
      identityPanel, identityTitle, identityTag, identityReward, copyIdentityCode, referralCount].every(Boolean)) return;

  const endpoint = SUPABASE_URL + '/functions/v1/beagu-referral-link-v1';
  const sessionKey = 'beagu-level-session-v1';
  const deviceKey = 'beagu-referral-device-secret-v1';
  let active = false;
  let generation = 0;
  let currentLink = '';
  let lastIdentity = null;
  let upgraded = false;
  let lastReferrals = 0;
  let lastSnapshot = '', activeToken='', referralKnown=false, serverPromotion=false;
  function ownerSessionMatches(){try{const t=sessionStorage.getItem(sessionKey);return /^[a-f0-9]{64}$/.test(t||'')&&t===sessionStorage.getItem('beagu-account-session-v1');}catch{return false;}}
  function missionState(){
    const reported=get('challengeAccountStatus')?.dataset.accountState||'checking';
    const accountState=reported==='verified'&&!ownerSessionMatches()?'checking':reported;
    const referralComplete=referralKnown&&lastReferrals>=1;
    const accountComplete=accountState==='verified';
    const verifiedLevel=Number(get('challengeAccessPanel')?.getAttribute('data-auth-level')||0);
    const achieved=referralComplete&&accountComplete&&serverPromotion;
    const legacy=active&&accountState==='unverified'&&(serverPromotion||verifiedLevel===2);
    return {accountState,referralComplete,accountComplete,achieved,legacy};
  }
  function renderMissions(){
    const m=missionState(),r=get('challengeMissionReferral'),a=get('challengeMissionAccount');
    if(r)r.dataset.state=!referralKnown?'checking':m.referralComplete?'complete':'pending';
    if(a)a.dataset.state=m.accountComplete?'complete':m.accountState==='checking'?'checking':'pending';
    const rt=get('challengeMissionReferralState'),at=get('challengeMissionAccountState'),summary=get('challengeMissionSummary');
    if(rt)rt.textContent=referralKnown?(m.referralComplete?'완료 · 1 / 1':'0 / 1'):'확인 중';
    if(at)at.textContent=m.accountComplete?'완료 · 로그인 인증':m.accountState==='checking'?'확인 중':'가입 또는 로그인 필요';
    if(summary)summary.textContent=m.achieved?'두 미션 완료 · Lv.2 활성화':m.legacy?'기존 Lv.2 달성 · 현재 혜택 유지 (포스트잇 이용 시 계정 필요)':m.referralComplete&&m.accountComplete?'두 미션 완료 · 서버 Lv.2 확인 중':'두 미션의 달성 순서는 자유롭습니다.';
    return m;
  }
  function renderMeter(count,known=true){
    if(countHint)countHint.textContent=known?'서버 확인 완료 기준':'현재 확인 중 · 숫자 미확정';
    if(meter){if(known)meter.setAttribute('aria-valuenow',String(Math.min(1,count)));else meter.removeAttribute('aria-valuenow');meter.dataset.complete=known&&count>=1?'true':'false';}
  }
  function renderState(earned,count=lastReferrals) {
    serverPromotion=earned===true;
    const mission=renderMissions();
    upgraded=mission.achieved;
    const premiumVisual=upgraded||mission.legacy;
    identityPanel.classList.toggle('is-lv2', premiumVisual);
    identityPanel.dataset.referralState = upgraded||(mission.legacy&&referralKnown&&count>=1) ? 'earned' : 'pending';
    identityTitle.textContent = upgraded ? 'Lv.2 참여코드' :
      mission.legacy ? '기존 Lv.2 달성 · 혜택 유지' : 'Lv.2 참여코드(비활성)';
    identityTag.textContent = upgraded ? '✓ Lv.2 인증 완료' :
      mission.legacy ? '기존 열람 권한' : '승급 대기';
    if(certificateLevelBanner)certificateLevelBanner.textContent = upgraded ? 'Lv.2 챌린지 달성' : mission.legacy ? '기존 Lv.2 참여 인증' : 'Lv.1 챌린지 달성';
    if(certificate)certificate.dataset.level = premiumVisual ? '2' : '1';
    if(heading)heading.textContent=upgraded||mission.legacy?'Lv.2 달성 · 추천 이어가기':'Lv.2로 레벨업하기';
    const canCopy=upgraded||(mission.legacy&&referralKnown&&count>=1);
    copyIdentityCode.hidden = !canCopy;
    copyIdentityCode.disabled = !canCopy || !lastIdentity;
    if(vipMedal)vipMedal.hidden=!upgraded;
    if(certificateMedal)certificateMedal.hidden=!premiumVisual;
    if(certificateThanks){
      const thanksCount=Math.floor(count/10)*10;
      const thanks=[
        '함께해 주신 선생님들 덕분에 변화가 시작됩니다.',
        '더 나은 교직문화를 위한 연대에 감사드립니다.',
        '선생님들의 목소리가 더 멀리 전해지고 있습니다.',
        '참여를 이어 주신 모든 분께 깊이 감사드립니다.'
      ];
      certificateThanks.hidden=thanksCount<10;
      certificateThanks.textContent=thanksCount>=10?
        '감사의 훈장 · 유효한 추천 '+thanksCount.toLocaleString('ko-KR')+'명 달성! '+thanks[(Math.floor(count/10)-1)%thanks.length]:'';
    }
    identityReward.hidden = !upgraded;
    identityReward.textContent = upgraded
      ? '🏅 공식 Lv.2 참여코드가 활성화되었습니다. 함께해 주셔서 감사합니다.'
      : '';
    copyIdentityCode.textContent = upgraded ? '코드 복사' : '번호 복사';

    // Invitation links must remain visible and copyable after promotion.
    title.textContent = '나의 전용 조사 링크';
    tag.textContent = '링크 공유하기';
    referralCount.textContent = count.toLocaleString('ko-KR') + '건';
    panel.dataset.state = upgraded ? 'earned' : 'pending';
    linkField.value = currentLink;
    linkField.setAttribute('aria-label', '내 전용 조사 링크');
    copyButton.textContent = '링크 복사';
    renderMeter(count,referralKnown);
    if(share){share.hidden=!currentLink;share.disabled=!currentLink;}
  }
  function reset() {
    ++generation;
    currentLink = '';
    linkField.value = '';
    linkField.hidden = true;
    copyButton.hidden = true;
    copyButton.disabled = true;
    progress.textContent = '';progress.hidden=true;
    lastReferrals=0;lastSnapshot='';referralKnown=false;serverPromotion=false;
    if(retry)retry.hidden=true;
    renderState(false,0);
    referralCount.textContent = '확인 중';renderMeter(0,false);
    status.textContent = '전용 조사 링크를 불러오고 있어요.';
  }
  function deviceSecret() {
    const existing = localStorage.getItem(deviceKey);
    if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const created = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(deviceKey, created);
    return created;
  }
  async function load(detail) {
    if (!active) return;
    const seq = ++generation;
    const token = sessionStorage.getItem(sessionKey) || '';
    if (!/^[a-f0-9]{64}$/.test(token)||token!==activeToken) return;
    if (!detail || typeof detail.visitor !== 'string' ||
        typeof detail.code !== 'string') return;
    lastIdentity = {visitor: detail.visitor, code: detail.code};
    if (!upgraded) status.textContent = '추천 현황 확인 중이에요.';
    try {
      const response = await fetch(endpoint, {
        method: 'POST', cache: 'no-store',
        headers: {'Content-Type': 'application/json', 'X-Beagu-Session': token},
        body: JSON.stringify({
          action: 'issue', visitor: detail.visitor, identityCode: detail.code,
          deviceSecret: deviceSecret()
        })
      });
      if (!active || seq !== generation || sessionStorage.getItem(sessionKey)!==token) return;
      const payload = await response.json().catch(() => ({}));
      if (!active || seq !== generation || sessionStorage.getItem(sessionKey)!==token) return;
      if (response.status === 503 && payload.error === 'REFERRAL_NOT_READY') {
        throw Object.assign(Error('REFERRAL_NOT_READY'),{status:503});
      }
      if (!response.ok) {const error=Error(payload.error || 'UNAVAILABLE');error.status=response.status;throw error;}
      if (typeof payload.link !== 'string' ||
          !/^https:\/\/baeguindex\.com\/survey\.html\?ref=[a-f0-9]{64}$/.test(payload.link))
        throw Error('INVALID_LINK');
      const rawCount=payload.validReferrals;
      if(typeof rawCount!=='number'||!Number.isSafeInteger(rawCount)||rawCount<0)throw Error('INVALID_REFERRAL_COUNT');
      const count=rawCount;
      currentLink = typeof payload.shortLink === 'string' &&
        /^https:\/\/baeguindex\.com\/r\/#[A-Za-z0-9_-]{8}$/.test(payload.shortLink)
        ? payload.shortLink : payload.link;
      linkField.hidden = false;
      if(retry)retry.hidden=true;
      copyButton.hidden = false;
      copyButton.disabled = false;

      // Only a server-approved, credited referral can upgrade the PERSONAL CODE.
      // A link visit, self-declared level, or incomplete payload cannot do so.
      const promoted = Number(payload.level) === 2 &&
        count >= 1 && payload.provisional === true;
      const newlyPromoted = promoted && !serverPromotion;
      lastReferrals=count;referralKnown=true;
      renderState(promoted,count);
      if(payload.deviceBound===true)window.dispatchEvent(new CustomEvent('beagu:challenge-device-verified',{detail:{code:detail.code}}));
      if (newlyPromoted) window.dispatchEvent(new Event('beagu:level-state-change'));
      progress.hidden=false;
      progress.textContent = upgraded?'Lv.2 달성 · 누적 유효 추천 '+count.toLocaleString('ko-KR')+'건':'유효한 추천 '+count.toLocaleString('ko-KR')+' / 1건 · '+(count>=1?'추천 미션 완료':'추천 미션 진행 중');
      const snapshot=(promoted?'2':'1')+':'+count;
      if(snapshot!==lastSnapshot){
        lastSnapshot=snapshot;
        window.dispatchEvent(new CustomEvent('beagu:referral-status-changed',
          {detail:{level:promoted?2:1,validReferrals:count}}));
      }
      const loginLevel = Number(get('challengeAccessPanel')?.getAttribute('data-auth-level') || 0);
      status.textContent = promoted
        ? '동료에게 링크를 보내세요. 설문 참여가 확인되면 추천이 누적됩니다.'
        : loginLevel >= 2
          ? '기존 Lv.2 열람 권한은 유지됩니다. 포스트잇 이용 시 계정 인증이 필요합니다.'
          : '동료에게 링크를 보내세요. 설문 참여가 확인되면 추천이 누적됩니다.';
    } catch (error) {
      if (!active || seq !== generation || sessionStorage.getItem(sessionKey)!==token) return;
      if(error?.status===401||error?.status===403){reset();window.dispatchEvent(new CustomEvent('beagu:referral-status-changed',{detail:{level:1,validReferrals:0}}));}
      else if(lastSnapshot){
        const before=certificateLevelBanner?.textContent;
        referralKnown=false;serverPromotion=false;renderState(false,lastReferrals);
        if(countHint)countHint.textContent='마지막으로 확인된 실적 · 새로고침 필요';
        if(before!==certificateLevelBanner?.textContent)
          window.dispatchEvent(new CustomEvent('beagu:referral-status-changed',{detail:{level:1,validReferrals:0}}));
      }
      if(retry)retry.hidden=false;
      if(error?.status===403)status.textContent='소유자 확인에 실패했습니다. 처음 코드를 발급받은 브라우저에서 확인하거나 저장 설정을 확인해 주세요.';
      else if(error?.status===401)status.textContent='인증이 만료되었습니다. 다시 인증한 뒤 링크를 확인해 주세요.';
      else status.textContent='전용 조사 링크를 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.';
    }
  }
  retry?.addEventListener('click',()=>{if(active&&lastIdentity)void load(lastIdentity)});
  copyButton.addEventListener('click', async () => {
    if (!active || !currentLink || sessionStorage.getItem(sessionKey)!==activeToken) return;
    try {
      await navigator.clipboard.writeText(currentLink);
      status.textContent = '전용 조사 링크를 복사했습니다.';
    } catch (_) {
      linkField.focus();
      linkField.select();
      status.textContent = '링크를 선택했습니다. 직접 복사해 주세요.';
    }
  });
  share?.addEventListener('click',async()=>{
    if(!active||!currentLink||sessionStorage.getItem(sessionKey)!==activeToken)return;
    const url=currentLink;
    try{if(typeof navigator.share==='function'){await navigator.share({title:'2026 배구지수 챌린지',text:'선생님들의 교직문화 조사에 함께해 주세요.',url});status.textContent='공유 요청을 전달했습니다.';}
      else{await navigator.clipboard.writeText(url);status.textContent='전용 조사 링크를 복사했습니다.';}}
    catch(error){if(error?.name==='AbortError')return;linkField.focus();linkField.select();status.textContent='링크를 선택했습니다. 직접 복사해 주세요.';}
  });
  window.addEventListener('beagu:challenge-access-granted', () => {const token=sessionStorage.getItem(sessionKey)||'';active=true;if(token!==activeToken){lastIdentity=null;activeToken=token;reset();}});
  window.addEventListener('beagu:challenge-access-revoked', () => {
    active = false; activeToken=''; lastIdentity = null; reset();
  });
  window.addEventListener('beagu:identity-ready', e => {void load(e.detail);});
  window.addEventListener('beagu:challenge-account-state',()=>{
    if(!active||sessionStorage.getItem(sessionKey)!==activeToken)return;
    const before=certificateLevelBanner?.textContent;
    renderState(serverPromotion,lastReferrals);
    if(!referralKnown){referralCount.textContent='확인 중';renderMeter(0,false);}
    if(before!==certificateLevelBanner?.textContent)
      window.dispatchEvent(new CustomEvent('beagu:referral-status-changed',{detail:{level:upgraded?2:1,validReferrals:lastReferrals}}));
  });

  window.addEventListener('focus', () => {
    if (active && lastIdentity) void load(lastIdentity);
  });
  document.addEventListener('visibilitychange', () => {
    if (active && lastIdentity && !document.hidden) void load(lastIdentity);
  });
  setInterval(() => {
    if (active && lastIdentity && !document.hidden) void load(lastIdentity);
  }, 60000);
  reset();
})();
