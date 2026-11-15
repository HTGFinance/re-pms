'use client';
import Link from 'next/link';
import { useTenant } from '@/components/TenantShell';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import InstallApp from '@/components/InstallApp';
import { fmtDate, omr } from '@/lib/api';

function Welcome() { const w = useSearchParams().get('welcome'); if (!w) return null;
  return <div className="tcard welcome"><h4>Your app is ready 🎉</h4><div className="small muted">Add it to your home screen so it opens like any other app.</div><InstallApp /></div>; }

export default function THome() {
  const { home } = useTenant(); if (!home) return <div className="empty">Loading…</div>;
  const a = home.account; const c = home.contracts.find((x: any) => x.status === 'Active') || home.contracts[0];
  const days = c ? Math.round((new Date(c.expiryDate).getTime() - Date.now()) / 864e5) : null;
  return <>
    <Suspense fallback={null}><Welcome /></Suspense>
    {home.toAccept.length > 0 && <Link className="tlink" href="/t/flat"><div className="note" style={{ marginBottom: 12 }}>Your lease contract is ready. <b>Review and accept it →</b></div></Link>}
    {home.complaintsToConfirm > 0 && <Link className="tlink" href="/t/complaints"><div className="info" style={{ marginBottom: 12 }}>{home.complaintsToConfirm} complaint(s) completed — <b>please confirm if the problem is solved →</b></div></Link>}
    <div className="tcard"><div className="small muted">Total payable</div><div className="tbig" style={{ color: Number(a.balance) > 0 ? 'var(--navy)' : 'var(--green)' }}>{omr(Math.max(0, Number(a.balance)))}</div>
      <div className="line"><span>This month's rent</span><b>{omr(a.currentDue)}</b></div>
      <div className="line"><span>Previous outstanding</span><b style={{ color: Number(a.previousDue) > 0 ? 'var(--red)' : undefined }}>{omr(a.previousDue)}</b></div>
      {Number(a.advance) > 0 && <div className="line"><span>Advance / credit</span><b>{omr(a.advance)}</b></div>}
      {Number(a.pendingPayments) > 0 && <div className="small muted" style={{ marginTop: 6 }}>{omr(a.pendingPayments)} being checked by finance.</div>}
      <Link href="/t/pay"><button className="primary btn-block" style={{ marginTop: 12 }}>Pay rent</button></Link></div>
    <div className="tcard"><h4>Need something fixed?</h4><div className="small muted" style={{ marginBottom: 10 }}>Report a repair, service or flat problem with photos and follow it here.</div>
      <div className="row"><Link href="/t/complaints/new" style={{ flex: 1 }}><button className="btn-block">+ New complaint</button></Link><Link href="/t/complaints" style={{ flex: 1 }}><button className="btn-block">My complaints ({home.openComplaints} open)</button></Link></div></div>
    {c && <div className="tcard"><h4>My contract</h4>
      <div className="line"><span className="muted">Contract</span><b>{c.contractNo}</b></div>
      <div className="line"><span className="muted">Monthly rent</span><b>{omr(c.monthlyRent)}{Number(c.vatRate) ? ' + VAT' : ''}</b></div>
      <div className="line"><span className="muted">Rent due</span><b>Day {c.rentDueDay} · {c.paymentFrequency}</b></div>
      <div className="line"><span className="muted">Expires</span><b>{fmtDate(c.expiryDate)} {days !== null && days <= 90 && days >= 0 && <span className="pill p-amber">{days} days</span>}</b></div>
      <div className="line"><span className="muted">Last payment</span><b>{fmtDate(a.lastPaymentDate)}</b></div></div>}
  </>;
}
