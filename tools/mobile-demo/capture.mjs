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

// New tenancy form, filled like a real signing
await p.goto(W+'/tenants/new',{waitUntil:'networkidle0'});await wait(1500);
const typeIn=async(label,val)=>{await p.evaluate((label,val)=>{const f=[...document.querySelectorAll('.form > div')].find(x=>(x.querySelector('label')?.textContent||'').startsWith(label));const i=f&&f.querySelector('input,textarea');if(!i)return;const set=Object.getOwnPropertyDescriptor(i.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set;set.call(i,val);i.dispatchEvent(new Event('input',{bubbles:true}));},label,val);};
const pick=async(label,idx)=>{await p.evaluate((label,idx)=>{const f=[...document.querySelectorAll('.form > div')].find(x=>(x.querySelector('label')?.textContent||'').startsWith(label));const s=f&&f.querySelector('select');if(!s)return;const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(s,s.options[Math.min(idx,s.options.length-1)].value);s.dispatchEvent(new Event('change',{bubbles:true}));},label,idx);await wait(500);};
await typeIn('Full name','Ahmed Al Hinai');await typeIn('Mobile','9123 4567');await typeIn('Email','ahmed.hinai@example.com');await typeIn('Nationality','Omani');
await typeIn('ID / CR number','12345678');await typeIn('ID expiry','2029-03-31');await typeIn('Passport number','OM1234567');await typeIn('Passport expiry','2031-06-30');
await pick('Property',1);await pick('Flat / unit',1);await typeIn('Start date','2026-12-01');await wait(400);
await p.evaluate(()=>{const f=[...document.querySelectorAll('.form > div')].find(x=>(x.querySelector('label')?.textContent||'').startsWith('Start date'));const i=f.querySelector('input');i.dispatchEvent(new Event('change',{bubbles:true}))});await wait(600);
await pick('Payment mode',1);
await grab(p,'tenants-new',{role:'pm'});
await Promise.all([p.waitForFunction(()=>document.body.innerText.includes('Tenancy created'),{timeout:20000}),p.evaluate(()=>document.querySelector('.formbar button.primary').click())]);await wait(1500);
await grab(p,'tenancy-done',{role:'pm'});
const newId=await p.evaluate(()=>{const a=[...document.querySelectorAll('a')].find(x=>x.textContent.trim()==='Open tenant');return a&&a.getAttribute('href').split('/').pop()});
await go(p,'/tenants/'+newId,'tenant-new-detail',{role:'pm'});
const link=await p.evaluate(async(id)=>{const r=await fetch('/api/tenants/'+id+'/invite',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});return (await r.json()).link},newId);
{const ctx=await br.createBrowserContext();const q=await ctx.newPage();await q.setViewport({width:1280,height:900});await q.goto(link.replace(/^https?:\/\/[^/]+/,W),{waitUntil:'networkidle0'});await wait(1200);await grab(q,'invite',{role:'tenant'});
 const pw='Welcome!2026x';await q.evaluate(pw=>{document.querySelectorAll('input[type=password]').forEach(i=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,pw);i.dispatchEvent(new Event('input',{bubbles:true}))})},pw);
 await Promise.all([q.waitForNavigation({waitUntil:'networkidle0'}).catch(()=>{}),q.evaluate(()=>document.querySelector('form button.primary, form button[type=submit], form button').click())]);await wait(1800);
 await grab(q,'t-welcome',{role:'tenant'});}
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
