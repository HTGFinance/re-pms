'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, Me } from '@/lib/api';

/** Technician app: phone-first frame. */
export default function MLayout({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null); const router = useRouter(); const path = usePathname();
  useEffect(() => { api<Me & { mustChangePassword?: boolean }>('/auth/me').then((m) => { if (m.mustChangePassword) router.replace('/password'); else if (m.role === 'TENANT') router.replace('/t'); else setMe(m); }).catch(() => router.replace('/login')); }, [router]);
  if (!me) return <div className="empty">Loading…</div>;
  const logout = async () => { await api('/auth/logout', { method: 'POST' }).catch(() => undefined); router.replace('/login'); };
  return <div className="tapp">
    <div className="ttop"><div><div className="small" style={{ opacity: .8 }}>Maintenance</div><div className="tname">{me.name}</div></div>
      <button className="sm" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.4)' }} onClick={logout}>Sign out</button></div>
    <div className="tbody">{children}</div>
    <nav className="tnav">
      <Link href="/m" className={path === '/m' ? 'on' : ''}><span className="ic">🛠</span>My jobs</Link>
      <Link href="/m?view=done" className={''}><span className="ic">✅</span>Done</Link>
      {me.role !== 'TECHNICIAN' && <Link href="/complaints"><span className="ic">🖥</span>Full portal</Link>}
    </nav></div>;
}
