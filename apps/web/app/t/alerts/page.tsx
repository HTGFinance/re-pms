'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { useTenant } from '@/components/TenantShell';
import { useLoad } from '@/components/ui';
import { api } from '@/lib/api';

export default function TAlerts() {
  const { reload } = useTenant(); const N = useLoad(() => api<any[]>('/me/notifications'));
  useEffect(() => { if (N.data?.some((n) => !n.readAt)) api('/me/notifications/read-all', { body: {} }).then(reload).catch(() => undefined); }, [N.data, reload]);
  return <>{N.data && !N.data.length && <div className="empty">No notifications yet.</div>}
    {N.data?.map((n) => { const card = <div className="tcard" style={!n.readAt ? { borderColor: '#cfe0f5', background: '#f5f9fe' } : undefined}>
      <div className="row"><b>{n.title}</b><span className="small muted right">{new Date(n.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Muscat' })}</span></div>
      {n.body && <div className="small" style={{ marginTop: 4 }}>{n.body}</div>}</div>;
      return n.link?.startsWith('/t') ? <Link key={n.id} href={n.link} className="tlink">{card}</Link> : <div key={n.id}>{card}</div>; })}</>;
}
