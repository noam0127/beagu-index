// Local VM contract: not a browser or a deployment test. No real network calls.
const vm=require('node:vm'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../js/beagu-release-info-v1.js'),'utf8');
const base={schema:1,version:'v1.2.0',name:'정돈',environment:'candidate',commit:null,builtAt:null,deployedAt:null,changes:['UI 개선','<img src=x onerror=alert(1)>']};
class Element{constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.className='';this.classList={contains:()=>false}}append(...kids){this.children.push(...kids)}}
async function run({meta=base,host='baeguindex.com',path='/',game=false,embedded=false,status=200}){
 const body=new Element('body');body.classList.contains=x=>game&&x==='arcade-body';
 const document={body,currentScript:{src:'https://'+host+path+'js/beagu-release-info-v1.js'},createElement:t=>new Element(t)};
 const win={};win.self=win;win.top=embedded?{}:win;let fetchCount=0;
 vm.runInNewContext(code,{window:win,document,location:{hostname:host,pathname:path},URL,fetch:async(url,opts)=>{fetchCount++;assert.equal(url.origin,'https://'+host);assert.equal(opts.credentials,'same-origin');return {ok:status===200,json:async()=>meta}}});
 await new Promise(r=>setImmediate(r));return {body,fetchCount,summary:body.children[0]?.children[0]?.children[0]?.textContent,panel:body.children[0]?.children[0]?.children[1]};
}
(async()=>{const prod={...base,environment:'production',commit:'a'.repeat(40),builtAt:'2026-11-24T00:00:00Z',deployedAt:'2026-11-24T00:10:00Z'};
 const cases=[{args:{},expected:'미배포 · v1.2.0 · 정돈'},{args:{meta:prod},expected:'v1.2.0 · 정돈'},{args:{meta:prod,host:'www.baeguindex.com'},expected:'v1.2.0 · 정돈'},{args:{meta:prod,path:'/_preview/'},expected:'미배포 · v1.2.0 · 정돈'},{args:{meta:prod,host:'example.test'},expected:'미배포 · v1.2.0 · 정돈'},{args:{meta:{...prod,commit:'bad'}},expected:'미배포 · v1.2.0 · 정돈'},{args:{meta:{...prod,version:'bad'}},expected:'버전 확인 불가'},{args:{status:404},expected:'버전 확인 불가'},{args:{game:true},expected:undefined},{args:{embedded:true},expected:undefined}];
 for(const t of cases){const r=await run(t.args);assert.equal(r.summary,t.expected);if(t.expected===undefined)assert.equal(r.fetchCount,0)}
 const r=await run({meta:prod});assert.match(r.panel.children[0].textContent,/aaaaaaaaaaaa/);assert.match(r.panel.children[1].textContent,/2026/);assert.equal(r.panel.children.at(-1).children[1].tag,'li');assert.equal(r.panel.children.at(-1).children[1].textContent,'<img src=x onerror=alert(1)>');console.log('PASS: version metadata 13 groups; mock DOM, no network');
})().catch(e=>{console.error(e);process.exitCode=1});
