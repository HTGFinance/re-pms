'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import InstallApp from '@/components/InstallApp';

export default function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const router = useRouter();
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { const r = await api('/auth/login', { body: { email, password } }); router.replace(r.user.mustChangePassword ? '/password' : r.user.role === 'TENANT' ? '/t' : r.user.role === 'TECHNICIAN' ? '/m' : '/'); } catch (x: any) { setErr(x.message); setBusy(false); }
  };
  return <div className="login"><form className="box" onSubmit={submit}>
    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)' }}>RE-PMS</div>
    <div className="muted small" style={{ marginBottom: 18 }}>Real Estate Property Management System</div>
    {err && <div className="err">{err}</div>}
    <label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus style={{ marginBottom: 12 }} />
    <label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ marginBottom: 18 }} />
    <button className="primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    <InstallApp />
  </form></div>;
}
