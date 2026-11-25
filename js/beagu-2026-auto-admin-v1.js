(()=>{"use strict";
const root=document.getElementById("adminAuto2026");if(!root)return;
let generation=0,owner=false,offset=0;
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);return n;};
async function call(body){const {data}=await window.supabaseClient.auth.getSession();const token=data?.session?.access_token;if(!token)throw Error("MFA");const res=await fetch("https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-2026-review-admin",{method:"POST",cache:"no-store",headers:{"content-type":"application/json","Authorization":"Bearer "+token,"apikey":window.SUPABASE_PUBLISHABLE_KEY||""},body:JSON.stringify(body)});if(!res.ok)throw Error("DENIED");return res.json();}
function button(label,fn){const b=el("button",label);b.type="button";b.className="secondary";b.onclick=async()=>{if(!owner||b.disabled)return;b.disabled=true;try{await fn();}catch{if(owner)message.textContent="처리 실패 · 최신 자료 및 MFA를 확인하세요.";}finally{b.disabled=false;}};return b;}
const message=el("p","관리자 인증 후 확인합니다.");message.setAttribute("role","status");
async function refresh(){if(!owner)return;const g=generation;const d=await call({action:"auto_status",offset});if(!owner||g!==generation)return;root.replaceChildren();
 const stats=el("p","전체 "+d.total+"개교 · 기술검사 "+d.structural_pass+"개교 · 자동 공개 적격 "+d.auto_ready+"개교 · 공개범위 확인 대기 "+d.scope_pending+"개교 · 검토 필요 "+d.review_required+"개교");root.append(el("h4","자동 공개 현황"),stats,button("새로고침",refresh),message);
 const scope=el("details");scope.append(el("summary","공통 공개범위 확인"));const ver=el("select");for(const v of d.source_versions||[]){const opt=el("option",v);opt.value=v;ver.append(opt);}
 const note=el("textarea");note.placeholder="기존 조사 안내와 익명 범위 확인 근거 (12~500자)";note.maxLength=500;
 scope.append(ver,note,button("공통 공개범위 검토 저장",async()=>{if(note.value.trim().length<12||!window.confirm("기존 조사 안내와 익명 공개범위를 실제 확인하셨습니까? 미확인 학교를 공개하지 않습니다."))return;await call({action:"percentile_v13_scope",source_version:ver.value,decision:"COMPATIBLE",notice_compatible:true,anonymous_scope_reviewed:true,note:note.value.trim()});await refresh();}));root.append(scope);
 function card(row,isReport){const n=el("article");n.className="ranking-card";n.append(el("strong",row.school_name||row.school_id),el("p",isReport?row.detail:(row.reasons||[]).map(x=>({STRUCTURE:"기술검사 필요",EVIDENCE_UNVERIFIED:"익명성·응답 검증 근거 미확인",HELD:"공개 보류"}[x]||x)).join(" · ")));
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