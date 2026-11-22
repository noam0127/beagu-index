/* Female SD art direction for the 2027 spring–summer semester (36 fictional episodes).
 * Presentation-only metadata. No gameplay, scores, storage, or network access.
 * Existing seven-day story deliberately does not import this module in its render path.
 */
(function(root){
'use strict';
const VERSION='class-diary-female-semester/v1';
const EPISODE_MOODS=Object.freeze([
 'neutral','tired','worried','neutral','worried','shy',
 'smile','flustered','worried','neutral','worried','shy',
 'worried','worried','tired','worried','flustered','tired',
 'worried','worried','worried','neutral','tired','smile',
 'worried','flustered','tired','smile','worried','neutral',
 'tired','smile','shy','shy','smile','smile'
]);
const WOMEN=Object.freeze({
 woman:Object.freeze({id:'woman',name:'서지윤',role:'3학년 담임'}),
 none:Object.freeze({id:'none',name:'윤민서',role:'3학년 담임'}),
 suhyun:Object.freeze({id:'suhyun',name:'박수현',role:'3학년 부장'}),
 sea:Object.freeze({id:'sea',name:'오세아',role:'교감'}),
 yuri:Object.freeze({id:'yuri',name:'강유리',role:'행정실 주무관'})
});
const GUESTS=Object.freeze({
 2:Object.freeze({id:'yuri',expression:'neutral',line:'복합기 옆에 두었던 종이를 찾으러 강유리 주무관이 들렀다. “기계가 또 멈췄나요?” 묻고는 담당 부서에 점검을 요청해 두겠다고 했다.'}),
 5:Object.freeze({id:'suhyun',expression:'neutral',line:null}),
 13:Object.freeze({id:'suhyun',expression:'worried',line:null}),
 17:Object.freeze({id:'ensemble',expression:'flustered',line:null}),
 21:Object.freeze({id:'sea',expression:'worried',line:'오세아 교감이 회의실 문 앞에서 기다리고 있었다. “이 일을 한 분이 다 감당할 필요는 없어요. 확인할 내용부터 나눠 봅시다.”'}),
 22:Object.freeze({id:'suhyun',expression:'neutral',line:null}),
 29:Object.freeze({id:'sea',expression:'neutral',line:'오세아 교감은 양쪽의 요청을 번갈아 읽었다. 결론을 재촉하는 대신, 먼저 아이들에게 어떤 도움이 필요한지 물었다.'}),
 31:Object.freeze({id:'suhyun',expression:'tired',line:null}),
 32:Object.freeze({id:'suhyun',expression:'smile',line:null})
});
const SEASONS=Object.freeze({
 'cold-spring':'추운 초봄',
 'spring':'봄',
 'late-spring':'늦봄',
 'early-summer':'초여름',
 'summer':'한여름'
});
function seasonForDate(date){
 const s=String(date||'');
 const match=/^(?:2027-)?(0[3-7])-(\d\d)$/.exec(s);
 if(!match)return null;
 const m=Number(match[1]);
 return m===3?'cold-spring':m===4?'spring':m===5?'late-spring':m===6?'early-summer':'summer';
}
function wardrobeForEpisode(episode,scenes){
 const n=Number(episode);
 if(!Number.isInteger(n)||n<1||n>36||!Array.isArray(scenes)||!scenes[n-1])return null;
 return seasonForDate(scenes[n-1][0]);
}
function expressionFor(episode,partner,reflection,choiceId){
 const n=Number(episode);
 if(!Number.isInteger(n)||n<1||n>36)return 'neutral';
 if(partner!=='woman'&&partner!=='none')return 'neutral'; // male lead is managed in the male-character workstream
 if(reflection){
  const choice=String(choiceId==null?'':choiceId);
  if(choice==='1')return 'smile';
  if(choice==='2')return 'tired';
  return n===34&&partner==='woman'?'shy':'neutral';
 }
 const mood=EPISODE_MOODS[n-1];
 // Minseo has a platonic route; her awkwardness is not a romantic blush.
 return partner==='none'&&mood==='shy'?'flustered':mood;
}
function guestFor(episode,partner,reflection){
 const n=Number(episode);
 if(reflection||!Number.isInteger(n)||n<1||n>36)return null;
 const moment=GUESTS[n];
 if(!moment)return null;
 let id=moment.id;
 if(id==='ensemble')id=partner==='woman'?'none':'woman';
 const person=WOMEN[id];
 if(!person||id===partner)return null;
 return Object.freeze({id:person.id,name:person.name,role:person.role,expression:moment.expression,text:moment.line});
}
function artFor({episode,partner,reflection=false,choiceId=null,scenes}){
 return Object.freeze({
  season:wardrobeForEpisode(episode,scenes),
  expression:expressionFor(episode,partner,reflection,choiceId),
  guest:guestFor(episode,partner,reflection)
 });
}
if(EPISODE_MOODS.length!==36)throw Error('FEMALE_SEMESTER_MOOD_COUNT');
const api=Object.freeze({VERSION,SEASONS,WOMEN,EPISODE_MOODS,GUESTS,seasonForDate,wardrobeForEpisode,expressionFor,guestFor,artFor});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryFemaleSemester=api;
})(typeof window!=='undefined'?window:globalThis);
