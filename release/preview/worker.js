// Set PREVIEW_PASSWORD as a Worker secret before the first deployment.
export default {
  async fetch(request, env) {
    const headers = new Headers({"Cache-Control":"private,no-store","X-Robots-Tag":"noindex, nofollow, noarchive","Referrer-Policy":"no-referrer"});
    if (!env.PREVIEW_PASSWORD || request.headers.get("Authorization") !== "Basic " + btoa("owner:" + env.PREVIEW_PASSWORD)) {
      headers.set("WWW-Authenticate", 'Basic realm="Baegu TEST"');
      return new Response("테스트 웹 인증이 필요합니다.", {status:401,headers});
    }
    const response = await env.ASSETS.fetch(new Request(request.url,{method:request.method}));
    const out = new Response(response.body,response);
    headers.forEach((v,k)=>out.headers.set(k,v));
    out.headers.set("Content-Security-Policy","default-src 'self'; connect-src 'self' https://ycwuugggqbunlbwuzvbx.supabase.co wss://ycwuugggqbunlbwuzvbx.supabase.co; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; media-src 'self' blob:; form-action 'self'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
    return out;
  }
};
