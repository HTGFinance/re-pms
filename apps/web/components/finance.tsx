'use client';
import { FormEvent, useEffect, useState } from 'react';
import { Err, Field, Modal, useLoad } from '@/components/ui';
import { api, fmtDate, num3, omr } from '@/lib/api';
import { BRAND } from '@/lib/brand';

export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date());
export const BANKS = ['Bank Muscat', 'National Bank of Oman', 'Bank Dhofar', 'Sohar International', 'Oman Arab Bank', 'HSBC Oman', 'Bank Nizwa', 'Ahli Bank', 'Other'];

/** Searchable tenant picker (uses /tenants?q=). */
export function TenantPicker({ value, onChange, fixed }: { value: string; onChange: (id: string, t?: any) => void; fixed?: { id: string; name: string } }) {
  const [q, setQ] = useState(''); const [list, setList] = useState<any[]>([]);
  useEffect(() => { if (fixed) return; const h = setTimeout(() => api<any[]>('/tenants' + (q ? '?q=' + encodeURIComponent(q) : '')).then(setList).catch(() => setList([])), 250); return () => clearTimeout(h); }, [q, fixed]);
  if (fixed) return <input value={fixed.name} disabled />;
  return <div><input placeholder="Search tenant name, no. or mobile" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 6 }} />
    <select value={value} onChange={(e) => onChange(e.target.value, list.find((t) => t.id === e.target.value))} required size={Math.min(6, Math.max(2, list.length))}>
      {list.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.tenantNo}{t.current ? ` · ${t.current.buildingName} ${t.current.unitNo}` : ''}</option>)}</select></div>;
}

export function PaymentForm({ tenant, suggested, onClose, onSaved }: { tenant?: { id: string; name: string }; suggested?: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ tenantId: tenant?.id || '', date: today(), amount: suggested ? Number(suggested).toFixed(3) : '', method: 'Cash', reference: '', notes: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => { e.preventDefault(); setErr(''); setBusy(true);
    try { await api('/payments', { body: { ...f, amount: String(f.amount) } }); onSaved(); } catch (x: any) { setErr(x.message); setBusy(false); } };
  return <Modal title="Record payment" onClose={onClose}><Err msg={err} />
    <div className="info" style={{ marginBottom: 12 }}>The receipt is saved as <b>Pending</b>. It reaches the tenant's ledger once a different person in finance verifies it against the bank statement or cash count. Cheques are entered in the cheque register.</div>
    <form className="form" onSubmit={save}>
      <Field label="Tenant" full><TenantPicker value={f.tenantId} fixed={tenant} onChange={(id) => setF({ ...f, tenantId: id })} /></Field>
      <Field label="Payment date"><input type="date" value={f.date} max={today()} onChange={(e) => setF({ ...f, date: e.target.value })} required /></Field>
      <Field label="Amount (OMR)"><input type="number" step="0.001" min="0.001" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></Field>
      <Field label="Method"><select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}><option>Cash</option><option>Bank transfer</option><option>Card (POS)</option></select></Field>
      <Field label="Reference (receipt book / transfer / POS no.)"><input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} required /></Field>
      <Field label="Notes" full><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <div className="full row"><button type="button" onClick={onClose}>Cancel</button><button className="primary right" disabled={busy || !f.tenantId}>Save receipt</button></div>
    </form></Modal>;
}

export function ChequeSeriesForm({ tenant, onClose, onSaved }: { tenant?: { id: string; name: string }; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>({ tenantId: tenant?.id || '', contractId: '', bank: BANKS[0], firstChequeNo: '', firstDueDate: '', count: 12, amount: '', intervalMonths: 1 });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const C = useLoad(() => f.tenantId ? api<any[]>(`/contracts?tenantId=${f.tenantId}`) : Promise.resolve([]), [f.tenantId]);
  useEffect(() => { const c = C.data?.find((x) => ['Active', 'Upcoming'].includes(x.status)); if (c && !f.contractId) setF((p: any) => ({ ...p, contractId: c.id, amount: p.amount || (Number(c.monthlyRent) * (1 + Number(c.vatRate))).toFixed(3) })); }, [C.data]); // eslint-disable-line
  const save = async (e: FormEvent) => { e.preventDefault(); setErr(''); setBusy(true);
    const body: any = { ...f, count: Number(f.count), intervalMonths: Number(f.intervalMonths), amount: String(f.amount) }; if (!body.contractId) delete body.contractId;
    try { await api('/cheques/series', { body }); onSaved(); } catch (x: any) { setErr(x.message); setBusy(false); } };
  return <Modal title="Receive post-dated cheques" onClose={onClose}><Err msg={err} /><form className="form" onSubmit={save}>
    <Field label="Tenant" full><TenantPicker value={f.tenantId} fixed={tenant} onChange={(id) => setF({ ...f, tenantId: id, contractId: '' })} /></Field>
    <Field label="Contract"><select value={f.contractId} onChange={(e) => setF({ ...f, contractId: e.target.value })}><option value="">— None —</option>{C.data?.map((c) => <option key={c.id} value={c.id}>{c.contractNo} · {c.building.name} {c.unit.unitNo} ({c.status})</option>)}</select></Field>
    <Field label="Bank"><select value={f.bank} onChange={(e) => setF({ ...f, bank: e.target.value })}>{BANKS.map((b) => <option key={b}>{b}</option>)}</select></Field>
    <Field label="First cheque no."><input value={f.firstChequeNo} onChange={(e) => setF({ ...f, firstChequeNo: e.target.value.replace(/\D/g, '') })} required inputMode="numeric" /></Field>
    <Field label="First cheque date"><input type="date" value={f.firstDueDate} onChange={(e) => setF({ ...f, firstDueDate: e.target.value })} required /></Field>
    <Field label="Number of cheques"><input type="number" min={1} max={60} value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} /></Field>
    <Field label="Every"><select value={f.intervalMonths} onChange={(e) => setF({ ...f, intervalMonths: e.target.value })}><option value={1}>1 month</option><option value={3}>3 months</option><option value={6}>6 months</option><option value={12}>12 months</option></select></Field>
    <Field label="Amount per cheque (OMR)"><input type="number" step="0.001" min="0.001" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></Field>
    <div className="full small muted">Numbers go up by one per cheque ({f.firstChequeNo || '000123'}, {f.firstChequeNo ? (BigInt(f.firstChequeNo) + 1n).toString().padStart(f.firstChequeNo.length, '0') : '000124'}…). Total {omr(Number(f.amount || 0) * Number(f.count || 0))}.</div>
    <div className="full row"><button type="button" onClick={onClose}>Cancel</button><button className="primary right" disabled={busy || !f.tenantId}>Save {f.count} cheque(s)</button></div>
  </form></Modal>;
}

export function ChargeForm({ tenant, canCredit, onClose, onSaved }: { tenant: { id: string; name: string }; canCredit: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ kind: 'Maintenance', date: today(), amount: '', description: '' }); const [err, setErr] = useState('');
  const credit = f.kind === 'Credit note';
  const save = async (e: FormEvent) => { e.preventDefault(); setErr('');
    const amt = Math.abs(Number(f.amount)); try { await api('/charges', { body: { tenantId: tenant.id, date: f.date, kind: f.kind, description: f.description, amount: String(credit ? -amt : amt) } }); onSaved(); } catch (x: any) { setErr(x.message); } };
  return <Modal title={`Charge or credit — ${tenant.name}`} onClose={onClose}><Err msg={err} /><form className="form" onSubmit={save}>
    <Field label="Type"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{['Maintenance', 'Fee', 'Utility', 'Penalty', 'Other', ...(canCredit ? ['Credit note'] : [])].map((k) => <option key={k}>{k}</option>)}</select></Field>
    <Field label="Date"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></Field>
    <Field label={credit ? 'Credit amount (OMR)' : 'Amount (OMR)'}><input type="number" step="0.001" min="0.001" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></Field>
    <Field label="Description" full><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} required maxLength={300} /></Field>
    <div className="full small muted">{credit ? 'A credit note reduces what the tenant owes.' : 'Charges are added to what the tenant owes.'}</div>
    <div className="full row"><button type="button" onClick={onClose}>Cancel</button><button className="primary right">Save</button></div></form></Modal>;
}

export function Receipt({ id, onClose }: { id: string; onClose: () => void }) {
  const R = useLoad(() => api(`/payments/${id}/receipt`), [id]); const r = R.data;
  return <Modal title="Payment receipt" onClose={onClose}><Err msg={R.error} />{r && <div id="receipt" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 18 }}>
    <div className="row" style={{ justifyContent: 'space-between' }}><div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)' }}>Receipt</div><div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', direction: 'rtl' }}>إيصال استلام</div></div>
    <div className="small" style={{ fontWeight: 700, marginTop: 4 }}>{BRAND.name}</div>
    <div className="small muted" style={{ marginBottom: 12 }}>{r.receiptNo} · {fmtDate(r.date)}</div>
    {[['Received from', r.tenant?.name + (r.tenant?.tenant_no ? ` (${r.tenant.tenant_no})` : '')], ['Property', r.tenant?.building ? `${r.tenant.building}, unit ${r.tenant.unit_no}` : '—'], ['Amount', omr(r.amount)], ['Method', r.method], ['Reference', r.reference || '—'], ['Verified', r.verifiedAt ? new Date(r.verifiedAt).toLocaleString('en-GB', { timeZone: 'Asia/Muscat' }) : '—']]
      .map(([k, v]) => <div className="line" key={k}><span className="muted">{k}</span><b>{v}</b></div>)}
  </div>}<div className="row" style={{ marginTop: 12 }}><button onClick={() => window.print()}>Print</button><button className="right" onClick={onClose}>Close</button></div></Modal>;
}

export const Money = ({ v, red }: { v: string | number; red?: boolean }) => <span style={red && Number(v) > 0 ? { color: 'var(--red)', fontWeight: 700 } : undefined}>{num3(v)}</span>;
