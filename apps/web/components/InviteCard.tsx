'use client';
import { useState } from 'react';
import { fmtDate } from '@/lib/api';
import { BRAND } from '@/lib/brand';

/** What staff see after sending a tenant app invitation: QR to scan in the office, WhatsApp / SMS / copy, and a welcome letter to print. */
export default function InviteCard({ inv }: { inv: any }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(inv.link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { window.prompt('Copy this link', inv.link); } };
  const letter = () => {
    const w = window.open('', '_blank'); if (!w) return;
    const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Welcome letter — ${esc(inv.tenant.name)}</title><style>
      body{font-family:Arial,sans-serif;color:#1d1d1b;max-width:720px;margin:24px auto;padding:0 24px}.bar{height:8px;background:linear-gradient(90deg,#feed01 50%,#e40613 50%)}
      .head{display:flex;justify-content:space-between;align-items:center;margin:18px 0}.head img{height:70px}h1{font-size:24px;margin:8px 0}
      .box{display:flex;gap:24px;align-items:center;border:1px solid #ddd;border-radius:12px;padding:18px;margin:18px 0}.box img{width:190px;height:190px}
      ol{line-height:1.8;padding-left:20px}.ar{direction:rtl;text-align:right;border-top:1px solid #ddd;margin-top:22px;padding-top:12px}.small{font-size:12px;color:#555}
      @media print{button{display:none}}</style></head><body>
      <div class="bar"></div><div class="head"><img src="${location.origin}${BRAND.logo}" alt=""><div style="text-align:right"><b>${esc(inv.company || BRAND.name)}</b><div class="small">${new Date().toLocaleDateString('en-GB')}</div></div></div>
      <h1>Welcome, ${esc(inv.tenant.name)}</h1><p>Your tenancy at <b>${esc(inv.where)}</b> is ready (tenant no. ${esc(inv.tenant.tenantNo)}). With our tenant app you can pay rent, send transfer receipts, report repairs with photos and see your contract.</p>
      <div class="box"><img src="${inv.qr}" alt="QR code"><div><b>Set up your app in one minute</b><ol><li>Scan this code with your phone camera.</li><li>Choose a password.</li><li>Tap <b>Add to Home Screen</b> (iPhone: Share → Add to Home Screen).</li></ol>
      <div class="small">This code works once, until ${new Date(inv.expiresAt).toLocaleDateString('en-GB')}. If it expires, ask the office for a new one.</div></div></div>
      <div class="ar"><b>مرحباً بكم</b><p>امسح الرمز بكاميرا الهاتف، ثم اختر كلمة مرور، ثم أضف التطبيق إلى الشاشة الرئيسية لدفع الإيجار والإبلاغ عن الأعطال ومتابعة عقدك.</p></div>
      <p><button onclick="window.print()">Print</button></p></body></html>`);
    w.document.close();
  };
  return <div className="invite">
    <div className="invite-qr"><img src={inv.qr} alt="QR code for the tenant app invitation" /><div className="small muted">Tenant scans this in the office</div></div>
    <div className="invite-body">
      <div className="line"><span className="muted">Tenant</span><b>{inv.tenant.name} ({inv.tenant.tenantNo})</b></div>
      <div className="line"><span className="muted">Unit</span><b>{inv.where}</b></div>
      <div className="line"><span className="muted">Link valid until</span><b>{fmtDate(String(inv.expiresAt).slice(0, 10))} · works once</b></div>
      <div className="line"><span className="muted">Email</span><b>{inv.emailSent ? <span className="pill p-green">Sent to {inv.email}</span> : !inv.email ? <span className="pill p-gray">No email on file</span> : inv.emailConfigured ? <span className="pill p-red">Could not send — use WhatsApp</span> : <span className="pill p-gray">Email not set up on the server</span>}</b></div>
      <div className="invite-actions">
        {inv.whatsapp ? <a className="btn wa" href={inv.whatsapp} target="_blank" rel="noreferrer">Send by WhatsApp</a> : <span className="small muted">Add a mobile number to send by WhatsApp or SMS.</span>}
        {inv.sms && <a className="btn" href={inv.sms}>Send SMS</a>}
        <button type="button" onClick={copy}>{copied ? 'Copied ✓' : 'Copy link'}</button>
        <button type="button" onClick={letter}>Print welcome letter</button>
      </div>
      <div className="small muted" style={{ marginTop: 8 }}>The tenant opens the link, chooses a password and adds the app to their home screen. No app store needed.</div>
    </div>
  </div>;
}
