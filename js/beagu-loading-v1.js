/* 지연되는 페이지 이동·비동기 검색만 표시. 빠른 동작에는 깜빡임 없는 로딩 화면. */
(function(){
  'use strict';
  if(window.BeaguLoading) return;
  const DELAY_MS=350, MIN_VISIBLE_MS=300;
  let node=null, message=null, visibleAt=0, nextId=0, openTimer=null, closeTimer=null;
  const pending=new Map();
  function create(){
    if(node || !document.body) return;
    node=document.createElement('div');
    node.className='beagu-loading-screen';
    node.hidden=true;
    node.setAttribute('role','status');
    node.setAttribute('aria-live','polite');
    node.setAttribute('aria-atomic','true');
    node.innerHTML='<div class="beagu-loading-card">'+
      '<div class="beagu-loading-track" aria-hidden="true">'+
      '<svg class="beagu-loading-ball" viewBox="0 0 100 100" focusable="false" aria-hidden="true">'+
      '<circle cx="50" cy="50" r="45" fill="#fff" stroke="#527da9" stroke-width="3"/>'+
      '<path d="M20 16 Q53 46 24 83 M48 6 Q83 47 52 94 M78 17 Q46 50 79 84" fill="none" stroke="#628cb6" stroke-width="5" stroke-linecap="round"/>'+
      '<path d="M9 40 Q50 19 91 40 M8 67 Q51 85 92 66" fill="none" stroke="#b0c8e0" stroke-width="4" stroke-linecap="round"/>'+
      '</svg></div>'+
      '<p class="beagu-loading-title">배구지수</p>'+
      '<p class="beagu-loading-message">자료를 불러오는 중…</p></div>';
    message=node.querySelector('.beagu-loading-message');
    document.body.appendChild(node);
  }
  function setMessage(){
    const labels=Array.from(pending.values());
    if(message && labels.length) message.textContent=labels[labels.length-1].label;
  }
  function show(){
    openTimer=null;
    if(!pending.size) return;
    create();if(!node)return;
    if(closeTimer){clearTimeout(closeTimer);closeTimer=null}
    setMessage();
    if(node.hidden){node.hidden=false;visibleAt=performance.now()}
  }
  function hide(){
    if(openTimer){clearTimeout(openTimer);openTimer=null}
    if(closeTimer){clearTimeout(closeTimer);closeTimer=null}
    if(node)node.hidden=true;
  }
  function start(label, options){
    const id=++nextId;
    const timeoutMs=options && options.timeoutMs>0 ? options.timeoutMs : 30000;
    const info={label:typeof label==='string' && label ? label : '자료를 불러오는 중…',expire:null};
    pending.set(id,info);
    if(closeTimer){clearTimeout(closeTimer);closeTimer=null}
    if(node && !node.hidden)setMessage();
    else if(!openTimer)openTimer=setTimeout(show,DELAY_MS);
    info.expire=setTimeout(()=>finish(id),timeoutMs);
    return id;
  }
  function finish(id){
    const info=pending.get(id);
    if(!info)return;
    clearTimeout(info.expire);
    pending.delete(id);
    if(pending.size){setMessage();return}
    if(openTimer){clearTimeout(openTimer);openTimer=null}
    if(node && !node.hidden){
      const remain=Math.max(0,MIN_VISIBLE_MS-(performance.now()-visibleAt));
      closeTimer=setTimeout(()=>{closeTimer=null;if(!pending.size)hide()},remain);
    }
  }
  function clearAll(){
    for(const [id,info] of pending){clearTimeout(info.expire);pending.delete(id)}
    hide();
  }
  function validNavigation(event){
    if(event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)return false;
    const link=event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if(!link || link.hasAttribute('download') || (link.target && link.target!=='_self'))return false;
    let next;
    try{next=new URL(link.href,location.href)}catch{return false}
    if(!/^https?:$/.test(next.protocol) || next.origin!==location.origin)return false;
    if(next.pathname===location.pathname && next.search===location.search)return false;
    return true;
  }
  document.addEventListener('click',event=>{
    if(validNavigation(event))start('페이지를 이동하고 있습니다…',{timeoutMs:11000});
  });
  window.addEventListener('pageshow',event=>{if(event.persisted)clearAll()});
  window.addEventListener('pagehide',clearAll);
  window.BeaguLoading=Object.freeze({start,finish,clearAll});
})();
