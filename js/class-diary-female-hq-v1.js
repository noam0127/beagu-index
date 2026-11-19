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
/* Restore the original photo-style high-resolution portraits.
 * Preserve the matte edition files in the repository for possible future use.
 * No canvas recoloring or alternate anime-style assets are loaded.
 */
const BUST_CROP=Object.freeze({
 // Fraction of the original height retained, from the top of the same photo.
 // Keep facial identity and clothing exactly as in the approved photo-style art.
 woman:0.66,none:0.71,suhyun:0.69,sea:0.70,yuri:0.69
});
const BUST_CACHE=Object.create(null);
const BUST_BUSY=Object.create(null);
function has(who){return Object.prototype.hasOwnProperty.call(PEOPLE,who)&&!!PEOPLE[who]&&typeof PEOPLE[who].dataUrl==='string';}
function hasBust(who){return !!BUST_CACHE[who];}
function portrait(who){return has(who)?(BUST_CACHE[who]||PEOPLE[who].dataUrl):null;}
/* Reframe approved photographs as shoulders-to-waist portraits in the browser.
 * An ordinary, same-origin Canvas crop: no face regeneration, recoloring,
 * network calls, uploads, storage, tracking or modification of male portraits.
 * If Canvas or WebP encoding is unavailable, retain the photo original.
 */
function prepareBust(onReady){
 if(typeof Image==='undefined'||typeof document==='undefined')return 0;
 let started=0;
 for(const who of Object.keys(BUST_CROP)){
  if(!has(who)||BUST_CACHE[who]||BUST_BUSY[who])continue;
  BUST_BUSY[who]=true;started++;
  const image=new Image();
  image.onload=()=>{
   try{
    const width=image.naturalWidth||image.width;
    const height=image.naturalHeight||image.height;
    if(width<32||height<64)throw Error('FEMALE_BUST_DIMENSIONS');
    const cropHeight=Math.max(1,Math.round(height*BUST_CROP[who]));
    const canvas=document.createElement('canvas');
    canvas.width=width;
    canvas.height=cropHeight;
    const ctx=canvas.getContext('2d');
    if(!ctx)throw Error('FEMALE_BUST_CANVAS');
    ctx.drawImage(image,0,0,width,cropHeight,0,0,width,cropHeight);
    const url=canvas.toDataURL('image/webp',.86);
    if(!url.startsWith('data:image/webp;base64,'))throw Error('FEMALE_BUST_WEBP');
    BUST_CACHE[who]=url;
    if(typeof onReady==='function')onReady(who,url);
   }catch(_){
    // Keep the unmodified original photo if cropping is unsupported.
   }finally{delete BUST_BUSY[who];}
  };
  image.onerror=()=>{delete BUST_BUSY[who];};
  image.src=PEOPLE[who].dataUrl;
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
const api=Object.freeze({VERSION,PEOPLE,BUST_CROP,has,hasBust,portrait,prepareBust,face,validate});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryFemaleHQ=api;
})(typeof window!=='undefined'?window:globalThis);
