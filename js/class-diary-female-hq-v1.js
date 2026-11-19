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
function has(who){return Object.prototype.hasOwnProperty.call(PEOPLE,who)&&!!PEOPLE[who]&&typeof PEOPLE[who].dataUrl==='string';}
function portrait(who){return has(who)?PEOPLE[who].dataUrl:null;}
function face(who,expression){return emotions&&typeof emotions.get==='function'?emotions.get(who,expression):null;}
function validate(){
 const ids=['woman','none','suhyun','sea','yuri'];
 if(!ids.every(has))throw Error('FEMALE_HQ_ASSET_MISSING');
 for(const id of ids)for(const expression of ['neutral','smile','worried','flustered','tired','shy'])
  if(!face(id,expression))throw Error('FEMALE_HQ_EXPRESSION_MISSING_'+id+'_'+expression);
 return Object.freeze({characters:ids.length,expressions:ids.length*6});
}
const api=Object.freeze({VERSION,PEOPLE,has,portrait,face,validate});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryFemaleHQ=api;
})(typeof window!=='undefined'?window:globalThis);
