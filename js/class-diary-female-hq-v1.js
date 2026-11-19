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
/* Original high-resolution photographic cutouts: five distinct natural
 * head-to-mid-thigh (3/4) poses with real alpha transparency, no rectangle or scenery.
 * The preexisting full-body photo data remains an offline/rollback fallback.
 * Images are served as immutable same-origin WebP assets, not Canvas crops.
 */
const BUST_ASSETS=Object.freeze({
 woman:'assets/class-diary/characters/female-jiyoon-thigh-v4.webp',
 none:'assets/class-diary/characters/female-minseo-thigh-v4.webp',
 suhyun:'assets/class-diary/characters/female-suhyun-thigh-v4.webp',
 sea:'assets/class-diary/characters/female-sea-thigh-v4.webp',
 yuri:'assets/class-diary/characters/female-yuri-thigh-v4.webp'
});
function has(who){return Object.prototype.hasOwnProperty.call(PEOPLE,who)&&!!PEOPLE[who]&&typeof PEOPLE[who].dataUrl==='string';}
function hasBust(who){return has(who)&&Object.prototype.hasOwnProperty.call(BUST_ASSETS,who);}
function portrait(who){return hasBust(who)?BUST_ASSETS[who]:null;}
function legacyPortrait(who){return has(who)?PEOPLE[who].dataUrl:null;}
function prepareBust(){return 0;} // A real transparent asset is ready immediately.
function face(who,expression){return emotions&&typeof emotions.get==='function'?emotions.get(who,expression):null;}
function validate(){
 const ids=['woman','none','suhyun','sea','yuri'];
 if(!ids.every(has))throw Error('FEMALE_HQ_ASSET_MISSING');
 for(const id of ids)for(const expression of ['neutral','smile','worried','flustered','tired','shy'])
  if(!face(id,expression))throw Error('FEMALE_HQ_EXPRESSION_MISSING_'+id+'_'+expression);
 return Object.freeze({characters:ids.length,expressions:ids.length*6});
}
const api=Object.freeze({VERSION,PEOPLE,BUST_ASSETS,has,hasBust,portrait,legacyPortrait,prepareBust,face,validate});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryFemaleHQ=api;
})(typeof window!=='undefined'?window:globalThis);
