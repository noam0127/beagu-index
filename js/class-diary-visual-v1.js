/* Class Diary illustrated stage v1: self-contained text-free SVG backgrounds and
 * consistent original adult character portraits; all artwork is generated in memory.
 * No requests, storage, tracking or reliance on real-school images.
 */
(function(root){
'use strict';
const VERSION='class-diary-visual/v1';
const CAST=Object.freeze({
 woman:Object.freeze({name:'서지윤',age:30,role:'3학년 담임',hair:'밤색 반묶음 머리',outfit:'크림색 가디건, 흰 셔츠',temperament:'조용한 배려와 분명한 의견',value:'학생의 말이 끝날 때까지 기다리기',weakness:'도움을 쉽게 청하지 못함'}),
 man:Object.freeze({name:'한현우',alias:'현우 선생님',age:32,role:'3학년 동학년 담임',hair:'불규칙하게 내려온 자연스러운 검은 앞머리',outfit:'남색 니트, 하늘색 셔츠',temperament:'농담 뒤에 책임을 남기는 태도',value:'동료의 시간 존중',weakness:'갈등을 농담으로 피할 때가 있음'}),
 none:Object.freeze({name:'윤민서',age:29,role:'동학년 담임',hair:'검정색 단발',outfit:'연두색 카디건',temperament:'신중하고 꼼꼼함',value:'아이와 교사의 안전',weakness:'완벽하게 준비하려 애씀'}),
  man2:Object.freeze({name:'차도겸',age:31,role:'동학년 담임',hair:'정돈된 검은 머리',outfit:'짙은 회색 셔츠와 짙은 청색 니트',temperament:'외모는 화려하지만 조용하고 신중함',value:'실뜨기로 참여를 유도하고 경계를 지키기',weakness:'관심을 받으면 친절을 거절하지 못하는 경향'}),
  man3:Object.freeze({name:'백태오',age:33,role:'동학년 담임',hair:'짧은 검정 운동형 머리',outfit:'체육복에 밝은 회색 바람막이',temperament:'경쾌한 리더십과 강한 승부욕',value:'배구를 통한 협력과 모든 학생의 참여',weakness:'승패에 몰입하면 몸을 움직이기 어려운 아이의 시선을 놓침'})
});
const MAP={
 morning:'office',meeting:'meeting',classroom:'classroom',hallway:'hallway',
 evening:'office',weekend:'street',night:'study',gate:'gate',cafe:'cafe',
 consultation:'consultation'
};
function sceneForEvent(event,day){
 const s=String(event&&event.place||'');
 if(/교문|등교|주차장/.test(s))return 'gate';
 if(/교실|모둠|학급회의/.test(s))return 'classroom';
 if(/복도/.test(s))return 'hallway';
 if(/상담/.test(s))return 'consultation';
 if(/카페|서점/.test(s))return 'cafe';
 if(/집|일요일/.test(s))return 'night';
 if(/학년연구실|교무실|전담시간/.test(s))return 'morning';
 return ['morning','meeting','classroom','hallway','evening','weekend','night'][Math.max(0,Math.min(6,Number(day||1)-1))];
}
const palettes={
 office:['#f9e6cd','#f2bdaa','#9cbecc'],meeting:['#ffe4d1','#e6bdac','#adc8c8'],
 classroom:['#fff0d8','#efc8a7','#b9d9c8'],hallway:['#f9e1c8','#d8b6ad','#a3beca'],
 street:['#ffcfb2','#d891a5','#9d92b5'],study:['#273455','#76637d','#bf8e77'],
 gate:['#dbe9f2','#f4c6c8','#b4d0ad'],cafe:['#f0d0ae','#b98f84','#929bad'],
 consultation:['#f2dfd4','#d5baa9','#afcfbc']
};
function obj(type,p){
 const [light,rose,blue]=p;
 const blossoms='<g fill="#eeb8c5" opacity=".9"><circle cx="126" cy="105" r="10"/><circle cx="155" cy="78" r="8"/><circle cx="193" cy="120" r="12"/><circle cx="220" cy="70" r="7"/><circle cx="1012" cy="92" r="11"/><circle cx="1066" cy="118" r="8"/></g>';
 const window='<rect x="83" y="72" width="410" height="260" rx="14" fill="#eff7f4"/><rect x="96" y="84" width="384" height="236" fill="#d3e7e3"/><path d="M284 84V320M96 198H480" stroke="#fbf8ed" stroke-width="18"/>'+blossoms;
 const desks='<g fill="#b9957a" stroke="#977b66" stroke-width="4"><path d="M220 460h220l-28 110H243z"/><path d="M630 470h236l-26 105H649z"/></g><g fill="#83908a"><rect x="266" y="530" width="110" height="12" rx="6"/><rect x="680" y="538" width="110" height="12" rx="6"/></g>';
 const shelf='<rect x="880" y="180" width="220" height="314" rx="10" fill="#b89477"/><g fill="#e5dbcc">'+[0,1,2,3].map(i=>'<rect x="896" y="'+(195+i*70)+'" width="190" height="11"/>').join('')+'</g><g fill="#85a6a1"><rect x="903" y="210" width="42" height="48"/><rect x="954" y="212" width="29" height="46"/><rect x="903" y="286" width="35" height="49"/><rect x="942" y="286" width="28" height="49"/></g>';
 const plant='<g><path d="M1080 446v76h-52l12-76z" fill="#cf947a"/><path d="M1055 450q-95-124-64-157q46-20 64 157m0 0q30-159 87-145q35 44-87 145" fill="#719e8c" opacity=".9"/></g>';
 if(type==='street'||type==='gate'){
  return '<path d="M0 370L320 180H825L1200 370V730H0Z" fill="#e8c0af"/><rect x="410" y="210" width="430" height="260" rx="18" fill="#f5e1cf"/><rect x="440" y="230" width="365" height="160" fill="#b4ccd1"/><path d="M0 535Q580 475 1200 535V730H0Z" fill="#e5c6ad"/><path d="M140 0Q245 175 160 460" fill="none" stroke="#866d61" stroke-width="37"/>'+blossoms+'<path d="M145 0Q410 145 560 85" stroke="#94756c" stroke-width="15" fill="none"/>';
 }
 if(type==='study'){
  return '<rect width="1200" height="730" fill="#394568"/><rect x="96" y="75" width="435" height="350" rx="16" fill="#66728c"/><rect x="113" y="90" width="403" height="323" fill="#263852"/><circle cx="425" cy="170" r="48" fill="#fff0cd" opacity=".85"/><rect x="140" y="478" width="950" height="54" rx="12" fill="#a77c69"/><path d="M235 490h490l-60-60H295z" fill="#f4ead5"/><path d="M890 410v83" stroke="#d2ad8c" stroke-width="15"/><path d="M835 419l54-125l58 125z" fill="#f8dcab"/><circle cx="890" cy="431" r="79" fill="#fff0b2" opacity=".12"/>';
 }
 if(type==='hallway'){
  return '<path d="M420 0l-120 730H0V0Z" fill="#dfc7ba"/><path d="M790 0l155 730h255V0Z" fill="#e4cbb8"/><path d="M260 730L525 0h155l280 730" fill="#f3ddc7"/><rect x="50" y="120" width="280" height="375" fill="#c7ddd4"/><rect x="865" y="100" width="270" height="430" fill="#b3c8c6"/><path d="M0 630L580 410L1200 630" fill="#c4b7b2"/>';
 }
 if(type==='cafe'||type==='consultation'){
  return window+'<rect x="645" y="90" width="438" height="330" rx="26" fill="#e7d4c8"/><rect x="765" y="300" width="275" height="210" rx="36" fill="#b7a5a0"/><rect x="230" y="490" width="750" height="40" rx="20" fill="#ad8775"/>'+plant;
 }
 return window+(type==='classroom'?'<rect x="605" y="105" width="492" height="284" rx="10" fill="#537870" stroke="#c0a18c" stroke-width="20"/>'+desks:
 '<rect x="592" y="300" width="315" height="205" rx="20" fill="#c8c6b9"/><rect x="632" y="325" width="240" height="138" fill="#819ea5"/>'+desks)+shelf+plant;
}
function backgroundSvg(id){
 const type=MAP[id]||MAP.morning,p=palettes[type]||palettes.office;
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 730" role="img" aria-hidden="true"><defs><linearGradient id="a" x2=".7" y2="1"><stop stop-color="'+p[0]+'"/><stop offset=".66" stop-color="'+p[1]+'"/><stop offset="1" stop-color="'+p[2]+'"/></linearGradient><radialGradient id="b"><stop stop-color="#fff6e5" stop-opacity=".8"/><stop offset="1" stop-color="#fff6e5" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="730" fill="url(#a)"/><circle cx="240" cy="90" r="570" fill="url(#b)"/>'+obj(type,p)+'<rect y="620" width="1200" height="110" fill="#6d6980" opacity=".11"/></svg>';
}
function portraitSvg(which,expression){
 const id=['man','man2','man3'].includes(which)?which:which==='none'?'none':'woman';
 const smile=expression==='happy'||expression==='tender'||expression==='warm';
 const worried=expression==='worried'||expression==='tension';
 const hair=id==='man3'?'#252f36':id==='man2'?'#242332':id==='man'?'#3d3234':id==='none'?'#34343b':'#645047';
 const coat=id==='man3'?'#37665d':id==='man2'?'#454860':id==='man'?'#34465c':id==='none'?'#a9b8a7':'#e7d7c1';
 const eyes=worried?'<path d="M140 217l28 3m48 0l26-3" stroke="#51413f" stroke-width="5"/>':
 '<path d="M141 220q12 7 25 0m51 0q12 7 25 0" fill="none" stroke="#493e3e" stroke-width="6" stroke-linecap="round"/>';
 const mouth=smile?'<path d="M176 260q18 18 36 0" fill="none" stroke="#b36f6b" stroke-width="4"/>':
 worried?'<path d="M184 267h20" stroke="#b36f6b" stroke-width="4"/>':'<path d="M182 265q13 7 26 0" stroke="#b36f6b" stroke-width="4" fill="none"/>';
 const backHair=['man','man2','man3'].includes(id)?'<path d="M122 197Q90 78 190 78Q284 87 261 204L231 180Q178 175 145 182Z" fill="'+hair+'"/>':
 '<path d="M100 187Q93 59 191 63Q295 66 287 207L274 344H104Z" fill="'+hair+'"/>';
 const bangs=id==='none'?'<path d="M111 180Q150 137 272 175Q280 111 246 95Q118 66 111 180Z" fill="'+hair+'"/>':
 '<path d="M110 183Q136 94 183 108Q218 133 263 174L273 137Q260 79 185 78Q113 80 110 183Z" fill="'+hair+'"/>';
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 540" aria-hidden="true"><defs><linearGradient id="skin" x2="1" y2="1"><stop stop-color="#f7d9bd"/><stop offset="1" stop-color="#d9a895"/></linearGradient></defs><ellipse cx="195" cy="520" rx="162" ry="22" fill="#35475e" opacity=".12"/><path d="M40 540Q40 335 148 334H242Q350 336 350 540Z" fill="'+coat+'"/><path d="M143 336l53 81l55-81l-21 205h-71Z" fill="#fff9f3"/><path d="M174 312h48v68q-23 27-48 0Z" fill="url(#skin)"/>'+backHair+'<ellipse cx="190" cy="215" rx="82" ry="115" fill="url(#skin)"/>'+bangs+eyes+mouth+'<path d="M188 221l-8 27l13 2" stroke="#c99486" stroke-width="3" fill="none"/><circle cx="143" cy="251" r="16" fill="#e6a79f" opacity=".18"/><circle cx="231" cy="251" r="16" fill="#e6a79f" opacity=".18"/><path d="M151 373q44 31 91 0" stroke="#ddd5ce" stroke-width="5" fill="none"/>'+(id==='man3'?'<circle cx="315" cy="453" r="38" fill="#f3f5e8" stroke="#476d79" stroke-width="6"/><path d="M286 425q58 30 45 64m-44-27q47-40 64-19" stroke="#527db0" stroke-width="5" fill="none"/>':id==='man2'?'<path d="M277 467q-20-23 4-38q13-8 30 0q21 14 3 33q-31 20-41-1m-7 11q16-40 52-28" stroke="#e8f4ff" stroke-width="4" fill="none"/>':'')+'</svg>';
}
function dataUrl(svg){return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)}
const api=Object.freeze({VERSION,CAST,sceneForEvent,backgroundSvg,portraitSvg,dataUrl});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryVisual=api;
})(typeof window!=='undefined'?window:globalThis);
