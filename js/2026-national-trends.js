/* Public, high-sample nationwide 2026 modes only.
 * Absolutely no school-level identifiers, response counts or free text.
 */
(()=>{"use strict";
 const root=document.getElementById("beagu2026NationalTrends");
 if(!root)return;
 const selected=["Q01","Q02","Q04","Q06","Q10","Q13"];
 const catalog=window.Beagu2026Questionnaire||{};
 const add=(name,className,text)=>{
  const el=document.createElement(name);if(className)el.className=className;
  if(text!==undefined)el.textContent=String(text);return el;
 };
 const message=(text)=>{
  root.replaceChildren(add("p","beagu-2026-national-status",text));
 };
 async function load(){
  try{
   const signal=AbortSignal.timeout?AbortSignal.timeout(12000):undefined;
   const response=await fetch(SUPABASE_URL+
    "/rest/v1/rpc/beagu_2026_public_national_core_modes",{
    method:"POST",cache:"no-store",signal,
    headers:{"apikey":SUPABASE_PUBLISHABLE_KEY,"Content-Type":"application/json"},
    body:"{}"
   });
   if(!response.ok)throw Error("summary_unavailable");
   const result=await response.json();
   if(result?.scope!=="NATIONAL_POOLED_VOLUNTARY_RESPONDENTS"||
      result?.representative!==false||!Array.isArray(result.items))
      throw Error("invalid_summary");
   const known=new Map();
   for(const item of result.items){
     const id=String(item?.question_id||"");
     if(!/^Q(0[1-9]|1[0-3])$/.test(id)||id==="Q12"||known.has(id))continue;
     const question=catalog[id],idx=item?.mode_option_index;
     if(!question||question.kind!=="choice"||!Number.isInteger(idx)||
       idx<0||idx>=question.options.length)continue;
     known.set(id,question.options[idx]);
   }
   const fragment=document.createDocumentFragment();
   for(const id of selected){
     const meta=catalog[id],mode=known.get(id);
     if(!mode||!meta)continue;
     const item=add("article","beagu-2026-national-item");
     item.append(add("strong","",meta.question),add("span","",mode));
     fragment.append(item);
   }
   if(!fragment.childNodes.length){
     message("전국 단위 공개 기준을 충족한 결과가 아직 없습니다.");
   }else root.replaceChildren(fragment);
  }catch{message("현재 전국 집계를 표시하지 못했습니다. 다음 방문 시 다시 확인합니다.");}
 }
 void load();
})();
