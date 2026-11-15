import puppeteer from 'puppeteer-core';
import fs from 'fs';
const W='http://localhost:3000', PW='Demo!Pass2026';
const br=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const views={}; let css='';
async function login(email){const ctx=await br.createBrowserContext();const p=await ctx.newPage();await p.setViewport({width:1280,height:900});
 await p.goto(W+'/login',{waitUntil:'networkidle0'});await p.type('input[type=email]',email);await p.type('input[type=password]',PW);
 await Promise.all([p.waitForNavigation({waitUntil:'networkidle0'}).catch(()=>{}),p.keyboard.press('Enter')]);await wait(1500);
 if(!css){const hrefs=await p.evaluate(()=>[...document.querySelectorAll('link[rel=stylesheet]')].map(l=>l.href));for(const h of hrefs)css+=await (await fetch(h)).text();}
 return p;}
const grab=async(p,key,meta={})=>{const html=await p.evaluate(()=>{const b=document.body.cloneNode(true);b.querySelectorAll('script,next-route-announcer,nextjs-portal').forEach(e=>e.remove());b.querySelectorAll('input').forEach(i=>i.setAttribute('value',i.value));b.querySelectorAll('select').forEach(s=>{const o=s.options[s.selectedIndex];if(o)o.setAttribute('selected','')});return b.innerHTML});views[key]={html,path:await p.evaluate(()=>location.pathname+location.search),...meta};console.log(key,(html.length/1024|0)+'KB');};
const go=async(p,u,key,meta)=>{await p.goto(W+u,{waitUntil:'networkidle0'});await wait(1400);await grab(p,key,meta);};
const clickText=async(p,sel,text)=>{await p.evaluate((sel,text)=>{const b=[...document.querySelectorAll(sel)].find(x=>x.textContent.trim()===text);b&&b.click()},sel,text);await wait(1400);};
// Executive
let p=await login('ceo@demo.om');
for(const [tab,tk] of [['Summary','exec'],['Charts','charts']]){
 await p.goto(W+'/executive'+(tk==='charts'?'?view=charts':''),{waitUntil:'networkidle0'});await wait(1500);
 for(const [lbl,k] of [['Year to date','ytd'],['Month','month'],['Quarter','quarter'],['Year','year']]){await clickText(p,'.seg button',lbl);await grab(p,`${tk}-${k}`,{role:'exec'});}
}
// Property manager portal
p=await login('pm@demo.om');
for(const [u,k] of [['/','dashboard'],['/properties','buildings'],['/tenants','tenants'],['/contracts','contracts'],['/recovery','recovery'],['/cheques','cheques'],['/complaints','complaints'],['/notices','notices'],['/maintenance','maintenance'],['/imports','imports']]) await go(p,u,k,{role:'pm'});
const tid=await p.evaluate(async()=>{const r=await fetch('/api/tenants');return (await r.json()).find(t=>t.name==='Said Al Maskari')?.id});
await go(p,'/tenants/'+tid,'tenant-detail',{role:'pm'});
await p.goto(W+'/complaints',{waitUntil:'networkidle0'});await wait(1200);await p.evaluate(()=>document.querySelector('tr.clickable')?.click());await wait(1500);await grab(p,'complaint-detail',{role:'pm'});
await p.goto(W+'/recovery',{waitUntil:'networkidle0'});await wait(1200);for(const [l,k] of [['Arrears & follow-up','recovery-arrears'],['Verification queue (6)','recovery-verify']]){await clickText(p,'button',l);await grab(p,k,{role:'pm'});}
await p.goto(W+'/maintenance',{waitUntil:'networkidle0'});await wait(1200);await clickText(p,'button','Year to date');await grab(p,'maintenance-ytd',{role:'pm'});
// Tenant app
p=await login('tenant@demo.om');
for(const [u,k] of [['/t','t-home'],['/t/pay','t-pay'],['/t/complaints','t-complaints'],['/t/complaints/new','t-new'],['/t/flat','t-flat'],['/t/alerts','t-alerts']]) await go(p,u,k,{role:'tenant'});
const cid=await p.evaluate(async()=>{const r=await fetch('/api/me/complaints');return (await r.json())[0]?.id});
await go(p,'/t/complaints/'+cid,'t-complaint',{role:'tenant'});
// Technician app
p=await login('tech1@demo.om');
await go(p,'/m','m-jobs',{role:'tech'});
const jid=await p.evaluate(()=>{const a=[...document.querySelectorAll('a[href^="/m/jobs/"]')][0];return a&&a.getAttribute('href')});
if(jid) await go(p,jid,'m-job',{role:'tech'});
fs.writeFileSync('./views.json',JSON.stringify(views));fs.writeFileSync('./app.css',css);
console.log('css',css.length); await br.close();
