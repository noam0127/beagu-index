/* Game-specific CC0 music, controlled by each game's existing sound switch.
   Original music sources:
   volleyball: congusbongus, https://opengameart.org/content/keep-your-dream-alive-seamless-loop (CC0)
   teacher_run: HydroGene, https://opengameart.org/content/8-bit-jester-theme (CC0)
   When the source is unreachable, a small *original* synthesizer loop is used instead.
   No music is started before gameplay and a user gesture. */
(function(root){
 'use strict';
 const tracks=Object.freeze({
  volleyball:Object.freeze({
   url:'https://opengameart.org/sites/default/files/Keep%20your%20dream%20alive%21%20seamless.ogg',
   name:'Keep your dream alive!',artist:'congusbongus',volume:.13,tempo:148,
   lead:[659,784,880,988,880,784,659,587,659,784,988,1175,988,880,784,659],
   bass:[220,220,261.63,261.63,293.66,293.66,246.94,246.94]
  }),
  teacher_run:Object.freeze({
   url:'https://opengameart.org/sites/default/files/10._jester_theme_0.mp3',
   name:'8-bit Jester Theme',artist:'HydroGene',volume:.105,tempo:168,
   lead:[587,698,587,523,440,523,587,392,440,523,659,587,523,440,392,440],
   bass:[196,196,220,220,174.61,174.61,196,196]
  })
 });
 function create(kind){
  const track=tracks[kind];
  if(!track)throw new Error('Unknown game BGM');
  const audio=new Audio();
  audio.preload='none';
  audio.loop=true;
  audio.volume=track.volume;
  let wanted=false,requested=false,pending=false,unavailable=false,disposed=false;
  let ctx=null,timer=null,step=0;
  function note(freq,length,volume,type){
   if(!ctx||ctx.state!=='running')return;
   const start=ctx.currentTime;
   const osc=ctx.createOscillator(),gain=ctx.createGain();
   osc.type=type;
   osc.frequency.setValueAtTime(freq,start);
   gain.gain.setValueAtTime(.0001,start);
   gain.gain.exponentialRampToValueAtTime(volume,start+.012);
   gain.gain.exponentialRampToValueAtTime(.0001,start+length);
   osc.connect(gain);gain.connect(ctx.destination);
   osc.start(start);osc.stop(start+length+.025);
  }
  function fallbackTick(){
   if(!wanted||document.hidden||disposed)return;
   const index=step++%track.lead.length;
   note(track.lead[index],.20,.012,'square');
   if(index%2===0)note(track.bass[Math.floor(index/2)%track.bass.length],.33,.009,'triangle');
  }
  function stopFallback(){
   if(timer!==null){clearInterval(timer);timer=null}
   if(ctx&&ctx.state==='running')void ctx.suspend().catch(()=>{});
  }
  function startFallback(){
   if(timer!==null||disposed||!wanted||document.hidden)return;
   try{
    const Context=root.AudioContext||root.webkitAudioContext;
    if(!Context)return;
    if(!ctx)ctx=new Context();
    const begin=()=>{
     if(timer!==null||!wanted||document.hidden||disposed)return;
     fallbackTick();
     timer=setInterval(fallbackTick,Math.round(60000/track.tempo/2));
    };
    if(ctx.state==='suspended')void ctx.resume().then(begin).catch(()=>{});
    else begin();
   }catch(_){}
  }
  function sync(play){
   wanted=Boolean(play);
   if(disposed)return;
   if(!wanted||document.hidden){
    audio.pause();
    stopFallback();
    return;
   }
   if(unavailable){startFallback();return}
   if(!requested){audio.src=track.url;requested=true}
   if(!audio.paused||pending)return;
   pending=true;
   try{
    const promise=audio.play();
    if(promise&&typeof promise.then==='function'){
     promise.then(()=>{pending=false}).catch(error=>{
      pending=false;
      if(!wanted||disposed)return;
      // Browser autoplay lock is not a network failure; await another click.
      if(error?.name==='NotAllowedError'||error?.name==='AbortError')return;
      unavailable=true;
      startFallback();
     });
    }else pending=false;
   }catch(error){
    pending=false;
    if(error?.name==='NotAllowedError')return;
    unavailable=true;startFallback();
   }
  }
  const onError=()=>{
   unavailable=true;
   audio.pause();
   if(wanted)startFallback();
  };
  const onVisibility=()=>sync(wanted);
  audio.addEventListener('error',onError);
  document.addEventListener('visibilitychange',onVisibility);
  return Object.freeze({
   sync,
   get track(){return Object.freeze({name:track.name,artist:track.artist,source:track.url})},
   dispose(){
    disposed=true;wanted=false;audio.pause();stopFallback();
    audio.removeEventListener('error',onError);
    document.removeEventListener('visibilitychange',onVisibility);
    if(ctx)void ctx.close().catch(()=>{});
   }
  });
 }
 root.BeaguArcadeBgm=Object.freeze({create});
})(window);
