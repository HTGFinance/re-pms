'use client';
import Link from 'next/link';
import { Header, useMe } from '@/components/Shell';
import { Err, Kpi, useLoad } from '@/components/ui';
import { api, can, fmtDate, omr } from '@/lib/api';

export default function Dashboard() {
  const me = useMe();
  const { data: s, error } = useLoad(() => api('/dashboard/summary'));
  const { data: exp } = useLoad(() => api<any[]>('/contracts?expiringWithinDays=90').catch(() => []));
  const { data: r } = useLoad(() => can(me, 'RECOVERY', 'FINANCE', 'PROPERTY_MANAGER', 'EXECUTIVE') ? api('/recovery/summary').catch(() => null) : Promise.resolve(null), [me?.role]);
  return <>
    <Header title="Dashboard" sub={`Welcome, ${me?.name}`} right={s && <div className="meta">As of {fmtDate(s.asOf)}</div>} />
    <div id="view">
      <Err msg={error} />
      {s && <div className="grid k4">
        <Kpi label="Occupancy" value={s.occupancy + '%'} sub={`${s.occupied} of ${s.units} units`} tone={s.occupancy >= 90 ? 'good' : 'warn'} />
        <Kpi label="Vacant units" value={s.vacant} tone={s.vacant ? 'warn' : 'good'} />
        <Kpi label="Monthly rent roll" value={omr(s.monthlyRentRoll)} sub="Active contracts, incl. VAT" />
        <Kpi label="Security deposits held" value={omr(s.depositsHeld)} sub="Liability to tenants" />
        <Kpi label="Expiring ≤ 90 days" value={s.expiringWithin90Days} tone={s.expiringWithin90Days ? 'warn' : undefined} />
        <Kpi label="Not registered with municipality" value={s.notRegistered} tone={s.notRegistered ? 'warn' : 'good'} />
        <Kpi label="Draft contracts" value={s.draftContracts} />
        <Kpi label="Buildings" value={s.buildings} />
      </div>}
      {r && <><div className="sec">Collections this month <Link className="small" style={{ fontWeight: 400, color: 'var(--teal)' }} href="/recovery">Open rent recovery →</Link></div><div className="grid k4">
        <Kpi label="Rent billed" value={omr(r.billed)} />
        <Kpi label="Collected against billing" value={r.collectionRate == null ? '—' : r.collectionRate + '%'} sub={omr(r.collectedAgainstBilling)} tone={r.collectionRate >= 90 ? 'good' : 'warn'} />
        <Kpi label="Total overdue" value={omr(r.totalOverdue)} sub={`${r.tenantsInArrears} tenant(s)`} tone={Number(r.totalOverdue) > 0 ? 'bad' : 'good'} />
        <Kpi label="Awaiting verification" value={r.pendingVerification.count} sub={omr(r.pendingVerification.amount)} tone={r.pendingVerification.count ? 'warn' : undefined} />
        <Kpi label="Cheques due ≤ 30 days" value={r.cheques.dueWithin30Days} sub={omr(r.cheques.dueWithin30DaysAmount)} />
      </div></>}
      <div className="sec">Contracts expiring within 90 days</div>
      <div className="card tw">{exp?.length ? <table><thead><tr><th>Contract</th><th>Tenant</th><th>Building / unit</th><th>Expiry</th><th className="n">Days</th><th className="n">Rent</th></tr></thead>
        <tbody>{exp.map((c) => <tr key={c.id}><td><Link href={`/contracts?id=${c.id}`}>{c.contractNo}</Link></td><td><Link href={`/tenants/${c.tenant.id}`}>{c.tenant.name}</Link></td><td>{c.building.name} {c.unit.unitNo}</td><td>{fmtDate(c.expiryDate)}</td><td className="n">{c.daysToExpiry}</td><td className="n">{omr(c.monthlyRent)}</td></tr>)}</tbody></table>
        : <div className="empty">No contracts expire in the next 90 days.</div>}</div>
      <div className="small muted" style={{ marginTop: 14 }}>Maintenance (phase 4) and the executive dashboard with budget vs actual and period filters (phase 5) are still to come.</div>
    </div>
  </>;
}
