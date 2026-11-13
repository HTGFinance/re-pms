'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Header, useMe } from '@/components/Shell';
import { Err, Field, Modal, Pill, useLoad } from '@/components/ui';
import { api, can, fmtDate, omr } from '@/lib/api';
import { TenantForm } from '../page';

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>(); const me = useMe(); const edit = can(me, 'PROPERTY_MANAGER');
  const T = useLoad(() => api(`/tenants/${id}`), [id]);
  const [editing, setEditing] = useState(false); const [newC, setNewC] = useState(false);
  const t = T.data;
  return <>
    <Header title={t ? t.name : 'Tenant'} sub={t ? `${t.tenantNo} · ${t.status}` : ''} right={<div className="row"><Link className="btn" style={{ textDecoration: 'none' }} href="/tenants">← Tenants</Link>{edit && t && <><button onClick={() => setEditing(true)}>Edit</button><button className="primary" onClick={() => setNewC(true)}>+ Contract</button></>}</div>} />
    <div id="view"><Err msg={T.error} />
      {t && <div className="grid c2">
        <div className="card"><h3>Profile</h3>
          {[['Tenant no.', t.tenantNo], ['Mobile', t.mobile], ['Email', t.email], [t.idType || 'ID', t.idNumber], ['Nationality', t.nationality], ['Status', <Pill key="s" s={t.status} />], ['Created', fmtDate(t.createdAt)]].map(([k, v]: any) =>
            <div className="line" key={k}><span className="muted">{k}</span><b>{v || '—'}</b></div>)}</div>
        <div className="card"><h3>Ledger, payments & documents</h3><div className="muted small">Tenant ledger, receipts, cheques and the document vault arrive in phase 2 (billing & recovery) and phase 3 (tenant app).</div></div>
      </div>}
      <div className="sec">Contracts</div>
      <div className="card tw">{t?.contracts?.length ? <table><thead><tr><th>Contract</th><th>Unit</th><th>Term</th><th className="n">Monthly rent</th><th className="n">Deposit</th><th>VAT</th><th>Status</th><th>E-contract</th><th>Municipality reg.</th></tr></thead>
        <tbody>{t.contracts.map((c: any) => <tr key={c.id}><td><Link href={`/contracts?id=${c.id}`}><b>{c.contractNo}</b></Link></td><td>{c.unit.building.name} {c.unit.unitNo}</td><td>{fmtDate(c.startDate)} – {fmtDate(c.expiryDate)}</td>
          <td className="n">{omr(c.monthlyRent)}</td><td className="n">{omr(c.securityDeposit)}</td><td>{Number(c.vatRate) ? '5%' : 'Exempt'}</td><td><Pill s={c.status} /></td><td><Pill s={c.eStatus} /></td><td>{c.municipalityRegNo || '—'}</td></tr>)}</tbody></table>
        : <div className="empty">No contracts yet.</div>}</div>
    </div>
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
    if (f.expiryDate) body.expiryDate = f.expiryDate; if (f.securityDeposit) body.securityDeposit = String(f.securityDeposit); if (f.noticeMonths !== '') body.noticeMonths = Number(f.noticeMonths);
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
    <Field label="Save as"><label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text)', fontSize: 13 }}><input type="checkbox" style={{ width: 'auto' }} checked={f.asDraft} onChange={set('asDraft')} /> Draft (activate later)</label></Field>
    <div className="full small muted">VAT (5%) is applied automatically when the unit is marked commercial.</div>
    <div className="full row"><button type="button" onClick={onClose}>Cancel</button><button className="primary right">Create contract</button></div></form></Modal>;
}
