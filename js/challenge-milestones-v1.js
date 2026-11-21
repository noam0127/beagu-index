/* v1.1.0 Stage30 — purely decorative celebration for a verified
 * participant ordinal. Never use the public progress counter or infer
 * membership level from a milestone. No personal code enters the PNG. */
(()=>{
  'use strict';
  const certificate=document.getElementById('certificate');
  const card=document.getElementById('challengeMilestone');
  const symbol=document.getElementById('challengeMilestoneSymbol');
  const title=document.getElementById('challengeMilestoneTitle');
  const detail=document.getElementById('challengeMilestoneDetail');
  if(!certificate||!card||!symbol||!title||!detail)return;

  const milestones=Object.freeze({
    100:Object.freeze({symbol:'✦',title:'100번째, 특별한 시작',detail:'백 번째 참여를 축하합니다!'}),
    111:Object.freeze({symbol:'✧',title:'111번째, 반짝이는 순간',detail:'나란히 빛나는 숫자의 주인공이에요.'}),
    222:Object.freeze({symbol:'✦',title:'222번째, 두 배의 응원',detail:'뜻깊은 연속 숫자를 기념해요.'}),
    500:Object.freeze({symbol:'★',title:'500번째, 함께 만든 절반',detail:'1,000명 목표를 향한 소중한 이정표예요.'}),
    777:Object.freeze({symbol:'✹',title:'777번째, 행운의 주인공',detail:'특별한 숫자 777을 획득했어요!'}),
    1000:Object.freeze({symbol:'♛',title:'1,000번째, 목표 달성',detail:'배구지수 1,000명 챌린지의 이정표예요!'})
  });

  function clear(){
    card.hidden=true;
    certificate.removeAttribute('data-milestone');
    symbol.textContent='';
    title.textContent='';
    detail.textContent='';
  }

  function show(raw){
    // No numeric coercion: the caller must pass the validated, server-issued
    // safe integer, not a URL field / progress counter / arbitrary string.
    if(!Number.isSafeInteger(raw)||raw<1||!Object.hasOwn(milestones,raw)){
      clear();
      return false;
    }
    const picked=milestones[raw];
    certificate.dataset.milestone=String(raw);
    symbol.textContent=picked.symbol;
    title.textContent=picked.title;
    detail.textContent=picked.detail;
    card.hidden=false;
    return true;
  }
  clear();
  Object.defineProperty(window,'BeaguChallengeMilestones',{
    configurable:false,enumerable:false,writable:false,
    value:Object.freeze({show,clear})
  });
})();
