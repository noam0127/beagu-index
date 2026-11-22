/* 『나의 OO한 학급일지』 공개 체험판 — 실제 학교 정보/설문 응답/레벨 인증 사용 안 함 */
(function(root){
'use strict';
const SCHOOL_ID='DEMO001';
const world=Object.freeze({
  mode:'public_fiction_demo',eligible:true,storyIsFiction:true,sourceIsFiction:true,
  fictionalPresent:'2027-03-08/2027-03-14',publishedYears:[],
  basic:{id:SCHOOL_ID,name:'가상의 초등학교',sido:'가상 배경',scale:'medium',schoolKind:'초등학교',schoolStatus:'가상'},
  numbers:{},categories:{},geography:{tags:[],unverifiedLandscape:[]},
  storyHooks:[],issues:[],coverage:{numericKnown:0,numericTotal:18,categoricalKnown:0,categoricalTotal:3}
});
const places=['교무실','협의실','교실','상담실 앞 복도','학교 정문','동네의 서점','집의 작은 책상'];
const briefs=['처음 만나는 동료','말할 수 있는 회의','아이들과 만드는 약속','서로 다르게 기억한 일','퇴근 후의 선택','각자의 토요일','일요일의 수첩'];
const scenes=Object.freeze(places.map((place,i)=>Object.freeze({
  day:i+1,place,brief:briefs[i],passage:'이 장면과 대화는 전부 창작된 이야기입니다.',
  dialogue:'“어떤 선택을 하시겠어요?”',basis:'fictional_general',questionKey:null,
  historicalMode:null,note:'실제 학교 통계·실제 직원·설문 응답을 사용하지 않은 순수 허구'
})));
const plan=Object.freeze({schemaVersion:'class-diary-demo/v1',schoolId:SCHOOL_ID,scenes,approvedSignals:0});
function createDemo(){
  // Fresh, in-memory structures. Never read browser storage or call an API.
  return {world:JSON.parse(JSON.stringify(world)),plan:JSON.parse(JSON.stringify(plan))};
}
const api=Object.freeze({SCHOOL_ID,createDemo});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryDemo=api;
})(typeof window!=='undefined'?window:globalThis);
