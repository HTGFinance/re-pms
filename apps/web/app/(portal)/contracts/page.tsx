'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { Header, useMe } from '@/components/Shell';
import { Err, Field, Kpi, Modal, Pill, useLoad } from '@/components/ui';
import { api, can, fmtDate, num3, omr } from '@/lib/api';

const NEXT: Record<string, string | null> = { Draft: 'Sent to tenant', 'Sent to tenant': 'Tenant accepted', 'Tenant accepted': 'Landlord approved', 'Landlord approved': 'Registered', Registered: null };
const FEE_RATE = 0.03;

export default function ContractsPage() { return <Suspense fallback={<div className="empty">Loading…</div>}><Contracts /></Suspense>; }

function Contracts() {
  const me = useMe(); const edit = can(me, 'PROPERTY_MANAGER'); const sp = useSearchParams();
  const [status, setStatus] = useState('Active'); const [eStatus, setEStatus] = useState(''); const [expiring, setExpiring] = useState(false);
  const [open, setOpen] = useState<string | null>(sp.get('id'));
  const qs = new URLSearchParams(); if (status) qs.set('status', status); if (eStatus) qs.set('eStatus', eStatus); if (expiring) qs.set('expiringWithinDays', '90');
  const C = useLoad(() => api<any[]>('/contracts?' + qs.toString()), [status, eStatus, expiring]);
  const list = C.data || [];
  return <>
    <Header title="Contracts" sub="Leases, e-contract workflow, municipality registration and renewals" />
    <div id="view">
      <div className="grid k4" style={{ marginBottom: 14 }}>
        <Kpi label="Contracts shown" value={list.length} />
        <Kpi label="Monthly rent (excl. VAT)" value={omr(list.reduce((s, c) => s + Number(c.monthlyRent), 0))} />
        <Kpi label="Not yet registered" value={list.filter((c) => c.eStatus !== 'Registered').length} tone={list.some((c) => c.eStatus !== 'Registered') ? 'warn' : 'good'} />
        <Kpi label="Expiring ≤ 90 days" value={list.filter((c) => c.status === 'Active' && c.daysToExpiry <= 90).length} />
      </div>
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{['Active', 'Upcoming', 'Draft', 'Ended', 'Terminated'].map((s) => <option key={s}>{s}</option>)}</select>
        <select value={eStatus} onChange={(e) => setEStatus(e.target.value)}><option value="">Any e-contract stage</option>{Object.keys(NEXT).map((s) => <option key={s}>{s}</option>)}</select>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0, color: 'var(--text)' }}><input type="checkbox" style={{ width: 'auto' }} checked={expiring} onChange={(e) => setExpiring(e.target.checked)} /> Expiring within 90 days</label>
      </div>
      <Err msg={C.error} />
      <div className="card tw"><table><thead><tr><th>Contract</th><th>Tenant</th><th>Building / unit</th><th>Term</th><th className="n">Days left</th><th className="n">Rent</th><th>Status</th><th>E-contract</th><th>Municipality</th></tr></thead>
        <tbody>{list.map((c) => <tr key={c.id} className="clickable" onClick={() => setOpen(c.id)}>
          <td><b>{c.contractNo}</b></td><td>{c.tenant.name}<div className="small muted">{c.tenant.tenantNo}</div></td><td>{c.building.name} {c.unit.unitNo}</td>
          <td>{fmtDate(c.startDate)} – {fmtDate(c.expiryDate)}</td><td className="n" style={c.status === 'Active' && c.daysToExpiry <= 30 ? { color: 'var(--red)', fontWeight: 700 } : undefined}>{c.status === 'Active' ? c.daysToExpiry : '—'}</td>
          <td className="n">{num3(c.monthlyRent)}{Number(c.vatRate) ? <div className="small muted">+ VAT</div> : null}</td><td><Pill s={c.status} /></td><td><Pill s={c.eStatus} /></td><td>{c.municipalityRegNo || <span className="muted small">Pending</span>}</td></tr>)}</tbody></table>
        {C.data && !list.length && <div className="empty">No contracts match these filters.</div>}</div>
    </div>
    {open && <ContractDetail id={open} edit={edit} onClose={() => setOpen(null)} onChanged={C.reload} />}
  </>;
}

function ContractDetail({ id, edit, onClose, onChanged }: { id: string; edit: boolean; onClose: () => void; onChanged: () => void }) {
  const D = useLoad(() => api(`/contracts/${id}`), [id]); const c = D.data;
  const [err, setErr] = useState(''); const [mode, setMode] = useState<'' | 'register' | 'renew' | 'end'>('');
  useEffect(() => setErr(''), [mode]);
  const act = async (path: string, body?: any) => { setErr(''); try { await api(`/contracts/${id}/${path}`, { body: body ?? {} }); setMode(''); D.reload(); onChanged(); } catch (x: any) { setErr(x.message); } };
  if (!c) return <Modal title="Contract" onClose={onClose}><Err msg={D.error} /><div className="empty">Loading…</div></Modal>;
  const next = NEXT[c.eStatus]; const annual = Number(c.monthlyRent) * 12;
  return <Modal title={`Contract ${c.contractNo}`} onClose={onClose}>
    <Err msg={err} />
    <div className="info" style={{ marginBottom: 12 }}><b><Link href={`/tenants/${c.tenant.id}`}>{c.tenant.name}</Link></b> · {c.unit.building.name}, unit {c.unit.unitNo} ({c.unit.unitType})</div>
    <div className="grid c2" style={{ gap: 0, columnGap: 24 }}>
      {[['Status', <Pill key="1" s={c.status} />], ['E-contract', <Pill key="2" s={c.eStatus} />], ['Start', fmtDate(c.startDate)], ['Expiry', fmtDate(c.expiryDate)], ['Tenancy since', fmtDate(c.tenancyFrom)],
        ['Monthly rent', omr(c.monthlyRent) + (Number(c.vatRate) ? ' + VAT 5%' : '')], ['Security deposit', omr(c.securityDeposit)], ['Payment', `${c.paymentFrequency}, due day ${c.rentDueDay}`],
        ['Notice period', `${c.noticeMonths} month(s)`], ['Municipality reg.', c.municipalityRegNo ? `${c.municipalityRegNo} (${fmtDate(c.municipalityRegDate)}) · fee ${num3(c.municipalityFee)}` : 'Not registered']]
        .map(([k, v]: any) => <div className="line" key={k}><span className="muted">{k}</span><b style={{ textAlign: 'right' }}>{v}</b></div>)}
    </div>
    {c.notes && <div className="small muted" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{c.notes}</div>}
    {edit && !mode && <div className="row" style={{ marginTop: 16 }}>
      {c.status === 'Draft' && <button className="primary" onClick={() => act('activate')}>Activate</button>}
      {next && next !== 'Registered' && ['Draft', 'Active', 'Upcoming'].includes(c.status) && <button className="primary" onClick={() => act('e-status', { step: next })}>Mark: {next}</button>}
      {next === 'Registered' && <button className="primary" onClick={() => setMode('register')}>Record municipality registration</button>}
      {['Active', 'Ended'].includes(c.status) && <button onClick={() => setMode('renew')}>Renew</button>}
      {['Active', 'Upcoming'].includes(c.status) && <button className="danger" onClick={() => setMode('end')}>End / terminate</button>}
      <button className="right" onClick={onClose}>Close</button></div>}
    {mode === 'register' && <RegForm annual={annual} onCancel={() => setMode('')} onSave={(b) => act('e-status', { step: 'Registered', ...b })} />}
    {mode === 'renew' && <RenewForm rent={c.monthlyRent} expiry={c.expiryDate} onCancel={() => setMode('')} onSave={(b) => act('renew', b)} />}
    {mode === 'end' && <EndForm onCancel={() => setMode('')} onSave={(b) => act('end', b)} />}
    {!edit && <div className="row" style={{ marginTop: 16 }}><button className="right" onClick={onClose}>Close</button></div>}
  </Modal>;
}

function RegForm({ annual, onCancel, onSave }: { annual: number; onCancel: () => void; onSave: (b: any) => void }) {
  const [f, setF] = useState({ regNo: '', regDate: new Date().toISOString().slice(0, 10), fee: (annual * FEE_RATE).toFixed(3) });
  const submit = (e: FormEvent) => { e.preventDefault(); onSave(f); };
  return <form className="form" style={{ marginTop: 16 }} onSubmit={submit}><div className="full info">Register on the municipality portal, then record the result. Fee shown = 3% of annual rent ({num3(annual)}); adjust to what was paid.</div>
    <Field label="Registration no."><input value={f.regNo} onChange={(e) => setF({ ...f, regNo: e.target.value })} required /></Field>
    <Field label="Registration date"><input type="date" value={f.regDate} onChange={(e) => setF({ ...f, regDate: e.target.value })} required /></Field>
    <Field label="Fee paid (OMR)"><input type="number" step="0.001" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} /></Field>
    <div className="full row"><button type="button" onClick={onCancel}>Back</button><button className="primary right">Save registration</button></div></form>;
}
function RenewForm({ rent, expiry, onCancel, onSave }: { rent: string; expiry: string; onCancel: () => void; onSave: (b: any) => void }) {
  const [months, setMonths] = useState(12); const [pctInc, setPct] = useState(0); const [newRent, setRent] = useState(Number(rent).toFixed(3));
  return <form className="form" style={{ marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); onSave({ months: Number(months), monthlyRent: String(newRent) }); }}>
    <div className="full info">The renewal starts on the day after {fmtDate(expiry)} as a new contract, and goes through e-contract and registration again.</div>
    <Field label="Term (months)"><input type="number" min={1} max={60} value={months} onChange={(e) => setMonths(Number(e.target.value))} /></Field>
    <Field label="Rent increase %"><input type="number" step="0.1" value={pctInc} onChange={(e) => { setPct(Number(e.target.value)); setRent((Number(rent) * (1 + Number(e.target.value) / 100)).toFixed(3)); }} /></Field>
    <Field label="New monthly rent (OMR)"><input type="number" step="0.001" value={newRent} onChange={(e) => setRent(e.target.value)} required /></Field>
    <div className="full row"><button type="button" onClick={onCancel}>Back</button><button className="primary right">Create renewal</button></div></form>;
}
function EndForm({ onCancel, onSave }: { onCancel: () => void; onSave: (b: any) => void }) {
  const [f, setF] = useState({ endDate: new Date().toISOString().slice(0, 10), early: true, reason: '' });
  return <form className="form" style={{ marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
    <Field label="Last day of tenancy"><input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} required /></Field>
    <Field label="Type"><select value={f.early ? 'early' : 'normal'} onChange={(e) => setF({ ...f, early: e.target.value === 'early' })}><option value="early">Early termination</option><option value="normal">Normal end</option></select></Field>
    <Field label="Reason" full><input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
    <div className="full row"><button type="button" onClick={onCancel}>Back</button><button className="danger right">Confirm end of contract</button></div></form>;
}
