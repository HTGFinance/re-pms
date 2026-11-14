'use client';
import { FormEvent, useRef, useState } from 'react';
import { useTenant } from '@/components/TenantShell';
import { Err, Pill, useLoad } from '@/components/ui';
import { today } from '@/components/finance';
import { api, fmtDate, num3, omr } from '@/lib/api';

export default function TPay() {
  const { home, reload } = useTenant();
  const bank = useLoad(() => api('/me/bank-details')); const P = useLoad(() => api<any[]>('/me/payments')); const L = useLoad(() => api('/me/ledger'));
  const [f, setF] = useState({ date: today(), amount: '', reference: '' }); const file = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState(''); const [ok, setOk] = useState(''); const [busy, setBusy] = useState(false); const [showStmt, setShowStmt] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); setErr(''); setOk(''); const r = file.current?.files?.[0]; if (!r) { setErr('Attach the bank receipt'); return; }
    const fd = new FormData(); fd.append('date', f.date); fd.append('amount', String(f.amount)); fd.append('reference', f.reference); fd.append('receipt', r); setBusy(true);
    try { await api('/me/payments', { form: fd }); setOk('Thank you — your payment was sent for checking. It will show on your account once finance confirms it with the bank.'); setF({ date: today(), amount: '', reference: '' }); if (file.current) file.current.value = ''; P.reload(); reload(); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); } };
  const b = bank.data; const bal = Math.max(0, Number(home?.account?.balance || 0));
  return <>
    <div className="tcard"><div className="small muted">Total payable</div><div className="tbig">{omr(bal)}</div></div>
    <div className="tcard"><h4>Pay online</h4><div className="small muted">Card payment through the payment gateway is coming soon.</div><button className="btn-block" disabled style={{ marginTop: 8 }}>Pay by card (coming soon)</button></div>
    <div className="tcard"><h4>Pay by bank transfer</h4>
      {b && (b.iban || b.accountNo) ? <>{[['Bank', b.bank], ['Account name', b.accountName], ['Account no.', b.accountNo], ['IBAN', b.iban], ['Reference', home?.tenant?.tenantNo]].filter(([, v]) => v).map(([k, v]) => <div className="line" key={k}><span className="muted">{k}</span><b style={{ wordBreak: 'break-all' }}>{v}</b></div>)}
        <div className="small muted" style={{ marginTop: 6 }}>{b.note}</div></> : <div className="small muted">Ask the office for the bank details.</div>}
      <form onSubmit={submit} style={{ marginTop: 12 }}><Err msg={err} />{ok && <div className="ok-msg">{ok}</div>}
        <div className="form" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div><label>Transfer date</label><input type="date" value={f.date} max={today()} onChange={(e) => setF({ ...f, date: e.target.value })} required /></div>
          <div><label>Amount (OMR)</label><input type="number" step="0.001" min="0.001" inputMode="decimal" value={f.amount} placeholder={bal ? bal.toFixed(3) : ''} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></div>
          <div className="full"><label>Bank reference no.</label><input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} required /></div>
          <div className="full"><label>Bank receipt (photo or PDF)</label><input ref={file} type="file" accept="image/*,application/pdf" capture="environment" required /></div>
        </div><button className="primary btn-block" style={{ marginTop: 12 }} disabled={busy}>{busy ? 'Sending…' : 'Send payment for checking'}</button></form></div>
    <div className="tcard"><h4>Payment history</h4>{P.data?.length ? P.data.map((p) => <div key={p.id} className="line"><span>{fmtDate(p.date)}<div className="small muted">{p.method} · {p.reference}{p.rejectReason ? ` · ${p.rejectReason}` : ''}</div></span><span style={{ textAlign: 'right' }}><b>{omr(p.amount)}</b><div><Pill s={p.status} /></div></span></div>) : <div className="small muted">No payments yet.</div>}</div>
    <div className="tcard"><h4 className="row">Statement <button className="sm right" onClick={() => setShowStmt(!showStmt)}>{showStmt ? 'Hide' : 'Show'}</button></h4>
      {showStmt && L.data && (L.data.lines.length ? L.data.lines.map((l: any) => <div key={l.kind + l.id} className="line"><span>{fmtDate(l.date)}<div className="small muted">{l.description}</div></span><span style={{ textAlign: 'right' }}>{Number(l.debit) ? num3(l.debit) : '−' + num3(l.credit)}<div className="small muted">Bal {num3(l.balance)}</div></span></div>) : <div className="small muted">No transactions yet.</div>)}</div>
  </>;
}
