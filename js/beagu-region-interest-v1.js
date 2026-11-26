/* Count only a genuine dropdown pair selection. Public top five contain labels only; TOP10 server activation deferred. */
(()=>{
'use strict';
const root=document.getElementById('beaguRegionInterest'),schoolRank=document.getElementById('beaguInterest'),panel=document.getElementById('regionPanel'),region=document.getElementById('regionSelect'),office=document.getElementById('officeSelect');
if(!root||!panel||!region||!office)return;
const list=root.querySelector('[data-region-interest-list]'),status=root.querySelector('[data-region-interest-status]');
if(!list||!status)return;
const client=typeof supabaseClient!=='undefined'?supabaseClient:window.supabaseClient;
if(!client)return;
const short=(r,o)=>{
 if(r==='경남'){if(o==='창원교육지원청')return '창원(본청)';if(o==='창원교육지원청(마산센터)')return '마산센터';if(o==='창원교육지원청(진해센터)')return '진해센터';}
 if(r==='세종'&&o==='세종특별자치시교육청')return '세종교육청';
 const name=o.replace(/^(전남광주통합특별시|강원특별자치도|전북특별자치도|제주특별자치도|세종특별자치시|서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|강원도|경기도|충청북도|충청남도|전라북도|전라남도|경상북도|경상남도|제주도)/,'').replace(/교육지원청$/,'');
 return name||o;
};
let loadedAt=0,request=0;
const visible=()=>!panel.hidden&&!document.hidden;
const el=(tag,cls,value)=>{const n=document.createElement(tag);n.className=cls;if(value!==undefined)n.textContent=value;return n;};
async function load(force=false){
 if(!visible()||(!force&&Date.now()-loadedAt<900000))return;
 const seq=++request;
 try{
  const {data,error}=await client.rpc('beagu_region_interest_top5_v1');
  if(seq!==request||!visible())return;
  if(error||!Array.isArray(data))throw Error('unavailable');
  const rows=data.filter(r=>r&&typeof r.region==='string'&&r.region.length>0&&r.region.length<=24&&typeof r.office==='string'&&r.office.length>0&&r.office.length<=120).slice(0,5);
  list.replaceChildren();
  rows.forEach((r,i)=>{const item=el('li','beagu-interest-item');const body=el('div','beagu-interest-link');body.append(el('span','beagu-interest-rank',String(i+1)),el('strong','beagu-interest-school',r.region+' '+short(r.region,r.office)));item.append(body);list.append(item);});
  status.hidden=rows.length>0;status.textContent=rows.length?'':'아직 집계된 지역 선택 기록이 없습니다.';loadedAt=Date.now();
 }catch(_){if(seq===request){list.replaceChildren();status.hidden=false;status.textContent='급상승 지역을 불러오지 못했습니다.';}}
}
function mode(){root.hidden=panel.hidden;if(schoolRank)schoolRank.hidden=!panel.hidden;if(visible())void load();}
office.addEventListener('change',e=>{
 if(!e.isTrusted||panel.hidden||office.disabled||!region.value||!office.value)return;
 const v=window.beaguVisitor;if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(String(v||'')))return;
 // A real office selection completes the pair. No calls on province-only changes, pagination or rerenders.
 void Promise.resolve(client.rpc('beagu_record_region_interest_v1',{p_region:region.value,p_office:office.value,p_visitor:v})).catch(()=>{});
});
new MutationObserver(mode).observe(panel,{attributes:true,attributeFilter:['hidden']});
setInterval(()=>{if(visible())void load(true);},900000);
document.addEventListener('visibilitychange',()=>{if(visible())void load()});
mode();
})();
