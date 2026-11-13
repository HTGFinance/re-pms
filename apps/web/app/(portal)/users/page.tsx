'use client';
import { FormEvent, useState } from 'react';
import { Header } from '@/components/Shell';
import { Err, Field, Modal, Pill, useLoad } from '@/components/ui';
import { api, fmtDate, Role, ROLE_LABEL } from '@/lib/api';

const STAFF_ROLES = (Object.keys(ROLE_LABEL) as Role[]).filter((r) => r !== 'TENANT');
const SCOPED = ['PROPERTY_MANAGER', 'RECOVERY', 'MAINTENANCE_SUPERVISOR', 'TECHNICIAN'];

export default function Users() {
  const U = useLoad(() => api<any[]>('/users')); const B = useLoad(() => api<any[]>('/buildings'));
  const [form, setForm] = useState<any | null>(null);
  return <>
    <Header title="Users & roles" sub="Staff logins, roles and the buildings each person can see" right={<button className="primary" onClick={() => setForm({})}>+ User</button>} />
    <div id="view"><Err msg={U.error} />
      <div className="card tw"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Buildings</th><th>Last sign-in</th><th>Status</th><th></th></tr></thead>
        <tbody>{U.data?.map((u) => <tr key={u.id}><td><b>{u.name}</b></td><td>{u.email}</td><td>{ROLE_LABEL[u.role as Role]}</td>
          <td className="small">{SCOPED.includes(u.role) ? (u.buildings.length ? u.buildings.map((b: any) => b.name).join(', ') : 'All buildings') : 'All buildings'}</td>
          <td>{u.lastLoginAt ? fmtDate(u.lastLoginAt) : '—'}</td><td><Pill s={u.isActive ? 'Active' : 'Inactive'} /></td><td><button className="sm" onClick={() => setForm(u)}>Edit</button></td></tr>)}</tbody></table></div>
      <div className="small muted" style={{ marginTop: 10 }}>Administrator, Finance and Executive always see all buildings. Other roles see only the buildings ticked; none ticked = all. Tenant logins are created in phase 3.</div>
    </div>
    {form && <UserForm u={form} buildings={B.data || []} onClose={() => setForm(null)} onSaved={() => { setForm(null); U.reload(); }} />}
  </>;
}

function UserForm({ u, buildings, onClose, onSaved }: { u: any; buildings: any[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: u.name || '', email: u.email || '', role: u.role || 'PROPERTY_MANAGER', password: '', isActive: u.isActive ?? true, buildingIds: (u.buildings || []).map((b: any) => b.id) as string[] });
  const [err, setErr] = useState('');
  const toggle = (id: string) => setF({ ...f, buildingIds: f.buildingIds.includes(id) ? f.buildingIds.filter((x) => x !== id) : [...f.buildingIds, id] });
  const save = async (e: FormEvent) => { e.preventDefault(); setErr('');
    const body: any = u.id ? { name: f.name, role: f.role, isActive: f.isActive, buildingIds: f.buildingIds } : { name: f.name, email: f.email, role: f.role, password: f.password, buildingIds: f.buildingIds };
    if (u.id && f.password) body.password = f.password;
    try { await api(u.id ? `/users/${u.id}` : '/users', { method: u.id ? 'PATCH' : 'POST', body }); onSaved(); } catch (x: any) { setErr(x.message); } };
  return <Modal title={u.id ? `Edit ${u.name}` : 'New user'} onClose={onClose}><Err msg={err} /><form className="form" onSubmit={save}>
    <Field label="Full name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
    <Field label="Email (login)"><input type="email" value={f.email} disabled={!!u.id} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
    <Field label="Role"><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
    <Field label={u.id ? 'New password (leave blank to keep)' : 'Password (min. 10 characters)'}><input type="password" minLength={10} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required={!u.id} /></Field>
    {u.id && <Field label="Status"><select value={f.isActive ? 'Active' : 'Inactive'} onChange={(e) => setF({ ...f, isActive: e.target.value === 'Active' })}><option>Active</option><option>Inactive</option></select></Field>}
    {SCOPED.includes(f.role) && <Field label="Buildings this user can see (none = all)" full><div>{buildings.map((b) => <label key={b.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginRight: 14, color: 'var(--text)', fontSize: 13 }}><input type="checkbox" style={{ width: 'auto' }} checked={f.buildingIds.includes(b.id)} onChange={() => toggle(b.id)} />{b.name}</label>)}</div></Field>}
    <div className="full row"><button type="button" onClick={onClose}>Cancel</button><button className="primary right">Save</button></div></form></Modal>;
}
