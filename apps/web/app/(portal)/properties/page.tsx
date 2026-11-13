'use client';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { Header, useMe } from '@/components/Shell';
import { Err, Field, Modal, Pill, useLoad } from '@/components/ui';
import { api, can, fmtDate, mapUrl, num3 } from '@/lib/api';

const TYPES = ['Residential', 'Commercial', 'Mixed use', 'Warehouse', 'Other'];

export default function Properties() {
  const me = useMe(); const edit = can(me, 'PROPERTY_MANAGER');
  const [bid, setBid] = useState(''); const [status, setStatus] = useState('');
  const [bForm, setBForm] = useState<any | null>(null); const [uForm, setUForm] = useState<any | null>(null);
  const B = useLoad(() => api<any[]>('/buildings'));
  const U = useLoad(() => api<any[]>(`/units?${bid ? 'buildingId=' + bid : ''}${status ? '&status=' + status : ''}`), [bid, status]);
  const reload = () => { B.reload(); U.reload(); };
  return <>
    <Header title="Buildings & units" sub="Portfolio, occupancy and locations" right={edit && <div className="row"><button onClick={() => setBForm({ type: 'Residential' })}>+ Building</button><button className="primary" onClick={() => setUForm({ buildingId: bid || B.data?.[0]?.id, vatApplicable: false })}>+ Unit</button></div>} />
    <div id="view">
      <Err msg={B.error || U.error} />
      <div className="card tw"><table><thead><tr><th>Code</th><th>Building</th><th>Type</th><th>Address / location</th><th className="n">Units</th><th className="n">Occupied</th><th>Municipality</th><th></th></tr></thead>
        <tbody>{B.data?.map((b) => <tr key={b.id} className="clickable" onClick={() => setBid(b.id === bid ? '' : b.id)} style={b.id === bid ? { background: '#eef5fd' } : undefined}>
          <td><b>{b.code}</b></td><td><b>{b.name}</b></td><td>{b.type}</td><td>{b.addressCode || b.location}<div className="small muted">{b.addressCode ? b.location : ''}</div></td>
          <td className="n">{b.units}</td><td className="n">{b.occupied} ({b.units ? Math.round((b.occupied / b.units) * 100) : 0}%)</td><td>{b.municipality}</td>
          <td style={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>{mapUrl(b.lat, b.lng) && <a className="btn sm" style={{ textDecoration: 'none' }} href={mapUrl(b.lat, b.lng)} target="_blank" rel="noopener">📍 Navigate</a>} {edit && <button className="sm" onClick={() => setBForm(b)}>Edit</button>}</td></tr>)}</tbody></table>
        {B.data && !B.data.length && <div className="empty">No buildings yet. Add one, or import your units from Excel.</div>}</div>
      <div className="sec row">Units {bid && <span className="small muted" style={{ fontWeight: 400 }}>· {B.data?.find((b) => b.id === bid)?.name} <a style={{ cursor: 'pointer', color: 'var(--teal)' }} onClick={() => setBid('')}>show all</a></span>}
        <select className="right" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All units</option><option>Occupied</option><option>Vacant</option></select></div>
      <div className="card tw"><table><thead><tr><th>Building</th><th>Unit</th><th>Type</th><th className="n">Listed rent</th><th>VAT</th><th>Status</th><th>Tenant</th><th>Contract</th><th></th></tr></thead>
        <tbody>{U.data?.map((u) => <tr key={u.id}><td>{u.buildingName}</td><td><b>{u.unitNo}</b></td><td>{u.unitType}</td><td className="n">{num3(u.listedRent)}</td><td>{u.vatApplicable ? '5%' : 'Exempt'}</td><td><Pill s={u.status} /></td>
          <td>{u.tenant ? <Link href={`/tenants/${u.tenant.id}`}>{u.tenant.name}</Link> : '—'}</td><td>{u.contract ? `${u.contract.contractNo} · to ${fmtDate(u.contract.expiryDate)}` : "—"}</td>
          <td>{edit && <button className="sm" onClick={() => setUForm(u)}>Edit</button>}</td></tr>)}</tbody></table>
        {U.data && !U.data.length && <div className="empty">No units match.</div>}</div>
    </div>
    {bForm && <BuildingForm b={bForm} onClose={() => setBForm(null)} onSaved={() => { setBForm(null); reload(); }} />}
    {uForm && <UnitForm u={uForm} buildings={B.data || []} onClose={() => setUForm(null)} onSaved={() => { setUForm(null); reload(); }} />}
  </>;
}

function BuildingForm({ b, onClose, onSaved }: { b: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ code: b.code || '', name: b.name || '', type: b.type || 'Residential', location: b.location || '', addressCode: b.addressCode || '', lat: b.lat || '', lng: b.lng || '', municipality: b.municipality || '' });
  const [err, setErr] = useState(''); const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const save = async (e: FormEvent) => { e.preventDefault(); setErr('');
    const body: any = { ...f }; if (!body.lat) delete body.lat; if (!body.lng) delete body.lng;
    try { await api(b.id ? `/buildings/${b.id}` : '/buildings', { method: b.id ? 'PATCH' : 'POST', body }); onSaved(); } catch (x: any) { setErr(x.message); } };
  return <Modal title={b.id ? `Edit ${b.name}` : 'New building'} onClose={onClose}><Err msg={err} /><form className="form" onSubmit={save}>
    <Field label="Code"><input value={f.code} onChange={set('code')} required maxLength={20} placeholder="B5" /></Field>
    <Field label="Name"><input value={f.name} onChange={set('name')} required /></Field>
    <Field label="Type"><select value={f.type} onChange={set('type')}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
    <Field label="Area / city"><input value={f.location} onChange={set('location')} placeholder="Al Khuwair, Muscat" /></Field>
    <Field label="Address code (way / building / plot no.)"><input value={f.addressCode} onChange={set('addressCode')} /></Field>
    <Field label="Municipality"><input value={f.municipality} onChange={set('municipality')} placeholder="Muscat Municipality" /></Field>
    <Field label="Latitude"><input value={f.lat} onChange={set('lat')} placeholder="23.5961" /></Field>
    <Field label="Longitude"><input value={f.lng} onChange={set('lng')} placeholder="58.4280" /></Field>
    <div className="full row"><button type="button" onClick={onClose}>Cancel</button><button className="primary right">Save</button></div></form></Modal>;
}

function UnitForm({ u, buildings, onClose, onSaved }: { u: any; buildings: any[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ buildingId: u.buildingId || '', unitNo: u.unitNo || '', unitType: u.unitType || '', listedRent: u.listedRent || '', vatApplicable: !!u.vatApplicable });
  const [err, setErr] = useState(''); const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async (e: FormEvent) => { e.preventDefault(); setErr('');
    const body: any = { ...f }; if (!body.listedRent) delete body.listedRent; if (u.id) delete body.buildingId;
    try { await api(u.id ? `/units/${u.id}` : '/units', { method: u.id ? 'PATCH' : 'POST', body }); onSaved(); } catch (x: any) { setErr(x.message); } };
  return <Modal title={u.id ? `Edit unit ${u.unitNo}` : 'New unit'} onClose={onClose}><Err msg={err} /><form className="form" onSubmit={save}>
    <Field label="Building"><select value={f.buildingId} onChange={set('buildingId')} disabled={!!u.id} required>{buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
    <Field label="Unit no."><input value={f.unitNo} onChange={set('unitNo')} required /></Field>
    <Field label="Unit type"><input value={f.unitType} onChange={set('unitType')} placeholder="Flat 2BHK, Retail Shop, Office…" /></Field>
    <Field label="Listed rent (OMR / month)"><input type="number" step="0.001" min="0" value={f.listedRent} onChange={set('listedRent')} /></Field>
    <Field label="VAT"><label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text)', fontSize: 13 }}><input type="checkbox" style={{ width: 'auto' }} checked={f.vatApplicable} onChange={set('vatApplicable')} /> VAT 5% applies (commercial)</label></Field>
    <div className="full row"><button type="button" onClick={onClose}>Cancel</button><button className="primary right">Save</button></div></form></Modal>;
}
