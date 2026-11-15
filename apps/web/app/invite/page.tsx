'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { BRAND } from '@/lib/brand';

/** Public page the tenant opens from the invitation link / QR code: choose a password, then the app opens. */
function Invite() {
  const token = useSearchParams().get('token') || ''; const router = useRouter();
  const [info, setInfo] = useState<any>(null); const [bad, setBad] = useState('');
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [show, setShow] = useState(false);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!token) { setBad('This link is incomplete. Open the full link from your message, or scan the QR code again.'); return; }
    api(`/invite?token=${encodeURIComponent(token)}`).then((d) => { setInfo(d); setEmail(d.email || ''); }).catch((x) => setBad(x.message)); }, [token]);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr('');
    if (pw.length < 10) { setErr('Use at least 10 characters for your password'); return; }
    if (pw !== pw2) { setErr('The two passwords are different'); return; }
    setBusy(true);
    try { await api('/invite/accept', { body: { token, password: pw, ...(info.needsEmail ? { email } : {}) } }); router.replace('/t?welcome=1'); }
    catch (x: any) { setErr(x.message); setBusy(false); }
  };
  return <div className="login"><div className="box">
    <img className="llogo" src={BRAND.logo} alt={`${BRAND.name} logo`} />
    {bad ? <><h2 style={{ margin: '4px 0 8px', fontSize: 20 }}>Link not available</h2><div className="err">{bad}</div><Link href="/login"><button className="primary btn-block">Go to sign in</button></Link></>
      : !info ? <div className="muted">Checking your link…</div>
      : <form onSubmit={submit}>
        <div className="small muted">Welcome to {info.company}</div>
        <h2 style={{ margin: '2px 0 4px', fontSize: 22, color: 'var(--navy)' }}>{info.name}</h2>
        <div className="small" style={{ marginBottom: 14 }}>{info.building}{info.unit ? ` · Unit ${info.unit}` : ''}</div>
        <div className="info" style={{ marginBottom: 14 }}>Choose a password to activate your tenant app. You will use your email and this password to sign in.</div>
        {err && <div className="err">{err}</div>}
        <label>Email</label>
        {info.needsEmail ? <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" style={{ marginBottom: 12 }} />
          : <input value={info.email} readOnly autoComplete="username" style={{ marginBottom: 12, background: '#f4f4f1' }} />}
        <label>New password (at least 10 characters)</label>
        <input type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} required minLength={10} autoComplete="new-password" style={{ marginBottom: 12 }} />
        <label>Repeat password</label>
        <input type={show ? 'text' : 'password'} value={pw2} onChange={(e) => setPw2(e.target.value)} required autoComplete="new-password" style={{ marginBottom: 8 }} />
        <label className="checkline" style={{ marginBottom: 14 }}><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /><span>Show passwords</span></label>
        <button className="primary btn-block" disabled={busy}>{busy ? 'Activating…' : 'Activate my app'}</button>
        <div className="small muted" style={{ marginTop: 10 }}>This link works once and expires on {new Date(info.expiresAt).toLocaleDateString('en-GB')}.</div>
      </form>}
  </div></div>;
}

export default function InvitePage() { return <Suspense fallback={<div className="empty">Loading…</div>}><Invite /></Suspense>; }
