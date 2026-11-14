'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Header } from '@/components/Shell';
import { Err, Kpi, useLoad } from '@/components/ui';
import { BarChart, HBars } from '@/components/charts';
import { today } from '@/components/finance';
import { api, fmtDate, num3, omr } from '@/lib/api';

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
const mShort = (m: string) => new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
type Mode = 'month' | 'quarter' | 'year' | 'ytd' | 'custom';

function rangeFor(mode: Mode, month: string, quarter: string, year: string, custom: [string, string]): [string, string, string] {
  const t = today();
  if (mode === 'month') { const [y, m] = month.split('-').map(Number); return [`${month}-01`, lastDay(y, m), new Date(month + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })]; }
  if (mode === 'quarter') { const [y, q] = quarter.split('-Q').map(Number); return [`${y}-${pad((q - 1) * 3 + 1)}-01`, lastDay(y, q * 3), `Q${q} ${y}`]; }
  if (mode === 'year') return [`${year}-01-01`, `${year}-12-31`, `Year ${year}`];
  if (mode === 'ytd') return [`${t.slice(0, 4)}-01-01`, t, 'Year to date'];
  return [custom[0], custom[1], 'Custom period'];
}

export default function Executive() {
  const t = today(); const thisY = Number(t.slice(0, 4));
  const [mode, setMode] = useState<Mode>('ytd'); const [month, setMonth] = useState(t.slice(0, 7)); const [quarter, setQuarter] = useState(`${thisY}-Q${Math.floor((Number(t.slice(5, 7)) - 1) / 3) + 1}`);
  const [year, setYear] = useState(String(thisY)); const [custom, setCustom] = useState<[string, string]>([`${thisY}-01-01`, t]); const [bid, setBid] = useState(''); const [view, setViewS] = useState<'summary' | 'charts'>(() => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'charts' ? 'charts' : 'summary'));
  const setView = (v: 'summary' | 'charts') => { setViewS(v); try { const u = new URL(window.location.href); if (v === 'charts') u.searchParams.set('view', 'charts'); else u.searchParams.delete('view'); window.history.replaceState(null, '', u.toString()); } catch {} };
  const [from, to, label] = rangeFor(mode, month, quarter, year, custom);
  const qs = `from=${from}&to=${to}${bid ? '&buildingId=' + bid : ''}`;
  const D = useLoad(() => api(`/executive/dashboard?${qs}`), [qs]); const B = useLoad(() => api<any[]>('/buildings'));
  const months = Array.from({ length: 24 }, (_, i) => { const d = new Date(t.slice(0, 8) + '01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - i); return d.toISOString().slice(0, 7); });
  const quarters = Array.from({ length: 8 }, (_, i) => { const q0 = thisY * 4 + Math.floor((Number(t.slice(5, 7)) - 1) / 3) - i; return `${Math.floor(q0 / 4)}-Q${(q0 % 4) + 1}`; });
  const d = D.data;
  return <>
    <Header title="Executive dashboard" sub="Group portfolio performance, budget vs actual and risks" right={<a className="btn" style={{ textDecoration: 'none' }} href={`/api/executive/report.xlsx?${qs}`}>⬇ Board pack (Excel)</a>} />
    <div id="view">
      <div className="tabs" style={{ marginBottom: 12 }}>{([['summary', 'Summary'], ['charts', 'Charts']] as const).map(([k, l]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}</div>
      <div className="card" style={{ marginBottom: 14 }}><div className="row">
        <b style={{ color: 'var(--navy)' }}>Period</b>
        <div className="seg">{([['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year'], ['ytd', 'Year to date'], ['custom', 'From – To']] as [Mode, string][]).map(([k, l]) => <button key={k} className={`sm ${mode === k ? 'primary' : ''}`} onClick={() => setMode(k)}>{l}</button>)}</div>
        {mode === 'month' && <select style={{ width: 'auto' }} value={month} onChange={(e) => setMonth(e.target.value)}>{months.map((m) => <option key={m} value={m}>{new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</option>)}</select>}
        {mode === 'quarter' && <select style={{ width: 'auto' }} value={quarter} onChange={(e) => setQuarter(e.target.value)}>{quarters.map((q) => <option key={q} value={q}>{q.replace('-', ' ')}</option>)}</select>}
        {mode === 'year' && <select style={{ width: 'auto' }} value={year} onChange={(e) => setYear(e.target.value)}>{[thisY, thisY - 1, thisY - 2].map((y) => <option key={y}>{y}</option>)}</select>}
        {mode === 'custom' && <><input type="date" style={{ width: 'auto' }} value={custom[0]} onChange={(e) => setCustom([e.target.value, custom[1]])} /><span className="small">to</span><input type="date" style={{ width: 'auto' }} value={custom[1]} onChange={(e) => setCustom([custom[0], e.target.value])} /></>}
        <select className="right" style={{ width: 'auto' }} value={bid} onChange={(e) => setBid(e.target.value)}><option value="">All buildings</option>{B.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
      </div><div className="small muted" style={{ marginTop: 6 }}><b>{label}</b> · {fmtDate(from)} – {fmtDate(to)}{to > t ? ` · actuals and budget to ${fmtDate(t)}` : ''}</div></div>
      <Err msg={D.error} />
      {d && (view === 'charts' ? <Charts d={d} label={label} /> : <Body d={d} label={label} />)}
    </div>
  </>;
}

function BvaKpi({ label, x, cost }: { label: string; x: any; cost?: boolean }) {
  const b = Number(x.budget);
  return <div className={`card kpi ${x.favourable === null ? '' : x.favourable ? 'good' : 'bad'}`}><div className="l">{label}</div><div className="v">{omr(x.actual)}</div>
    <div className="s">Budget {b ? omr(x.budget) : '—'}{b ? <><br /><span style={{ color: x.favourable ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{Number(x.variance) >= 0 ? '+' : ''}{num3(x.variance)} ({x.variancePct >= 0 ? '+' : ''}{x.variancePct}%){cost ? (x.favourable ? ' under budget' : ' over budget') : ''}</span></> : null}</div></div>;
}
const Var = ({ x }: { x: any }) => !Number(x.budget) ? <span className="muted small">No budget</span> : <span style={{ color: x.favourable ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{Number(x.variance) >= 0 ? '+' : ''}{num3(x.variance)} ({x.variancePct >= 0 ? '+' : ''}{x.variancePct}%)</span>;

function Body({ d, label }: { d: any; label: string }) {
  const x = d.totals, y = d.ytd, td = d.today; const bv = x.budgetVsActual;
  const L = d.monthly.map((m: any) => mShort(m.month)); const noBudget = !Number(bv.rentalIncome.budget) && !Number(bv.maintenance.budget);
  return <>
    <div className="sec" style={{ marginTop: 0 }}>Year to date at a glance <span className="small muted" style={{ fontWeight: 400 }}>· {fmtDate(y.from)} – {fmtDate(y.to)}</span></div>
    <div className="grid k4"><BvaKpi label="Rental income YTD" x={y.budgetVsActual.rentalIncome} /><BvaKpi label="Collections YTD" x={y.budgetVsActual.collections} /><BvaKpi label="Maintenance YTD" x={y.budgetVsActual.maintenance} cost /><BvaKpi label="Net operating income YTD" x={y.budgetVsActual.noi} /></div>
    <div className="sec">{label}</div>
    <div className="grid k4">
      <Kpi label={`Occupancy at ${fmtDate(d.period.asAt)}`} value={x.occupancy + '%'} sub={`${x.occupied} of ${x.units} units`} tone={x.occupancy >= 90 ? 'good' : 'warn'} />
      <Kpi label="Rent billed (excl. VAT)" value={omr(x.rentBilled)} sub={`VAT ${omr(x.vat)}`} />
      <Kpi label="Collected against billing" value={x.collectionRate == null ? '—' : x.collectionRate + '%'} sub={`${omr(x.collectedAgainstBilling)} of ${omr(x.billedInclVat)}`} tone={x.collectionRate >= 90 ? 'good' : 'warn'} />
      <Kpi label="Cash received" value={omr(x.cashReceived)} sub="Verified receipts in period" />
      <Kpi label="Maintenance" value={omr(x.maintenance)} />
      <Kpi label="Net operating income" value={omr(x.noi)} sub="Rent billed − maintenance" tone={Number(x.noi) >= 0 ? 'good' : 'bad'} />
      <Kpi label="Vacancy loss" value={omr(x.vacancyLoss)} sub="Listed rent of empty units" tone={Number(x.vacancyLoss) ? 'warn' : 'good'} />
    </div>
    <div className="sec">Budget vs actual — {label}</div>
    <div className="card tw"><table><thead><tr><th>Measure</th><th className="n">Budget</th><th className="n">Actual</th><th className="n">Variance</th><th>Result</th></tr></thead>
      <tbody>{[['Rental income (excl. VAT)', bv.rentalIncome], ['Collections (cash received)', bv.collections], ['Maintenance cost', bv.maintenance], ['Net operating income', bv.noi]].map(([l, v]: any) =>
        <tr key={l}><td>{l}</td><td className="n">{num3(v.budget)}</td><td className="n">{num3(v.actual)}</td><td className="n"><Var x={v} /></td><td>{v.favourable === null ? '' : v.favourable ? <span className="pill p-green">Favourable</span> : <span className="pill p-red">Adverse</span>}</td></tr>)}</tbody></table>
      <div className="small muted" style={{ marginTop: 8 }}>{noBudget ? <>No budget found for this period — import one under <Link href="/imports">Data import</Link>. </> : null}Budgets are monthly by building, pro-rated by days and counted only up to today. For maintenance, below budget is favourable.</div></div>
    <div className="sec">Building performance — {label}</div>
    <div className="card tw"><table><thead><tr><th>Building</th><th className="n">Occupancy</th><th className="n">Rent budget</th><th className="n">Rent actual</th><th className="n">Variance</th><th className="n">Collection %</th><th className="n">Cash</th><th className="n">Maint. budget</th><th className="n">Maint. actual</th><th className="n">NOI</th><th className="n">Vacancy loss</th></tr></thead>
      <tbody>{d.buildings.map((b: any) => <tr key={b.id}><td style={{ minWidth: 170 }}><b>{b.name}</b><div className="small muted">{b.type}{b.location ? ' · ' + b.location : ''}</div></td><td className="n">{b.occupied}/{b.units} ({b.occupancy}%)</td>
        <td className="n">{num3(b.budgetVsActual.rentalIncome.budget)}</td><td className="n">{num3(b.rentBilled)}</td><td className="n"><Var x={b.budgetVsActual.rentalIncome} /></td><td className="n">{b.collectionRate == null ? '—' : b.collectionRate + '%'}</td><td className="n">{num3(b.cashReceived)}</td>
        <td className="n">{num3(b.budgetVsActual.maintenance.budget)}</td><td className="n">{num3(b.maintenance)}</td><td className="n">{num3(b.noi)}</td><td className="n">{num3(b.vacancyLoss)}</td></tr>)}
        {d.buildings.length > 1 && <tr className="tot"><td>Total</td><td className="n">{x.occupied}/{x.units} ({x.occupancy}%)</td><td className="n">{num3(bv.rentalIncome.budget)}</td><td className="n">{num3(x.rentBilled)}</td><td className="n"><Var x={bv.rentalIncome} /></td><td className="n">{x.collectionRate == null ? '—' : x.collectionRate + '%'}</td><td className="n">{num3(x.cashReceived)}</td><td className="n">{num3(bv.maintenance.budget)}</td><td className="n">{num3(x.maintenance)}</td><td className="n">{num3(x.noi)}</td><td className="n">{num3(x.vacancyLoss)}</td></tr>}</tbody></table></div>
    <div className="sec">Outstanding rent by age (today)</div>
    <div className="card tw"><table><thead><tr><th>Age</th><th className="n">Amount (OMR)</th><th className="n">Share</th></tr></thead>
      <tbody>{[['Not yet overdue', td.aging.notDue], ['1–30 days overdue', td.aging.d0_30], ['31–60 days overdue', td.aging.d31_60], ['61–90 days overdue', td.aging.d61_90], ['Over 90 days overdue', td.aging.d90plus]].map(([l, v]) =>
        <tr key={l}><td>{l}</td><td className="n">{num3(v)}</td><td className="n">{Number(td.outstanding) ? Math.round((Number(v) / Number(td.outstanding)) * 1000) / 10 + '%' : '—'}</td></tr>)}
        <tr className="tot"><td>Total outstanding</td><td className="n">{num3(td.outstanding)}</td><td className="n">{td.tenantsInArrears} tenant(s) in arrears</td></tr></tbody></table>
      <div className="small muted" style={{ marginTop: 8 }}><Link href="/recovery">Rent recovery →</Link></div></div>
    <div className="sec">Risks and actions (today)</div>
    <div className="grid k4">
      <Kpi label="Monthly rent roll" value={omr(td.monthlyRentRoll)} sub="Active contracts, incl. VAT" />
      <Kpi label="Security deposits held" value={omr(td.depositsHeld)} sub="Liability to tenants" />
      <Kpi label="Overdue over 60 days" value={omr(td.aging.over60)} tone={Number(td.aging.over60) ? 'bad' : 'good'} />
      <Kpi label="Contracts expiring ≤ 90 days" value={td.expiringWithin90Days} tone={td.expiringWithin90Days ? 'warn' : undefined} sub={<Link href="/contracts">Contracts →</Link>} />
      <Kpi label="Not registered with municipality" value={td.notRegistered} tone={td.notRegistered ? 'warn' : 'good'} />
      <Kpi label="Cheques due ≤ 30 days" value={omr(td.cheques.dueWithin30DaysAmount)} sub={`${td.cheques.dueWithin30Days} cheque(s)`} />
      <Kpi label="Bounced cheques" value={td.cheques.bounced} sub={omr(td.cheques.bouncedAmount)} tone={td.cheques.bounced ? 'bad' : undefined} />
      <Kpi label="Payments awaiting verification" value={td.paymentsAwaitingVerification.count} sub={omr(td.paymentsAwaitingVerification.amount)} tone={td.paymentsAwaitingVerification.count ? 'warn' : undefined} />
      <Kpi label="Open complaints" value={td.openComplaints} sub={`${td.overdueComplaints} overdue · ${td.costsAwaitingApproval} cost(s) to approve`} tone={td.overdueComplaints ? 'warn' : undefined} />
      <Kpi label="Tenants leaving (open notices)" value={td.openNotices} sub={<Link href="/notices">Notices →</Link>} />
    </div>
  </>;
}

function Charts({ d, label }: { d: any; label: string }) {
  const td = d.today; const L = d.monthly.map((m: any) => mShort(m.month));
  return <>
    <div className="sec" style={{ marginTop: 0 }}>Charts — {label}</div>
    <div className="grid c2">
      <div className="card"><h3>Rental income: actual vs budget</h3><BarChart labels={L} series={[{ name: 'Actual rent (excl. VAT)', values: d.monthly.map((m: any) => Number(m.rent)) }]} line={{ name: 'Budget', values: d.monthly.map((m: any) => Number(m.budgetRent)) }} /></div>
      <div className="card"><h3>Collections: cash received vs budget</h3><BarChart labels={L} series={[{ name: 'Cash received', values: d.monthly.map((m: any) => Number(m.cash)), color: '#2a9d8f' }]} line={{ name: 'Collection budget', values: d.monthly.map((m: any) => Number(m.budgetCollection)) }} /></div>
      <div className="card"><h3>Billed vs collected against billing</h3><BarChart labels={L} series={[{ name: 'Billed incl. VAT', values: d.monthly.map((m: any) => Number(m.billed)) }, { name: 'Collected', values: d.monthly.map((m: any) => Number(m.collected)), color: '#2a9d8f' }]} /></div>
      <div className="card"><h3>Maintenance: actual vs budget</h3><BarChart labels={L} series={[{ name: 'Maintenance', values: d.monthly.map((m: any) => Number(m.maintenance)), color: '#e76f51' }]} line={{ name: 'Budget', values: d.monthly.map((m: any) => Number(m.budgetMaintenance)) }} /></div>
      <div className="card"><h3>Outstanding rent by age (today)</h3><HBars unit="OMR " items={[['Not yet overdue', td.aging.notDue, '#94a3b8'], ['1–30 days', td.aging.d0_30, '#2a9d8f'], ['31–60 days', td.aging.d31_60, '#e9b949'], ['61–90 days', td.aging.d61_90, '#e76f51'], ['Over 90 days', td.aging.d90plus, '#c0392b']].map(([l, v, c]) => ({ label: l, value: Number(v), color: c }))} />
        <div className="small muted">Total {omr(td.outstanding)} · {td.tenantsInArrears} tenant(s) in arrears · <Link href="/recovery">Rent recovery →</Link></div></div>
      <div className="card"><h3>Occupancy by building at {fmtDate(d.period.asAt)}</h3><HBars items={d.buildings.map((b: any) => ({ label: `${b.name} (${b.occupied}/${b.units})`, value: b.occupancy, color: b.occupancy >= 90 ? '#2a9d8f' : b.occupancy >= 60 ? '#e9b949' : '#e76f51' }))} suffix="%" max={100} share={false} /><div className="small muted">% of units occupied.</div></div>
    </div>
    <div className="small muted" style={{ marginTop: 8 }}>The budget line for the current month counts days up to today only, so it drops in the last bar.</div>
  </>;
}
