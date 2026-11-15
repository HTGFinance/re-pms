import json
import base64
import sys
MODE=sys.argv[1] if len(sys.argv)>1 else 'all'
views=json.load(open('views.json')); css=open('app.css').read()
ROLES={'dashboard':('exec','pm'),'app':('tenant','tech')}.get(MODE)
if ROLES: views={k:v for k,v in views.items() if v.get('role') in ROLES}
B='/home/claude/re-pms/apps/web/public/brand/'
def uri(f): return 'data:image/png;base64,'+base64.b64encode(open(B+f,'rb').read()).decode()
LOGO, MARK = uri('logo-full.png'), uri('logo-mark.png')
from PIL import Image
import io
def small(f,w):
    im=Image.open(B+f); im=im.resize((w,int(im.height*w/im.width)),Image.LANCZOS); b=io.BytesIO(); im.save(b,'PNG',optimize=True); return 'data:image/png;base64,'+base64.b64encode(b.getvalue()).decode()
MARK=small('logo-mark.png',128); LOGO=small('logo-full.png',427)
for k,v in views.items(): v['html']=v['html'].replace('/brand/logo-mark.png','__MARK__').replace('/brand/logo-full.png','__LOGO__')
for k,v in views.items(): v['html']=v['html']
paths={}
for k,v in views.items():
    p=v['path']
    if k in ('exec-ytd',): paths['/executive']=k
    elif k=='charts-ytd': paths['/executive?view=charts']=k
    elif k=='invite': paths['/invite']=k
    elif k.startswith(('exec-','charts-','recovery-','maintenance-','complaint-detail','tenancy-done','tenant-new-detail')): pass
    else: paths.setdefault(p,k)
data=json.dumps({'mark':MARK,'logo':LOGO,'views':{k:v['html'] for k,v in views.items()},'role':{k:v.get('role') for k,v in views.items()},'paths':paths}).replace('</','<\\/')
start='''<div class="dstart">
<div class="dhero"><img class="dlogoimg" src="__LOGO__" alt="Hamdan Properties logo"><h1>Hamdan Properties</h1><div class="dsub">Property Management System</div><p>Executive dashboard, staff portal, tenant app and technician app. Pick a view to open it on your phone, tablet or computer.</p></div>
<div class="dgrid">
<a class="dcard" href="#exec-ytd"><span class="dic">📊</span><b>Executive dashboard</b><span>Owners and board: occupancy, collections, NOI vs budget, charts</span></a>
<a class="dcard" href="#dashboard"><span class="dic">🏢</span><b>Property &amp; finance portal</b><span>Buildings, tenants, contracts, rent recovery, cheques, maintenance</span></a>
<a class="dcard" href="#t-home"><span class="dic">📱</span><b>Tenant app</b><span>Rent due, pay, repairs with photos, contract, alerts</span></a>
<a class="dcard" href="#m-jobs"><span class="dic">🛠</span><b>Technician app</b><span>Jobs for today, directions, updates, costs</span></a>
<a class="dcard" href="#tenants-new"><span class="dic">📝</span><b>New tenant sign-up (office)</b><span>One form after signing: tenant, ID, passport, photo, documents, flat, rent, payment mode. Creates the app invitation.</span></a>
<a class="dcard" href="#invite"><span class="dic">🔗</span><b>Tenant invitation (tenant's phone)</b><span>What the tenant sees when they open the link: choose a password, then add the app to the home screen</span></a>
</div>
<p class="dnote">Shown with sample data (4 buildings, 94 units, 86 tenants) until the group’s buildings are loaded. Saving, payments and uploads are switched off in this file; they work in the live system.</p>
</div>'''
HERO_END='</p></div>'
if MODE=='dashboard':
    start=start.replace('Executive dashboard, staff portal, tenant app and technician app. Pick a view to open it on your phone, tablet or computer.','Executive dashboard and staff portal for owners, management, property, finance and recovery teams. Opens on computer, tablet and phone.')
    import re
    start=re.sub(r'<a class="dcard" href="#(t-home|m-jobs|invite)">.*?</a>\n?','',start)
    TITLE='Hamdan Properties — Dashboard'; OUT='Hamdan_Properties_Dashboard.html'
elif MODE=='app':
    import re
    start=start.replace('Executive dashboard, staff portal, tenant app and technician app. Pick a view to open it on your phone, tablet or computer.','Mobile app for tenants and maintenance technicians. Best opened on a phone.')
    start=re.sub(r'<a class="dcard" href="#(exec-ytd|dashboard|tenants-new)">.*?</a>\n?','',start)
    start=start.replace('<div class="dsub">Property Management System</div>','<div class="dsub">Tenant &amp; Technician App</div>')
    TITLE='Hamdan Properties — App'; OUT='Hamdan_Properties_App.html'
else:
    TITLE='Hamdan Properties — Dashboard and App'; OUT='index.html'
html='''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#1d1d1b"><title>__TITLE__</title>
<style>'''+css+'''
.dstart{min-height:100vh;background:linear-gradient(160deg,#1d1d1b,#34342f);position:relative;color:#fff;padding:32px 18px 60px;display:flex;flex-direction:column;align-items:center;gap:24px}
.dstart:before{content:'';position:absolute;left:0;right:0;top:0;height:6px;background:linear-gradient(90deg,#feed01 0 50%,#e40613 50% 100%)}.dhero{max-width:760px;text-align:center;display:flex;flex-direction:column;align-items:center}.dlogoimg{width:230px;max-width:70vw;height:auto;margin:10px 0 6px}.dsub{color:#feed01;font-weight:600;letter-spacing:.08em;text-transform:uppercase;font-size:12px;margin-bottom:10px}.dhero h1{font-size:34px;margin:6px 0}.dhero p{color:#dbe5f1;font-size:16px;line-height:1.5;margin:0}
.dgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;width:100%;max-width:760px}
.dcard{background:#fff;color:#1e293b;border-radius:16px;padding:18px;text-decoration:none;display:flex;flex-direction:column;gap:6px;box-shadow:0 12px 30px rgba(0,0,0,.2);min-height:44px}
.dcard b{font-size:16px;color:#1d1d1b}.dcard{border-top:4px solid #e40613}.dcard span{font-size:13px;color:#64748b;line-height:1.45}.dcard .dic{font-size:26px}
.dcard:active{transform:scale(.98)}
.dnote{color:#c5d3e0;font-size:13px;text-align:center;max-width:560px}
@media(max-width:560px){.dgrid{grid-template-columns:1fr}.dhero h1{font-size:28px}}
.dpill{position:fixed;right:12px;bottom:calc(14px + env(safe-area-inset-bottom));z-index:70;background:#0f172a;color:#fff;border:0;border-radius:999px;padding:9px 14px;font-size:12px;font-weight:600;box-shadow:0 8px 20px rgba(0,0,0,.3);min-height:0}
.dpill:hover{background:#1e293b}.dpill.up{bottom:calc(76px + env(safe-area-inset-bottom))}
#dtoast{position:fixed;left:50%;top:18px;transform:translateX(-50%);background:#0f172a;color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;z-index:90;max-width:90vw;opacity:0;transition:opacity .25s;pointer-events:none;text-align:center}
#dtoast.show{opacity:1}
.dscrim{position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:55;display:none}
@media(max-width:1023px){.dscrim.on{display:block}}
</style></head><body>
<div id="root"></div><div class="dscrim" id="dscrim"></div><div id="dtoast" role="status" aria-live="polite"></div>
<button class="dpill" id="dpill" type="button" hidden>⌂ Menu</button>
<script id="data" type="application/json">'''+data+'''</script>
<script>
(function(){
var D=JSON.parse(document.getElementById('data').textContent);
var START=__START__;
var root=document.getElementById('root'),toastEl=document.getElementById('dtoast'),pill=document.getElementById('dpill'),scrim=document.getElementById('dscrim');
var tt;function toast(m){toastEl.textContent=m;toastEl.classList.add('show');clearTimeout(tt);tt=setTimeout(function(){toastEl.classList.remove('show')},2600)}
var OFF='Saving is switched off in this file. It works in the live system.';
function keyFor(href){var r=keyFor0(href);return r&&D.views[r]?r:null}
function keyFor0(href){if(!href||href.charAt(0)!=='/')return null;
 if(D.paths[href])return D.paths[href];
 if(/^\\/tenants\\/[^/]+$/.test(href))return 'tenant-detail';
 if(/^\\/t\\/complaints\\/[^/]+$/.test(href))return 't-complaint';
 if(/^\\/m\\/jobs\\/[^/]+$/.test(href))return 'm-job';
 if(href.indexOf('/m?')===0)return 'm-jobs';
 var q=href.split('?')[0];if(D.paths[q])return D.paths[q];return null}
function closeMenu(){var a=root.querySelector('aside');if(a)a.classList.remove('open');scrim.classList.remove('on')}
function go(k){if(location.hash==='#'+k)render();else location.hash=k}
function period(k){var m=k.match(/^(exec|charts)-(.*)$/);return m?m:null}
function render(){
 var k=(location.hash||'').slice(1);if(!D.views[k])k='start';
 root.innerHTML=(k==='start'?START:D.views[k]).split('__MARK__').join(D.mark).split('__LOGO__').join(D.logo);closeMenu();window.scrollTo(0,0);
 var role=D.role[k];pill.hidden=k==='start';pill.classList.toggle('up',role==='tenant'||role==='tech');
 root.querySelectorAll('a[href]').forEach(function(a){var h=a.getAttribute('href');if(h.charAt(0)==='#')return;var t=keyFor(h);if(t){a.setAttribute('href','#'+t)}else{a.setAttribute('data-off',h.indexOf('/api/')===0?'dl':'1');a.setAttribute('href','#'+k)}});
 root.querySelectorAll('form').forEach(function(f){f.addEventListener('submit',function(e){e.preventDefault();toast(OFF)})});
 root.querySelectorAll('select').forEach(function(s){s.addEventListener('change',function(){toast('filters show the sample view. They work live in the full system.')})});
 var p=period(k);
 root.querySelectorAll('button').forEach(function(b){var t=b.textContent.trim();var to=null;
  if(p){var map={'Year to date':'ytd','Month':'month','Quarter':'quarter','Year':'year'};
   if(b.closest('.seg')&&map[t])to=p[1]+'-'+map[t];
   if(b.closest('.seg')&&t==='From – To')b.dataset.msg='pick any dates in the full system.';
   if(t==='Summary')to='exec-'+p[2];if(t==='Charts')to='charts-'+p[2];}
  if(k.indexOf('recovery')===0){if(t==='Rent schedule')to='recovery';if(t==='Arrears & follow-up')to='recovery-arrears';if(/^Verification queue/.test(t))to='recovery-verify';if(t==='All payments')b.dataset.msg='payment history is in the full system.';}
  if(k.indexOf('maintenance')===0){if(t==='This month')to='maintenance';if(t==='Year to date')to='maintenance-ytd';}
  if(k==='complaint-detail'&&(t==='×'||t==='Close'||t==='Cancel'))to='complaints';
  if(k==='tenants-new'&&t==='Create tenancy')to='tenancy-done';
  if(k==='tenancy-done'&&t==='+ Another tenancy')to='tenants-new';
  if(k==='invite'&&t==='Activate my app')to='t-welcome';
  if(b.classList.contains('mbtn')||b.classList.contains('mclose'))return;
  if(/^Sign out$/.test(t)){to='start'}
  if(to)b.dataset.v=to;});
 if(k==='tenancy-done')root.querySelectorAll('a[href="#tenant-detail"]').forEach(function(a){a.setAttribute('href','#tenant-new-detail')});
 root.querySelectorAll('a').forEach(function(a){if(a.textContent.trim()==='Sign out'){a.setAttribute('href','#start');a.removeAttribute('data-off')}});
 if(k==='complaints'||k==='tenants')root.querySelectorAll('tr.clickable').forEach(function(r){r.dataset.v=k==='complaints'?'complaint-detail':'tenant-detail'});
}
root.addEventListener('click',function(e){
 var t=e.target;
 var mb=t.closest('.mbtn');if(mb){var a=root.querySelector('aside');if(a){a.classList.add('open');scrim.classList.add('on')}return}
 if(t.closest('.mclose')){closeMenu();return}
 var a=t.closest('a[data-off]');if(a){e.preventDefault();toast(a.getAttribute('data-off')==='dl'?'Excel downloads work in the full system.':'this screen opens in the full system.');return}
 var v=t.closest('[data-v]');if(v){e.preventDefault();if(v.dataset.v==='tenant-detail'&&v.tagName==='TR')toast('Demo shows one sample tenant.');go(v.dataset.v);return}
 var b=t.closest('button');if(b){if(b.dataset.msg){toast(b.dataset.msg);return}var ty=(b.getAttribute('type')||'submit');if(!b.closest('form')||ty!=='submit'){toast(OFF)}return}
 if(t.closest('aside nav a'))closeMenu();
 if(k0()==='complaint-detail'&&t.classList&&t.classList.contains('modal'))go('complaints');
});
function k0(){return (location.hash||'').slice(1)}
scrim.addEventListener('click',closeMenu);
pill.addEventListener('click',function(){go('start')});
window.addEventListener('hashchange',render);render();
})();
</script></body></html>'''
html=(html.replace('.dgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))','.dgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))') if MODE!='all' else html).replace('__TITLE__',TITLE).replace('__START__',json.dumps(start).replace('</','<\\/'))
open(OUT,'w').write(html)
print(OUT,len(html)//1024,'KB')
