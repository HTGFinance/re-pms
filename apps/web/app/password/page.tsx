'use client';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function ChangePassword() {
  const router = useRouter(); const [me, setMe] = useState<any>(null);
  const [cur, setCur] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { api('/auth/me').then(setMe).catch(() => router.replace('/login')); }, [router]);
  const submit = async (e: FormEvent) => { e.preventDefault(); setErr('');
    if (pw !== pw2) { setErr('The two new passwords do not match'); return; } if (pw.length < 10) { setErr('Use at least 10 characters'); return; }
    setBusy(true); try { await api('/auth/change-password', { body: { currentPassword: cur, newPassword: pw } }); router.replace(me?.role === 'TENANT' ? '/t' : '/'); } catch (x: any) { setErr(x.message); setBusy(false); } };
  return <div className="login"><form className="box" onSubmit={submit}>
    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--navy)' }}>Choose your password</div>
    <div className="muted small" style={{ marginBottom: 16 }}>{me?.mustChangePassword ? 'For your security, replace the temporary password you were given.' : 'Change your password.'}</div>
    {err && <div className="err">{err}</div>}
    <label>{me?.mustChangePassword ? 'Temporary password' : 'Current password'}</label><input type="password" value={cur} onChange={(e) => setCur(e.target.value)} required style={{ marginBottom: 12 }} />
    <label>New password (at least 10 characters)</label><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={10} style={{ marginBottom: 12 }} />
    <label>Repeat new password</label><input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required style={{ marginBottom: 18 }} />
    <button className="primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
  </form></div>;
}
