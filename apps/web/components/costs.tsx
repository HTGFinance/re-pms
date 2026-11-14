'use client';
import { FormEvent, useState } from 'react';
import { Err, useLoad } from '@/components/ui';
import { today } from '@/components/finance';
import { api, fmtDate, num3, omr } from '@/lib/api';

const CLASSES = ['Company responsibility', 'Recoverable from tenant', 'Tenant responsibility', 'Pending approval'];
const AP: Record<string, string> = { 'Not needed': 'p-green', Approved: 'p-green', Pending: 'p-amber', Rejected: 'p-red' };

/** Cost lines on a job, with a form to add one. Used by staff and by technicians. */
export function CostsPanel({ complaintId, canAdd, hasTenant, meId, compact }: { complaintId: string; canAdd: boolean; hasTenant: boolean; meId?: string; compact?: boolean }) {
  const C = useLoad(() => api(`/complaints/${complaintId}/costs`), [complaintId]); const [adding, setAdding] = useState(false); const [err, setErr] = useState('');
  const blank = { workDate: today(), material: '', labour: '', contractor: '', contractorName: '', other: '', description: '', classification: 'Company responsibility' };
  const [f, setF] = useState(blank);
  const total = ['material', 'labour', 'contractor', 'other'].reduce((s, k) => s + (Number((f as any)[k]) || 0), 0);
  const save = async (e: FormEvent) => { e.preventDefault(); setErr(''); const body: any = { workDate: f.workDate, classification: f.classification };
    for (const k of ['material', 'labour', 'contractor', 'other']) if ((f as any)[k]) body[k] = String((f as any)[k]);
    if (f.contractorName) body.contractorName = f.contractorName; if (f.description) body.description = f.description;
    try { await api(`/complaints/${complaintId}/costs`, { body }); setF(blank); setAdding(false); C.reload(); } catch (x: any) { setErr(x.message); } };
  const del = async (id: string) => { setErr(''); try { await api(`/maintenance-costs/${id}`, { method: 'DELETE' }); C.reload(); } catch (x: any) { setErr(x.message); } };
  const c = C.data; const limit = c?.approvalLimit ?? 200;
  const needs = f.classification === 'Pending approval' || f.classification === 'Recoverable from tenant' || total > limit;
  return <div>
    <div className="row" style={{ marginBottom: 6 }}><b style={{ color: 'var(--navy)' }}>Costs</b>{c && <span className="small muted">Total {omr(c.total)}{Number(c.pending) ? ` · ${omr(c.pending)} awaiting approval` : ''}</span>}
      {canAdd && !adding && <button className="sm right" onClick={() => setAdding(true)}>+ Add cost</button>}</div>
    <Err msg={err || C.error} />
    {c?.items?.length > 0 && <div className={compact ? '' : 'tw'}>{compact ? c.items.map((k: any) => <div key={k.id} className="line"><span>{fmtDate(k.workDate)} · {k.classification}<div className="small muted">{k.description}</div></span><span style={{ textAlign: 'right' }}><b>{num3(k.total)}</b><div><span className={`pill ${AP[k.approvalStatus]}`}>{k.approvalStatus === 'Not needed' ? 'Recorded' : k.approvalStatus}</span></div></span></div>)
      : <table><thead><tr><th>Date</th><th className="n">Material</th><th className="n">Labour</th><th className="n">Contractor</th><th className="n">Other</th><th className="n">Total</th><th>Who pays</th><th>Approval</th><th></th></tr></thead>
        <tbody>{c.items.map((k: any) => <tr key={k.id}><td>{fmtDate(k.workDate)}<div className="small muted">{k.technician?.name || ''}</div></td><td className="n">{num3(k.material)}</td><td className="n">{num3(k.labour)}</td><td className="n">{num3(k.contractor)}{k.contractorName && <div className="small muted">{k.contractorName}</div>}</td><td className="n">{num3(k.other)}</td>
          <td className="n"><b>{num3(k.total)}</b></td><td className="small">{k.classification}{k.description && <div className="muted">{k.description}</div>}</td>
          <td><span className={`pill ${AP[k.approvalStatus]}`}>{k.approvalStatus}</span>{k.rejectReason && <div className="small" style={{ color: 'var(--red)' }}>{k.rejectReason}</div>}{k.approvedBy && <div className="small muted">{k.approvedBy}</div>}</td>
          <td>{canAdd && ['Pending', 'Not needed', 'Rejected'].includes(k.approvalStatus) && !k.chargeId && (!meId || k.recordedById === meId) && <button className="sm danger" onClick={() => del(k.id)}>Delete</button>}</td></tr>)}</tbody></table>}</div>}
    {c && !c.items.length && !adding && <div className="small muted">No costs recorded yet.</div>}
    {adding && <form onSubmit={save} className="form" style={{ marginTop: 8, gridTemplateColumns: compact ? '1fr 1fr' : undefined }}>
      <div><label>Date of work</label><input type="date" value={f.workDate} max={today()} onChange={(e) => setF({ ...f, workDate: e.target.value })} required /></div>
      <div><label>Who pays</label><select value={f.classification} onChange={(e) => setF({ ...f, classification: e.target.value })}>{CLASSES.filter((x) => hasTenant || x === 'Company responsibility' || x === 'Pending approval').map((x) => <option key={x}>{x}</option>)}</select></div>
      {[['material', 'Material (OMR)'], ['labour', 'Labour (OMR)'], ['contractor', 'External contractor (OMR)'], ['other', 'Other expenses (OMR)']].map(([k, l]) =>
        <div key={k}><label>{l}</label><input type="number" step="0.001" min="0" inputMode="decimal" value={(f as any)[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>)}
      {Number(f.contractor) > 0 && <div className="full"><label>Contractor name</label><input value={f.contractorName} onChange={(e) => setF({ ...f, contractorName: e.target.value })} /></div>}
      <div className="full"><label>What was done / bought</label><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={500} /></div>
      <div className="full small" style={{ color: needs ? '#8a5a00' : 'var(--muted)' }}>Total <b>{omr(total)}</b>{needs ? ' — needs approval by a property manager or finance' : ''}{f.classification === 'Recoverable from tenant' ? '; once approved it is charged to the tenant' : ''}.</div>
      <div className="full row"><button type="button" onClick={() => { setAdding(false); setErr(''); }}>Cancel</button><button className="primary right" disabled={total <= 0}>Save cost</button></div></form>}
  </div>;
}
