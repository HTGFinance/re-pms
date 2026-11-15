'use client';
import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { Header } from '@/components/Shell';
import { Err, Field, useLoad } from '@/components/ui';
import InviteCard from '@/components/InviteCard';
import { api, omr } from '@/lib/api';
import { ID_TYPES } from '../page';

const DOCS: [string, string, boolean][] = [['passport', 'Passport copy', false], ['civil-id', 'Civil ID / resident card copy', false], ['contract', 'Signed contract', false], ['other', 'Other documents', true]];
const plus1y = (d: string) => { if (!d) return ''; const x = new Date(d + 'T00:00:00Z'); x.setUTCFullYear(x.getUTCFullYear() + 1); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };

/** One form at contract signing: tenant profile, photo, documents, property, contract terms and the tenant app invitation. */
export default function NewTenancy() {
  const B = useLoad(() => api<any[]>('/buildings'));
  const U = useLoad(() => api<any[]>('/units?status=Vacant'));
  const O = useLoad(() => api<any>('/tenancies/options'));
  const [t, setT] = useState<any>({ name: '', mobile: '', email: '', nationality: '', idType: ID_TYPES[0], idNumber: '', idExpiry: '', passportNo: '', passportExpiry: '' });
  const [c, setC] = useState<any>({ buildingId: '', unitId: '', startDate: '', expiryDate: '', monthlyRent: '', securityDeposit: '', paymentFrequency: 'Monthly', paymentMode: 'Bank transfer', rentDueDay: 5, noticeMonths: '', notes: '' });
  const [photo, setPhoto] = useState<File | null>(null); const [docs, setDocs] = useState<Record<string, File[]>>({});
  const [invite, setInvite] = useState(true);
  const [busy, setBusy] = useState(''); const [err, setErr] = useState(''); const [done, setDone] = useState<any>(null);
  const st = (k: string) => (e: any) => setT({ ...t, [k]: e.target.value });
  const sc = (k: string) => (e: any) => setC({ ...c, [k]: e.target.value });
  const units = useMemo(() => (U.data || []).filter((u) => !c.buildingId || u.buildingId === c.buildingId), [U.data, c.buildingId]);
  const unit = U.data?.find((u) => u.id === c.unitId);
  const pickUnit = (e: any) => { const u = U.data?.find((x) => x.id === e.target.value);
    setC({ ...c, unitId: e.target.value, buildingId: u?.buildingId || c.buildingId, monthlyRent: u?.listedRent && Number(u.listedRent) ? u.listedRent : c.monthlyRent, securityDeposit: u?.listedRent && Number(u.listedRent) ? u.listedRent : c.securityDeposit, noticeMonths: u ? (u.vatApplicable ? 3 : 1) : c.noticeMonths }); };
  const pickStart = (e: any) => setC({ ...c, startDate: e.target.value, expiryDate: !c.expiryDate || c.expiryDate === plus1y(c.startDate) ? plus1y(e.target.value) : c.expiryDate });

  const save = async (e: FormEvent) => {
    e.preventDefault(); setErr('');
    if (!t.mobile && !t.email) { setErr('Enter a mobile number or an email so the tenant can receive the app link'); return; }
    try {
      setBusy('Saving tenant and contract…');
      const tenant: any = { name: t.name.trim(), mobile: t.mobile, email: t.email, nationality: t.nationality, idType: t.idType, idNumber: t.idNumber, passportNo: t.passportNo };
      if (t.idExpiry) tenant.idExpiry = t.idExpiry; if (t.passportExpiry) tenant.passportExpiry = t.passportExpiry;
      const contract: any = { unitId: c.unitId, startDate: c.startDate, monthlyRent: String(c.monthlyRent), paymentFrequency: c.paymentFrequency, paymentMode: c.paymentMode, rentDueDay: Number(c.rentDueDay) };
      if (c.expiryDate) contract.expiryDate = c.expiryDate; if (c.securityDeposit !== '') contract.securityDeposit = String(c.securityDeposit);
      if (c.noticeMonths !== '') contract.noticeMonths = Number(c.noticeMonths); if (c.notes) contract.notes = c.notes;
      const r = await api('/tenancies', { body: { tenant, contract } });
      const id = r.tenant.id; const upErr: string[] = [];
      const up = async (kind: string, files: File[]) => { if (!files.length) return; const f = new FormData(); files.forEach((x) => f.append('files', x)); try { await api(`/tenants/${id}/files?kind=${kind}`, { form: f }); } catch (x: any) { upErr.push(x.message); } };
      setBusy('Uploading photo and documents…');
      if (photo) await up('photo', [photo]);
      for (const [k] of DOCS) await up(k, docs[k] || []);
      let inv = null;
      if (invite) { setBusy('Creating the app invitation…'); inv = await api(`/tenants/${id}/invite`, { body: {} }); }
      setDone({ ...r, inv, upErr }); window.scrollTo(0, 0);
    } catch (x: any) { setErr(x.message); } finally { setBusy(''); }
  };

  if (done) return <>
    <Header title="Tenancy created" sub={`${done.tenant.tenantNo} · ${done.contract.contractNo}`} right={<div className="row"><Link className="btn" href={`/tenants/${done.tenant.id}`} style={{ textDecoration: 'none' }}>Open tenant</Link><button className="primary" onClick={() => window.location.reload()}>+ Another tenancy</button></div>} />
    <div id="view">
      <div className="ok-msg"><b>{done.tenant.name}</b> is registered with contract <b>{done.contract.contractNo}</b>. The first rent invoice has been raised and appears in Rent recovery and on the dashboards.</div>
      {done.upErr.length > 0 && <Err msg={'Some files were not saved: ' + done.upErr.join('; ') + ' — add them from the tenant page.'} />}
      {done.inv ? <div className="card"><h3>Tenant app invitation</h3><InviteCard inv={done.inv} /></div>
        : <div className="card"><h3>Tenant app</h3><div className="small muted">No invitation sent. Send it any time from the tenant page.</div></div>}
    </div>
  </>;

  return <>
    <Header title="New tenancy" sub="Register the tenant and contract after signing, then invite them to the app" right={<Link className="btn" href="/tenants" style={{ textDecoration: 'none' }}>Cancel</Link>} />
    <form id="view" onSubmit={save}>
      <Err msg={err || B.error || U.error} />
      <div className="steps-form">
        <section className="card"><h3><span className="stepno">1</span> Tenant</h3><div className="form">
          <Field label="Full name / company *" full><input value={t.name} onChange={st('name')} required autoComplete="off" /></Field>
          <Field label="Mobile *"><input value={t.mobile} onChange={st('mobile')} placeholder="9xxx xxxx" inputMode="tel" /></Field>
          <Field label="Email (used to sign in)"><input type="email" value={t.email} onChange={st('email')} placeholder="name@example.com" /></Field>
          <Field label="Nationality"><input value={t.nationality} onChange={st('nationality')} /></Field>
          <Field label="ID type"><select value={t.idType} onChange={st('idType')}>{ID_TYPES.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="ID / CR number"><input value={t.idNumber} onChange={st('idNumber')} /></Field>
          <Field label="ID expiry"><input type="date" value={t.idExpiry} onChange={st('idExpiry')} /></Field>
          <Field label="Passport number"><input value={t.passportNo} onChange={st('passportNo')} /></Field>
          <Field label="Passport expiry"><input type="date" value={t.passportExpiry} onChange={st('passportExpiry')} /></Field>
        </div></section>

        <section className="card"><h3><span className="stepno">2</span> Photo and documents</h3>
          <div className="docgrid">
            <label className="docpick photo">{photo ? <img src={URL.createObjectURL(photo)} alt="Tenant photo" /> : <span className="ph">📷</span>}
              <span><b>Tenant photo</b><span className="small muted">{photo ? photo.name : 'Take or choose a photo'}</span></span>
              <input type="file" accept="image/*" capture="user" onChange={(e) => setPhoto(e.target.files?.[0] || null)} /></label>
            {DOCS.map(([k, label, multi]) => <label key={k} className="docpick"><span className="ph">📄</span>
              <span><b>{label}</b><span className="small muted">{docs[k]?.length ? docs[k].map((f) => f.name).join(', ') : 'PDF or photo, up to 10 MB'}</span></span>
              <input type="file" accept="image/*,application/pdf" multiple={multi} onChange={(e) => setDocs({ ...docs, [k]: Array.from(e.target.files || []) })} /></label>)}
          </div></section>

        <section className="card"><h3><span className="stepno">3</span> Property and unit</h3><div className="form">
          <Field label="Property"><select value={c.buildingId} onChange={(e) => setC({ ...c, buildingId: e.target.value, unitId: '' })}><option value="">All properties</option>{B.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Flat / unit (vacant) *"><select value={c.unitId} onChange={pickUnit} required><option value="">— Select —</option>{units.map((u) => <option key={u.id} value={u.id}>{c.buildingId ? '' : u.buildingName + ' — '}{u.unitNo} · {u.unitType || 'Unit'} · list {u.listedRent}{u.vatApplicable ? ' + VAT' : ''}</option>)}</select></Field>
          {unit && <div className="full small muted">{unit.buildingName}, unit {unit.unitNo}{unit.areaSqm ? ` · ${unit.areaSqm} m²` : ''} · listed rent {omr(unit.listedRent)}{unit.vatApplicable ? ' · commercial: 5% VAT applies' : ''}</div>}
          {U.data && !units.length && <div className="full note">No vacant units{c.buildingId ? ' in this property' : ''}.</div>}
        </div></section>

        <section className="card"><h3><span className="stepno">4</span> Contract and rent</h3><div className="form">
          <Field label="Start date *"><input type="date" value={c.startDate} onChange={pickStart} required /></Field>
          <Field label="Expiry date"><input type="date" value={c.expiryDate} onChange={sc('expiryDate')} /></Field>
          <Field label="Monthly rent (OMR) *"><input type="number" step="0.001" min="0.001" value={c.monthlyRent} onChange={sc('monthlyRent')} required inputMode="decimal" /></Field>
          <Field label="Security deposit (OMR)"><input type="number" step="0.001" min="0" value={c.securityDeposit} onChange={sc('securityDeposit')} inputMode="decimal" /></Field>
          <Field label="Payment period"><select value={c.paymentFrequency} onChange={sc('paymentFrequency')}>{['Monthly', 'Quarterly', 'Half-yearly', 'Yearly'].map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Payment mode"><select value={c.paymentMode} onChange={sc('paymentMode')}>{(O.data?.paymentModes || ['Bank transfer', 'Cheque (PDC)', 'Cash', 'Online gateway']).map((x: string) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Rent due day of month"><input type="number" min={1} max={28} value={c.rentDueDay} onChange={sc('rentDueDay')} /></Field>
          <Field label="Notice period (months)"><input type="number" min={0} max={12} value={c.noticeMonths} onChange={sc('noticeMonths')} /></Field>
          <Field label="Notes" full><textarea value={c.notes} onChange={sc('notes')} placeholder="Special terms, parking, furniture…" /></Field>
          {c.paymentMode === 'Cheque (PDC)' && <div className="full info">After saving, record the post-dated cheques from the tenant page (Receive cheques).</div>}
        </div></section>

        <section className="card"><h3><span className="stepno">5</span> Tenant app</h3>
          <label className="checkline"><input type="checkbox" checked={invite} onChange={(e) => setInvite(e.target.checked)} />
            <span><b>Invite the tenant to the app now</b><span className="small muted">You get a QR code to scan in the office, plus WhatsApp and SMS buttons. {O.data?.emailConfigured ? 'The link is also emailed automatically.' : 'Email sending is not set up on the server yet.'} The link works once, for {O.data?.inviteDays || 7} days.</span></span></label>
        </section>
      </div>
      <div className="formbar"><span className="small muted">{busy}</span><button className="primary" disabled={!!busy}>{busy ? 'Saving…' : 'Create tenancy'}</button></div>
    </form>
  </>;
}
