'use client';
import Link from 'next/link';
import { Err, useLoad } from '@/components/ui';
import { api, fmtDate } from '@/lib/api';

export const STEPS = ['Complaint received', 'Under review', 'Assigned to maintenance', 'Work in progress', 'Completed', 'Tenant confirmation pending', 'Closed'];
export const stepOf = (label: string) => label === 'Cancelled' ? -1 : Math.max(STEPS.indexOf(label), label === 'Tenant confirmation pending' ? 5 : 0);
export const tone = (label: string) => label === 'Closed' ? 'p-green' : label === 'Cancelled' ? 'p-gray' : label === 'Tenant confirmation pending' ? 'p-purple' : label === 'Complaint received' ? 'p-blue' : 'p-amber';

export default function TComplaints() {
  const C = useLoad(() => api<any[]>('/me/complaints'));
  return <>
    <Link href="/t/complaints/new"><button className="primary btn-block" style={{ marginBottom: 14 }}>+ New complaint</button></Link>
    <Err msg={C.error} />
    {C.data && !C.data.length && <div className="empty">No complaints yet.</div>}
    {C.data?.map((c) => <Link key={c.id} href={`/t/complaints/${c.id}`} className="tlink"><div className="tcard">
      <div className="row"><b>{c.refNo}</b><span className={`pill ${tone(c.statusLabel)} right`}>{c.statusLabel}</span></div>
      <div style={{ margin: '4px 0' }}>{c.title || c.subcategory}</div>
      <div className="small muted">{c.category} / {c.subcategory} · {fmtDate(c.reportedAt)}</div>
      {c.statusLabel !== 'Cancelled' && <div className="stepper">{STEPS.map((s, i) => <span key={s} className={i <= stepOf(c.statusLabel) ? 'on' : ''} />)}</div>}
      {c.statusLabel === 'Tenant confirmation pending' && <div className="small" style={{ color: 'var(--navy)', fontWeight: 700 }}>Please confirm if the problem is solved →</div>}
    </div></Link>)}
  </>;
}
