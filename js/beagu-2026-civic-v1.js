(()=>{"use strict";
const anchor=document.querySelector(".latest-year-status");if(!anchor)return;
const panel=document.createElement("section");panel.className="beagu-civic-panel";
const button=document.createElement("button");button.type="button";button.id="civicReport";button.textContent="의심 데이터 신고";panel.append(button);anchor.after(panel);
const id=()=>{const p=new URLSearchParams(location.search),v=p.get("school_id")||p.get("school")||"";return /^[A-Z0-9]{7}$/.test(v)?v:null;};
const nonce=()=>{let v;try{v=sessionStorage.getItem("beagu-civic-device-v1");if(!v){v=crypto.randomUUID();sessionStorage.setItem("beagu-civic-device-v1",v);}}catch{v=crypto.randomUUID();}return v;};
button.onclick=async()=>{const school=id();if(!school||button.disabled)return;const input=window.prompt("자료 신고 사유 (12~500자, 개인정보 금지)");if(input===null)return;const detail=input.trim();if(detail.length<12||detail.length>500){window.alert("신고 사유를 12~500자로 입력해 주세요.");return;}button.disabled=true;
try{const res=await fetch("https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-2026-civic",{method:"POST",cache:"no-store",headers:{"content-type":"application/json","x-beagu-client":nonce()},body:JSON.stringify({action:"simple_report",school_id:school,detail})});if(!res.ok)throw Error("FAILED");window.alert("신고가 접수됐습니다.");}catch{window.alert("신고 접수 실패 · 사유 또는 요청 횟수를 확인하세요.");}finally{button.disabled=false;}};
})();
