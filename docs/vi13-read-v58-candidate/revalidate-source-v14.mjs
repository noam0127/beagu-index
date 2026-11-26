// Offline/private read-only revalidation helper. No network, output, writes, or approval records.
// Aggregate-only inputs are sufficient exactly when one valid source response or all 13
// score-bearing items are present for every response. Otherwise require source-row recomputation.
const pos=new Set([1,6,7,9,10,11]);
export function reconstructVI13(questions,n){
 if(!Number.isSafeInteger(n)||n<1||!Array.isArray(questions))return null;
 const core=questions.filter(q=>q&&/^Q(0[1-9]|1[0-3])$/.test(q.id)&&q.row===-1);
 if(core.length!==13||new Set(core.map(q=>q.id)).size!==13)return null;
 let points=0,answered=0,domain=[0,0,0],low=true,high=true;
 for(const q of core){
  const i=Number(q.id.slice(1)),c=q.counts;
  if(q.valid!==n||q.invalid!==0||!Array.isArray(c)||c.length!==6||c.some(x=>!Number.isSafeInteger(x)||x<0||x>n)||c.reduce((a,b)=>a+b,0)!==n||(i>=12&&c[5]!==0))return null;
  const count=n-c[i>=12?4:5], weights=i===12?[100,100,50,0,0,0]:i===13?[100,100,25,0,0,0]:pos.has(i)?[0,25,50,75,100,0]:[100,75,50,25,0,0];
  points+=c.reduce((a,b,j)=>a+b*weights[j],0);answered+=count;
  domain[[1,2,3,4,5,12,13].includes(i)?0:i<=9?1:2]+=count;
  if(i<=11){low=low&&c[0]===n;high=high&&c[4]===n;}
 }
 const extremePattern=low||high;
 if(n===1){if(answered<9||domain.some((v,j)=>v<[4,2,1][j]))return null;return {sumUnits:points*360360/answered,extremePattern};}
 if(answered!==13*n)return null;
 return {sumUnits:points*360360/13,extremePattern};
}
export function normalizeSourceTime(value,id){
 if(!['Q19','Q20'].includes(id))return null;
 const s=String(value??'').trim(),m=/^(?:(오전|오후)\s*)?(\d{1,2}):(\d{2})(?::00)?$/.exec(s);
 if(!m)return null;
 let h=Number(m[2]),mi=Number(m[3]);if(h>23||mi>59||(m[1]&&(h<1||h>12)))return null;
 if(m[1])h=h%12+(m[1]==='오후'?12:0);
 return (h%12+(id==='Q20'?12:0))*60+mi;
}
export function assessRevalidation(row,questions,sourceTimestamp,snapshotTimestamp){
 const v=reconstructVI13(questions,row.observations);
 const source=Date.parse(sourceTimestamp),snapshot=Date.parse(snapshotTimestamp);
 const scoreAgreement=v===null?null:v.sumUnits===row.sum_units;
 return {scoreAgreement,sourceAgreement:!Number.isFinite(source)||!Number.isFinite(snapshot)||source<snapshot?null:scoreAgreement,
  manipulation:row.flags>0||v?.extremePattern===true?false:null,
  // A technical comparison cannot establish permission, privacy or no prior linkage risk.
  notice:null,smallSample:null,reidentification:null,priorCombination:null};
}
