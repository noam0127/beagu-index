/* Three fictional adult women join the story as colleagues, never as romance options.
 * No user data, no storage, no networking, no change to game scores or choice rules.
 */
(function(root){
'use strict';
const VERSION='class-diary-supporting-cast/v1';
const PEOPLE=Object.freeze({
 suhyun:Object.freeze({id:'suhyun',name:'박수현',role:'3학년 부장'}),
 sea:Object.freeze({id:'sea',name:'오세아',role:'교감'}),
 yuri:Object.freeze({id:'yuri',name:'강유리',role:'행정실 주무관'})
});
const MOMENTS=Object.freeze({
 2:Object.freeze({id:'suhyun',expression:'smile',
  text:'박수현 부장이 회의 자료를 나눠 주었다. “오늘은 한 사람에게 일이 몰리지 않게 역할부터 정해 볼까요?” 얇은 안경 너머로 우리를 차례로 바라보는 눈길이 차분했다.'}),
 4:Object.freeze({id:'sea',expression:'worried',
  text:'복도에서 오세아 교감과 마주쳤다. 교감은 낡은 수첩을 덮고 물었다. “확인된 사실과 더 살펴야 할 이야기를 먼저 나눠 볼까요?” 나는 성급히 결론 내리려던 마음을 조금 늦췄다.'}),
 5:Object.freeze({id:'yuri',expression:'smile',
  text:'강유리 주무관이 학년연구실 문 앞에서 잠시 발걸음을 멈췄다. “급하지 않은 구매나 품의 건은 다음 주에 절차를 같이 확인해요.” 그 말에 책상 위 서류를 다시 한 번 정리할 여유가 생겼다.'})
});
const EVENTS=Object.freeze({
 hand_off:Object.freeze({id:'suhyun',expression:'neutral',
  text:'업무분장표를 펴고 있자 박수현 부장이 다가왔다. “담당을 바꾸는 일이라면 먼저 서로 동의했는지 확인해요.”'}),
 shared_meeting:Object.freeze({id:'suhyun',expression:'smile',
  text:'박수현 부장이 회의록을 다시 펼쳤다. “그럼 다음 주에는 누가 무엇을 맡을지 적어 둘게요.”'}),
 hostile_meeting:Object.freeze({id:'suhyun',expression:'worried',
  text:'박수현 부장은 말을 서두르지 않았다. “확정된 일과 아직 협의할 일을 구분해 보죠.”'}),
 procedure:Object.freeze({id:'sea',expression:'neutral',
  text:'오세아 교감은 확인할 내용을 짚어 주었다. “당장 결론 내리지 않아도 됩니다. 우선 절차대로 확인해요.”'}),
 week_end:Object.freeze({id:'yuri',expression:'smile',
  text:'강유리 주무관이 복도에서 인사했다. “다음 주에 처리해도 되는 품의는 급하게 올리지 않으셔도 돼요.”'})
});
function sceneMoment(day,reflection){
 if(reflection||!Number.isInteger(Number(day)))return null;
 return MOMENTS[Number(day)]||null;
}
function eventMoment(event){
 if(!event||event.result)return null;
 return EVENTS[String(event.id||'')]||null;
}
function describe(moment){
 if(!moment||!Object.prototype.hasOwnProperty.call(PEOPLE,moment.id))return null;
 const who=PEOPLE[moment.id];
 return Object.freeze({id:who.id,name:who.name,role:who.role,expression:moment.expression,text:moment.text});
}
const api=Object.freeze({VERSION,PEOPLE,sceneMoment,eventMoment,describe});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiarySupportingCast=api;
})(typeof window!=='undefined'?window:globalThis);
