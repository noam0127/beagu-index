(()=>{"use strict";
const root=document.getElementById("adminAuto2026");if(!root)return;
let generation=0,owner=false,offset=0;
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);return n;};
async function call(body){const {data}=await supabaseClient.auth.getSession();const token=data?.session?.access_token;if(!token)throw Error("MFA");const res=await fetch("https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-2026-review-admin",{method:"POST",cache:"no-store",headers:{"content-type":"application/json","Authorization":"Bearer "+token,"apikey":typeof SUPABASE_PUBLISHABLE_KEY==="string"?SUPABASE_PUBLISHABLE_KEY:""},body:JSON.stringify(body)});if(!res.ok)throw Error("DENIED");return res.json();}
function button(label,fn){const b=el("button",label);b.type="button";b.className="secondary";b.onclick=async()=>{if(!owner||b.disabled)return;b.disabled=true;try{await fn();}catch{if(owner)message.textContent="처리 실패 · 최신 자료 및 MFA를 확인하세요.";}finally{b.disabled=false;}};return b;}
const message=el("p","관리자 인증 후 확인합니다.");message.setAttribute("role","status");
async function refresh(){if(!owner)return;const g=generation;const d=await call({action:"auto_status",offset});if(!owner||g!==generation)return;root.replaceChildren();
 const stats=el("p","전체 "+d.total+"개교 · 기술검사 "+d.structural_pass+"개교 · 자동 공개 적격 "+d.auto_ready+"개교 · 공개범위 확인 대기 "+d.scope_pending+"개교 · 검토 필요 "+d.review_required+"개교");root.append(el("h4","자동 공개 현황"),stats,el("p","자동 경로 공개 · Lv.1 2026 설문 비공개 · Lv.2 "+(d.auto_lv2??"—")+"개교"),button("새로고침",refresh),message);
 const master=el("section");master.append(el("h4","최종 마스터 즉시 반영"),el("p","검토 완료한 VI13 CSV를 업로드하면 백분위가 즉시 반영됩니다. 기존 공개중단·철회 및 검증 근거 미확인 자료는 제외됩니다. 문항별 상세자료는 이 파일에 포함되지 않습니다."));
 const source=el("select");source.setAttribute("aria-label","마스터 원본 버전");for(const v of d.source_versions||[]){const opt=el("option",v);opt.value=v;source.append(opt);}
 const file=el("input");file.type="file";file.accept=".csv,text/csv";file.setAttribute("aria-label","검토 완료 VI13 마스터 CSV");
 const result=el("p");result.setAttribute("role","status");
 const upload=button("검토 완료 마스터 업로드 · 즉시 반영",async()=>{const f=file.files?.[0];if(!f||f.size>1500000||!source.value){result.textContent="CSV 파일과 원본 버전을 선택하세요.";return;}const g=generation;const csv=await f.text();if(!owner||g!==generation)return;
 const res=await call({action:"manual_master_publish",source_version:source.value,csv,confirmation:"FINAL_MASTER_PUBLISH"});if(!owner||g!==generation)return;
 result.textContent="반영 적격 학교 "+res.eligible+"개교 · 기존 보호조건에 따른 제외 "+res.blocked+"개교 · 배치 "+res.batch_id;
 if(Number.isSafeInteger(res.batch_id)&&Object.hasOwn(res,"previous_batch"))master.append(button("직전 마스터 복원",async()=>{if(!window.confirm("직전 마스터를 복원하시겠습니까? 공개중단 조건은 계속 적용됩니다."))return;await call({action:"manual_master_restore",batch_id:res.previous_batch,expected_batch:res.batch_id,confirmation:"RESTORE_MASTER"});result.textContent="이전 마스터 복원 완료";}));
 });master.append(source,file,upload,result);root.append(master);
 root.append(el("p","기존 기술검사 관측수 일치 "+(d.qa_count_match??"—")+"개교 · 재집계 대기 "+(d.reaggregation_pending??"—")+"개교 · 비공개 계산 완료 "+(d.reaggregation_staged??"—")+"개교 · 결과 매칭 없음 "+(d.reaggregation_no_match??"—")+"개교"));
 const run=d.reaggregation;root.append(el("p",run?"최근 비공개 전국 재집계 "+run.started_at+" · "+run.schools+"개교 · 운영 후보 교체 전":"전국 재집계 실행 기록 없음"));
 const scope=el("details");scope.append(el("summary","공통 공개범위 확인"));const ver=el("select");for(const v of d.source_versions||[]){const opt=el("option",v);opt.value=v;ver.append(opt);}
 const note=el("textarea");note.placeholder="기존 조사 안내와 익명 범위 확인 근거 (12~500자)";note.maxLength=500;
 scope.append(ver,note,button("공통 공개범위 검토 저장",async()=>{if(note.value.trim().length<12||!window.confirm("기존 조사 안내와 익명 공개범위를 실제 확인하셨습니까? 미확인 학교를 공개하지 않습니다."))return;await call({action:"percentile_v13_scope",source_version:ver.value,decision:"COMPATIBLE",notice_compatible:true,anonymous_scope_reviewed:true,note:note.value.trim()});await refresh();}));root.append(scope);
 function card(row,isReport){const n=el("article");n.className="ranking-card";n.append(el("strong",row.school_name||row.school_id),el("p",isReport?row.detail:(row.reasons||[]).map(x=>({STRUCTURE:"기술검사 필요",EVIDENCE_UNVERIFIED:"기술·학교 매칭 또는 재식별 위험 검증 근거 미확인",HELD:"공개 보류"}[x]||x)).join(" · ")));
 if(row.reaggregation_state)n.append(el("p",({PENDING:"재집계 실행 대기",STAGED:"비공개 재집계 완료 · 공개 보류 유지",NO_MATCH:"재집계 결과 없음 · 공개 보류 유지"})[row.reaggregation_state]||"재집계 상태 확인 필요"));
 for(const [decision,label] of [["NORMAL","정상처리"],["HOLD","공개중단"],["REAGGREGATE","재집계 요청"]]){if(decision==="NORMAL"&&!isReport)continue;if(decision!=="NORMAL"&&!row.updated_at)continue;
 n.append(button(label,async()=>{const reason=window.prompt("처리 근거 (12~500자, 개인정보 금지)");if(reason===null||reason.trim().length<12)return;if(!window.confirm(label+"하시겠습니까? 원본 응답은 변경하지 않습니다."))return;
 await call({action:"auto_action",school_id:row.school_id,source_version:row.source_version,updated_at:row.updated_at,feedback_id:isReport?row.id:null,decision,reason:reason.trim()});message.textContent=decision==="REAGGREGATE"?"재집계 요청 기록 · 실행 전까지 공개 보류":"처리 기록 저장";await refresh();}));}
 return n;}
 root.append(el("h4","이용자 신고 데이터"));for(const r of d.reports||[])root.append(card(r,true));if(!(d.reports||[]).length)root.append(el("p","접수 내역 없음"));
 root.append(el("h4","자동 검토 의심 데이터"));for(const r of d.suspects||[])root.append(card(r,false));if(!(d.suspects||[]).length)root.append(el("p","검토 대상 없음"));
 if(offset>0)root.append(button("이전",async()=>{offset=Math.max(0,offset-50);await refresh();}));if(offset+50<Number(d.review_required))root.append(button("다음",async()=>{offset+=50;await refresh();}));
}
window.Beagu2026ReviewAdmin={mount(role){owner=role==="owner";generation++;offset=0;root.hidden=!owner;if(owner)void refresh().catch(()=>{if(owner){root.replaceChildren(message);message.textContent="자동 공개 상태 조회 실패";}});},reset(){owner=false;generation++;root.hidden=true;root.replaceChildren();}};
})();