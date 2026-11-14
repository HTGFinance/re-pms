'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Err, useLoad } from '@/components/ui';
import { today } from '@/components/finance';
import { api, fmtDate } from '@/lib/api';

const PRI: Record<string, string> = { Urgent: 'p-red', High: 'p-amber', Medium: 'p-blue', Low: 'p-gray' };
export default function MJobsPage() { return <Suspense fallback={<div className="empty">Loading…</div>}><MJobs /></Suspense>; }
function MJobs() {
  const done = useSearchParams().get('view') === 'done';
  const J = useLoad(() => api<any[]>(done ? '/complaints?status=Tenant confirmation pending' : '/complaints?open=true'), [done]);
  const t = today(); const list = J.data || [];
  const groups = done ? [['Waiting for tenant to confirm', list]] : [['Overdue', list.filter((j) => j.overdue)], ['Due today', list.filter((j) => !j.overdue && j.expectedDate === t)], ['Coming up / no date', list.filter((j) => !j.overdue && j.expectedDate !== t)]];
  return <>
    <h3 style={{ margin: '0 0 10px', color: 'var(--navy)' }}>{done ? 'Completed jobs' : 'My open jobs'} <span className="small muted">({list.length})</span></h3>
    <Err msg={J.error} />
    {J.data && !list.length && <div className="empty">{done ? 'No completed jobs waiting for tenants.' : 'No open jobs. Well done!'}</div>}
    {groups.map(([title, items]: any) => items.length > 0 && <div key={title}><div className="small" style={{ fontWeight: 700, color: title === 'Overdue' ? 'var(--red)' : 'var(--muted)', margin: '10px 0 6px', textTransform: 'uppercase', letterSpacing: '.04em' }}>{title}</div>
      {items.map((j: any) => <Link key={j.id} href={`/m/jobs/${j.id}`} className="tlink"><div className="tcard">
        <div className="row"><b>{j.refNo}</b><span className={`pill ${PRI[j.priority]}`}>{j.priority}</span><span className="small muted right">{j.status}</span></div>
        <div style={{ fontWeight: 600, margin: '4px 0' }}>{j.title || j.subcategory}</div>
        <div className="small muted">📍 {j.unit}{j.tenant ? ` · ${j.tenant.name}` : ''}</div>
        <div className="small muted">{j.category} / {j.subcategory}{j.expectedDate ? ` · due ${fmtDate(j.expectedDate)}` : ''}{j.preferredVisit ? ` · visit: ${j.preferredVisit}` : ''}</div>
      </div></Link>)}</div>)}
  </>;
}
