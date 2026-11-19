/* Expanded 36-part original Korean contemporary novel scenes.
 * Editorial rule: every sentence must establish character, emotion, situation,
 * causality, conflict, or a later-repaid narrative promise.
 * No real-world allegations are inferred from selected school information.
 */
(function(root){
'use strict';
const VERSION='class-diary-expanded-scenes/v1';
const SCENES={};
// INSERT_EPISODES_HERE
const LINKS=Object.freeze([
 {name:'뒤집힌 이름표와 도윤의 발화',plant:1,payoff:36,token:'이름표'},
 {name:'복합기의 잘못된 인쇄와 기록',plant:2,payoff:13,token:'복합기'},
 {name:'서아의 자리 항의와 회의의 변화',plant:3,payoff:32,token:'서아'},
 {name:'급식 줄과 좁은 복도의 안전',plant:4,payoff:19,token:'계단'},
 {name:'전원 동의 회의록과 재검토',plant:5,payoff:22,token:'전원 동의'},
 {name:'외모 놀림과 말의 경계',plant:6,payoff:18,token:'몸'},
 {name:'옆 반 기간제 교사 정하린의 자리',plant:7,payoff:35,token:'하린'},
 {name:'조용히 집중하는 학생의 물음',plant:8,payoff:26,token:'연우'},
 {name:'경제 수업의 물가 이야기',plant:10,payoff:35,token:'물가'},
 {name:'교사의 수업 연구',plant:11,payoff:32,token:'연구'},
 {name:'체력단련과 회복',plant:12,payoff:36,token:'운동화'},
 {name:'가족 구성과 학생을 보호하는 안내',plant:14,payoff:21,token:'가족'},
 {name:'따돌림과 관계 회복',plant:15,payoff:25,token:'따돌림'},
 {name:'공개수업 준비',plant:18,payoff:26,token:'공개수업'},
 {name:'수업 중 교문 밖으로 나간 학생',plant:23,payoff:29,token:'교문'},
 {name:'교사의 수치심과 회복',plant:2,payoff:36,token:'수치심'}
]);
function scene(episode){
 const lines=SCENES[episode];
 if(!Number.isInteger(episode)||episode<1||episode>36||!lines)throw Error('EXPANDED_CHAPTER_NOT_FOUND_'+episode);
 return lines.slice();
}
function validate(){
 const errors=[];
 for(let i=1;i<=36;i++){
  const e=SCENES[i];
  if(!Array.isArray(e)||e.length<6)errors.push('CHAPTER_MISSING_'+i);
  else if(e.some(p=>typeof p!=='string'||p.trim().length<45))errors.push('INSUFFICIENT_PARAGRAPH_'+i);
 }
 for(const link of LINKS){
  if(link.plant>=link.payoff||!(SCENES[link.plant]||[]).join('').includes(link.token)||
   !(SCENES[link.payoff]||[]).join('').includes(link.token))errors.push('UNPAID_THREAD_'+link.name);
 }
 if(errors.length)throw Error(errors.join(','));
 return {chapters:36,threadLinks:LINKS.length,minAddedChars:Math.min(...Object.values(SCENES).map(e=>e.join('').length))};
}
const api=Object.freeze({VERSION,SCENES,LINKS,scene,validate});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryExpandedScenes=api;
})(typeof window!=='undefined'?window:globalThis);
