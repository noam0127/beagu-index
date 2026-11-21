/* Stage32: normalize server aggregates without turning missing telemetry into
 * fabricated zero bars. Chart data are display-only; the admin Edge
 * function independently authorizes every request (Owner/Operator + AAL2). */
(()=>{
 'use strict';
 const integer=value=>{
   if(typeof value==='number')return Number.isSafeInteger(value)&&value>=0?value:null;
   if(typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value)){
     const n=Number(value);
     return Number.isSafeInteger(n)?n:null;
   }
   return null;
 };
 const dateKey=value=>{
   if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
   const d=new Date(value+'T00:00:00.000Z');
   return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===value?value:null;
 };
 const periodKey=(date,scale)=>{
   if(scale==='day')return date;
   if(scale==='month')return date.slice(0,7);
   if(scale==='week'){
     const d=new Date(date+'T00:00:00.000Z');
     d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
     return d.toISOString().slice(0,10);
   }
   return null;
 };
 function daily(rows,metric,scale){
   if(!Array.isArray(rows))return Object.freeze({status:'unavailable',points:[]});
   if(!['views','searches','plays'].includes(metric)||
      !['day','week','month'].includes(scale))
     return Object.freeze({status:'invalid',points:[]});
   if(!rows.length)return Object.freeze({status:'empty',points:[]});
   const groups=new Map();
   for(const row of rows){
     const day=dateKey(row?.day),count=integer(row?.[metric]);
     if(!day||count===null)return Object.freeze({status:'invalid',points:[]});
     const key=periodKey(day,scale);
     const total=(groups.get(key)||0)+count;
     if(!Number.isSafeInteger(total))return Object.freeze({status:'invalid',points:[]});
     groups.set(key,total);
   }
   const points=[...groups].sort(([a],[b])=>a.localeCompare(b)).slice(-60)
     .map(([key,value])=>Object.freeze({key,value}));
   return Object.freeze({status:points.every(p=>p.value===0)?'zero':'ready',points});
 }
 function hourly(rows){
   if(!Array.isArray(rows))return Object.freeze({status:'unavailable',points:[]});
   if(!rows.length)return Object.freeze({status:'empty',points:[]});
   const byHour=new Map();
   for(const row of rows){
     const hour=integer(row?.hour),count=integer(row?.views);
     // Duplicate or out-of-range hours indicate incompatible backend data.
     if(hour===null||hour>23||count===null||byHour.has(hour))
       return Object.freeze({status:'invalid',points:[]});
     byHour.set(hour,count);
   }
   const points=Array.from({length:24},(_,hour)=>Object.freeze({
     hour,value:byHour.has(hour)?byHour.get(hour):null
   }));
   return Object.freeze({
     status:[...byHour.values()].every(n=>n===0)?'zero':'ready',
     points
   });
 }
 window.BeaguAdminChartIntegrity=Object.freeze({daily,hourly});
})();
