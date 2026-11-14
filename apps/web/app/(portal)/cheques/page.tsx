'use client';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { Header, useMe } from '@/components/Shell';
import { Err, Field, Kpi, Modal, useLoad } from '@/components/ui';
import { BANKS, ChequeSeriesForm, today } from '@/components/finance';
import { api, can, fmtDate, num3, omr } from '@/lib/api';

const PILL: Record<string, string> = { 'In hand': 'p-blue', Deposited: 'p-amber', Cleared: 'p-green', Bounced: 'p-red', Replaced: 'p-gray', 'Returned to tenant': 'p-gray', Cancelled: 'p-gray' };
const VIEWS = ['Due ≤ 30 days', 'In hand', 'Deposited', 'Bounced', 'Cleared', 'All'];

export default function Cheques() {
  const me = useMe(); const fin = can(me, 'FINANCE'); const handler = can(me, 'RECOVERY', 'FINANCE', 'PROPERTY_MANAGER'); const dep = can(me, 'RECOVERY', 'FINANCE');
  const [view, setView] = useState('Due ≤ 30 days'); const [adding, setAdding] = useState(false); const [bounce, setBounce] = useState<any>(null); const [replace, setReplace] = useState<any>(null); const [err, setErr] = useState('');
  const qs = view === 'Due ≤ 30 days' ? '?dueWithinDays=30' : view === 'All' ? '' : '?status=' + encodeURIComponent(view);
  const Q = useLoad(() => api<any[]>('/cheques' + qs), [view]); const All = useLoad(() => api<any[]>('/cheques'));
  const reload = () => { Q.reload(); All.reload(); };
  const act = async (id: string, step: string) => { setErr(''); try { await api(`/cheques/${id}/${step}`, { body: {} }); reload(); } catch (x: any) { setErr(x.message); } };
  const a = All.data || []; const t = today(); const plus30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const sum = (l: any[]) => l.reduce((s, q) => s + Number(q.amount), 0);
  const inHand = a.filter((q) => q.status === 'In hand'), due = inHand.filter((q) => q.dueDate <= plus30), now = inHand.filter((q) => q.dueDate <= t), dep_ = a.filter((q) => q.status === 'Deposited'), bnc = a.filter((q) => q.status === 'Bounced');
  return <>
    <Header title="Cheques (PDC)" sub="Post-dated cheques: deposit on the date, confirm clearance from the bank statement" right={handler && <button className="primary" onClick={() => setAdding(true)}>+ Receive cheques</button>} />
    <div id="view">
      <div className="grid k4">
        <Kpi label="Cheques in hand" value={omr(sum(inHand))} sub={`${inHand.length} cheque(s)`} />
        <Kpi label="Due within 30 days" value={omr(sum(due))} sub={`${due.length} cheque(s)`} />
        <Kpi label="Due for deposit now" value={now.length} sub={omr(sum(now))} tone={now.length ? 'warn' : 'good'} />
        <Kpi label="Deposited, awaiting clearance" value={dep_.length} sub={omr(sum(dep_))} />
        <Kpi label="Bounced (to replace)" value={bnc.length} sub={omr(sum(bnc))} tone={bnc.length ? 'bad' : undefined} />
      </div>
      <div className="toolbar" style={{ marginTop: 14 }}>{VIEWS.map((v) => <button key={v} className={view === v ? 'primary' : ''} onClick={() => setView(v)}>{v}</button>)}</div>
      <Err msg={Q.error || err} />
      <div className="card tw">{Q.data && (Q.data.length ? <table><thead><tr><th>Ref</th><th>Cheque no.</th><th>Bank</th><th>Tenant / unit</th><th>Cheque date</th><th className="n">Amount</th><th>Status</th><th></th></tr></thead>
        <tbody>{Q.data.map((q) => { const d = Math.round((new Date(q.dueDate).getTime() - new Date(t).getTime()) / 864e5); return <tr key={q.id}>
          <td>{q.refNo}</td><td><b>{q.chequeNo}</b></td><td>{q.bank}</td><td><Link href={`/tenants/${q.tenant.id}`}>{q.tenant.name}</Link><div className="small muted">{q.unit || ''}{q.contractNo ? ' · ' + q.contractNo : ''}</div></td>
          <td>{fmtDate(q.dueDate)}{q.status === 'In hand' && d <= 7 && <div className="small" style={{ color: d < 0 ? 'var(--red)' : '#b7791f' }}>{d < 0 ? `${-d} day(s) past date` : d === 0 ? 'Due today' : `In ${d} day(s)`}</div>}</td>
          <td className="n">{num3(q.amount)}</td>
          <td><span className={`pill ${PILL[q.status]}`}>{q.status}</span>{q.bounceReason && <div className="small" style={{ color: 'var(--red)' }}>{q.bounceReason}</div>}{q.notes && <div className="small muted">{q.notes}</div>}</td>
          <td style={{ whiteSpace: 'nowrap' }}>
            {q.status === 'In hand' && dep && <button className="sm" disabled={!q.dueForDeposit} title={q.dueForDeposit ? '' : 'Not before the cheque date'} onClick={() => act(q.id, 'deposit')}>Deposit</button>}
            {q.status === 'In hand' && handler && <> <button className="sm" onClick={() => act(q.id, 'return')}>Return</button></>}
            {q.status === 'Deposited' && fin && <><button className="sm ok" onClick={() => act(q.id, 'clear')}>Cleared</button> <button className="sm danger" onClick={() => setBounce(q)}>Bounced</button></>}
            {q.status === 'Deposited' && !fin && <span className="small muted">Finance confirms clearance</span>}
            {q.status === 'Bounced' && handler && <button className="sm" onClick={() => setReplace(q)}>Replace</button>}
          </td></tr>; })}
          <tr className="tot"><td colSpan={5}>{Q.data.length} cheque(s)</td><td className="n">{num3(sum(Q.data))}</td><td colSpan={2}></td></tr></tbody></table>
        : <div className="empty">No cheques in this view.</div>)}</div>
      <div className="small muted" style={{ marginTop: 8 }}>A cheque becomes a payment on the tenant's ledger only when finance marks it cleared. A bounced cheque leaves the rent unpaid; you can add a bounce fee.</div>
    </div>
    {adding && <ChequeSeriesForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    {bounce && <BounceForm q={bounce} onClose={() => setBounce(null)} onDone={() => { setBounce(null); reload(); }} />}
    {replace && <ReplaceForm q={replace} onClose={() => setReplace(null)} onDone={() => { setReplace(null); reload(); }} />}
  </>;
}

function BounceForm({ q, onClose, onDone }: { q: any; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ reason: 'Insufficient funds', bounceFee: '', date: today() }); const [err, setErr] = useState('');
  const save = async (e: FormEvent) => { e.preventDefault(); const body: any = { reason: f.reason, date: f.date }; if (f.bounceFee) body.bounceFee = String(f.bounceFee);
    try { await api(`/cheques/${q.id}/bounce`, { body }); onDone(); } catch (x: any) { setErr(x.message); } };
  return <Modal title={`Cheque ${q.chequeNo} bounced`} onClose={onClose}><Err msg={err} /><form className="form" onSubmit={save}>
    <div className="full small muted">{q.tenant.name} · {q.bank} · {omr(q.amount)}</div>
    <Field label="Reason"><select value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}>{['Insufficient funds', 'Signature mismatch', 'Account closed', 'Stopped by drawer', 'Post-dated / stale', 'Other'].map((r) => <option key={r}>{r}</option>)}</select></Field>
    <Field label="Date returned"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
    <Field label="Bounce fee to charge tenant (optional, OMR)"><input type="number" step="0.001" min="0" value={f.bounceFee} onChange={(e) => setF({ ...f, bounceFee: e.target.value })} /></Field>
    <div className="full row"><button type="button" onClick={onClose}>Cancel</button><button className="danger right">Mark bounced</button></div></form></Modal>;
}
function ReplaceForm({ q, onClose, onDone }: { q: any; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ chequeNo: '', bank: q.bank, dueDate: today(), amount: Number(q.amount).toFixed(3) }); const [err, setErr] = useState('');
  return <Modal title={`Replace cheque ${q.chequeNo}`} onClose={onClose}><Err msg={err} /><form className="form" onSubmit={async (e) => { e.preventDefault(); try { await api(`/cheques/${q.id}/replace`, { body: { ...f, amount: String(f.amount) } }); onDone(); } catch (x: any) { setErr(x.message); } }}>
    <Field label="New cheque no."><input value={f.chequeNo} onChange={(e) => setF({ ...f, chequeNo: e.target.value })} required /></Field>
    <Field label="Bank"><select value={f.bank} onChange={(e) => setF({ ...f, bank: e.target.value })}>{BANKS.map((b) => <option key={b}>{b}</option>)}</select></Field>
    <Field label="Cheque date"><input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} required /></Field>
    <Field label="Amount (OMR)"><input type="number" step="0.001" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></Field>
    <div className="full row"><button type="button" onClick={onClose}>Cancel</button><button className="primary right">Save replacement</button></div></form></Modal>;
}
