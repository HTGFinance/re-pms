'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Header, useMe } from '@/components/Shell';
import { Err, Kpi, Modal, Pill, useLoad } from '@/components/ui';
import { Money, PaymentForm, Receipt, today } from '@/components/finance';
import { api, can, fmtDate, num3, omr } from '@/lib/api';

const monthsBack = (n: number) => { const out: string[] = []; const d = new Date(today() + 'T00:00:00Z'); for (let i = 0; i < n; i++) { out.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() - 1); } return out; };
const mLabel = (m: string) => new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export default function Recovery() {
  const me = useMe(); const [tab, setTab] = useState<'schedule' | 'arrears' | 'verify' | 'payments'>('schedule');
  const [period, setPeriod] = useState(today().slice(0, 7)); const [bid, setBid] = useState('');
  const [record, setRecord] = useState<{ tenant?: any; amount?: string } | null>(null); const [receipt, setReceipt] = useState<string | null>(null);
  const S = useLoad(() => api(`/recovery/summary?period=${period}`), [period]);
  const B = useLoad(() => api<any[]>('/buildings'));
  const canRecord = can(me, 'RECOVERY', 'FINANCE', 'PROPERTY_MANAGER'); const s = S.data;
  return <>
    <Header title="Rent recovery" sub="Rent due, collections, verification and arrears" right={canRecord && <button className="primary" onClick={() => setRecord({})}>+ Record payment</button>} />
    <div id="view">
      <Err msg={S.error} />
      {s && <div className="grid k4">
        <Kpi label={`Billed — ${mLabel(period)}`} value={omr(s.billed)} />
        <Kpi label="Collected against billing" value={s.collectionRate == null ? '—' : s.collectionRate + '%'} sub={omr(s.collectedAgainstBilling)} tone={s.collectionRate >= 90 ? 'good' : 'warn'} />
        <Kpi label="Cash received in month" value={omr(s.cashReceived)} sub="Verified receipts dated in the month" />
        <Kpi label="Total overdue (today)" value={omr(s.totalOverdue)} sub={`${s.tenantsInArrears} tenant(s)`} tone={Number(s.totalOverdue) > 0 ? 'bad' : 'good'} />
        <Kpi label="Awaiting verification" value={s.pendingVerification.count} sub={omr(s.pendingVerification.amount)} tone={s.pendingVerification.count ? 'warn' : undefined} />
        <Kpi label="Cheques due ≤ 30 days" value={s.cheques.dueWithin30Days} sub={`${omr(s.cheques.dueWithin30DaysAmount)} · ${s.cheques.dueForDepositNow} due now`} tone={s.cheques.dueForDepositNow ? 'warn' : undefined} />
        <Kpi label="Bounced cheques" value={s.cheques.bounced} sub={omr(s.cheques.bouncedAmount)} tone={s.cheques.bounced ? 'bad' : undefined} />
      </div>}
      <div className="row" style={{ margin: '16px 0 10px' }}>
        {([['schedule', 'Rent schedule'], ['arrears', 'Arrears & follow-up'], ['verify', `Verification queue${s?.pendingVerification.count ? ` (${s.pendingVerification.count})` : ''}`], ['payments', 'All payments']] as const).map(([k, l]) =>
          <button key={k} className={tab === k ? 'primary' : ''} onClick={() => setTab(k)}>{l}</button>)}
        <select className="right" style={{ width: 'auto' }} value={bid} onChange={(e) => setBid(e.target.value)}><option value="">All buildings</option>{B.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        {tab === 'schedule' && <select style={{ width: 'auto' }} value={period} onChange={(e) => setPeriod(e.target.value)}>{monthsBack(24).map((m) => <option key={m} value={m}>{mLabel(m)}</option>)}</select>}
      </div>
      {tab === 'schedule' && <Schedule period={period} bid={bid} onRecord={canRecord ? (t, a) => setRecord({ tenant: t, amount: a }) : undefined} />}
      {tab === 'arrears' && <Arrears bid={bid} onRecord={canRecord ? (t, a) => setRecord({ tenant: t, amount: a }) : undefined} />}
      {tab === 'verify' && <Payments status="Pending" onChange={S.reload} onReceipt={setReceipt} />}
      {tab === 'payments' && <Payments onChange={S.reload} onReceipt={setReceipt} />}
    </div>
    {record && <PaymentForm tenant={record.tenant} suggested={record.amount} onClose={() => setRecord(null)} onSaved={() => { setRecord(null); S.reload(); setTab('verify'); }} />}
    {receipt && <Receipt id={receipt} onClose={() => setReceipt(null)} />}
  </>;
}

function Schedule({ period, bid, onRecord }: { period: string; bid: string; onRecord?: (t: any, a: string) => void }) {
  const D = useLoad(() => api(`/recovery/schedule?period=${period}${bid ? '&buildingId=' + bid : ''}`), [period, bid]); const d = D.data;
  return <div className="card tw"><Err msg={D.error} />{d && (d.rows.length ? <table><thead><tr><th>Tenant</th><th>Building / unit</th><th>Invoice</th><th>Due</th><th className="n">Rent</th><th className="n">VAT</th><th className="n">Billed</th><th className="n">Collected</th><th className="n">Outstanding</th><th>Last payment</th><th>Status</th><th></th></tr></thead>
    <tbody>{d.rows.map((r: any) => <tr key={r.invoiceId}><td><Link href={`/tenants/${r.tenant.id}`}>{r.tenant.name}</Link><div className="small muted">{r.tenant.mobile}</div></td><td>{r.building} {r.unit}</td><td>{r.invoiceNo}{r.months > 1 && <div className="small muted">{r.months} months</div>}</td><td>{fmtDate(r.dueDate)}</td>
      <td className="n">{num3(r.rent)}</td><td className="n">{num3(r.vat)}</td><td className="n">{num3(r.billed)}</td><td className="n">{num3(r.collected)}</td><td className="n"><Money v={r.outstanding} red /></td><td>{fmtDate(r.lastPaymentDate)}</td>
      <td><span className={`pill ${r.status === 'Paid' ? 'p-green' : r.status === 'Unpaid' ? 'p-red' : 'p-amber'}`}>{r.status}</span></td>
      <td>{onRecord && Number(r.outstanding) > 0 && <button className="sm" onClick={() => onRecord({ id: r.tenant.id, name: r.tenant.name }, r.outstanding)}>Record payment</button>}</td></tr>)}
      <tr className="tot"><td colSpan={6}>Total · {d.rows.length} invoice(s)</td><td className="n">{num3(d.totals.billed)}</td><td className="n">{num3(d.totals.collected)}</td><td className="n">{num3(d.totals.outstanding)}</td><td colSpan={3}></td></tr></tbody></table>
    : <div className="empty">No rent billed for this month.</div>)}
    <div className="small muted" style={{ marginTop: 8 }}>Collected = payments applied to this invoice. Payments always settle a tenant's oldest dues first.</div></div>;
}

function Arrears({ bid, onRecord }: { bid: string; onRecord?: (t: any, a: string) => void }) {
  const D = useLoad(() => api(`/recovery/arrears${bid ? '?buildingId=' + bid : ''}`), [bid]); const d = D.data;
  return <div className="card tw"><Err msg={D.error} />{d && (d.rows.length ? <table><thead><tr><th>Tenant</th><th>Mobile</th><th>Building / unit</th><th className="n">1–30 days</th><th className="n">31–60</th><th className="n">61–90</th><th className="n">90+</th><th className="n">Overdue</th><th>Oldest due</th><th>Last payment</th><th></th></tr></thead>
    <tbody>{d.rows.map((r: any) => <tr key={r.tenant.id}><td><Link href={`/tenants/${r.tenant.id}`}><b>{r.tenant.name}</b></Link>{r.contractStatus !== 'Active' && <div className="small" style={{ color: 'var(--red)' }}>Contract {r.contractStatus.toLowerCase()}</div>}</td>
      <td>{r.tenant.mobile ? <a href={`https://wa.me/${r.tenant.mobile.replace(/\D/g, '')}`} target="_blank" rel="noopener">{r.tenant.mobile}</a> : '—'}</td><td>{r.building} {r.unit}</td>
      <td className="n">{num3(r.aging.d0_30)}</td><td className="n">{num3(r.aging.d31_60)}</td><td className="n">{num3(r.aging.d61_90)}</td><td className="n"><Money v={r.aging.d90plus} red /></td><td className="n"><b>{num3(r.overdue)}</b></td>
      <td>{fmtDate(r.oldestDueDate)}</td><td>{fmtDate(r.lastPaymentDate)}</td><td>{onRecord && <button className="sm" onClick={() => onRecord({ id: r.tenant.id, name: r.tenant.name }, r.overdue)}>Record payment</button>}</td></tr>)}
      <tr className="tot"><td colSpan={3}>Total · {d.rows.length} tenant(s)</td><td className="n">{num3(d.totals.d0_30)}</td><td className="n">{num3(d.totals.d31_60)}</td><td className="n">{num3(d.totals.d61_90)}</td><td className="n">{num3(d.totals.d90plus)}</td><td className="n">{num3(d.totals.overdue)}</td><td colSpan={3}></td></tr></tbody></table>
    : <div className="empty">No tenant has overdue rent.</div>)}
    <div className="small muted" style={{ marginTop: 8 }}>Age is counted from each invoice's due date. Tap a mobile number to message the tenant on WhatsApp.</div></div>;
}

function Payments({ status, onChange, onReceipt }: { status?: string; onChange: () => void; onReceipt: (id: string) => void }) {
  const D = useLoad(() => api<any[]>('/payments' + (status ? '?status=' + status : '')), [status]); const [reject, setReject] = useState<any>(null); const [err, setErr] = useState('');
  const verify = async (id: string) => { setErr(''); try { await api(`/payments/${id}/verify`, { body: {} }); D.reload(); onChange(); } catch (x: any) { setErr(x.message); } };
  return <div className="card tw"><Err msg={D.error || err} />{D.data && (D.data.length ? <table><thead><tr><th>Receipt</th><th>Date</th><th>Tenant</th><th>Method</th><th>Reference</th><th className="n">Amount</th><th>Recorded by</th><th>Status</th><th></th></tr></thead>
    <tbody>{D.data.map((p) => <tr key={p.id}><td>{p.receiptNo}</td><td>{fmtDate(p.date)}</td><td><Link href={`/tenants/${p.tenant.id}`}>{p.tenant.name}</Link></td><td>{p.method}</td><td>{p.reference}{p.notes && <div className="small muted">{p.notes}</div>}</td>
      <td className="n">{num3(p.amount)}</td><td className="small">{p.recordedBy || '—'}{p.verifiedBy && <div className="muted">{p.status === 'Rejected' ? 'Rejected' : 'Verified'} by {p.verifiedBy}</div>}</td>
      <td><Pill s={p.status} />{p.rejectReason && <div className="small" style={{ color: 'var(--red)' }}>{p.rejectReason}</div>}</td>
      <td style={{ whiteSpace: 'nowrap' }}>{p.canVerify && <><button className="sm ok" onClick={() => verify(p.id)}>Verify</button> <button className="sm danger" onClick={() => setReject(p)}>Reject</button></>}
        {p.status === 'Pending' && !p.canVerify && <span className="small muted">Needs a different finance user</span>}
        {p.status === 'Verified' && <button className="sm" onClick={() => onReceipt(p.id)}>Receipt</button>}</td></tr>)}</tbody></table>
    : <div className="empty">{status === 'Pending' ? 'Nothing is waiting for verification.' : 'No payments yet.'}</div>)}
    {status === 'Pending' && <div className="small muted" style={{ marginTop: 8 }}>Check each receipt against the bank statement or cash count. The person who recorded a payment cannot verify it.</div>}
    {reject && <RejectForm p={reject} onClose={() => setReject(null)} onDone={() => { setReject(null); D.reload(); onChange(); }} />}</div>;
}

function RejectForm({ p, onClose, onDone }: { p: any; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(''); const [err, setErr] = useState('');
  return <Modal title={`Reject ${p.receiptNo}`} onClose={onClose}><Err msg={err} /><form onSubmit={async (e) => { e.preventDefault(); try { await api(`/payments/${p.id}/reject`, { body: { reason } }); onDone(); } catch (x: any) { setErr(x.message); } }}>
    <div className="small muted" style={{ marginBottom: 8 }}>{p.tenant.name} · {omr(p.amount)} · {p.method} {p.reference}</div>
    <label>Reason</label><input value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="e.g. Not found on bank statement" />
    <div className="row" style={{ marginTop: 12 }}><button type="button" onClick={onClose}>Cancel</button><button className="danger right">Reject payment</button></div></form></Modal>;
}
