const { chromium } = require("playwright");
const fs = require("node:fs");
(async()=>{
  const origin = new URL(process.env.PREVIEW_URL).origin;
  const browser = await chromium.launch();
  const checks=JSON.parse(fs.readFileSync("checks.json"));
  try {
    for(const width of [390,1280]){
      const context=await browser.newContext({viewport:{width,height:844},
        httpCredentials:{origin,username:"owner",password:process.env.PREVIEW_PASSWORD}});
      for(const file of ["index","search","statistics","challenge","postit","teacher-run","teacher-volleyball","admin"]){
        const page=await context.newPage(), errors=[];
        page.on("pageerror", e=>errors.push(e.message));
        page.on("response", r=>{if(new URL(r.url()).origin===origin&&r.status()>=400)errors.push(r.status()+" "+r.url())});
        await page.route(/https:\/\/(?:snvzwrexuqavnfvzgxqj\.supabase\.co|(?:www\.)?baeguindex\.com|forms\.gle|docs\.google\.com)\//,route=>{
          if(new URL(route.request().url()).origin===origin)return route.continue();
          errors.push("운영 요청 감지");return route.abort();
        });
        try {
          await page.goto(origin+"/"+file+".html",{waitUntil:"load",timeout:30000});
          await page.getByText("TEST · 테스트 웹",{exact:true}).waitFor();
          if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2))errors.push("가로 넘침");
        }catch(e){errors.push(e.message)}
        checks.push({name:file+" "+width+"px",state:errors.length?"failed":"passed",errors});
        await page.close();
      }
      await context.close();
    }
  }finally{await browser.close();fs.writeFileSync("checks.json",JSON.stringify(checks))}
  if(checks.some(c=>c.state!=="passed"))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
