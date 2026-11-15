'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Header, useMe } from '@/components/Shell';
import { Err, Field, Modal, Pill, useLoad } from '@/components/ui';
import { api, can, fmtDate, omr } from '@/lib/api';
import { TenantForm } from '../page';
import { ChargeForm, ChequeSeriesForm, Money, PaymentForm, Receipt } from '@/components/finance';
import { num3 } from '@/lib/api';
import InviteCard from '@/components/InviteCard';

const DOC_LABEL: Record<string, string> = { photo: 'Photo', passport: 'Passport', 'civil-id': 'Civil ID', contract: 'Signed contract', other: 'Other' };

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>(); const me = useMe(); const edit = can(me, 'PROPERTY_MANAGER');
  const T = useLoad(() => api(`/tenants/${id}`), [id]);
  const [editing, setEditing] = useState(false); const [newC, setNewC] = useState(false);
  const [modal, setModal] = useState<'' | 'pay' | 'chq' | 'chg'>(''); const [receipt, setReceipt] = useState<string | null>(null);
  const showLedger = can(me, 'FINANCE', 'RECOVERY', 'PROPERTY_MANAGER', 'EXECUTIVE');
  const L = useLoad(() => showLedger ? api(`/ledger/${id}`) : Promise.resolve(null), [id]);
  const Q = useLoad(() => showLedger ? api<any[]>(`/cheques?tenantId=${id}`) : Promise.resolve([]), [id]);
  const P = useLoad(() => showLedger ? api<any[]>(`/payments?tenantId=${id}`) : Promise.resolve([]), [id]);
  const reloadMoney = () => { L.reload(); Q.reload(); P.reload(); };
  const LG = useLoad(() => edit ? api(`/tenants/${id}/login`) : Promise.resolve(null), [id]);
  const [pwInfo, setPwInfo] = useState<any>(null); const [lgErr, setLgErr] = useState('');
  const IV = useLoad(() => edit || can(me, 'EXECUTIVE', 'FINANCE') ? api(`/tenants/${id}/invitation`) : Promise.resolve(null), [id]);
  const F = useLoad(() => can(me, 'PROPERTY_MANAGER', 'FINANCE', 'RECOVERY', 'EXECUTIVE', 'MAINTENANCE_SUPERVISOR') ? api<any[]>(`/tenants/${id}/files`) : Promise.resolve([]), [id]);
  const [inv, setInv] = useState<any>(null); const [ivBusy, setIvBusy] = useState(false); const [fErr, setFErr] = useState(''); const [docKind, setDocKind] = useState('passport');
  const sendInvite = async () => { setLgErr(''); setIvBusy(true); try { setInv(await api(`/tenants/${id}/invite`, { body: {} })); IV.reload(); } catch (x: any) { setLgErr(x.message); } finally { setIvBusy(false); } };
  const upload = async (kind: string, files: FileList | null) => { if (!files?.length) return; setFErr(''); const f = new FormData(); Array.from(files).forEach((x) => f.append('files', x)); try { await api(`/tenants/${id}/files?kind=${kind}`, { form: f }); F.reload(); } catch (x: any) { setFErr(x.message); } };
  const delFile = async (fid: string) => { if (!confirm('Remove this file?')) return; try { await api(`/tenant-files/${fid}`, { method: 'DELETE' }); F.reload(); } catch (x: any) { setFErr(x.message); } };
  const photo = F.data?.find((x) => x.kind === 'photo');
  const makeLogin = async () => { setLgErr(''); try { setPwInfo(await api(`/tenants/${id}/login`, { body: {} })); LG.reload(); } catch (x: any) { setLgErr(x.message); } };
  const CP = useLoad(() => can(me, 'MAINTENANCE_SUPERVISOR', 'PROPERTY_MANAGER', 'EXECUTIVE') ? api<any[]>(`/complaints?tenantId=${id}`) : Promise.resolve([]), [id]);
  const t = T.data;
  return <>
    <Header title={t ? t.name : 'Tenant'} sub={t ? `${t.tenantNo} · ${t.status}` : ''} right={<div className="row"><Link className="btn" style={{ textDecoration: 'none' }} href="/tenants">← Tenants</Link>{edit && t && <><button onClick={() => setEditing(true)}>Edit</button><button className="primary" onClick={() => setNewC(true)}>+ Contract</button></>}</div>} />
    <div id="view"><Err msg={T.error} />
      {t && <div className="grid c2">
        <div className="card"><h3>Profile</h3>
          <div className="prof">{photo ? <img src={`/api/files/${photo.id}`} alt={`Photo of ${t.name}`} /> : <span className="prof-ph">{t.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}</span>}
            <div><b style={{ fontSize: 16 }}>{t.name}</b><div className="small muted">{t.tenantNo}{t.nationality ? ' · ' + t.nationality : ''}</div>{edit && <label className="small linkish">{photo ? 'Change photo' : 'Add photo'}<input type="file" accept="image/*" capture="user" hidden onChange={(e) => upload('photo', e.target.files)} /></label>}</div></div>
          {[['Mobile', t.mobile], ['Email', t.email], [t.idType || 'ID', t.idNumber ? `${t.idNumber}${t.idExpiry ? ' · expires ' + fmtDate(t.idExpiry) : ''}` : ''], ['Passport', t.passportNo ? `${t.passportNo}${t.passportExpiry ? ' · expires ' + fmtDate(t.passportExpiry) : ''}` : ''], ['Status', <Pill key="s" s={t.status} />], ['Created', fmtDate(t.createdAt)]].map(([k, v]: any) =>
            <div className="line" key={k}><span className="muted">{k}</span><b>{v || '—'}</b></div>)}</div>
        {L.data ? <div className="card"><h3>Account <span className="row">{can(me, 'RECOVERY', 'FINANCE', 'PROPERTY_MANAGER') && <><button className="sm primary" onClick={() => setModal('pay')}>Record payment</button><button className="sm" onClick={() => setModal('chq')}>Receive cheques</button></>}{can(me, 'FINANCE', 'PROPERTY_MANAGER') && <button className="sm" onClick={() => setModal('chg')}>Charge / credit</button>}</span></h3>
          <div className="due" style={{ marginBottom: 10 }}><div className="small muted">Balance owed</div><div className="big" style={{ color: Number(L.data.balance) > 0 ? 'var(--red)' : 'var(--green)' }}>{omr(L.data.balance)}</div>
            {Number(L.data.unappliedCredit) > 0 && <div className="small">Advance / credit: {omr(L.data.unappliedCredit)}</div>}</div>
          {[['Not yet overdue', L.data.aging.current], ['1–30 days overdue', L.data.aging.d0_30], ['31–60 days', L.data.aging.d31_60], ['61–90 days', L.data.aging.d61_90], ['Over 90 days', L.data.aging.d90plus]].map(([k, v]: any) =>
            <div className="line" key={k}><span className="muted">{k}</span><b>{num3(v)}</b></div>)}
          <div className="line"><span className="muted">Last payment</span><b>{fmtDate(L.data.lastPaymentDate)}</b></div>
          {L.data.pendingPayments.length > 0 && <div className="note" style={{ marginTop: 8 }}>{L.data.pendingPayments.length} payment(s) of {omr(L.data.pendingPayments.reduce((s: number, p: any) => s + Number(p.amount), 0))} awaiting verification — not yet in the balance.</div>}
        </div> : <div className="card"><h3>Account</h3><div className="muted small">Not available for your role.</div></div>}
      </div>}
      {t && <div className="grid c2" style={{ marginTop: 14 }}>
        {IV.data && <div className="card"><h3>Tenant app <span className={`pill ${IV.data.state === 'Active' ? 'p-green' : IV.data.state === 'Invited' ? 'p-amber' : IV.data.state === 'Expired' ? 'p-red' : 'p-gray'}`}>{IV.data.state}</span></h3><Err msg={lgErr} />
          {IV.data.login && <div className="line"><span className="muted">Signs in with</span><b>{IV.data.login.email}</b></div>}
          {IV.data.login?.lastLoginAt && <div className="line"><span className="muted">Last sign-in</span><b>{fmtDate(String(IV.data.login.lastLoginAt).slice(0, 10))}</b></div>}
          {IV.data.sentAt && <div className="line"><span className="muted">Last invitation</span><b>{fmtDate(String(IV.data.sentAt).slice(0, 10))}{IV.data.emailedTo ? ' · emailed' : ''}{IV.data.state === 'Invited' ? ` · valid to ${fmtDate(String(IV.data.expiresAt).slice(0, 10))}` : ''}</b></div>}
          {IV.data.state !== 'Active' && <div className="small muted" style={{ margin: '6px 0' }}>Send a one-time link by WhatsApp, SMS or email, or let the tenant scan the QR code here in the office.</div>}
          {edit && <div className="row" style={{ marginTop: 8 }}><button className="primary sm" onClick={sendInvite} disabled={ivBusy}>{ivBusy ? 'Creating…' : IV.data.state === 'Not invited' ? 'Send app invitation' : IV.data.state === 'Active' ? 'Send a new link (reset password)' : 'Send a new link'}</button>
            <button className="sm" onClick={makeLogin} title="Fallback when the tenant has no phone or email access">Temporary password instead</button></div>}
          {pwInfo && <div className="note" style={{ marginTop: 8 }}>Temporary password for <b>{pwInfo.email}</b>: <b style={{ fontSize: 16, letterSpacing: 1 }}>{pwInfo.temporaryPassword}</b><br />Give it to the tenant privately — it is shown only once.</div>}
        </div>}
        <div className="card"><h3>Documents <span className="small muted" style={{ fontWeight: 400 }}>{F.data?.filter((x) => x.kind !== 'photo').length || 0} file(s)</span></h3><Err msg={fErr} />
          {F.data?.filter((x) => x.kind !== 'photo').map((f) => <div className="line" key={f.id}><span><span className="pill p-gray">{DOC_LABEL[f.kind] || f.kind}</span> <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer">{f.originalName}</a></span>
            <span className="row"><span className="small muted">{fmtDate(String(f.createdAt).slice(0, 10))}</span>{edit && <button className="sm danger" onClick={() => delFile(f.id)} aria-label={`Remove ${f.originalName}`}>×</button>}</span></div>)}
          {!F.data?.filter((x) => x.kind !== 'photo').length && <div className="small muted">No documents yet.</div>}
          {edit && <div className="row" style={{ marginTop: 10 }}><select value={docKind} onChange={(e) => setDocKind(e.target.value)} style={{ width: 'auto' }}>{['passport', 'civil-id', 'contract', 'other'].map((k) => <option key={k} value={k}>{DOC_LABEL[k]}</option>)}</select>
            <label className="btn sm" style={{ cursor: 'pointer' }}>Upload file<input type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { upload(docKind, e.target.files); e.target.value = ''; }} /></label></div>}
        </div>
      </div>}
      {(CP.data?.length ?? 0) > 0 && <><div className="sec">Complaints</div><div className="card tw"><table><thead><tr><th>Ref</th><th>Reported</th><th>Problem</th><th>Status</th></tr></thead>
        <tbody>{CP.data!.map((c: any) => <tr key={c.id}><td><Link href="/complaints">{c.refNo}</Link></td><td>{fmtDate(c.reportedAt)}</td><td>{c.title || c.subcategory}<div className="small muted">{c.category}</div></td><td>{c.status}</td></tr>)}</tbody></table></div></>}
      <div className="sec">Contracts</div>
      <div className="card tw">{t?.contracts?.length ? <table><thead><tr><th>Contract</th><th>Unit</th><th>Term</th><th className="n">Monthly rent</th><th className="n">Deposit</th><th>Pays by</th><th>VAT</th><th>Status</th><th>E-contract</th><th>Municipality reg.</th></tr></thead>
        <tbody>{t.contracts.map((c: any) => <tr key={c.id}><td><Link href={`/contracts?id=${c.id}`}><b>{c.contractNo}</b></Link></td><td>{c.unit.building.name} {c.unit.unitNo}</td><td>{fmtDate(c.startDate)} – {fmtDate(c.expiryDate)}</td>
          <td className="n">{omr(c.monthlyRent)}</td><td className="n">{omr(c.securityDeposit)}</td><td>{c.paymentFrequency} · {c.paymentMode}</td><td>{Number(c.vatRate) ? '5%' : 'Exempt'}</td><td><Pill s={c.status} /></td><td><Pill s={c.eStatus} /></td><td>{c.municipalityRegNo || '—'}</td></tr>)}</tbody></table>
        : <div className="empty">No contracts yet.</div>}</div>
      {L.data && <>
        <div className="sec">Statement</div>
        <div className="card tw">{L.data.lines.length ? <table><thead><tr><th>Date</th><th>Ref</th><th>Description</th><th className="n">Debit</th><th className="n">Credit</th><th className="n">Balance</th></tr></thead>
          <tbody>{L.data.lines.map((l: any) => <tr key={l.kind + l.id}><td>{fmtDate(l.date)}</td><td>{l.kind === 'Payment' ? <a style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setReceipt(l.id)}>{l.ref}</a> : l.ref}</td><td>{l.description}</td>
            <td className="n">{Number(l.debit) ? num3(l.debit) : ''}</td><td className="n">{Number(l.credit) ? num3(l.credit) : ''}</td><td className="n"><b>{num3(l.balance)}</b></td></tr>)}</tbody></table>
          : <div className="empty">No transactions yet.</div>}
          {L.data.notYetDue.length > 0 && <div className="small muted" style={{ marginTop: 8 }}>Billed but not yet due: {L.data.notYetDue.map((i: any) => `${i.invoice_no} (${fmtDate(i.due_date)}, ${i.total})`).join(', ')}</div>}</div>
        {L.data.open.length > 0 && <><div className="sec">Unpaid items (oldest first)</div><div className="card tw"><table><thead><tr><th>Ref</th><th>Due</th><th className="n">Amount</th><th className="n">Paid</th><th className="n">Outstanding</th><th className="n">Days overdue</th></tr></thead>
          <tbody>{L.data.open.map((o: any) => <tr key={o.id}><td>{o.ref}</td><td>{fmtDate(o.date)}</td><td className="n">{num3(o.amount)}</td><td className="n">{num3(o.paid)}</td><td className="n"><Money v={o.outstanding} red /></td><td className="n">{o.daysOverdue}</td></tr>)}</tbody></table></div></>}
        <div className="grid c2" style={{ marginTop: 14 }}>
          <div className="card tw"><h3>Payments</h3>{P.data?.length ? <table><thead><tr><th>Receipt</th><th>Date</th><th>Method</th><th className="n">Amount</th><th>Status</th></tr></thead><tbody>{P.data.map((p: any) => <tr key={p.id}><td>{p.receiptNo}</td><td>{fmtDate(p.date)}</td><td>{p.method}</td><td className="n">{num3(p.amount)}</td><td><Pill s={p.status} /></td></tr>)}</tbody></table> : <div className="empty">None</div>}</div>
          <div className="card tw"><h3>Cheques</h3>{Q.data?.length ? <table><thead><tr><th>No.</th><th>Bank</th><th>Date</th><th className="n">Amount</th><th>Status</th></tr></thead><tbody>{Q.data.map((q: any) => <tr key={q.id}><td>{q.chequeNo}</td><td>{q.bank}</td><td>{fmtDate(q.dueDate)}</td><td className="n">{num3(q.amount)}</td><td>{q.status}</td></tr>)}</tbody></table> : <div className="empty">None</div>}</div>
        </div></>}
    </div>
    {modal === 'pay' && t && <PaymentForm tenant={{ id: t.id, name: t.name }} suggested={L.data && Number(L.data.balance) > 0 ? L.data.balance : undefined} onClose={() => setModal('')} onSaved={() => { setModal(''); reloadMoney(); }} />}
    {modal === 'chq' && t && <ChequeSeriesForm tenant={{ id: t.id, name: t.name }} onClose={() => setModal('')} onSaved={() => { setModal(''); reloadMoney(); }} />}
    {modal === 'chg' && t && <ChargeForm tenant={{ id: t.id, name: t.name }} canCredit={can(me, 'FINANCE')} onClose={() => setModal('')} onSaved={() => { setModal(''); reloadMoney(); }} />}
    {receipt && <Receipt id={receipt} onClose={() => setReceipt(null)} />}
    {inv && <Modal title="Tenant app invitation" onClose={() => setInv(null)}><InviteCard inv={inv} /></Modal>}
    {editing && t && <TenantForm t={t} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); T.reload(); }} />}
    {newC && t && <ContractForm tenantId={t.id} onClose={() => setNewC(false)} onSaved={() => { setNewC(false); T.reload(); }} />}
  </>;
}

export function ContractForm({ tenantId, onClose, onSaved }: { tenantId: string; onClose: () => void; onSaved: () => void }) {
  const U = useLoad(() => api<any[]>('/units?status=Vacant'));
  const [f, setF] = useState<any>({ unitId: '', startDate: '', expiryDate: '', monthlyRent: '', securityDeposit: '', paymentFrequency: 'Monthly', rentDueDay: 1, noticeMonths: '', asDraft: false });
  const [err, setErr] = useState(''); const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const pickUnit = (e: any) => { const u = U.data?.find((x) => x.id === e.target.value); setF({ ...f, unitId: e.target.value, monthlyRent: u?.listedRent || f.monthlyRent, securityDeposit: u?.listedRent || f.securityDeposit, noticeMonths: u ? (u.vatApplicable ? 3 : 1) : f.noticeMonths }); };
  const save = async (e: FormEvent) => { e.preventDefault(); setErr('');
    const body: any = { tenantId, unitId: f.unitId, startDate: f.startDate, monthlyRent: String(f.monthlyRent), paymentFrequency: f.paymentFrequency, rentDueDay: Number(f.rentDueDay), asDraft: f.asDraft };
    if (f.expiryDate) body.expiryDate = f.expiryDate; if (f.securityDeposit) body.securityDeposit = String(f.securityDeposit); if (f.noticeMonths !== '') body.noticeMonths = Number(f.noticeMonths); if (f.billFrom) body.billFrom = f.billFrom;
    try { await api('/contracts', { body }); onSaved(); } catch (x: any) { setErr(x.message); } };
  return <Modal title="New contract" onClose={onClose}><Err msg={err || U.error} /><form className="form" onSubmit={save}>
    <Field label="Vacant unit" full><select value={f.unitId} onChange={pickUnit} required><option value="">— Select —</option>{U.data?.map((u) => <option key={u.id} value={u.id}>{u.buildingName} — {u.unitNo} ({u.unitType}, list {u.listedRent}{u.vatApplicable ? ' + VAT' : ''})</option>)}</select></Field>
    <Field label="Start date"><input type="date" value={f.startDate} onChange={set('startDate')} required /></Field>
    <Field label="Expiry date (blank = 12 months)"><input type="date" value={f.expiryDate} onChange={set('expiryDate')} /></Field>
    <Field label="Monthly rent (OMR)"><input type="number" step="0.001" min="0.001" value={f.monthlyRent} onChange={set('monthlyRent')} required /></Field>
    <Field label="Security deposit (OMR)"><input type="number" step="0.001" min="0" value={f.securityDeposit} onChange={set('securityDeposit')} /></Field>
    <Field label="Payment frequency"><select value={f.paymentFrequency} onChange={set('paymentFrequency')}>{['Monthly', 'Quarterly', 'Half-yearly', 'Yearly'].map((x) => <option key={x}>{x}</option>)}</select></Field>
    <Field label="Rent due day"><input type="number" min={1} max={28} value={f.rentDueDay} onChange={set('rentDueDay')} /></Field>
    <Field label="Notice period (months)"><input type="number" min={0} max={12} value={f.noticeMonths} onChange={set('noticeMonths')} /></Field>
    <Field label="Bill rent from (blank = start date, or this month if start is earlier)"><input type="date" value={f.billFrom || ''} onChange={set('billFrom')} /></Field>
    <Field label="Save as"><label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text)', fontSize: 13 }}><input type="checkbox" style={{ width: 'auto' }} checked={f.asDraft} onChange={set('asDraft')} /> Draft (activate later)</label></Field>
    <div className="full small muted">VAT (5%) is applied automatically when the unit is marked commercial.</div>
    <div className="full row"><button type="button" onClick={onClose}>Cancel</button><button className="primary right">Create contract</button></div></form></Modal>;
}
