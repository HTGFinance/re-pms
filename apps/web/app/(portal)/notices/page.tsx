'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Header, useMe } from '@/components/Shell';
import { Err, Field, Modal, useLoad } from '@/components/ui';
import { api, can, fmtDate, num3 } from '@/lib/api';

const STATUSES = ['Submitted', 'Acknowledged', 'Inspection scheduled', 'Inspection done', 'Keys handed over', 'Settled', 'Cancelled'];

export default function Notices() {
  const me = useMe(); const edit = can(me, 'PROPERTY_MANAGER'); const [all, setAll] = useState(false); const [open, setOpen] = useState<any>(null);
  const N = useLoad(() => api<any[]>('/notices' + (all ? '' : '?open=true')), [all]);
  return <>
    <Header title="Notices to vacate" sub="Tenants leaving: notice period, inspection, key handover and settlement" />
    <div id="view">
      <div className="toolbar"><button className={!all ? 'primary' : ''} onClick={() => setAll(false)}>Open</button><button className={all ? 'primary' : ''} onClick={() => setAll(true)}>All</button></div>
      <Err msg={N.error} />
      <div className="card tw">{N.data && (N.data.length ? <table><thead><tr><th>Ref</th><th>Tenant</th><th>Building / unit</th><th>Submitted</th><th>Leaving</th><th>Notice ends</th><th>Rent until</th><th className="n">Deposit</th><th>Inspection</th><th>Status</th><th></th></tr></thead>
        <tbody>{N.data.map((n) => <tr key={n.id}><td><b>{n.ref_no}</b></td><td><Link href={`/tenants/${n.tenant_id}`}>{n.tenant_name}</Link><div className="small muted">{n.mobile}</div></td><td>{n.building_name} {n.unit_no}<div className="small muted">{n.contract_no}</div></td>
          <td>{fmtDate(n.submitted_on)}</td><td>{fmtDate(n.proposed_date)}{n.proposed_date < n.notice_end && <div className="small" style={{ color: 'var(--red)' }}>Short notice</div>}</td><td>{fmtDate(n.notice_end)}</td><td><b>{fmtDate(n.final_rent_date)}</b></td>
          <td className="n">{num3(n.security_deposit)}</td><td>{fmtDate(n.inspection_date)}</td><td><span className="pill p-blue">{n.status}</span></td><td>{edit && <button className="sm" onClick={() => setOpen(n)}>Update</button>}</td></tr>)}</tbody></table>
        : <div className="empty">No notices.</div>)}</div>
      <div className="small muted" style={{ marginTop: 8 }}>Rent is payable until the later of the tenant's leaving date and the end of the notice period. End the contract from the Contracts page once keys are handed over; deposit settlement comes with the finance phase.</div>
    </div>
    {open && <Upd n={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); N.reload(); }} />}
  </>;
}

function Upd({ n, onClose, onDone }: { n: any; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ status: n.status, inspectionDate: n.inspection_date || '', handoverDate: n.handover_date || '', staffNote: n.staff_note || '' }); const [err, setErr] = useState('');
  const save = async () => { setErr(''); const body: any = { status: f.status, staffNote: f.staffNote }; if (f.inspectionDate) body.inspectionDate = f.inspectionDate; if (f.handoverDate) body.handoverDate = f.handoverDate;
    try { await api(`/notices/${n.id}`, { method: 'PATCH', body }); onDone(); } catch (x: any) { setErr(x.message); } };
  return <Modal title={`${n.ref_no} — ${n.tenant_name}`} onClose={onClose}><Err msg={err} /><div className="form">
    <Field label="Status"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
    <Field label="Final inspection date"><input type="date" value={f.inspectionDate} onChange={(e) => setF({ ...f, inspectionDate: e.target.value })} /></Field>
    <Field label="Key handover date"><input type="date" value={f.handoverDate} onChange={(e) => setF({ ...f, handoverDate: e.target.value })} /></Field>
    <Field label="Message to tenant" full><textarea value={f.staffNote} onChange={(e) => setF({ ...f, staffNote: e.target.value })} /></Field>
    <div className="full small muted">The tenant is notified in the app of any change.</div>
    <div className="full row"><button onClick={onClose}>Cancel</button><button className="primary right" onClick={save}>Save</button></div></div></Modal>;
}
