// Test-only informational endpoint. Supabase .supabase.co blocks HTML rendering.
// Do NOT serve credentials, markup, or a faux frontend here.
const text=[
 '배구지수 Lv0~Lv2 테스트 웹 — 정적 화면 호스팅 변경 안내',
 '',
 'Supabase의 기본 도메인은 GET text/html 응답을 text/plain으로 변환합니다.',
 '따라서 이 주소에서 테스트 웹을 직접 표시할 수 없습니다.',
 '',
 '안전한 테스트 프론트엔드는 별도 Vercel 또는 Cloudflare Pages 프로젝트에 배포해야 합니다.',
 '테스트 소스 및 준비 사항:',
 'https://github.com/noam0127/beagu-index/pull/56',
 '',
 '운영 배구지수(baeguindex.com)와 기존 Supabase는 변경하지 않습니다.',
 '이 주소에는 이메일, 비밀번호, 고유번호를 입력하지 마세요.'
].join('\n');
Deno.serve((req:Request)=>new Response(req.method==='HEAD'?null:text,{
 status:req.method==='GET'||req.method==='HEAD'?200:405,
 headers:{
  'Content-Type':'text/plain; charset=utf-8',
  'Cache-Control':'no-store, max-age=0',
  'X-Robots-Tag':'noindex, nofollow, noarchive, nosnippet',
  'Referrer-Policy':'no-referrer',
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY'
 }
}));
