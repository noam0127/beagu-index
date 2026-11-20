/* Korean live-action drama photo poses for original fictional adult teachers.
 * No player data, storage, network requests, or changes to the 36-episode engine. */
(function(root){
'use strict';
const VERSION='class-diary-male-natural/v2';
const POSES=Object.freeze({
 man:Object.freeze(['neutral','smile','shy','explaining','thinking','tired','listening','notebook']),
 man2:Object.freeze(['greeting','string-game','preparing','listening','thinking','demonstrating','smiling','bashful']),
 man3:Object.freeze(['greeting','volleyball','explaining','clipboard','awkward','thinking','listening','relaxed'])
});
const ASSETS=Object.freeze({
 man:Object.freeze({name:'한현우',src:'assets/class-diary/characters/hyunwoo-poses-v2.webp',columns:4,rows:2}),
 man2:Object.freeze({name:'차도겸',src:'assets/class-diary/characters/dogyeom-poses-v2.webp',columns:8,rows:1}),
 man3:Object.freeze({name:'백태오',src:'assets/class-diary/characters/taeo-poses-v2.webp',columns:8,rows:1})
});
const SPECIAL=Object.freeze({
 man:Object.freeze({1:0,3:3,6:2,12:2,16:6,17:4,19:5,20:5,23:5,29:6,30:1,34:2,35:1,36:7}),
 man2:Object.freeze({1:0,3:1,4:5,7:2,16:3,19:4,22:3,27:5,29:3,34:1,35:6,36:7}),
 man3:Object.freeze({1:0,3:2,6:1,9:5,16:2,19:3,22:5,27:1,29:3,30:6,34:7,35:1,36:7})
});
const DEFAULTS=Object.freeze({
 man:Object.freeze([0,1,6,3,4,2,5,7]),
 man2:Object.freeze([0,3,4,1,5,2,6,7]),
 man3:Object.freeze([0,2,6,3,5,1,4,7])
});
const status=Object.create(null);

/* Apply a same-origin, hair-only photographic adjustment once per eight-pose atlas.
   Canvas failure leaves the original photo untouched. No new storage or network calls. */
const hairSources=Object.create(null);
function restyleHyunwoo(image){
 try{
  const doc=root.document;
  if(!doc||typeof doc.createElement!=='function')return null;
  const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
  if(!width||!height||width<400||height<250)return null;
  const canvas=doc.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)return null;
  ctx.drawImage(image,0,0,width,height);
  const frame=ctx.getImageData(0,0,width,height),data=frame.data;
  const cw=width/4,ch=height/2;
  for(let pose=0;pose<8;pose++){
   const x0=(pose%4)*cw,y0=Math.floor(pose/4)*ch;
   // Darken only hair-toned pixels in the upper head region, never the skin below.
   for(let y=Math.floor(y0+ch*.015);y<Math.ceil(y0+ch*.235);y++)
    for(let x=Math.floor(x0+cw*.17);x<Math.ceil(x0+cw*.83);x++){
     const i=(y*width+x)*4,r=data[i],g=data[i+1],b=data[i+2];
     if(r>20&&r<162&&g<146&&b<145&&r>=g*.95&&r>=b*.92){
      data[i]=Math.round(r*.73);
      data[i+1]=Math.round(g*.76);
      data[i+2]=Math.round(b*.87);
     }
    }
  }
  ctx.putImageData(frame,0,0);
  for(let pose=0;pose<8;pose++){
   const x0=(pose%4)*cw,y0=Math.floor(pose/4)*ch;
   // Light, asymmetrical fringes in the hair zone rather than a flat fringe sticker.
   for(let strand=0;strand<9;strand++){
    const x=x0+cw*(.31+strand*.043);
    const top=y0+ch*(.114+(strand%3)*.006);
    const tip=y0+ch*(.190+(strand%4)*.006);
    const half=cw*(strand%3===0?.012:.008);
    ctx.beginPath();
    ctx.moveTo(x-half,top);
    ctx.quadraticCurveTo(x+cw*.015,top+ch*.042,x-cw*.014,tip);
    ctx.quadraticCurveTo(x+half,tip-ch*.021,x+half,top);
    ctx.closePath();
    ctx.fillStyle='rgba(29,27,32,'+(strand%3===0?.35:.22)+')';
    ctx.fill();
   }
  }
  return canvas.toDataURL('image/webp',.86);
 }catch(_){return null}
}
function spriteSource(partner){
 const asset=cast(partner);
 return asset?(hairSources[partner]||asset.src):null;
}

function cast(partner){return Object.prototype.hasOwnProperty.call(ASSETS,partner)?ASSETS[partner]:null}
function poseIndex(partner,episode,reflection,choiceId){
 if(!cast(partner))return 0;
 const n=Number(episode);
 if(!Number.isInteger(n)||n<1||n>36)return 0;
 if(reflection){return String(choiceId)==='1'?6:String(choiceId)==='2'?5:7}
 return Object.prototype.hasOwnProperty.call(SPECIAL[partner],n)?SPECIAL[partner][n]:DEFAULTS[partner][(n-1)%8];
}
function poseFor(partner,episode,reflection,choiceId){
 return POSES[partner]?POSES[partner][poseIndex(partner,episode,reflection,choiceId)]:null;
}
function paint(node,partner,episode,reflection,choiceId,season){
 const asset=cast(partner);
 if(!node||!node.style||!node.dataset)throw Error('MALE_POSE_NODE_REQUIRED');
 if(!asset)throw Error('MALE_POSE_UNKNOWN_ACTOR');
 const ix=poseIndex(partner,episode,reflection,choiceId);
 const x=ix%asset.columns,y=Math.floor(ix/asset.columns);
 node.style.backgroundImage='url("'+spriteSource(partner)+'")';
 node.style.backgroundRepeat='no-repeat';
 node.style.backgroundSize=(asset.columns*100)+'% '+(asset.rows*100)+'%';
 node.style.backgroundPosition=(asset.columns===1?0:100*x/(asset.columns-1))+'% '+(asset.rows===1?0:100*y/(asset.rows-1))+'%';
 node.dataset.maleAtlas='v2';
 node.dataset.maleActor=partner;
 node.dataset.pose=POSES[partner][ix];
 node.dataset.season=season||'cold-spring';
 return node;
}
function preload(partner,callback){
 const asset=cast(partner);
 if(!asset||typeof callback!=='function')throw Error('MALE_POSE_PRELOAD_ARGS');
 const existing=status[partner];
 if(existing&&existing.state==='ready'){callback();return true}
 if(existing&&existing.state==='failed')return false;
 if(existing){existing.callbacks.push(callback);return true}
 if(typeof Image!=='function')return false;
 const state=status[partner]={state:'loading',callbacks:[callback]};
 const image=new Image();image.decoding='async';
 image.onload=function(){
  if(partner==='man')hairSources.man=restyleHyunwoo(image)||asset.src;
  state.state='ready';const callbacks=state.callbacks.splice(0);
  callbacks.forEach(function(fn){fn()});
 };
 image.onerror=function(){state.state='failed';state.callbacks.length=0};
 image.src=asset.src;return true;
}
const api=Object.freeze({VERSION,POSES,ASSETS,SPECIAL,cast,poseIndex,poseFor,paint,preload,spriteSource});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryMaleNatural=api;
})(typeof window!=='undefined'?window:globalThis);
