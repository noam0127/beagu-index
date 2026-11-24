/* Teacher Run 4.0 pure rules. Preview only until official versioned score validation is ready. */
(function(root){
 "use strict";
 const duration=190,secondsPerYear=5;
 const rounds=Object.freeze([
  Object.freeze({start:0,end:30,name:"신규교사의 시련",phase:"24~29세"}),
  Object.freeze({start:30,end:80,name:"격동의 교직생활",phase:"30~39세"}),
  Object.freeze({start:80,end:130,name:"책임의 무게",phase:"40~49세"}),
  Object.freeze({start:130,end:180,name:"베테랑의 투혼",phase:"50~59세"}),
  Object.freeze({start:180,end:190,name:"마지막 교직생활",phase:"60~62세"})
 ]);
 const age=t=>24+Math.floor(Math.max(0,Math.min(duration,t))/secondsPerYear);
 function roundAt(t){for(let i=rounds.length-1;i>=0;i--)if(t>=rounds[i].start)return i;return 0;}
 const multiplier=n=>n>=30?3:n>=20?2:n>=10?1.5:n>=5?1.2:1;
 const leavePlan=Object.freeze([
  Object.freeze({years:5,at:25,days:3,seconds:3,heal:.3}),
  Object.freeze({years:10,at:50,days:5,seconds:5,heal:.5}),
  Object.freeze({years:20,at:100,days:7,seconds:7,heal:.7})
 ]);
 function createLeave(){
  const pending=new Set(),held=new Set(),appeared=new Set(),used=new Set();
  let until=0;
  const find=years=>leavePlan.find(x=>x.years===years);
  const active=t=>t<until;
  return {
   advance(t){const added=[];for(const p of leavePlan)if(t>=p.at&&!appeared.has(p.years)){appeared.add(p.years);pending.add(p.years);added.push(p);}return added;},
   collect(years){if(!pending.delete(years))return false;held.add(years);return true;},
   use(years,t,hp,maxHp,boost=1){const p=find(years);if(!p||active(t)||!held.has(years)||hp<=0||maxHp<=0)return null;held.delete(years);used.add(years);until=t+p.seconds;return {hp:Math.min(maxHp,hp+Math.round(maxHp*p.heal*Math.max(1,Math.min(1.2,boost)))),until,days:p.days};},
   active, remaining:t=>Math.max(0,until-t),
   state(){return {pending:leavePlan.filter(p=>pending.has(p.years)),held:leavePlan.filter(p=>held.has(p.years)),used:used.size,usedDays:leavePlan.filter(p=>used.has(p.years)).reduce((n,p)=>n+p.days,0)};}
  };
 }
 const growthPlan=Object.freeze([
  {id:"guidance",name:"생활지도",detail:"피해 20% 감소",max:3},
  {id:"speed",name:"업무 능력",detail:"이동속도 15% 증가",max:3},
  {id:"power",name:"수업 전문성",detail:"공격력 20% 증가",max:3},
  {id:"rate",name:"교직 경험",detail:"공격속도 15% 증가",max:3},
  {id:"ally",name:"동료 관계",detail:"동료 교사 합류",max:2},
  {id:"vital",name:"자기관리",detail:"최대 체력 15% 증가",max:3},
  {id:"shield",name:"위기 대응",detail:"피해 1회 방어",max:2},
  {id:"heal",name:"교육자의 신념",detail:"회복 효과 20% 증가",max:3},
  {id:"workload",name:"학급운영",detail:"일반 장애물 12% 감소",max:3},
  {id:"community",name:"전문적 학습공동체",detail:"동료 공격속도 15% 증가",max:3}
 ].map(Object.freeze));
 function createGrowth(){
  const levels={},seen=new Set();let waiting=null,offered=[],shields=0;
  const level=id=>levels[id]||0;
  const available=()=>growthPlan.filter(p=>level(p.id)<p.max);
  function options(random=Math.random){const list=available().slice();for(let i=list.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[list[i],list[j]]=[list[j],list[i]];}return list.slice(0,3).map(p=>({...p,level:level(p.id)}));}
  return {
   next(t,random=Math.random){if(waiting!==null)return null;for(const year of [5,10,15,20,25,30,35]){if(t>=year*5&&!seen.has(year)){seen.add(year);waiting=year;offered=options(random);return {year,choices:offered.slice()};}}return null;},
   choose(id){if(waiting===null||!offered.some(p=>p.id===id))return false;levels[id]=level(id)+1;if(id==="shield")shields++;waiting=null;offered=[];return true;},
   grant(id){const p=available().find(p=>p.id===id);if(!p)return false;levels[id]=level(id)+1;if(id==="shield")shields++;return true;},
   absorb(){if(shields<=0)return false;shields--;return true;},level,shields:()=>shields,
   effects(){return {damage:Math.pow(.8,level("guidance")),speed:Math.pow(1.15,level("speed")),power:Math.pow(1.2,level("power")),rate:Math.pow(1.15,level("rate")),allies:level("ally"),maxHP:Math.pow(1.15,level("vital")),heal:Math.pow(1.2,level("heal")),spawn:Math.pow(.88,level("workload")),community:Math.pow(1.15,level("community"))};}
  };
 }
 const items=Object.freeze([
  {id:"coffee",name:"따뜻한 커피",emoji:"☕",good:true,heal:17,buff:"coffee",duration:6},
  {id:"snack",name:"동료의 간식",emoji:"🍪",good:true,heal:25},
  {id:"vacation",name:"방학",emoji:"🌴",good:true,inv:5},
  {id:"parental",name:"육아휴직",emoji:"🏡",good:true,buff:"parental",duration:5},
  {id:"graduate",name:"대학원",emoji:"🎓",good:true,growth:true},
  {id:"shield",name:"교권 보호막",emoji:"🛡️",good:true,shield:true},
  {id:"alumni",name:"졸업생의 편지",emoji:"💌",good:true,healRatio:.35},
  {id:"support",name:"동료의 지원",emoji:"🤝",good:true,clear:5},
  {id:"training",name:"연수",emoji:"📚",good:true,buff:"training",duration:7},
  {id:"relief",name:"업무 경감",emoji:"🌿",good:true,buff:"relief",duration:7},
  {id:"assignment",name:"업무분장",emoji:"🗂️",good:false,damage:8,buff:"assignment",duration:6},
  {id:"printer",name:"프린터 고장",emoji:"🖨️",good:false,damage:8,buff:"printer",duration:5},
  {id:"insomnia",name:"불면증",emoji:"🌙",good:false,damage:8,buff:"insomnia",duration:5},
  {id:"meeting",name:"회의 지옥",emoji:"📅",good:false,damage:8,buff:"meeting",duration:5},
  {id:"paper",name:"갑작스러운 공문",emoji:"📄",good:false,damage:8,papers:2},
  {id:"conflict",name:"교직원 갈등",emoji:"💢",good:false,damage:8,buff:"conflict",duration:5}
 ].map(Object.freeze));
 const events=Object.freeze([
  {id:"rush",icon:"📨",title:"공문 폭풍",detail:"장애물 증가",duration:6,stages:[0,1,2,3,4]},
  {id:"audit",icon:"🔎",title:"갑작스러운 감사",detail:"추적 장애물 출현",duration:5,stages:[1,2,3]},
  {id:"bonus",icon:"💰",title:"성과급 지급일",detail:"점수 아이템 등장",duration:4,stages:[0,1,2,3,4]},
  {id:"support",icon:"🤝",title:"동료 교사들의 연대",detail:"회복 및 장애물 제거",duration:5,stages:[0,1,2,3,4]},
  {id:"focus",icon:"✨",title:"수업 대성공",detail:"회복 · 점수 35% 추가",duration:6,stages:[0,1,2,3,4]},
  {id:"letters",icon:"💌",title:"스승의 날",detail:"감사 편지 등장",duration:4,stages:[0,1,2,3,4]},
  {id:"transfer",icon:"🏫",title:"학교 전근",detail:"교실과 장애물 패턴 변경",duration:6,stages:[1,2,3]}
 ].map(p=>Object.freeze({...p,stages:Object.freeze(p.stages)})));
 function createEffects(){
  const expires={};let shield=false;
  const active=(id,t)=>(expires[id]||0)>t;
  return {
   set(id,t,seconds){expires[id]=Math.max(expires[id]||0,t+seconds);},
   active,addShield(){shield=true;},consumeShield(){if(!shield)return false;shield=false;return true;},
   values(t){return {
    speed:Math.max(.65,Math.min(1.35,(active("coffee",t)?1.25:1)*(active("insomnia",t)?.7:1))),
    spawn:Math.max(.65,Math.min(1.5,(active("assignment",t)?1.35:1)*(active("relief",t)?.72:1))),
    power:Math.max(.6,Math.min(1.3,(active("training",t)?1.2:1)*(active("printer",t)?.65:1))),
    damage:active("training",t)?.8:1,helperRate:active("conflict",t)?.65:1,
    noSpawn:active("parental",t),meeting:active("meeting",t),shield};},
   labels(t){return Object.keys(expires).filter(id=>active(id,t)).map(id=>({id,remaining:Math.ceil(expires[id]-t)}));}
  };
 }
 function pickEvent(stage,random=Math.random,bossActive=false){if(bossActive)return null;const pool=events.filter(e=>e.stages.includes(stage));return pool.length?pool[Math.floor(random()*pool.length)]:null;}
 const bossPlan=Object.freeze([
  {id:"confusion",name:"신규교사의 혼란",icon:"📚",color:"#426991",start:20,end:30,hp:92,interval:2.1,damage:8,reward:"업무의 달인"},
  {id:"demands",name:"끝없는 요구",icon:"💬",color:"#a04c82",start:65,end:80,hp:140,interval:2,damage:9,reward:"교권 보호막"},
  {id:"responsibility",name:"책임의 거인",icon:"🗄️",color:"#a2683f",start:115,end:130,hp:155,interval:2.2,damage:11,reward:"업무 경감"},
  {id:"burnout",name:"번아웃의 그림자",icon:"🌘",color:"#60568d",start:165,end:180,hp:160,interval:2.0,damage:10,reward:"교육자의 신념"},
  {id:"final",name:"마지막 공문",icon:"📄",color:"#b48b35",start:185,end:190,hp:42,interval:1.55,damage:7,reward:"황금 분필"}
 ].map(Object.freeze));
 const difficulty=Object.freeze({easy:{hp:.6,score:1,pattern:1,leave:1.2},normal:{hp:1,score:1.5,pattern:2,leave:1},hard:{hp:1.5,score:2,pattern:3,leave:1},very_hard:{hp:1.65,score:2.2,pattern:3,leave:1},extreme:{hp:1.8,score:2.4,pattern:3,leave:1}});
 function createBosses(tier="hard"){
  const cfg=difficulty[tier]||difficulty.hard,seen=new Set(),defeated=[];
  let current=null;
  return {
   advance(t){let expired=null,started=null;
    if(current&&t>=current.end){expired=current.id;current=null;}
    const p=bossPlan.find(p=>t>=p.start&&t<p.end&&!seen.has(p.id));
    if(p){seen.add(p.id);const max=Math.ceil(p.hp*cfg.hp);current={...p,hp:max,maxHP:max};started={...current};}
    return {expired,started};},
   active(){return current?{...current}:null;},
   damage(amount,t){if(!current||t<current.start||t>=current.end||!Number.isFinite(amount)||amount<=0)return null;
    current.hp=Math.max(0,current.hp-amount);if(current.hp>0)return null;
    const beaten={...current};defeated.push(beaten.id);current=null;return beaten;},
   defeated(){return defeated.slice();},tier:cfg
  };
 }
 function ending({win=false,bosses=0,allies=0,crises=0,growth=0,combo=0,hits=0}={}){
  const titles=[];
  if(win&&bosses===5)titles.push("전설의 정년퇴직");
  if(win)titles.push("영광의 정년퇴직");
  if(allies>=3)titles.push("함께한 교직 인생");
  if(crises>=2)titles.push("불굴의 교사");
  if(growth>=7)titles.push("교육 전문가");
  if(combo>=10&&hits<=5)titles.push("회피의 달인");
  if(!win)titles.push("새로운 인생의 시작");
  return {primary:win?titles[0]:"새로운 인생의 시작",titles};
 }
 function create(){
  let combo=0,maxCombo=0,near=0,hits=0,lastHit=-Infinity,lowSince=null,lowEpisode=false;
  const paid=new Set(),objects=new WeakSet();
  function award(id,amount,out){if(paid.has(id))return;paid.add(id);out.push({id,amount});}
  return {
   nearMiss(object,clearance){
    if(!object||object.good||!Number.isFinite(clearance)||clearance<=0||clearance>=58||objects.has(object))return 0;
    objects.add(object);near++;combo++;maxCombo=Math.max(maxCombo,combo);return Math.round(90*multiplier(combo));
   },
   hit(t){hits++;lastHit=t;combo=0;},
   health(t,hp,maxHp){
    const out=[],ratio=maxHp>0?hp/maxHp:0;
    if(ratio<=.1&&ratio>0){lowEpisode=true;if(lowSince===null)lowSince=t;if(t-lowSince>=5)award("low-survival",150,out);}
    else{lowSince=null;if(ratio>=.8&&lowEpisode){award("low-recovery",250,out);lowEpisode=false;}else if(ratio<=0){lowEpisode=false;}}
    return out;
   },
   bossClutch(){const out=[];award("boss-clutch",300,out);return out;},
   complete(t){const out=[];if(t>=duration&&lastHit<=duration-10)award("final-ten",200,out);return out;},
   stats(){return {combo,maxCombo,near,hits,crises:paid.size,lastHit};}
  };
 }
 root.BeaguRun4Rules=Object.freeze({duration,secondsPerYear,rounds,age,roundAt,multiplier,create,leavePlan,createLeave,growthPlan,createGrowth,items,events,createEffects,pickEvent,bossPlan,difficulty,createBosses,ending});
})(typeof window!=="undefined"?window:globalThis);
