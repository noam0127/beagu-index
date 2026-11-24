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
   use(years,t,hp,maxHp){const p=find(years);if(!p||active(t)||!held.has(years)||hp<=0||maxHp<=0)return null;held.delete(years);used.add(years);until=t+p.seconds;return {hp:Math.min(maxHp,hp+Math.round(maxHp*p.heal)),until,days:p.days};},
   active, remaining:t=>Math.max(0,until-t),
   state(){return {pending:leavePlan.filter(p=>pending.has(p.years)),held:leavePlan.filter(p=>held.has(p.years)),used:used.size};}
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
   complete(t){const out=[];if(t>=duration&&lastHit<=duration-10)award("final-ten",200,out);return out;},
   stats(){return {combo,maxCombo,near,hits,crises:paid.size,lastHit};}
  };
 }
 root.BeaguRun4Rules=Object.freeze({duration,secondsPerYear,rounds,age,roundAt,multiplier,create,leavePlan,createLeave,growthPlan,createGrowth});
})(typeof window!=="undefined"?window:globalThis);
