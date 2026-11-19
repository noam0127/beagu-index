/* Six fictional adult supporting colleagues join the story, never as romance options.
 * No user data, no storage, no networking, no change to game scores or choice rules.
 */
(function(root){
'use strict';
const VERSION='class-diary-supporting-cast/v1';
const PEOPLE=Object.freeze({
 suhyun:Object.freeze({id:'suhyun',name:'박수현',role:'3학년 부장'}),
 sea:Object.freeze({id:'sea',name:'오세아',role:'교감'}),
 yuri:Object.freeze({id:'yuri',name:'강유리',role:'행정실 주무관'}),
 junseo:Object.freeze({id:'junseo',name:'이준서',role:'체육전담 교사'}),
 dohyun:Object.freeze({id:'dohyun',name:'최도현',role:'교무부장'}),
 taesik:Object.freeze({id:'taesik',name:'장태식',role:'배움터지킴이'})
});
const MOMENTS=Object.freeze({
 1:Object.freeze({id:'taesik',expression:'smile',text:'교문 앞에서 장태식 배움터지킴이가 모자를 고쳐 썼다. “아침엔 바람이 차네요. 천천히 들어오세요.” 그는 등굣길의 아이들을 차례로 살폈다.'}),
 2:Object.freeze({id:'suhyun',expression:'smile',
  text:'박수현 부장이 회의 자료를 나눠 주었다. “오늘은 한 사람에게 일이 몰리지 않게 역할부터 정해 볼까요?” 얇은 안경 너머로 우리를 차례로 바라보는 눈길이 차분했다.'}),
 3:Object.freeze({id:'dohyun',expression:'neutral',text:'최도현 교무부장이 자료 한 장을 내밀었다. “누가 맡을 수 있는지부터 확인합시다. 한 사람에게 일이 몰리지 않게요.” 나는 그제야 업무분장표를 다시 펼쳤다.'}),
 4:Object.freeze({id:'sea',expression:'worried',
  text:'복도에서 오세아 교감과 마주쳤다. 교감은 낡은 수첩을 덮고 물었다. “확인된 사실과 더 살펴야 할 이야기를 먼저 나눠 볼까요?” 나는 성급히 결론 내리려던 마음을 조금 늦췄다.'}),
 5:Object.freeze({id:'yuri',expression:'smile',
  text:'강유리 주무관이 학년연구실 문 앞에서 잠시 발걸음을 멈췄다. “급하지 않은 구매나 품의 건은 다음 주에 절차를 같이 확인해요.” 그 말에 책상 위 서류를 다시 한 번 정리할 여유가 생겼다.'})
});
const EVENTS=Object.freeze({
 arrival:Object.freeze({id:'taesik',expression:'smile',text:'장태식 배움터지킴이는 교문 옆에서 한 발 물러섰다. “아이들이 뛰지 않게 같이 봐 주세요.”'}),
 parking:Object.freeze({id:'taesik',expression:'neutral',text:'장태식 배움터지킴이가 주차장 쪽을 가리켰다. “차가 모이는 시간에는 보행로를 비워 두면 좋겠어요.”'}),
 wildlife:Object.freeze({id:'junseo',expression:'worried',text:'이준서 체육전담 교사가 운동장 쪽을 살피고 돌아왔다. “아이들이 가까이 가지 않도록 동선부터 정하죠.”'}),
 sport:Object.freeze({id:'junseo',expression:'smile',text:'이준서 체육전담 교사가 배구공을 옆구리에 끼고 웃었다. “오늘 쉬실 분들은 편히 쉬세요. 나오는 사람끼리 짧게 해요.”'}),
 gender_duty:Object.freeze({id:'dohyun',expression:'neutral',text:'최도현 교무부장이 업무분장표를 다시 펼쳤다. “성별이나 나이 대신 맡은 일과 가능한 시간을 기준으로 정합시다.”'}),
 friendship_chair:Object.freeze({id:'dohyun',expression:'neutral',text:'최도현 교무부장은 말끝을 늦췄다. “친목회라면 본인의 의사부터 확인해야겠죠.”'}),
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
