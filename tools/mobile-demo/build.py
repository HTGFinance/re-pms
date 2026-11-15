import json
views=json.load(open('views.json')); css=open('app.css').read()
for k,v in views.items(): v['html']=v['html']
paths={}
for k,v in views.items():
    p=v['path']
    if k in ('exec-ytd',): paths['/executive']=k
    elif k=='charts-ytd': paths['/executive?view=charts']=k
    elif k.startswith(('exec-','charts-','recovery-','maintenance-','complaint-detail')): pass
    else: paths.setdefault(p,k)
data=json.dumps({'views':{k:v['html'] for k,v in views.items()},'role':{k:v.get('role') for k,v in views.items()},'paths':paths}).replace('</','<\\/')
start='''<div class="dstart">
<div class="dhero"><div class="dlogo">RE-PMS</div><h1>Live demo</h1><p>Property management for Oman and the Gulf. Pick a view to explore it on your phone, tablet or computer.</p></div>
<div class="dgrid">
<a class="dcard" href="#exec-ytd"><span class="dic">📊</span><b>Executive dashboard</b><span>Owners and board: occupancy, collections, NOI vs budget, charts</span></a>
<a class="dcard" href="#dashboard"><span class="dic">🏢</span><b>Property &amp; finance portal</b><span>Buildings, tenants, contracts, rent recovery, cheques, maintenance</span></a>
<a class="dcard" href="#t-home"><span class="dic">📱</span><b>Tenant app</b><span>Rent due, pay, repairs with photos, contract, alerts</span></a>
<a class="dcard" href="#m-jobs"><span class="dic">🛠</span><b>Technician app</b><span>Jobs for today, directions, updates, costs</span></a>
</div>
<p class="dnote">Sample data: 4 buildings, 94 units, 86 tenants. Saving, payments and uploads are switched off in this demo.</p>
</div>'''
html='''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#1f3a5f"><title>RE-PMS — Live demo (dashboard and mobile app)</title>
<style>'''+css+'''
.dstart{min-height:100vh;background:linear-gradient(160deg,#1f3a5f,#2b5a8a);color:#fff;padding:32px 18px 60px;display:flex;flex-direction:column;align-items:center;gap:24px}
.dhero{max-width:760px;text-align:center}.dlogo{font-weight:800;letter-spacing:.06em;color:#9fd8cf}.dhero h1{font-size:34px;margin:6px 0}.dhero p{color:#dbe5f1;font-size:16px;line-height:1.5;margin:0}
.dgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;width:100%;max-width:760px}
.dcard{background:#fff;color:#1e293b;border-radius:16px;padding:18px;text-decoration:none;display:flex;flex-direction:column;gap:6px;box-shadow:0 12px 30px rgba(0,0,0,.2);min-height:44px}
.dcard b{font-size:16px;color:#1f3a5f}.dcard span{font-size:13px;color:#64748b;line-height:1.45}.dcard .dic{font-size:26px}
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
<button class="dpill" id="dpill" type="button" hidden>⌂ Demo menu</button>
<script id="data" type="application/json">'''+data+'''</script>
<script>
(function(){
var D=JSON.parse(document.getElementById('data').textContent);
var START=__START__;
var root=document.getElementById('root'),toastEl=document.getElementById('dtoast'),pill=document.getElementById('dpill'),scrim=document.getElementById('dscrim');
var tt;function toast(m){toastEl.textContent=m;toastEl.classList.add('show');clearTimeout(tt);tt=setTimeout(function(){toastEl.classList.remove('show')},2600)}
var OFF='Demo: saving is switched off here. In the full system this works.';
function keyFor(href){if(!href||href.charAt(0)!=='/')return null;
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
 root.innerHTML=k==='start'?START:D.views[k];closeMenu();window.scrollTo(0,0);
 var role=D.role[k];pill.hidden=k==='start';pill.classList.toggle('up',role==='tenant'||role==='tech');
 root.querySelectorAll('a[href]').forEach(function(a){var h=a.getAttribute('href');if(h.charAt(0)==='#')return;var t=keyFor(h);if(t){a.setAttribute('href','#'+t)}else{a.setAttribute('data-off',h.indexOf('/api/')===0?'dl':'1');a.setAttribute('href','#'+k)}});
 root.querySelectorAll('form').forEach(function(f){f.addEventListener('submit',function(e){e.preventDefault();toast(OFF)})});
 root.querySelectorAll('select').forEach(function(s){s.addEventListener('change',function(){toast('Demo: filters show the sample view. They work live in the full system.')})});
 var p=period(k);
 root.querySelectorAll('button').forEach(function(b){var t=b.textContent.trim();var to=null;
  if(p){var map={'Year to date':'ytd','Month':'month','Quarter':'quarter','Year':'year'};
   if(b.closest('.seg')&&map[t])to=p[1]+'-'+map[t];
   if(b.closest('.seg')&&t==='From – To')b.dataset.msg='Demo: pick any dates in the full system.';
   if(t==='Summary')to='exec-'+p[2];if(t==='Charts')to='charts-'+p[2];}
  if(k.indexOf('recovery')===0){if(t==='Rent schedule')to='recovery';if(t==='Arrears & follow-up')to='recovery-arrears';if(/^Verification queue/.test(t))to='recovery-verify';if(t==='All payments')b.dataset.msg='Demo: payment history is in the full system.';}
  if(k.indexOf('maintenance')===0){if(t==='This month')to='maintenance';if(t==='Year to date')to='maintenance-ytd';}
  if(k==='complaint-detail'&&(t==='×'||t==='Close'||t==='Cancel'))to='complaints';
  if(b.classList.contains('mbtn')||b.classList.contains('mclose'))return;
  if(/^Sign out$/.test(t)){to='start'}
  if(to)b.dataset.v=to;});
 root.querySelectorAll('a').forEach(function(a){if(a.textContent.trim()==='Sign out'){a.setAttribute('href','#start');a.removeAttribute('data-off')}});
 if(k==='complaints'||k==='tenants')root.querySelectorAll('tr.clickable').forEach(function(r){r.dataset.v=k==='complaints'?'complaint-detail':'tenant-detail'});
}
root.addEventListener('click',function(e){
 var t=e.target;
 var mb=t.closest('.mbtn');if(mb){var a=root.querySelector('aside');if(a){a.classList.add('open');scrim.classList.add('on')}return}
 if(t.closest('.mclose')){closeMenu();return}
 var a=t.closest('a[data-off]');if(a){e.preventDefault();toast(a.getAttribute('data-off')==='dl'?'Demo: Excel downloads work in the full system.':'Demo: this screen opens in the full system.');return}
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
html=html.replace('__START__',json.dumps(start).replace('</','<\\/'))
open('index.html','w').write(html)
print(len(html)//1024,'KB')
