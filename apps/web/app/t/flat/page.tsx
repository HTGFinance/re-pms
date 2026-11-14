'use client';
import { FormEvent, useState } from 'react';
import { useTenant } from '@/components/TenantShell';
import { Err, useLoad } from '@/components/ui';
import { today } from '@/components/finance';
import { api, fmtDate, mapUrl, omr } from '@/lib/api';

const addM = (d: string, n: number) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };

export default function TFlat() {
  const { home, reload } = useTenant(); const N = useLoad(() => api<any[]>('/me/notices'));
  const [pw, setPw] = useState(''); const [accepting, setAccepting] = useState<string | null>(null); const [err, setErr] = useState('');
  const [notice, setNotice] = useState(false); const [nd, setNd] = useState(''); const [reason, setReason] = useState('');
  if (!home) return <div className="empty">Loading…</div>;
  const c = home.contracts.find((x: any) => x.status === 'Active') || home.contracts[0];
  const accept = async (e: FormEvent) => { e.preventDefault(); setErr(''); try { await api(`/me/contracts/${accepting}/accept`, { body: { password: pw } }); setAccepting(null); setPw(''); reload(); } catch (x: any) { setErr(x.message); } };
  const give = async (e: FormEvent) => { e.preventDefault(); setErr(''); try { await api('/me/notices', { body: { contractId: c.id, proposedDate: nd, reason } }); setNotice(false); N.reload(); reload(); } catch (x: any) { setErr(x.message); } };
  const open = N.data?.find((n) => !['Settled', 'Cancelled'].includes(n.status));
  const noticeEnd = c ? addM(today(), c.noticeMonths) : '';
  return <>
    <Err msg={err} />
    {home.contracts.filter((x: any) => x.eStatus === 'Sent to tenant').map((x: any) => <div key={x.id} className="tcard" style={{ borderColor: '#f3dfa6', background: '#fffbf0' }}>
      <h4>Contract {x.contractNo} is ready for you</h4>
      <div className="small">{x.building.name}, unit {x.unit.no} · {fmtDate(x.startDate)} – {fmtDate(x.expiryDate)} · {omr(x.monthlyRent)}/month{Number(x.vatRate) ? ' + VAT' : ''} · deposit {omr(x.securityDeposit)} · notice {x.noticeMonths} month(s)</div>
      {accepting === x.id ? <form onSubmit={accept} style={{ marginTop: 10 }}><label>Enter your password to accept</label><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required autoFocus />
        <div className="row" style={{ marginTop: 10 }}><button type="button" onClick={() => setAccepting(null)}>Cancel</button><button className="primary right">I accept this contract</button></div></form>
        : <button className="primary btn-block" style={{ marginTop: 10 }} onClick={() => setAccepting(x.id)}>Review & accept</button>}</div>)}
    {c && <div className="tcard"><h4>My flat</h4>
      <div className="line"><span className="muted">Building</span><b>{c.building.name}</b></div>
      <div className="line"><span className="muted">Unit</span><b>{c.unit.no} · {c.unit.type}</b></div>
      <div className="line"><span className="muted">Address</span><b style={{ textAlign: 'right' }}>{c.building.addressCode || c.building.location}</b></div>
      {mapUrl(c.building.lat, c.building.lng) && <a className="btn btn-block" style={{ display: 'block', textAlign: 'center', marginTop: 10, textDecoration: 'none' }} href={mapUrl(c.building.lat, c.building.lng)} target="_blank" rel="noopener">📍 Directions</a>}</div>}
    {c && <div className="tcard"><h4>Contract {c.contractNo}</h4>
      {[['Status', c.status], ['Start', fmtDate(c.startDate)], ['Expiry', fmtDate(c.expiryDate)], ['Monthly rent', omr(c.monthlyRent) + (Number(c.vatRate) ? ' + VAT 5%' : '')], ['Security deposit', omr(c.securityDeposit)],
        ['Payment', `${c.paymentFrequency}, due day ${c.rentDueDay}`], ['Notice period', `${c.noticeMonths} month(s)`], ['E-contract', c.eStatus + (c.tenantAcceptedAt ? ` (accepted ${fmtDate(c.tenantAcceptedAt)})` : '')], ['Municipality reg.', c.municipalityRegNo || 'Pending']]
        .map(([k, v]) => <div className="line" key={k}><span className="muted">{k}</span><b style={{ textAlign: 'right' }}>{v}</b></div>)}</div>}
    {c && c.status === 'Active' && <div className="tcard"><h4>Notice to vacate</h4>
      {open ? <>{[['Reference', open.ref_no], ['Submitted', fmtDate(open.submitted_on)], ['Your leaving date', fmtDate(open.proposed_date)], ['Notice period ends', fmtDate(open.notice_end)], ['Rent payable until', fmtDate(open.final_rent_date)], ['Status', open.status],
          ['Final inspection', open.inspection_date ? fmtDate(open.inspection_date) : 'To be arranged'], ['Key handover', open.handover_date ? fmtDate(open.handover_date) : '—'], ['Security deposit', omr(open.security_deposit)]]
          .map(([k, v]) => <div className="line" key={k}><span className="muted">{k}</span><b>{v}</b></div>)}{open.staff_note && <div className="small" style={{ marginTop: 6 }}>{open.staff_note}</div>}</>
        : notice ? <form onSubmit={give}><div className="info" style={{ marginBottom: 10 }}>Your contract needs {c.noticeMonths} month(s) notice. If you leave before {fmtDate(noticeEnd)}, rent is still payable until then.</div>
          <label>Date you plan to leave</label><input type="date" min={today()} value={nd} onChange={(e) => setNd(e.target.value)} required />
          {nd && <div className="small" style={{ margin: '6px 0' }}>Rent payable until <b>{fmtDate(nd > noticeEnd ? nd : noticeEnd)}</b></div>}
          <label style={{ marginTop: 8 }}>Reason (optional)</label><input value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="row" style={{ marginTop: 10 }}><button type="button" onClick={() => setNotice(false)}>Cancel</button><button className="danger right">Submit notice</button></div></form>
        : <><div className="small muted" style={{ marginBottom: 10 }}>Planning to move out? Give formal notice here and follow the inspection, handover and deposit settlement.</div><button className="btn-block" onClick={() => setNotice(true)}>Give notice to vacate</button></>}</div>}
  </>;
}
