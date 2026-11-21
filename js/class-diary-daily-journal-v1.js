/* 『나의 OO한 학급일지』: each chapter ends with one chosen diary note.
 * Event action is recorded in state.history; daily reflection is a separate selection.
 * Saves store only {episode,choice}, not private user prose or school record contents.
 */
(function(root){
'use strict';
const VERSION='class-diary-daily-journal/v1';
const NOTES=Object.freeze([["도윤은 오늘 자기 이름표를 뒤집어 놓았다.","새 교실에서 가장 낯선 사람은 어쩌면 나였다.","첫날의 질문을 모두 해결하지 않아도 된다."],["아이들과 함께 쉴 곳을 만들었다.","사물함 뒤 매트는 사실 내 휴식처가 필요해서 만든 공간이다.","교사도 쉴 곳이 있어야 아이들과 오래 지낼 수 있다."],["서지윤 선생님이 프린터 앞에서 도와주었다.","인쇄물은 자꾸 걸렸고 첫 시간은 성큼 다가왔다.","도움받는 일을 부끄러워하지 않기로 했다."],["동생을 챙기는 아이의 손을 오래 기억한다.","아이마다 교실 밖에도 소중한 삶이 있다.","누구나 도움을 받고 또 누군가를 도울 수 있다."],["조용한 아이의 의견도 회의록에 남기고 싶었다.","우리는 전원 동의라는 말을 너무 쉽게 썼다.","모두에게 말할 기회가 있었는지 다시 확인해야 한다."],["아이들은 퇴근길까지 나를 따라오려 했다.","연인 이름 옆 하트를 들키고 말았다.","친밀한 관계일수록 서로의 선을 지켜야 한다."],["어머니의 울음과 아이의 일상이 마음에 남는다.","밤 아홉 시가 넘도록 전화를 들고 있었다.","내가 바꿀 수 있는 일과 도움을 요청할 일을 구분하자."],["아이는 자신의 가족 이야기를 당당히 했다.","위로할 말을 고민한 건 나 혼자였다.","가족 형태만으로 아이의 행복을 짐작하지 않겠다."],["아이들은 스케이트장이 정말 재미있었다고 했다.","보온 외투가 없는 아이들 때문에 링크 옆에서 계속 떨었다.","좋은 체험은 즐거움만큼 안전한 준비가 중요하다."],["아이들이 무슨 일이든 돈부터 묻기 시작했다.","의자 하나를 넣는 데도 가격표가 붙는 기분이었다.","함께 살아가기 위해 당연히 할 일도 있다."],["남은 강낭콩을 집에 가져와 심었다.","비커가 깨졌지만 집의 작은 화분은 조용했다.","콩이 자라듯 나도 조금씩 자랐으면 좋겠다."],["책을 늦게 반납하는 아이의 이유를 더 알고 싶다.","도서관에 가다 사서 선생님과 지각 이야기를 나눴다.","내가 보이지 않는 자리에서도 책임은 남는다."],["직무를 맡은 아이가 그게 자기 일이라고 했다.","봉급표를 다시 쓰느라 시간이 한참 걸렸다.","일과 보상의 약속은 분명해야 한다."],["다트 회사의 사장과 직원들이 모두 울었다.","재미있는 노사 갈등인 줄 알았는데 교실이 울음바다가 됐다.","계약 없이 함께 일하면 작은 돈도 큰 문제가 된다."],["한소희 선생님이 매출전표를 출력하는 법을 알려줬다.","둘이 같겠어요라는 말이 하루 종일 귓가에 남았다.","모르는 사람에게 필요한 건 비아냥이 아니라 설명이다."],["아이들이 스승의 날 케이크와 꽃을 준비했다.","케이크를 스물한 조각으로 나누는 일은 참 어려웠다.","같은 크기와 공평한 마음이 꼭 같은 뜻은 아니다."],["풍선이 무서운 친구를 놀리지 않기로 했다.","가장 신나야 할 놀이를 멈춰야 했다.","한 아이의 두려움이 조롱받는 활동은 바꿀 수 있다."],["외투를 건넨 서지윤 선생님의 손을 기억한다.","도복이 젖었다며 우는 아이도 나도 흠뻑 젖었다.","아이의 속상함은 내 기준으로 작게 만들 수 없다."],["장례식장에서 교장선생님을 다른 모습으로 보았다.","ATM 앞에서 체육강사와 말없이 웃었다.","직책 뒤에도 저마다의 슬픔과 삶이 있다."],["깨진 유리 조각이 다치지 않게 모두를 살폈다.","비커와 유리막대에 이어 전신거울도 깨졌다.","우연이 반복된다면 환경부터 바꾸어야 한다."],["아이를 의심하지 않고 태블릿부터 찾아보았다.","아무도 쓰지 않는 사물함에서 태블릿이 나왔다.","확인하기 전에는 누구의 잘못도 정하지 않겠다."],["보건실에서 있었던 일 뒤 학생의 상태를 확인했다.","스프레이 소독제 하나에 교실이 소란스러워졌다.","자율과 안전은 함께 설계해야 한다."],["학생들은 내 손에 물건을 맡기고 마음껏 뛰었다.","나는 가방과 외투와 물통으로 가득한 물건보관함이 됐다.","부탁을 들어주는 일과 책임을 대신 지는 일은 다르다."],["아이들은 빵과 우유가 나온다며 신이 났다.","따뜻한 급식 한 끼가 이렇게 그리울 줄 몰랐다.","익숙한 한 끼는 누군가의 노동으로 준비된다."],["전학생의 우유급식 정산 문제를 다시 확인했다.","매일 남던 우유를 내가 마셨다는 말을 결국 했다.","작은 업무 누락이라도 정확하게 확인하고 책임지자."],["어린 학생과 6학년 아이들의 말을 모두 들어야 했다.","화가 나서 큰소리를 질렀더니 아이들이 입을 다물었다.","화가 난다는 이유로 판단의 순서를 바꿀 수 없다."],["나는 6학년 학생들에게 사과했다.","착한 애들이었다는 윤민서 선생님의 말이 잊히지 않는다.","잘못한 교사도 학생에게 사과할 수 있어야 한다."],["교실급식 뒤에 아이들과 안전하게 정리했다.","급식실이 물에 잠긴 날, 내 교실은 밥상과 설거지로 가득했다.","매일 먹는 밥 뒤에는 쉽게 보이지 않는 일이 많다."],["다친 아이와 목격한 아이들의 말을 따로 기록했다.","3월에 정한 줄서기 규칙이 다시 문제로 돌아왔다.","회의록에는 찬성뿐 아니라 걱정도 남아야 한다."],["교장실에서 나와 우리 교실의 문제를 다시 생각했다.","유난히 넓은 교장실에서 학교의 책임을 논의했다.","개인의 책임과 제도의 책임을 함께 보아야 한다."],["동료들이 내 공개수업을 돕겠다고 나섰다.","학교 대표 동료장학이 왜 하필 내 몫인지 아직도 모르겠다.","부담을 혼자 짊어지는 것만이 책임은 아니다."],["서로 다른 교사들의 조언에 귀를 기울였다.","여섯 사람이 같은 수업을 여섯 가지로 그렸다.","좋은 수업에는 하나의 정답만 있지 않다."],["학생이 계획에 없던 질문을 꺼냈다.","오래 준비한 수업안은 예상과 다르게 흘러갔다.","계획을 지키는 일과 배움을 지키는 일은 다르다."],["아이들은 회의록을 스스로 고쳐 썼다.","전원 동의라는 말 한 줄이 한 학기 동안 따라다녔다.","다시 고칠 수 있어야 우리의 결정이 된다."],["아이들은 각자의 방식으로 한 학기를 발표했다.","누구는 다트를, 누구는 운동장을, 누구는 동생을 이야기했다.","모두에게 같은 방식의 성장을 요구하지 않겠다."],["아이들이 남긴 편지와 이름표를 오래 바라봤다.","사물함 뒤 매트에 누워 보니 교실이 이상하게 조용했다.","강낭콩은 자랐다. 나도 조금은 자랐을 것이다."]]);
const copy=o=>JSON.parse(JSON.stringify(o));
function choices(episode){
 const texts=NOTES[Number(episode)-1];
 return texts?texts.map((text,i)=>({id:String(i),label:text})):null;
}
function selection(state,episode){
 const n=Number(episode);
 if(!Number.isInteger(n)||n<1||n>36)return null;
 const entries=state&&Array.isArray(state.journal)?state.journal:[];
 const row=entries.find(x=>x&&x.episode===n);
 return row&&Number.isInteger(row.choice)&&row.choice>=0&&row.choice<=2?row.choice:null;
}
function note(state,episode){
 const selected=selection(state,episode);
 return selected===null?null:{episode:Number(episode),choice:selected,text:NOTES[Number(episode)-1][selected]};
}
function choose(state,id){
 if(!state||state.phase!=='semester_reflection'||!Array.isArray(state.history)||
  !Number.isInteger(state.episode)||state.history.length!==state.episode||
  !/^[012]$/.test(String(id)))throw Error('JOURNAL_REFLECTION_REQUIRED');
 const n=copy(state), selected=Number(id),entries=Array.isArray(n.journal)?n.journal:[];
 // One reflection per chapter. The current page can be revised before advancing.
 const found=entries.findIndex(x=>x&&x.episode===n.episode);
 if(found>=0)entries[found]={episode:n.episode,choice:selected};
 else entries.push({episode:n.episode,choice:selected});
 n.journal=entries.sort((a,b)=>a.episode-b.episode);
 return n;
}
function entries(state){
 return (Array.isArray(state&&state.journal)?state.journal:[])
  .filter(x=>x&&Number.isInteger(x.episode)&&Number.isInteger(x.choice)&&x.episode>=1&&x.episode<=36&&x.choice>=0&&x.choice<=2)
  .map(x=>({episode:x.episode,choice:x.choice,text:NOTES[x.episode-1][x.choice]}));
}
function validate(){
 if(NOTES.length!==36||NOTES.some(r=>r.length!==3||r.some(s=>typeof s!=='string'||s.length<18)))throw Error('DAILY_JOURNAL_INCOMPLETE');
 return {chapters:36,options:108};
}
validate();
const api=Object.freeze({VERSION,NOTES,choices,selection,note,choose,entries,validate});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryDailyJournal=api;
})(typeof window!=='undefined'?window:globalThis);
