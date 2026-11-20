(() => {
  const get=id=>document.getElementById(id);
  const content=get("releaseContent"), status=get("releaseStatus"), section=get("webReleases");
  const labels={testing:"테스트 중",passed:"테스트 통과",failed:"실패",cancelled:"취소",queued:"승인 · 대기 중",running:"배포 중",success:"배포 성공"};
  let generation=0, timer;
  function add(parent,tag,text){
    const el=document.createElement(tag);
    if(text!=null)el.textContent=text;
    parent.append(el);
    return el;
  }
  async function api(action,params={}){
    const result=await supabaseClient.functions.invoke("beagu-web-release",{body:{action,...params}});
    if(result.error){
      const detail=await result.error.context?.json?.().catch(()=>null);
      throw Error(detail?.error || result.error.message);
    }
    return result.data;
  }
  function button(parent,label,onClick){
    const b=add(parent,"button",label);
    b.type="button"; b.className="secondary";
    b.onclick=async()=>{
      b.disabled=true;
      try {await onClick();await refresh()}catch(e){status.textContent=e.message}
      finally {b.disabled=false}
    };
  }
  function field(parent,label,value,multi=false){
    const wrapper=add(parent,"label",label);
    const el=add(wrapper,multi?"textarea":"input");el.value=value||"";
    return el;
  }
  function link(parent,title,url){
    const a=add(parent,"a",title);a.href=url;a.target="_blank";a.rel="noopener";return a;
  }
  async function refresh(){
    const g=++generation;
    clearTimeout(timer);
    try {
      const data=await api("list");
      if(section.hidden||g!==generation)return;
      const candidates=data.candidates, current=candidates.find(x=>x.id===data.current);
      const latest=candidates.find(x=>x.id===data.latest);
      status.textContent="운영 "+(data.current_version||"기준 버전 등록 전")+" · 테스트 "+(latest?.version||"후보 없음");
      content.replaceChildren();
      link(content,"운영 웹 열기","https://baeguindex.com");
      if(data.preview)link(content,"테스트 웹 열기",data.preview);
      const active=data.history.some(x=>["running","queued"].includes(x.state));
      for(const c of candidates){
        const detail=add(content,"details");detail.open=c.id===data.latest;
        add(detail,"summary",c.title+" · "+labels[c.state]);
        add(detail,"p",c.notes);add(detail,"p","커밋 "+c.sha+" · SHA-256 "+(c.digest||"검증 대기"));
        const diff=add(detail,"details");add(diff,"summary","변경 파일 · PR · 커밋");
        link(diff,"GitHub 변경 사항","https://github.com/noam0127/beagu-index/compare/"+c.changes.base+"..."+c.sha);
        for(const pr of c.changes.prs)link(diff,"PR #"+pr,"https://github.com/noam0127/beagu-index/pull/"+pr);
        for(const line of [...c.changes.files,...c.changes.commits])add(diff,"p",line);
        for(const check of c.checks||[])add(detail,"p",check.name+" · "+(labels[check.state]||check.state));
        const expected={nonce:crypto.randomUUID(),candidate:c.id,version:c.version,title:c.title,notes:c.notes,current:data.current};
        if(!active && c.id===data.latest && c.state==="passed" && !c.shipped_at){
          const version=field(detail,"버전",c.version), title=field(detail,"제목",c.title), notes=field(detail,"변경 내용",c.notes,true);
          button(detail,"수정 저장",()=>api("edit",{candidate:c.id,version:version.value,title:title.value,notes:notes.value}));
          button(detail,"본 웹에 배포",()=>{
            if(version.value!==c.version || title.value!==c.title || notes.value!==c.notes)throw Error("수정 내용을 먼저 저장해 주세요.");
            if(confirm(c.title+"을 운영 사이트에 배포할까요?\n"+c.notes))return api("deploy",expected);
          });
          button(detail,"배포 취소",()=>confirm("이 후보를 취소할까요?")&&api("cancel",expected));
        }
        if(c.shipped_at){
          if(!active&&c.id!==data.current)button(detail,"이 버전으로 롤백",()=>confirm(c.version+" 버전으로 되돌릴까요?")&&api("rollback",expected));
          const note=field(detail,"홈페이지 공개용 공지",c.public_note,true);
          button(detail,"공지 공개",()=>api("notice",{candidate:c.id,public_note:note.value,published:true}));
          button(detail,"공지 숨기기",()=>api("notice",{candidate:c.id,public_note:note.value,published:false}));
        }
      }
      add(content,"h3","배포 이력");
      for(const h of data.history)add(content,"p",[h.approved_at,h.kind==="rollback"?"롤백":"배포",candidates.find(c=>c.id===h.candidate)?.version||h.candidate,labels[h.state],h.finished_at,h.reason].filter(Boolean).join(" · "));
      if(active)timer=setTimeout(refresh,5000);
    }catch(e){if(g===generation)status.textContent="업데이트 이력 조회 실패 · "+e.message}
  }
  function reset(){++generation;clearTimeout(timer);content.replaceChildren();status.textContent="";section.hidden=true}
  get("releaseRefresh").onclick=refresh;
  window.WebReleases={reset,mount(role){reset();if(role==="owner"){section.hidden=false;void refresh()}}};
})();
