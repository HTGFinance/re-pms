'use client';
import { useRef, useState } from 'react';
import { Header, useMe } from '@/components/Shell';
import { Err } from '@/components/ui';
import { api, can } from '@/lib/api';

const TYPES = {
  units: { title: 'Buildings & units', who: ['PROPERTY_MANAGER'], desc: 'Adds or updates buildings and units. Import this first when adding new buildings.', cols: ['Building*', 'Building Code', 'Building Type', 'Location', 'Unit No*', 'Unit Type', 'Listed Rent', 'VAT Applicable (Y/N)'] },
  tenants: { title: 'Tenant master', who: ['PROPERTY_MANAGER'], desc: 'Creates tenants and their contracts. Put rent owed before go-live in Opening Balance (negative = advance).', cols: ['Tenant Name*', 'Mobile', 'Email', 'ID Type', 'ID Number', 'Nationality', 'Building*', 'Unit No*', 'Unit Type', 'Contract Start*', 'Contract Expiry', 'Monthly Rent*', 'Security Deposit', 'Payment Frequency', 'Rent Due Day', 'Notice Period (Months)', 'VAT Applicable (Y/N)', 'Opening Balance'] },
  budget: { title: 'Budget', who: ['FINANCE'], desc: 'Monthly budget by building. A row replaces the budget for that building and month.', cols: ['Year*', 'Month*', 'Building*', 'Rental Income Budget', 'Collection Budget', 'Maintenance Budget'] },
  payments: { title: 'Payments / receipts', who: ['FINANCE'], desc: 'Verified receipts from the bank statement or cash book.', cols: ['Tenant No or Name*', 'Payment Date*', 'Amount*', 'Method', 'Reference*'] },
} as const;
type T = keyof typeof TYPES;
const nk = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

export default function Imports() {
  const me = useMe();
  const allowed = (Object.keys(TYPES) as T[]).filter((k) => can(me, ...(TYPES[k].who as any)));
  const [type, setType] = useState<T>(allowed[0] || 'units'); const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<any>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const send = async (f: File, commit: boolean) => {
    setBusy(true); setErr(''); const form = new FormData(); form.append('file', f);
    try { const r = await api(`/imports/${type}?commit=${commit}`, { form }); if (commit) { setDone(`Imported ${r.valid} row(s) into ${TYPES[type].title}${r.errors ? ` · ${r.errors} row(s) skipped with errors` : ''}.`); setRes(null); setFile(null); if (input.current) input.current.value = ''; } else setRes(r); }
    catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  const def = TYPES[type];
  return <>
    <Header title="Data import" sub="Upload Excel or CSV files — every row is checked before anything is saved" />
    <div id="view">
      <div className="grid k4">{allowed.map((k) => <div key={k} className="card" style={{ cursor: 'pointer', ...(k === type ? { borderColor: 'var(--teal)', boxShadow: '0 0 0 2px #2a9d8f33' } : {}) }} onClick={() => { setType(k); setRes(null); setDone(''); setErr(''); }}>
        <div style={{ fontWeight: 700, color: 'var(--navy)' }}>{TYPES[k].title}</div><div className="small muted" style={{ marginTop: 4 }}>{TYPES[k].desc}</div></div>)}</div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3>Upload {def.title} <a className="btn sm" style={{ textDecoration: 'none' }} href={`/api/imports/templates/${type}`}>Download template</a></h3>
        <div className="small muted" style={{ marginBottom: 8 }}>Row 1 must hold these headings (* = required, any order). Dates may be dd/mm/yyyy or Excel dates. Amounts in OMR.</div>
        <div style={{ marginBottom: 10 }}>{def.cols.map((c) => <span key={c} className="tag">{c}</span>)}</div>
        <input ref={input} type="file" accept=".xlsx,.csv" style={{ maxWidth: 420 }} onChange={(e) => { const f = e.target.files?.[0] || null; setFile(f); setDone(''); setRes(null); if (f) send(f, false); }} />
        {busy && <span className="muted small" style={{ marginLeft: 10 }}>Checking…</span>}
        <div style={{ marginTop: 10 }}><Err msg={err} />{done && <div className="ok-msg">{done}</div>}</div>
      </div>
      {res && <div className="card tw" style={{ marginTop: 14 }}>
        <h3>Preview — sheet “{res.sheet}” <span><span className="pill p-green">{res.valid} ready</span> <span className="pill p-red">{res.errors} with errors</span></span></h3>
        <table><thead><tr><th>Row</th><th>Check</th><th>Result</th>{def.cols.map((c) => <th key={c}>{c.replace('*', '')}</th>)}</tr></thead>
          <tbody>{res.rows.slice(0, 300).map((r: any) => <tr key={r.line}><td>{r.line}</td><td>{r.ok ? <span className="pill p-green">OK</span> : <span className="pill p-red">Error</span>}</td>
            <td className="small" style={{ minWidth: 220, color: r.ok ? undefined : 'var(--red)' }}>{r.message}</td>
            {def.cols.map((c) => { const v = r.raw[nk(c.replace('*', ''))]; return <td key={c}>{v == null ? '' : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? v.slice(0, 10) : String(v)}</td>; })}</tr>)}</tbody></table>
        {res.rows.length > 300 && <div className="small muted">Showing the first 300 of {res.rows.length} rows.</div>}
        <div className="row" style={{ marginTop: 12 }}><button onClick={() => setRes(null)}>Cancel</button>
          <button className="primary right" disabled={!res.valid || busy || !file} onClick={() => file && send(file, true)}>Import {res.valid} valid row(s)</button></div>
      </div>}
    </div>
  </>;
}
