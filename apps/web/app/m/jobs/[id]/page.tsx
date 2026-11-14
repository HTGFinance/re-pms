'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Err, useLoad } from '@/components/ui';
import { CostsPanel } from '@/components/costs';
import { api, fmtDate, mapUrl, Me } from '@/lib/api';

const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Muscat' });
const LABEL: Record<string, string> = { 'Work in progress': '▶ Start work', 'Awaiting materials / approval': '⏸ Waiting for materials', 'Work completed': '✓ Work completed', 'Technician assigned': 'Back to assigned', Reviewed: 'Mark reviewed', Closed: 'Close', Cancelled: 'Cancel' };

export default function MJob() {
  const { id } = useParams<{ id: string }>(); const [me, setMe] = useState<Me | null>(null);
  useEffect(() => { api<Me>('/auth/me').then(setMe).catch(() => undefined); }, []);
  const D = useLoad(() => api(`/complaints/${id}`), [id]); const c = D.data;
  const [note, setNote] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const cam = useRef<HTMLInputElement>(null); const [kind, setKind] = useState('after');
  const run = async (fn: () => Promise<any>) => { setErr(''); setBusy(true); try { await fn(); setNote(''); D.reload(); } catch (x: any) { setErr(x.message); } finally { setBusy(false); } };
  const move = (status: string) => { if (status === 'Work completed' && !note.trim()) { setErr('Write what you did before marking the job completed'); return; } run(() => api(`/complaints/${id}/status`, { body: { status, ...(note ? { note } : {}) } })); };
  const upload = () => { const fs = cam.current?.files; if (!fs?.length) return; const fd = new FormData(); Array.from(fs).slice(0, 6).forEach((f) => fd.append('files', f)); run(() => api(`/complaints/${id}/files?kind=${kind}`, { form: fd })).then(() => { if (cam.current) cam.current.value = ''; }); };
  if (!c) return <><Err msg={D.error} /><div className="empty">Loading…</div></>;
  const tech = me?.role === 'TECHNICIAN'; const steps: string[] = (c.nextSteps || []).filter((s: string) => !tech || ['Work in progress', 'Awaiting materials / approval', 'Work completed'].includes(s));
  return <>
    <Link href="/m" className="small" style={{ color: 'var(--teal)' }}>← My jobs</Link>
    <div className="tcard" style={{ marginTop: 10 }}>
      <div className="row"><b>{c.refNo}</b><span className="pill p-amber right">{c.status}</span></div>
      <div style={{ fontWeight: 700, fontSize: 16, margin: '6px 0 2px' }}>{c.title || c.subcategory}</div>
      <div className="small muted">{c.category} / {c.subcategory} · {c.priority} priority</div>
      <p style={{ whiteSpace: 'pre-wrap' }}>{c.description}</p>
      <div className="line"><span className="muted">Where</span><b style={{ textAlign: 'right' }}>{c.unit}{c.building.addressCode ? <div className="small muted">{c.building.addressCode}</div> : null}</b></div>
      {c.tenant && <div className="line"><span className="muted">Tenant</span><b>{c.tenant.name}</b></div>}
      {c.preferredVisit && <div className="line"><span className="muted">Best time</span><b>{c.preferredVisit}</b></div>}
      {c.expectedDate && <div className="line"><span className="muted">Due</span><b>{fmtDate(c.expectedDate)}</b></div>}
      <div className="row" style={{ marginTop: 10 }}>
        {mapUrl(c.building.lat, c.building.lng) && <a className="btn" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }} href={mapUrl(c.building.lat, c.building.lng)} target="_blank" rel="noopener">📍 Directions</a>}
        {c.tenant?.mobile && <a className="btn" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }} href={`tel:${c.tenant.mobile}`}>📞 Call tenant</a>}</div>
      {c.files?.length > 0 && <div className="thumbs">{c.files.map((f: any) => <a key={f.id} href={f.url} target="_blank" rel="noopener" title={f.kind}>{f.mime.startsWith('image/') && f.mime !== 'image/heic' ? <img src={f.url} alt={f.name} /> : <div style={{ paddingTop: 26 }}>📄 {f.kind}</div>}</a>)}</div>}
    </div>
    <Err msg={err} />
    {steps.length > 0 && <div className="tcard"><h4>Update the job</h4>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you do / what is needed? (the tenant sees this)" />
      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>{steps.map((s) => <button key={s} className={`btn-block ${s === 'Work completed' ? 'ok' : s === 'Work in progress' ? 'primary' : ''}`} disabled={busy} onClick={() => move(s)}>{LABEL[s] || s}</button>)}</div>
      {note.trim() && <button className="btn-block" style={{ marginTop: 8 }} disabled={busy} onClick={() => run(() => api(`/complaints/${id}/notes`, { body: { note } }))}>Save note only</button>}</div>}
    <div className="tcard"><h4>Photos</h4><div className="row"><select style={{ width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value)}><option value="before">Before</option><option value="after">After</option></select>
      <input ref={cam} type="file" accept="image/*" capture="environment" multiple style={{ flex: 1 }} /></div><button className="btn-block" style={{ marginTop: 8 }} disabled={busy} onClick={upload}>Upload photos</button></div>
    {c.status !== 'Cancelled' && <div className="tcard"><CostsPanel complaintId={id} canAdd={!['Closed', 'Cancelled'].includes(c.status)} hasTenant={!!c.tenant} meId={tech ? me?.id : undefined} compact /></div>}
    <div className="tcard"><h4>History</h4><div className="timeline">{c.timeline.map((e: any, i: number) => <div key={i} className="ev"><b>{e.status}</b> <span className="small muted">· {when(e.at)} · {e.by}</span>{e.note && <div className="small">{e.note}</div>}</div>)}</div></div>
  </>;
}
