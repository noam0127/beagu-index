/* All five fictional female colleagues use original high-detail WebP portraits.
 * No network calls, tracking, saves or personal data. The former SVG art stays as fallback.
 */
(function(root){'use strict';
const VERSION='class-diary-female-hq/v1';
const PEOPLE=Object.freeze({
 woman:root.BeaguClassDiaryFemaleHQJiyoon,
 none:root.BeaguClassDiaryFemaleHQMinseo,
 suhyun:root.BeaguClassDiaryFemaleHQSuhyun,
 sea:root.BeaguClassDiaryFemaleHQSea,
 yuri:root.BeaguClassDiaryFemaleHQYuri
});
const emotions=root.BeaguClassDiaryFemaleHQEmotions;
function has(who){return Object.prototype.hasOwnProperty.call(PEOPLE,who)&&!!PEOPLE[who]&&typeof PEOPLE[who].dataUrl==='string';}
/* Skin-tone-only matte pass. All pixels stay in-memory; no network or persistence.
 * It gently compresses pale specular pixels on facial skin while preserving hair,
 * clothing, linework and the full-resolution original if Canvas is unsupported.
 */
const MATTE_CACHE=Object.create(null);
const MATTE_BUSY=Object.create(null);
const STYLE_KEYS=Object.freeze({
 woman:Object.freeze({shape:'soft-oval',gesture:'listening',palette:'cream'}),
 none:Object.freeze({shape:'angular-bob',gesture:'observing',palette:'sage'}),
 suhyun:Object.freeze({shape:'long-angular',gesture:'resolute',palette:'charcoal'}),
 sea:Object.freeze({shape:'mature-round',gesture:'steady',palette:'sand'}),
 yuri:Object.freeze({shape:'heart-smile',gesture:'energetic',palette:'lilac'})
});
function portrait(who){return has(who)?(MATTE_CACHE[who]||PEOPLE[who].dataUrl):null;}
function mattePixels(pixels,w,h){
 if(!pixels||!Number.isInteger(w)||!Number.isInteger(h))return;
 const limit=Math.round(h*.51);
 for(let y=0;y<limit;y++){
  for(let x=0;x<w;x++){
   const i=(y*w+x)*4;
   const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
   // The head/neck skin has a warm chroma; clothing grays and eye whites fail.
   if(pixels[i+3]<245||r<190||r<=g+8||g<=b+4||
      r-g>85||g-b>70)continue;
   const peak=Math.max(r,g,b);
   if(peak<=208)continue;
   const target=208+(peak-208)*.16;
   const scale=target/peak;
   pixels[i]=Math.round(r*scale);
   pixels[i+1]=Math.round(g*scale);
   pixels[i+2]=Math.round(b*scale);
  }
 }
}
function prepareMatte(onReady){
 if(typeof Image==='undefined'||typeof document==='undefined')return 0;
 let started=0;
 for(const id of Object.keys(STYLE_KEYS)){
  if(!has(id)||MATTE_CACHE[id]||MATTE_BUSY[id])continue;
  const source=PEOPLE[id].dataUrl;
  MATTE_BUSY[id]=true;started++;
  const img=new Image();
  img.onload=()=>{
   try{
    const canvas=document.createElement('canvas');
    canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx)throw Error('MATTE_CANVAS_UNAVAILABLE');
    ctx.drawImage(img,0,0);
    const frame=ctx.getImageData(0,0,canvas.width,canvas.height);
    mattePixels(frame.data,canvas.width,canvas.height);
    ctx.putImageData(frame,0,0);
    const result=canvas.toDataURL('image/webp',.86);
    if(result.startsWith('data:image/')){
     MATTE_CACHE[id]=result;
     if(typeof onReady==='function')onReady(id,result);
    }
   }catch(_){/* original remains available as a fallback */}
   finally{delete MATTE_BUSY[id];}
  };
  img.onerror=()=>{delete MATTE_BUSY[id];};
  img.src=source;
 }
 return started;
}
function face(who,expression){return emotions&&typeof emotions.get==='function'?emotions.get(who,expression):null;}
function validate(){
 const ids=['woman','none','suhyun','sea','yuri'];
 if(!ids.every(has))throw Error('FEMALE_HQ_ASSET_MISSING');
 for(const id of ids)for(const expression of ['neutral','smile','worried','flustered','tired','shy'])
  if(!face(id,expression))throw Error('FEMALE_HQ_EXPRESSION_MISSING_'+id+'_'+expression);
 return Object.freeze({characters:ids.length,expressions:ids.length*6});
}
const api=Object.freeze({VERSION,PEOPLE,STYLE_KEYS,has,portrait,face,validate,prepareMatte,mattePixels});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryFemaleHQ=api;
})(typeof window!=='undefined'?window:globalThis);
