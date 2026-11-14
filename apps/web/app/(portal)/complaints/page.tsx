'use client';
import Link from 'next/link';
import { FormEvent, useMemo, useRef, useState } from 'react';
import { Header, useMe } from '@/components/Shell';
import { Err, Field, Kpi, Modal, useLoad } from '@/components/ui';
import { api, can, fmtDate, mapUrl } from '@/lib/api';

const PRI: Record<string, string> = { Urgent: 'p-red', High: 'p-amber', Medium: 'p-blue', Low: 'p-gray' };
const ST: Record<string, string> = { New: 'p-blue', Reviewed: 'p-purple', 'Technician assigned': 'p-purple', 'Work in progress': 'p-amber', 'Awaiting materials / approval': 'p-amber', 'Tenant confirmation pending': 'p-green', Closed: 'p-gray', Cancelled: 'p-gray' };
const VIEWS: [string, string][] = [['open', 'Open'], ['overdue', 'Overdue'], ['Tenant confirmation pending', 'Awaiting tenant'], ['Closed', 'Closed'], ['all', 'All']];
const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Muscat' });

export default function Complaints() {
  const me = useMe(); const manager = can(me, 'MAINTENANCE_SUPERVISOR', 'PROPERTY_MANAGER');
  const [view, setView] = useState('open'); const [bid, setBid] = useState(''); const [open, setOpen] = useState<string | null>(null); const [adding, setAdding] = useState(false); const [cats, setCats] = useState(false);
  const qs = new URLSearchParams(); if (view === 'open') qs.set('open', 'true'); else if (view === 'overdue') qs.set('overdue', 'true'); else if (view !== 'all') qs.set('status', view); if (bid) qs.set('buildingId', bid);
  const L = useLoad(() => api<any[]>('/complaints?' + qs.toString()), [view, bid]); const S = useLoad(() => api('/complaints/summary')); const B = useLoad(() => api<any[]>('/buildings').catch(() => []));
  const reload = () => { L.reload(); S.reload(); }; const s = S.data;
  return <>
    <Header title={me?.role === 'TECHNICIAN' ? 'My jobs' : 'Complaints'} sub="Tenant complaints and maintenance jobs" right={<div className="row">{me?.role === 'ADMIN' && <button onClick={() => setCats(true)}>Categories</button>}{manager && <button className="primary" onClick={() => setAdding(true)}>+ New job</button>}</div>} />
    <div id="view">
      {s && <div className="grid k4">
        <Kpi label="New" value={s.new} tone={s.new ? 'warn' : undefined} /><Kpi label="Open" value={s.open} /><Kpi label="Work in progress" value={s.inProgress} />
        <Kpi label="Overdue" value={s.overdue} tone={s.overdue ? 'bad' : 'good'} /><Kpi label="Awaiting tenant confirmation" value={s.awaitingTenant} />
        <Kpi label="Average resolution" value={s.avgResolutionDays == null ? '—' : s.avgResolutionDays + ' days'} /><Kpi label="Tenant rating" value={s.avgRating == null ? '—' : s.avgRating + ' / 5'} tone={s.avgRating >= 4 ? 'good' : undefined} />
      </div>}
      <div className="toolbar" style={{ marginTop: 14 }}>{VIEWS.map(([k, l]) => <button key={k} className={view === k ? 'primary' : ''} onClick={() => setView(k)}>{l}</button>)}
        {(B.data?.length ?? 0) > 1 && <select className="right" value={bid} onChange={(e) => setBid(e.target.value)}><option value="">All buildings</option>{B.data!.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}</div>
      <Err msg={L.error} />
      <div className="card tw">{L.data && (L.data.length ? <table><thead><tr><th>Ref</th><th>Reported</th><th>Building / unit</th><th>Tenant</th><th>Problem</th><th>Priority</th><th>Assigned</th><th>Expected</th><th>Status</th></tr></thead>
        <tbody>{L.data.map((c) => <tr key={c.id} className="clickable" onClick={() => setOpen(c.id)}>
          <td><b>{c.refNo}</b>{c.reopenCount > 0 && <div className="small" style={{ color: 'var(--red)' }}>Reopened ×{c.reopenCount}</div>}</td><td>{fmtDate(c.reportedAt)}</td><td>{c.unit}</td>
          <td>{c.tenant?.name || <span className="muted">Staff</span>}</td><td style={{ minWidth: 200 }}><b>{c.title || c.subcategory}</b><div className="small muted">{c.category} / {c.subcategory}{c.fileCount ? ` · 📷 ${c.fileCount}` : ''}</div></td>
          <td><span className={`pill ${PRI[c.priority]}`}>{c.priority}</span></td><td>{c.assignedTo?.name || <span className="muted small">Unassigned</span>}</td>
          <td>{fmtDate(c.expectedDate)}{c.overdue && <div className="small" style={{ color: 'var(--red)' }}>Overdue</div>}</td><td><span className={`pill ${ST[c.status]}`}>{c.status}</span></td></tr>)}</tbody></table>
        : <div className="empty">No complaints in this view.</div>)}</div>
    </div>
    {open && <Detail id={open} manager={manager} onClose={() => setOpen(null)} onChanged={reload} />}
    {adding && <NewJob buildings={B.data || []} onClose={() => setAdding(false)} onSaved={(id) => { setAdding(false); reload(); setOpen(id); }} />}
    {cats && <Categories onClose={() => setCats(false)} />}
  </>;
}

function Detail({ id, manager, onClose, onChanged }: { id: string; manager: boolean; onClose: () => void; onChanged: () => void }) {
  const D = useLoad(() => api(`/complaints/${id}`), [id]); const A = useLoad(() => manager ? api<any[]>('/complaints/assignees') : Promise.resolve([]));
  const [err, setErr] = useState(''); const [note, setNote] = useState(''); const [internal, setInternal] = useState(false); const [kind, setKind] = useState('after'); const file = useRef<HTMLInputElement>(null);
  const c = D.data; const done = () => { D.reload(); onChanged(); };
  const run = async (fn: () => Promise<any>) => { setErr(''); try { await fn(); setNote(''); done(); } catch (x: any) { setErr(x.message); } };
  const patch = (body: any) => run(() => api(`/complaints/${id}`, { method: 'PATCH', body }));
  const move = (status: string) => run(() => api(`/complaints/${id}/status`, { body: { status, ...(note ? { note } : {}) } }));
  const upload = () => { const fs = file.current?.files; if (!fs?.length) return; const fd = new FormData(); Array.from(fs).slice(0, 6).forEach((f) => fd.append('files', f)); run(() => api(`/complaints/${id}/files?kind=${kind}`, { form: fd })).then(() => { if (file.current) file.current.value = ''; }); };
  if (!c) return <Modal title="Complaint" onClose={onClose}><Err msg={D.error} /><div className="empty">Loading…</div></Modal>;
  const LABEL: Record<string, string> = { Reviewed: 'Mark reviewed', 'Technician assigned': 'Assigned', 'Work in progress': 'Start work', 'Awaiting materials / approval': 'Awaiting materials / approval', 'Work completed': 'Work completed', Closed: 'Close', Cancelled: 'Cancel complaint' };
  return <Modal title={`${c.refNo} — ${c.title || c.subcategory}`} onClose={onClose}>
    <Err msg={err} />
    <div className="info" style={{ marginBottom: 12 }}>
      <span style={{ float: 'right' }}>{mapUrl(c.building.lat, c.building.lng) && <a className="btn sm" style={{ textDecoration: 'none' }} href={mapUrl(c.building.lat, c.building.lng)} target="_blank" rel="noopener">📍 Navigate</a>}</span>
      <b>{c.unit}</b>{c.tenant && <> · <Link href={`/tenants/${c.tenant.id}`}>{c.tenant.name}</Link>{c.tenant.mobile && <> · <a href={`tel:${c.tenant.mobile}`}>{c.tenant.mobile}</a></>}</>}
      <div className="small">{c.category} / {c.subcategory} · reported {when(c.reportedAt)}{c.preferredVisit && ` · visit: ${c.preferredVisit}`}</div></div>
    <p style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>{c.description}</p>
    {c.files?.length > 0 && <div className="thumbs" style={{ marginBottom: 12 }}>{c.files.map((f: any) => <a key={f.id} href={f.url} target="_blank" rel="noopener" title={`${f.kind}: ${f.name}`}>{f.mime.startsWith('image/') && f.mime !== 'image/heic' ? <img src={f.url} alt={f.name} /> : <div style={{ paddingTop: 26 }}>📄 {f.kind}</div>}</a>)}</div>}
    <div className="form">
      <Field label="Status"><div><span className={`pill ${ST[c.status]}`}>{c.status}</span>{c.tenantRating && <span className="small"> · rated {'★'.repeat(c.tenantRating)}</span>}</div></Field>
      <Field label="Priority">{manager ? <select value={c.priority} onChange={(e) => patch({ priority: e.target.value })}>{['Low', 'Medium', 'High', 'Urgent'].map((p) => <option key={p}>{p}</option>)}</select> : <div>{c.priority}</div>}</Field>
      <Field label="Assigned to">{manager ? <select value={c.assignedTo?.id || ''} onChange={(e) => patch({ assignedTo: e.target.value || null })}><option value="">— Unassigned —</option>{A.data?.map((a) => <option key={a.id} value={a.id}>{a.name}{a.role === 'MAINTENANCE_SUPERVISOR' ? ' (supervisor)' : ''}</option>)}</select> : <div>{c.assignedTo?.name || '—'}</div>}</Field>
      <Field label="Expected completion">{manager ? <input type="date" value={c.expectedDate || ''} onChange={(e) => patch({ expectedDate: e.target.value || null })} /> : <div>{fmtDate(c.expectedDate)}</div>}</Field>
    </div>
    {c.nextSteps?.length > 0 && <div style={{ marginTop: 14 }}>
      <label>Note (shown to the tenant with the update)</label><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Technician visiting tomorrow 10 am / parts ordered / what was done" />
      <div className="row" style={{ marginTop: 8 }}>{c.nextSteps.map((s: string) => <button key={s} className={s === 'Work completed' ? 'ok' : s === 'Cancelled' ? 'danger' : 'primary'} onClick={() => move(s)} disabled={s === 'Technician assigned' && !c.assignedTo}>{c.status === 'Closed' && s === 'Reviewed' ? 'Reopen' : c.status === 'Tenant confirmation pending' && s === 'Work in progress' ? 'Back to work' : c.status === 'Tenant confirmation pending' && s === 'Closed' ? 'Close without tenant reply' : LABEL[s] || s}</button>)}
        <button className="right" disabled={!note.trim()} onClick={() => run(() => api(`/complaints/${id}/notes`, { body: { note, internal } }))}>Add note only</button>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0, color: 'var(--text)' }}><input type="checkbox" style={{ width: 'auto' }} checked={internal} onChange={(e) => setInternal(e.target.checked)} /> internal</label></div>
      {c.status === 'Work in progress' || c.status === 'Technician assigned' ? <div className="small muted" style={{ marginTop: 6 }}>"Work completed" asks the tenant to confirm. Unanswered jobs close automatically after 7 days.</div> : null}
    </div>}
    <div className="row" style={{ marginTop: 14 }}><select style={{ width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value)}><option value="before">Before photo</option><option value="after">After photo</option><option value="internal">Internal file</option></select>
      <input ref={file} type="file" accept="image/*,application/pdf" multiple style={{ maxWidth: 260 }} /><button onClick={upload}>Upload</button></div>
    <div className="sec">Timeline</div>
    <div className="timeline">{c.timeline.map((e: any, i: number) => <div key={i} className="ev"><b>{e.status}</b> <span className="small muted">· {when(e.at)} · {e.by}{!e.visibleToTenant && ' · internal'}</span>{e.note && <div className="small">{e.note}</div>}</div>)}</div>
    {c.tenantFeedback && <div className="note">Tenant feedback: {c.tenantFeedback}</div>}
    <div className="row" style={{ marginTop: 12 }}><button className="right" onClick={onClose}>Close</button></div>
  </Modal>;
}

function NewJob({ buildings, onClose, onSaved }: { buildings: any[]; onClose: () => void; onSaved: (id: string) => void }) {
  const C = useLoad(() => api<any[]>('/maintenance-categories'));
  const [f, setF] = useState<any>({ buildingId: buildings[0]?.id || '', unitId: '', category: '', subcategory: '', title: '', description: '', priority: 'Medium' }); const [err, setErr] = useState('');
  const U = useLoad(() => f.buildingId ? api<any[]>(`/units?buildingId=${f.buildingId}`) : Promise.resolve([]), [f.buildingId]);
  const groups = useMemo(() => { const m = new Map<string, string[]>(); C.data?.forEach((c) => (m.get(c.category) ?? m.set(c.category, []).get(c.category)!).push(c.subcategory)); return m; }, [C.data]);
  const save = async (e: FormEvent) => { e.preventDefault(); setErr(''); const body: any = { ...f }; if (!body.unitId) delete body.unitId; if (!body.title) delete body.title;
    try { const c = await api('/complaints', { body }); onSaved(c.id); } catch (x: any) { setErr(x.message); } };
  return <Modal title="New maintenance job" onClose={onClose}><Err msg={err} /><form className="form" onSubmit={save}>
    <Field label="Building"><select value={f.buildingId} onChange={(e) => setF({ ...f, buildingId: e.target.value, unitId: '' })} required>{buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
    <Field label="Unit (blank = common area)"><select value={f.unitId} onChange={(e) => setF({ ...f, unitId: e.target.value })}><option value="">— Common area —</option>{U.data?.map((u) => <option key={u.id} value={u.id}>{u.unitNo}{u.tenant ? ` · ${u.tenant.name}` : ''}</option>)}</select></Field>
    <Field label="Category"><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value, subcategory: '' })} required><option value="">—</option>{[...groups.keys()].map((k) => <option key={k}>{k}</option>)}</select></Field>
    <Field label="Subcategory"><select value={f.subcategory} onChange={(e) => setF({ ...f, subcategory: e.target.value })} required><option value="">—</option>{(groups.get(f.category) || []).map((s) => <option key={s}>{s}</option>)}</select></Field>
    <Field label="Title" full><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={150} /></Field>
    <Field label="Description" full><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} required minLength={3} /></Field>
    <Field label="Priority"><select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{['Low', 'Medium', 'High', 'Urgent'].map((p) => <option key={p}>{p}</option>)}</select></Field>
    <div className="full small muted">If the unit has a tenant, they can follow the job in their app and will be asked to confirm when it is done.</div>
    <div className="full row"><button type="button" onClick={onClose}>Cancel</button><button className="primary right">Create job</button></div></form></Modal>;
}

function Categories({ onClose }: { onClose: () => void }) {
  const C = useLoad(() => api<any[]>('/maintenance-categories?all=true')); const [f, setF] = useState({ category: '', subcategory: '' }); const [err, setErr] = useState('');
  const groups = useMemo(() => { const m = new Map<string, any[]>(); C.data?.forEach((c) => (m.get(c.category) ?? m.set(c.category, []).get(c.category)!).push(c)); return m; }, [C.data]);
  const toggle = async (c: any) => { await api(`/maintenance-categories/${c.id}`, { method: 'PATCH', body: { isActive: !c.isActive } }); C.reload(); };
  const add = async (e: FormEvent) => { e.preventDefault(); setErr(''); try { await api('/maintenance-categories', { body: f }); setF({ category: f.category, subcategory: '' }); C.reload(); } catch (x: any) { setErr(x.message); } };
  return <Modal title="Complaint categories" onClose={onClose}><Err msg={err} />
    <div className="small muted" style={{ marginBottom: 10 }}>Tenants choose from the active ones. Click a subcategory to switch it on or off.</div>
    {[...groups.entries()].map(([k, list]) => <div key={k} className="catbox"><b>{k}</b><div style={{ marginTop: 6 }}>{list.map((c) => <span key={c.id} className="tag" style={{ cursor: 'pointer', opacity: c.isActive ? 1 : .4, textDecoration: c.isActive ? 'none' : 'line-through' }} onClick={() => toggle(c)}>{c.subcategory}</span>)}</div></div>)}
    <form className="row" onSubmit={add} style={{ marginTop: 10 }}><input placeholder="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} required style={{ flex: 1 }} list="catlist" />
      <datalist id="catlist">{[...groups.keys()].map((k) => <option key={k} value={k} />)}</datalist>
      <input placeholder="Subcategory" value={f.subcategory} onChange={(e) => setF({ ...f, subcategory: e.target.value })} required style={{ flex: 1 }} /><button className="primary">Add</button></form>
    <div className="row" style={{ marginTop: 12 }}><button className="right" onClick={onClose}>Close</button></div></Modal>;
}
