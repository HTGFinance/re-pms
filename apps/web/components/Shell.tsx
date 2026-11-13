'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api, Me, Role, ROLE_LABEL } from '@/lib/api';

const MeCtx = createContext<Me | null>(null);
export const useMe = () => useContext(MeCtx);

const NAV: { href: string; label: string; roles?: Role[] }[] = [
  { href: '/', label: 'Dashboard' },
  { href: '/properties', label: 'Buildings & units', roles: ['PROPERTY_MANAGER', 'FINANCE', 'RECOVERY', 'MAINTENANCE_SUPERVISOR', 'EXECUTIVE'] },
  { href: '/tenants', label: 'Tenants', roles: ['PROPERTY_MANAGER', 'FINANCE', 'RECOVERY', 'MAINTENANCE_SUPERVISOR', 'EXECUTIVE'] },
  { href: '/contracts', label: 'Contracts', roles: ['PROPERTY_MANAGER', 'FINANCE', 'RECOVERY', 'EXECUTIVE'] },
  { href: '/imports', label: 'Data import', roles: ['PROPERTY_MANAGER', 'FINANCE'] },
  { href: '/users', label: 'Users & roles', roles: [] },
  { href: '/audit', label: 'Audit log', roles: [] },
];

export default function Shell({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null); const path = usePathname(); const router = useRouter();
  useEffect(() => { api<Me>('/auth/me').then(setMe).catch(() => router.replace('/login')); }, [router]);
  if (!me) return <div className="empty">Loading…</div>;
  if (me.role === 'TENANT') return <div className="empty">The tenant app arrives in phase 3. Please use a staff account here.</div>;
  const items = NAV.filter((n) => !n.roles || me.role === 'ADMIN' || n.roles.includes(me.role));
  const logout = async () => { await api('/auth/logout', { method: 'POST' }).catch(() => undefined); router.replace('/login'); };
  return <MeCtx.Provider value={me}><div className="app">
    <aside>
      <div className="brand">RE-PMS<small>Property Management System</small></div>
      <nav>{items.map((n) => <Link key={n.href} href={n.href} className={(n.href === '/' ? path === '/' : path.startsWith(n.href)) ? 'on' : ''}>{n.label}</Link>)}</nav>
      <div className="foot"><b style={{ color: '#fff' }}>{me.name}</b><br />{ROLE_LABEL[me.role]}<br /><a style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={logout}>Sign out</a></div>
    </aside>
    <main>{children}</main>
  </div></MeCtx.Provider>;
}

export const Header = ({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) =>
  <header><div><h1>{title}</h1>{sub && <div className="meta">{sub}</div>}</div>{right}</header>;
