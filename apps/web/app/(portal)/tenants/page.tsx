'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Header, useMe } from '@/components/Shell';
import { Err, Field, Modal, Pill, useLoad } from '@/components/ui';
import { api, can, fmtDate } from '@/lib/api';

export const ID_TYPES = ['Civil ID / Resident Card', 'Passport', 'Commercial Registration'];

export default function Tenants() {
  const me = useMe(); const router = useRouter();
  const [q, setQ] = useState(''); const [query, setQuery] = useState(''); const [adding, setAdding] = useState(false);
  const T = useLoad(() => api<any[]>('/tenants' + (query ? '?q=' + encodeURIComponent(query) : '')), [query]);
  return <>
    <Header title="Tenants" sub="Tenant master and current contracts" right={can(me, 'PROPERTY_MANAGER') && <div className="row"><button onClick={() => setAdding(true)}>+ Tenant only</button><Link className="btn primary" href="/tenants/new" style={{ textDecoration: 'none' }}>+ New tenancy</Link></div>} />
    <div id="view">
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
        <input placeholder="Search name, tenant no., mobile or ID" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 300 }} /><button>Search</button>
        {query && <button type="button" onClick={() => { setQ(''); setQuery(''); }}>Clear</button>}
      </form>
      <Err msg={T.error} />
      <div className="card tw"><table><thead><tr><th>Tenant no.</th><th>Name</th><th>Mobile</th><th>ID</th><th>Current unit</th><th>Contract expiry</th><th>Status</th></tr></thead>
        <tbody>{T.data?.map((t) => <tr key={t.id} className="clickable" onClick={() => router.push(`/tenants/${t.id}`)}>
          <td>{t.tenantNo}</td><td><Link href={`/tenants/${t.id}`}><b>{t.name}</b></Link></td><td>{t.mobile}</td><td>{t.idNumber}<div className="small muted">{t.idType}</div></td>
          <td>{t.current ? `${t.current.buildingName} ${t.current.unitNo}` : '—'}</td><td>{t.current ? fmtDate(t.current.expiryDate) : '—'}</td><td><Pill s={t.status} /></td></tr>)}</tbody></table>
        {T.data && !T.data.length && <div className="empty">No tenants found.</div>}</div>
    </div>
    {adding && <TenantForm onClose={() => setAdding(false)} onSaved={(t) => router.push(`/tenants/${t.id}`)} />}
  </>;
}

export function TenantForm({ t, onClose, onSaved }: { t?: any; onClose: () => void; onSaved: (t: any) => void }) {
  const [f, setF] = useState<any>({ name: t?.name || '', mobile: t?.mobile || '', email: t?.email || '', idType: t?.idType || ID_TYPES[0], idNumber: t?.idNumber || '', nationality: t?.nationality || '', status: t?.status || 'Active', idExpiry: t?.idExpiry || '', passportNo: t?.passportNo || '', passportExpiry: t?.passportExpiry || '' });
  const [err, setErr] = useState(''); const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const save = async (e: FormEvent) => { e.preventDefault(); setErr('');
    const body = { ...f, idExpiry: f.idExpiry || null, passportExpiry: f.passportExpiry || null };
    try { onSaved(await api(t ? `/tenants/${t.id}` : '/tenants', { method: t ? 'PATCH' : 'POST', body })); } catch (x: any) { setErr(x.message); } };
  return <Modal title={t ? `Edit ${t.name}` : 'New tenant'} onClose={onClose}><Err msg={err} /><form className="form" onSubmit={save}>
    <Field label="Full name / company" full><input value={f.name} onChange={set('name')} required /></Field>
    <Field label="Mobile"><input value={f.mobile} onChange={set('mobile')} placeholder="+968 9xxxxxxx" /></Field>
    <Field label="Email"><input type="email" value={f.email} onChange={set('email')} /></Field>
    <Field label="ID type"><select value={f.idType} onChange={set('idType')}>{ID_TYPES.map((x) => <option key={x}>{x}</option>)}</select></Field>
    <Field label="ID / CR number"><input value={f.idNumber} onChange={set('idNumber')} /></Field>
    <Field label="Nationality"><input value={f.nationality} onChange={set('nationality')} /></Field>
    <Field label="ID expiry"><input type="date" value={f.idExpiry} onChange={set('idExpiry')} /></Field>
    <Field label="Passport number"><input value={f.passportNo} onChange={set('passportNo')} /></Field>
    <Field label="Passport expiry"><input type="date" value={f.passportExpiry} onChange={set('passportExpiry')} /></Field>
    {t && <Field label="Status"><select value={f.status} onChange={set('status')}>{['Active', 'Inactive', 'Vacated', 'Blacklisted'].map((x) => <option key={x}>{x}</option>)}</select></Field>}
    <div className="full row"><button type="button" onClick={onClose}>Cancel</button><button className="primary right">Save</button></div></form></Modal>;
}
