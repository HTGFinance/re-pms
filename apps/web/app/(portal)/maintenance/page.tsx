'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Header, useMe } from '@/components/Shell';
import { Err, Kpi, Modal, useLoad } from '@/components/ui';
import { BarChart, HBars } from '@/components/charts';
import { today } from '@/components/finance';
import { api, can, fmtDate, num3, omr } from '@/lib/api';

const mLabel = (m: string) => new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
function periods() {
  const t = today(); const y = t.slice(0, 4), m = Number(t.slice(5, 7)); const q = Math.floor((m - 1) / 3);
  const lm = new Date(Date.UTC(Number(y), m - 2, 1)); const lmEnd = new Date(Date.UTC(Number(y), m - 1, 0));
  return { month: [t.slice(0, 8) + '01', t], last: [lm.toISOString().slice(0, 10), lmEnd.toISOString().slice(0, 10)], quarter: [`${y}-${String(q * 3 + 1).padStart(2, '0')}-01`, t], ytd: [`${y}-01-01`, t] } as Record<string, [string, string]>;
}
const CLS_COLOR: Record<string, string> = { 'Company responsibility': '#1f3a5f', 'Recoverable from tenant': '#2a9d8f', 'Tenant responsibility': '#e9b949' };

export default function Maintenance() {
  const me = useMe(); const P = periods();
  const [tab, setTab] = useState<'dash' | 'approvals' | 'history'>('dash'); const [pk, setPk] = useState('month'); const [range, setRange] = useState<[string, string]>(P.month); const [bid, setBid] = useState('');
  const B = useLoad(() => api<any[]>('/buildings'));
  const qs = `from=${range[0]}&to=${range[1]}${bid ? '&buildingId=' + bid : ''}`;
  const D = useLoad(() => api(`/maintenance/dashboard?${qs}`), [qs]); const Q = useLoad(() => api<any[]>('/maintenance-costs?approval=Pending'));
  const choose = (k: string) => { setPk(k); if (P[k]) setRange(P[k]); };
  const d = D.data;
  return <>
    <Header title="Maintenance" sub="Performance, spending, technicians and approvals" right={<a className="btn" style={{ textDecoration: 'none' }} href={`/api/maintenance/report.xlsx?${qs}`}>⬇ Excel report</a>} />
    <div id="view">
      <div className="card" style={{ marginBottom: 14 }}><div className="row">
        {[['month', 'This month'], ['last', 'Last month'], ['quarter', 'This quarter'], ['ytd', 'Year to date'], ['custom', 'From – To']].map(([k, l]) => <button key={k} className={`sm ${pk === k ? 'primary' : ''}`} onClick={() => choose(k)}>{l}</button>)}
        {pk === 'custom' && <><input type="date" style={{ width: 'auto' }} value={range[0]} onChange={(e) => setRange([e.target.value, range[1]])} /><input type="date" style={{ width: 'auto' }} value={range[1]} onChange={(e) => setRange([range[0], e.target.value])} /></>}
        <select className="right" style={{ width: 'auto' }} value={bid} onChange={(e) => setBid(e.target.value)}><option value="">All buildings</option>{B.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <span className="small muted">{fmtDate(range[0])} – {fmtDate(range[1])}</span></div></div>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={tab === 'dash' ? 'primary' : ''} onClick={() => setTab('dash')}>Dashboard</button>
        <button className={tab === 'approvals' ? 'primary' : ''} onClick={() => setTab('approvals')}>Cost approvals{Q.data?.length ? ` (${Q.data.length})` : ''}</button>
        <button className={tab === 'history' ? 'primary' : ''} onClick={() => setTab('history')}>History by building / unit</button></div>
      <Err msg={D.error} />
      {tab === 'dash' && d && <Dash d={d} />}
      {tab === 'approvals' && <Approvals Q={Q} canApprove={can(me, 'PROPERTY_MANAGER', 'FINANCE')} onChange={D.reload} />}
      {tab === 'history' && <History buildings={B.data || []} />}
    </div>
  </>;
}

function Dash({ d }: { d: any }) {
  const k = d.kpis, s = d.spend; const spent = Number(s.total), bud = Number(s.budget);
  return <>
    <div className="grid k4">
      <Kpi label="Complaints received" value={k.received} sub={`${k.completed} completed in period`} />
      <Kpi label="New (to review)" value={k.newNow} tone={k.newNow ? 'warn' : undefined} />
      <Kpi label="Open now" value={k.openNow} sub={`${k.wipNow} work in progress`} />
      <Kpi label="Overdue now" value={k.overdueNow} tone={k.overdueNow ? 'bad' : 'good'} />
      <Kpi label="Awaiting tenant confirmation" value={k.awaitingTenant} />
      <Kpi label="Average resolution" value={k.avgResolutionDays == null ? '—' : `${k.avgResolutionDays} days`} />
      <Kpi label="Tenant rating" value={k.avgRating == null ? '—' : `${k.avgRating} / 5`} sub={`${k.reopened} reopened by tenants`} tone={k.avgRating >= 4 ? 'good' : undefined} />
    </div>
    <div className="sec">Spending</div>
    <div className="grid k4">
      <Kpi label="Maintenance spend" value={omr(s.total)} sub="Approved and not needing approval" />
      <Kpi label="Budget for the period" value={bud ? omr(s.budget) : '—'} sub={bud ? `${spent <= bud ? 'Under' : 'Over'} by ${omr(Math.abs(bud - spent))}` : 'No budget imported'} tone={bud ? (spent <= bud ? 'good' : 'bad') : undefined} />
      <Kpi label="Awaiting approval" value={omr(s.pendingApproval)} sub={`${s.pendingCount} cost line(s)`} tone={s.pendingCount ? 'warn' : undefined} />
      <Kpi label="Recovered from tenants" value={omr(s.byClass.find((c: any) => c.classification === 'Recoverable from tenant')?.amount || 0)} />
    </div>
    <div className="grid c2" style={{ marginTop: 14 }}>
      <div className="card"><h3>Monthly maintenance spend (OMR, last 12 months)</h3><BarChart labels={d.trend.map((t: any) => mLabel(t.month))} series={[{ name: 'Spend', values: d.trend.map((t: any) => Number(t.cost)) }]} /></div>
      <div className="card"><h3>Complaints received vs completed</h3><BarChart labels={d.trend.map((t: any) => mLabel(t.month))} series={[{ name: 'Received', values: d.trend.map((t: any) => t.received), color: '#4f86c6' }, { name: 'Completed', values: d.trend.map((t: any) => t.completed), color: '#2a9d8f' }]} /></div>
      <div className="card"><h3>Who pays</h3><HBars unit="OMR " items={s.byClass.map((c: any) => ({ label: c.classification, value: Number(c.amount), color: CLS_COLOR[c.classification] }))} />
        <h3 style={{ marginTop: 16 }}>Cost type</h3><HBars unit="OMR " items={[['Material', s.split.material], ['Labour', s.split.labour], ['External contractors', s.split.contractor], ['Other', s.split.other]].map(([l, v]) => ({ label: l, value: Number(v) }))} /></div>
      <div className="card"><h3>Complaints by category</h3>{d.categories.length ? <HBars items={d.categories.map((c: any) => ({ label: `${c.category} · OMR ${num3(c.cost)}`, value: c.count }))} /> : <div className="empty">No complaints in this period.</div>}</div>
    </div>
    <div className="sec">Building-wise maintenance</div>
    <div className="card tw"><table><thead><tr><th>Building</th><th className="n">Units</th><th className="n">Received</th><th className="n">Open now</th><th className="n">Spend</th><th className="n">Company cost</th><th className="n">Cost per unit</th></tr></thead>
      <tbody>{d.buildings.map((b: any) => <tr key={b.id}><td><b>{b.name}</b></td><td className="n">{b.units}</td><td className="n">{b.received}</td><td className="n">{b.openNow}</td><td className="n">{num3(b.cost)}</td><td className="n">{num3(b.companyCost)}</td><td className="n">{num3(b.costPerUnit)}</td></tr>)}</tbody></table></div>
    <div className="sec">Technician performance</div>
    <div className="card tw"><table><thead><tr><th>Technician</th><th className="n">Assigned</th><th className="n">Completed</th><th className="n">Open now</th><th className="n">Overdue</th><th className="n">Avg days</th><th className="n">On time</th><th className="n">Rating</th><th className="n">Reopened</th><th className="n">Cost of jobs</th></tr></thead>
      <tbody>{d.technicians.filter((t: any) => t.assigned || t.completed || t.openNow || Number(t.cost)).map((t: any) => <tr key={t.id}><td><b>{t.name}</b>{t.role === 'MAINTENANCE_SUPERVISOR' && <span className="small muted"> · supervisor</span>}</td><td className="n">{t.assigned}</td><td className="n">{t.completed}</td><td className="n">{t.openNow}</td>
        <td className="n" style={t.overdueNow ? { color: 'var(--red)', fontWeight: 700 } : undefined}>{t.overdueNow}</td><td className="n">{t.avgDays ?? '—'}</td><td className="n">{t.onTimeRate == null ? '—' : t.onTimeRate + '%'}</td><td className="n">{t.rating ?? '—'}</td><td className="n">{t.reopened}</td><td className="n">{num3(t.cost)}</td></tr>)}</tbody></table>
      <div className="small muted" style={{ marginTop: 8 }}>{d.technicians.filter((t: any) => !(t.assigned || t.completed || t.openNow || Number(t.cost))).length > 0 && `${d.technicians.filter((t: any) => !(t.assigned || t.completed || t.openNow || Number(t.cost))).length} technician(s) with no jobs in this period are hidden. `}On time = completed by the expected date. Rating = tenants' 1–5 stars when confirming. Cost = cost lines on the technician's jobs in the period.</div></div>
  </>;
}

function Approvals({ Q, canApprove, onChange }: { Q: any; canApprove: boolean; onChange: () => void }) {
  const [err, setErr] = useState(''); const [rej, setRej] = useState<any>(null); const [cls, setCls] = useState<Record<string, string>>({});
  const approve = async (k: any) => { setErr(''); const c = cls[k.id] || (k.classification === 'Pending approval' ? '' : k.classification);
    if (!c) { setErr('Choose who pays for ' + k.refNo); return; }
    try { await api(`/maintenance-costs/${k.id}/approve`, { body: { classification: c } }); Q.reload(); onChange(); } catch (x: any) { setErr(x.message); } };
  return <div className="card tw"><Err msg={err || Q.error} />{Q.data && (Q.data.length ? <table><thead><tr><th>Job</th><th>Work date</th><th>Building / unit</th><th>Details</th><th className="n">Total</th><th>Why approval</th><th>Recorded by</th><th>Who pays</th><th></th></tr></thead>
    <tbody>{Q.data.map((k: any) => <tr key={k.id}><td><Link href="/complaints">{k.refNo}</Link></td><td>{fmtDate(k.workDate)}</td><td>{k.unit}</td>
      <td className="small">{[Number(k.material) && `Material ${num3(k.material)}`, Number(k.labour) && `Labour ${num3(k.labour)}`, Number(k.contractor) && `Contractor ${num3(k.contractor)}${k.contractorName ? ' (' + k.contractorName + ')' : ''}`, Number(k.other) && `Other ${num3(k.other)}`].filter(Boolean).join(' · ')}{k.description && <div className="muted">{k.description}</div>}</td>
      <td className="n"><b>{num3(k.total)}</b></td><td className="small">{k.approvalReason}</td><td className="small">{k.recordedBy}</td>
      <td><select value={cls[k.id] ?? (k.classification === 'Pending approval' ? '' : k.classification)} onChange={(e) => setCls({ ...cls, [k.id]: e.target.value })} disabled={!k.canApprove}><option value="">— choose —</option>{['Company responsibility', 'Recoverable from tenant', 'Tenant responsibility'].map((c) => <option key={c}>{c}</option>)}</select></td>
      <td style={{ whiteSpace: 'nowrap' }}>{k.canApprove ? <><button className="sm ok" onClick={() => approve(k)}>Approve</button> <button className="sm danger" onClick={() => setRej(k)}>Reject</button></> : <span className="small muted">{canApprove ? 'Recorded by you' : 'Property manager / finance'}</span>}</td></tr>)}</tbody></table>
    : <div className="empty">No costs waiting for approval.</div>)}
    <div className="small muted" style={{ marginTop: 8 }}>Costs need approval when the payer is undecided, when they will be charged to the tenant, or when they are above the approval limit. "Recoverable from tenant" adds a charge to the tenant's account when approved.</div>
    {rej && <RejectCost k={rej} onClose={() => setRej(null)} onDone={() => { setRej(null); Q.reload(); onChange(); }} />}</div>;
}
function RejectCost({ k, onClose, onDone }: { k: any; onClose: () => void; onDone: () => void }) {
  const [r, setR] = useState(''); const [err, setErr] = useState('');
  return <Modal title={`Reject cost on ${k.refNo}`} onClose={onClose}><Err msg={err} /><label>Reason</label><input value={r} onChange={(e) => setR(e.target.value)} placeholder="e.g. Quote too high, get another" />
    <div className="row" style={{ marginTop: 12 }}><button onClick={onClose}>Cancel</button><button className="danger right" disabled={!r.trim()} onClick={async () => { try { await api(`/maintenance-costs/${k.id}/reject`, { body: { reason: r } }); onDone(); } catch (x: any) { setErr(x.message); } }}>Reject</button></div></Modal>;
}

function History({ buildings }: { buildings: any[] }) {
  const [bid, setBid] = useState(buildings[0]?.id || ''); const [uid, setUid] = useState('');
  const U = useLoad(() => bid ? api<any[]>(`/units?buildingId=${bid}`) : Promise.resolve([]), [bid]);
  const H = useLoad(() => bid ? api(`/maintenance/history?${uid ? 'unitId=' + uid : 'buildingId=' + bid}`) : Promise.resolve(null), [bid, uid]); const h = H.data;
  const top = useMemo(() => h?.units?.slice(0, 8) || [], [h]);
  return <>
    <div className="toolbar"><select value={bid} onChange={(e) => { setBid(e.target.value); setUid(''); }}>{buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
      <select value={uid} onChange={(e) => setUid(e.target.value)}><option value="">Whole building</option>{U.data?.map((u) => <option key={u.id} value={u.id}>Unit {u.unitNo}</option>)}</select>
      {h && <span className="small muted">{h.jobs.length} job(s) · total {omr(h.total)}</span>}</div>
    <Err msg={H.error} />
    {h && !uid && top.length > 0 && <div className="card" style={{ marginBottom: 14 }}><h3>Highest maintenance cost by unit</h3><HBars unit="OMR " items={top.map((x: any) => ({ label: `${x.unit} (${x.jobs} job${x.jobs > 1 ? 's' : ''})`, value: Number(x.cost) }))} /></div>}
    {h && <div className="card tw">{h.jobs.length ? <table><thead><tr><th>Ref</th><th>Reported</th><th>Unit</th><th>Problem</th><th>Technician</th><th>Status</th><th className="n">Rating</th><th className="n">Cost</th><th className="n">Recovered</th></tr></thead>
      <tbody>{h.jobs.map((j: any) => <tr key={j.id}><td>{j.refNo}</td><td>{fmtDate(j.reportedAt)}</td><td>{j.unit}</td><td>{j.title || j.subcategory}<div className="small muted">{j.category} / {j.subcategory}</div></td><td>{j.technician || '—'}</td><td>{j.status}</td><td className="n">{j.rating ? '★'.repeat(j.rating) : ''}</td><td className="n">{num3(j.cost)}</td><td className="n">{Number(j.recovered) ? num3(j.recovered) : ''}</td></tr>)}</tbody></table>
      : <div className="empty">No maintenance recorded.</div>}</div>}
  </>;
}
