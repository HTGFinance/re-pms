'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, Me } from '@/lib/api';
import { BRAND } from '@/lib/brand';

type Home = any;
const Ctx = createContext<{ me: Me; home: Home | null; reload: () => void } | null>(null);
export const useTenant = () => useContext(Ctx)!;

const TABS = [{ href: '/t', label: 'Home', icon: '⌂' }, { href: '/t/pay', label: 'Pay', icon: '💳' }, { href: '/t/complaints', label: 'Complaints', icon: '🛠' }, { href: '/t/flat', label: 'My flat', icon: '🏠' }, { href: '/t/alerts', label: 'Alerts', icon: '🔔' }];

/** Mobile-first frame for the tenant app: header + bottom tab bar. */
export default function TenantShell({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null); const [home, setHome] = useState<Home | null>(null); const path = usePathname(); const router = useRouter();
  const reload = useCallback(() => { api('/me').then(setHome).catch(() => undefined); }, []);
  useEffect(() => { api<Me & { mustChangePassword?: boolean }>('/auth/me').then((m) => {
    if (m.role !== 'TENANT') { router.replace('/'); return; }
    if (m.mustChangePassword) { router.replace('/password'); return; }
    setMe(m); reload(); }).catch(() => router.replace('/login')); }, [router, reload]);
  if (!me) return <div className="empty">Loading…</div>;
  const logout = async () => { await api('/auth/logout', { method: 'POST' }).catch(() => undefined); router.replace('/login'); };
  return <Ctx.Provider value={{ me, home, reload }}>
    <div className="tapp">
      <div className="ttop"><div className="tid"><img src={BRAND.mark} alt={BRAND.name} /><div><div className="small" style={{ opacity: .8 }}>Welcome</div><div className="tname">{home?.tenant?.name || me.name}</div>
        {home?.contracts?.[0] && <div className="small" style={{ opacity: .85 }}>{home.contracts[0].building.name} · Unit {home.contracts[0].unit.no}</div>}</div></div>
        <button className="sm" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.4)' }} onClick={logout}>Sign out</button></div>
      <div className="tbody">{children}</div>
      <nav className="tnav">{TABS.map((t) => { const on = t.href === '/t' ? path === '/t' : path.startsWith(t.href);
        const badge = t.href === '/t/alerts' ? home?.unreadNotifications : t.href === '/t/complaints' ? home?.complaintsToConfirm : 0;
        return <Link key={t.href} href={t.href} className={on ? 'on' : ''}><span className="ic">{t.icon}{badge ? <i>{badge}</i> : null}</span>{t.label}</Link>; })}</nav>
    </div></Ctx.Provider>;
}
