(async () => {
  try {
    const {data,error}=await supabaseClient.rpc("beagu_latest_web_notice");
    if(error || !data?.note)return;
    const box=document.getElementById("releaseNotice");
    box.textContent="배구지수 웹 "+data.version+" 업데이트 · "+data.date.slice(0,10)+" · "+data.note;
    box.hidden=false;
  } catch { /* The homepage works while the release service is unavailable. */ }
})();
