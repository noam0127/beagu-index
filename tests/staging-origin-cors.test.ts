import {
  STAGING_PROJECT_URL,
  exactStagingOriginAllowed,
  originAllowedForProject,
} from "../supabase/functions/_shared/staging-origin.ts";

function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}
const render = "https://baegu-index-v110-sandbox.onrender.com";
const stage = STAGING_PROJECT_URL;
const prod = "https://snvzwrexuqavnfvzgxqj.supabase.co";
const productionOrigin = "https://baeguindex.com";
const localOrigin = "http://127.0.0.1:8000";
const ordinary = new Set([productionOrigin, "https://www.baeguindex.com",
  localOrigin, "https://noam0127.github.io"]);

Deno.test("only an exact, verified single Render origin can be enabled on stage", () => {
  check(exactStagingOriginAllowed(render, stage, render), "exact host should pass");
  for (const bad of [
    "http://baegu-index-v110-sandbox.onrender.com",
    render + "/admin.html", render + "?x=1", render + "#x",
    render + ":443", render + ".evil.com",
    "https://*.onrender.com", "https://onrender.com",
    "https://USER.onrender.com", "https://user@host.onrender.com",
    "https://example.onrender.com", "https://127.0.0.1:8000",
    "https://forms.gle",
  ]) check(!exactStagingOriginAllowed(bad,stage,render),"denied "+bad);
  check(!exactStagingOriginAllowed(render,stage,""),"unset origin must deny");
  check(!exactStagingOriginAllowed(render,prod,render),"production must deny");
  check(!exactStagingOriginAllowed(render,stage,render+"/"),"trailing slash must deny");
});

Deno.test("staging code cannot copy existing production CORS allowlist", () => {
  check(originAllowedForProject(render,ordinary,stage,render), "verified Render should pass");
  check(originAllowedForProject(localOrigin,ordinary,stage,render),"existing local QA origin should pass");
  check(!originAllowedForProject(productionOrigin,ordinary,stage,render),"prod host must not be allowed on stage");
  check(!originAllowedForProject("https://www.baeguindex.com",ordinary,stage,render),"prod www must be denied");
  check(!originAllowedForProject("https://noam0127.github.io",ordinary,stage,render),"unverified GitHub Pages must be denied");
  check(!originAllowedForProject("https://evil.onrender.com",ordinary,stage,render),"arbitrary Render host must be denied");
  check(!originAllowedForProject(render,ordinary,stage,""),"no config means no Render host");
  check(!originAllowedForProject(productionOrigin,new Set([productionOrigin]),stage,render),
    "production host must be denied even though present in original code");
});

Deno.test("production CORS remains its original allowlist", () => {
  check(originAllowedForProject(productionOrigin,ordinary,prod,render),"existing production host preserved");
  check(!originAllowedForProject(render,ordinary,prod,render),"Render must never open production");
  check(!originAllowedForProject("https://evil.onrender.com",ordinary,prod,"https://evil.onrender.com"),
    "accidental env flag cannot open a production function");
});

Deno.test("staging cannot silently allow random localhost ports", () => {
  const set=new Set(["http://127.0.0.1:8000","http://127.0.0.1:9999"]);
  check(!originAllowedForProject("http://127.0.0.1:9999",set,stage,render),
    "only bounded QA ports allowed");
  check(originAllowedForProject("http://127.0.0.1:8000",set,stage,render),"known QA port preserved");
});
