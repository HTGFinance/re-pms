'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api, Me, Role, ROLE_LABEL } from '@/lib/api';

const MeCtx = createContext<Me | null>(null);
export const useMe = () => useContext(MeCtx);

const NAV: { href: string; label: string; roles?: Role[] }[] = [
  { href: '/executive', label: 'Executive dashboard', roles: ['EXECUTIVE', 'FINANCE', 'PROPERTY_MANAGER'] },
  { href: '/', label: 'Dashboard', roles: ['PROPERTY_MANAGER', 'FINANCE', 'RECOVERY', 'MAINTENANCE_SUPERVISOR', 'EXECUTIVE'] },
  { href: '/properties', label: 'Buildings & units', roles: ['PROPERTY_MANAGER', 'FINANCE', 'RECOVERY', 'MAINTENANCE_SUPERVISOR', 'EXECUTIVE'] },
  { href: '/tenants', label: 'Tenants', roles: ['PROPERTY_MANAGER', 'FINANCE', 'RECOVERY', 'MAINTENANCE_SUPERVISOR', 'EXECUTIVE'] },
  { href: '/contracts', label: 'Contracts', roles: ['PROPERTY_MANAGER', 'FINANCE', 'RECOVERY', 'EXECUTIVE'] },
  { href: '/maintenance', label: 'Maintenance', roles: ['MAINTENANCE_SUPERVISOR', 'PROPERTY_MANAGER', 'FINANCE', 'EXECUTIVE'] },
  { href: '/complaints', label: 'Complaints', roles: ['MAINTENANCE_SUPERVISOR', 'PROPERTY_MANAGER', 'TECHNICIAN', 'EXECUTIVE'] },
  { href: '/notices', label: 'Notices to vacate', roles: ['PROPERTY_MANAGER', 'FINANCE', 'RECOVERY', 'EXECUTIVE'] },
  { href: '/recovery', label: 'Rent recovery', roles: ['RECOVERY', 'FINANCE', 'PROPERTY_MANAGER', 'EXECUTIVE'] },
  { href: '/cheques', label: 'Cheques (PDC)', roles: ['RECOVERY', 'FINANCE', 'PROPERTY_MANAGER', 'EXECUTIVE'] },
  { href: '/imports', label: 'Data import', roles: ['PROPERTY_MANAGER', 'FINANCE'] },
  { href: '/users', label: 'Users & roles', roles: [] },
  { href: '/audit', label: 'Audit log', roles: [] },
];

export default function Shell({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null); const [open, setOpen] = useState(false); const path = usePathname(); const router = useRouter();
  useEffect(() => { api<Me & { mustChangePassword?: boolean }>('/auth/me').then((m) => { if (m.role === 'TENANT') router.replace('/t'); else if (m.mustChangePassword) router.replace('/password'); else { if (m.role === 'TECHNICIAN' && window.location.pathname === '/') router.replace('/m'); if (m.role === 'EXECUTIVE' && window.location.pathname === '/') router.replace('/executive'); setMe(m); } }).catch(() => router.replace('/login')); }, [router]);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [open]);
  if (!me) return <div className="empty">Loading…</div>;
  const items = NAV.filter((n) => !n.roles || me.role === 'ADMIN' || n.roles.includes(me.role));
  const isOn = (h: string) => (h === '/' ? path === '/' : path.startsWith(h));
  const current = items.find((n) => isOn(n.href))?.label ?? 'RE-PMS';
  const logout = async () => { await api('/auth/logout', { method: 'POST' }).catch(() => undefined); router.replace('/login'); };
  return <MeCtx.Provider value={me}><div className="app">
    <div className="mbar">
      <button className="mbtn" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}><span /><span /><span /></button>
      <div className="mtitle"><b>{current}</b><small>RE-PMS</small></div>
    </div>
    {open && <div className="scrim" onClick={() => setOpen(false)} />}
    <aside className={open ? 'open' : ''}>
      <div className="brand"><div>RE-PMS<small>Property Management System</small></div>
        <button className="mclose" aria-label="Close menu" onClick={() => setOpen(false)}>×</button></div>
      <nav>{items.map((n) => <Link key={n.href} href={n.href} className={isOn(n.href) ? 'on' : ''}>{n.label}</Link>)}</nav>
      <div className="foot"><b style={{ color: '#fff' }}>{me.name}</b><br />{ROLE_LABEL[me.role]}<br /><a style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={logout}>Sign out</a></div>
    </aside>
    <main>{children}</main>
  </div></MeCtx.Provider>;
}

export const Header = ({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) =>
  <header><div><h1>{title}</h1>{sub && <div className="meta">{sub}</div>}</div>{right}</header>;
