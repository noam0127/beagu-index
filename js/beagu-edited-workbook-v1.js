/* Narrow XLSX reader for a final values-only edited workbook.
 * Local browser parsing: no CDN, no formulas executed, no external links fetched. */
(function(){
 const decoder=new TextDecoder('utf-8',{fatal:true});
 const xml=s=>{if(/<!DOCTYPE|<!ENTITY/i.test(s))throw Error('외부 XML 금지');const d=new DOMParser().parseFromString(s,'application/xml');if(d.querySelector('parsererror'))throw Error('엑셀 XML 오류');return d;};
 const nodes=(x,t)=>Array.from(x.getElementsByTagNameNS('*',t));
 async function unzip(buffer){
  if(buffer.byteLength>8*1024*1024)throw Error('8MB 이하 파일을 선택하세요.');
  const b=new Uint8Array(buffer),v=new DataView(buffer);let end=-1;
  for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}
  if(end<0||v.getUint16(end+4,true)||v.getUint16(end+6,true))throw Error('표준 XLSX 파일이 아닙니다.');
  const count=v.getUint16(end+10,true),size=v.getUint32(end+12,true),offset=v.getUint32(end+16,true);
  if(count>500||offset+size>end)throw Error('엑셀 압축 형식 오류');
  const files=new Map();let pos=offset;
  for(let i=0;i<count;i++){
   if(pos+46>end||v.getUint32(pos,true)!==0x02014b50)throw Error('엑셀 압축 목록 오류');
   const flags=v.getUint16(pos+8,true),method=v.getUint16(pos+10,true),compressed=v.getUint32(pos+20,true),raw=v.getUint32(pos+24,true),nl=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true),local=v.getUint32(pos+42,true);
   if(pos+46+nl+extra+comment>end)throw Error('엑셀 압축 목록 오류');
   const name=decoder.decode(b.subarray(pos+46,pos+46+nl));pos+=46+nl+extra+comment;
   if(!/^xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/sheet\d+\.xml)$/.test(name))continue;
   if(files.has(name)||flags&1||![0,8].includes(method)||raw>24*1024*1024||local+30>offset||v.getUint32(local,true)!==0x04034b50)throw Error('지원하지 않는 엑셀 압축');
   const start=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);
   if(start+compressed>offset)throw Error('엑셀 압축 범위 오류');
   files.set(name,{start,compressed,raw,method});
  }
  let total=0;
  return async name=>{
   const f=files.get(name);if(!f)return null;
   total+=f.raw;if(total>40*1024*1024)throw Error('엑셀 데이터가 너무 큽니다.');
   let bytes=b.subarray(f.start,f.start+f.compressed);
   if(f.method===8){const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')),reader=stream.getReader(),chunks=[];let n=0;while(true){const z=await reader.read();if(z.done)break;n+=z.value.length;if(n>f.raw){await reader.cancel();throw Error('엑셀 압축 크기 오류');}chunks.push(z.value);}const all=new Uint8Array(n);let p=0;for(const c of chunks){all.set(c,p);p+=c.length;}bytes=all;}
   if(bytes.length!==f.raw)throw Error('엑셀 크기 오류');return xml(decoder.decode(bytes));
  };
 }
 async function read(file){
  const load=await unzip(await file.arrayBuffer());
  const book=await load('xl/workbook.xml'),rels=await load('xl/_rels/workbook.xml.rels');if(!book||!rels)throw Error('엑셀 통합문서 오류');
  const sheets=nodes(book,'sheet'),sheet=sheets.find(s=>s.getAttribute('name')==='2026')||(sheets.length===1?sheets[0]:null);
  if(!sheet)throw Error('2026 시트 하나를 지정하세요.');
  const rid=sheet.getAttribute('r:id')||sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
  const relation=nodes(rels,'Relationship').find(r=>r.getAttribute('Id')===rid);
  const target=relation?.getAttribute('Target')||'';
  const path=target.startsWith('/')?target.slice(1):'xl/'+target;
  if(relation?.getAttribute('TargetMode')==='External'||!/^xl\/worksheets\/sheet\d+\.xml$/.test(path))throw Error('지원하지 않는 시트 경로');
  const doc=await load(path);if(!doc)throw Error('시트 없음');
  const ss=await load('xl/sharedStrings.xml'),shared=ss?nodes(ss,'si').map(x=>nodes(x,'t').map(t=>t.textContent).join('')):[];
  const styles=await load('xl/styles.xml');const formats=new Map(styles?nodes(styles,'numFmt').map(x=>[Number(x.getAttribute('numFmtId')),x.getAttribute('formatCode')]):[]);
  const xfs=styles?nodes(styles,'cellXfs')[0]:null;const styleIds=xfs?nodes(xfs,'xf').map(x=>Number(x.getAttribute('numFmtId'))):[];
  const rows=[];
  for(const r of nodes(doc,'row')){
   const line=[];for(const c of nodes(r,'c')){
    const ref=/^([A-Z]{1,3})[1-9]\d*$/.exec(c.getAttribute('r')||'');if(!ref)throw Error('셀 위치 오류');
    let col=0;for(const a of ref[1])col=col*26+a.charCodeAt(0)-64;col--;
    if(col>=140)throw Error('140열 이하 파일을 사용하세요.');
    const t=c.getAttribute('t'),val=nodes(c,'v')[0]?.textContent??'',formula=nodes(c,'f').length;
    if(formula&&val==='')throw Error('수식 계산값을 저장한 뒤 업로드하세요.');
    if(t==='e')throw Error('엑셀 오류값이 있습니다.');
    let value=t==='s'?shared[Number(val)]:t==='inlineStr'?nodes(c,'t').map(x=>x.textContent).join(''):val;
    if(t==='s'&&value===undefined)throw Error('문자열 참조 오류');
    const fmt=styleIds[Number(c.getAttribute('s')||0)],format=formats.get(fmt)||'';
    if(!t||t==='n'){
     if(value!==''&&([9,10].includes(fmt)||format.includes('%')))value=String(Number(value)*100)+'%';
     else if(value!==''&&([18,19,20,21,45,46,47].includes(fmt)||/h+[: ]m+/i.test(format))){const mins=Math.round((Number(value)%1)*1440)%1440;value=String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0');}
    }
    if(line[col]!==undefined)throw Error('중복 셀');line[col]=value;
   }
   if(line.some(v=>v!==''&&v!==undefined))rows.push(Array.from({length:line.length},(_,i)=>line[i]??''));
   if(rows.length>7001)throw Error('7000개교 이하 파일을 사용하세요.');
  }
  return rows;
 }
 window.BeaguEditedWorkbook={read};
})();
