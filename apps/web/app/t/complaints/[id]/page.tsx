'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useTenant } from '@/components/TenantShell';
import { Err, useLoad } from '@/components/ui';
import { api, fmtDate } from '@/lib/api';
import { STEPS, stepOf, tone } from '../page';

const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Muscat' });

export default function TComplaint() {
  const { id } = useParams<{ id: string }>(); const { reload } = useTenant();
  const D = useLoad(() => api(`/me/complaints/${id}`), [id]); const c = D.data;
  const [mode, setMode] = useState<'' | 'confirm' | 'reopen'>(''); const [rating, setRating] = useState(0); const [text, setText] = useState(''); const [err, setErr] = useState('');
  const act = async (path: string, body: any) => { setErr(''); try { await api(`/me/complaints/${id}/${path}`, { body }); setMode(''); setText(''); D.reload(); reload(); } catch (x: any) { setErr(x.message); } };
  if (!c) return <><Err msg={D.error} /><div className="empty">Loading…</div></>;
  const step = stepOf(c.statusLabel); const canReopen = c.statusLabel === 'Tenant confirmation pending' || (c.status === 'Closed' && c.closedAt && Date.now() - new Date(c.closedAt).getTime() < 30 * 864e5);
  return <>
    <Link href="/t/complaints" className="small" style={{ color: 'var(--teal)' }}>← My complaints</Link>
    <div className="tcard" style={{ marginTop: 10 }}>
      <div className="row"><b>{c.refNo}</b><span className={`pill ${tone(c.statusLabel)} right`}>{c.statusLabel}</span></div>
      <div style={{ fontWeight: 700, margin: '6px 0 2px' }}>{c.title || c.subcategory}</div>
      <div className="small muted">{c.category} / {c.subcategory} · {c.unit}</div>
      {c.statusLabel !== 'Cancelled' && <><div className="stepper">{STEPS.map((s, i) => <span key={s} className={i <= step ? 'on' : ''} title={s} />)}</div>
        <div className="small muted">Step {step + 1} of {STEPS.length}: {c.statusLabel}</div></>}
      <p style={{ whiteSpace: 'pre-wrap' }}>{c.description}</p>
      {c.expectedDate && !['Closed', 'Cancelled'].includes(c.status) && <div className="line"><span className="muted">Expected completion</span><b>{fmtDate(c.expectedDate)}</b></div>}
      {c.assignedTo && <div className="line"><span className="muted">Technician</span><b>{c.assignedTo.name}</b></div>}
      {c.preferredVisit && <div className="line"><span className="muted">Preferred visit</span><b>{c.preferredVisit}</b></div>}
      {c.files?.length > 0 && <div className="thumbs">{c.files.map((f: any) => <a key={f.id} href={f.url} target="_blank" rel="noopener" title={f.kind === 'after' ? 'After work' : f.kind === 'before' ? 'Before work' : 'Your photo'}>{f.mime.startsWith('image/') && f.mime !== 'image/heic' ? <img src={f.url} alt={f.name} /> : <div style={{ paddingTop: 26 }}>📄 {f.kind}</div>}</a>)}</div>}
    </div>
    <Err msg={err} />
    {c.statusLabel === 'Tenant confirmation pending' && !mode && <div className="tcard" style={{ borderColor: '#cfe0f5', background: '#f5f9fe' }}>
      <h4>Is the problem solved?</h4><div className="small muted" style={{ marginBottom: 10 }}>The maintenance team marked this job as completed. If you don't reply, it closes automatically after 7 days.</div>
      <div className="row"><button className="ok" style={{ flex: 1 }} onClick={() => setMode('confirm')}>Yes, it's solved</button><button className="danger" style={{ flex: 1 }} onClick={() => setMode('reopen')}>No, still a problem</button></div></div>}
    {mode === 'confirm' && <div className="tcard"><h4>Rate the service (optional)</h4>
      <div className="stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={n <= rating ? 'on' : ''} onClick={() => setRating(n)}>★</button>)}</div>
      <textarea placeholder="Any comments?" value={text} onChange={(e) => setText(e.target.value)} style={{ marginTop: 8 }} />
      <div className="row" style={{ marginTop: 10 }}><button onClick={() => setMode('')}>Back</button><button className="primary right" onClick={() => act('confirm', { ...(rating ? { rating } : {}), ...(text ? { feedback: text } : {}) })}>Confirm & close</button></div></div>}
    {mode === 'reopen' && <div className="tcard"><h4>What is still wrong?</h4><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell us what is not fixed" />
      <div className="row" style={{ marginTop: 10 }}><button onClick={() => setMode('')}>Back</button><button className="danger right" disabled={text.trim().length < 3} onClick={() => act('reopen', { reason: text })}>Reopen complaint</button></div></div>}
    {c.status === 'Closed' && canReopen && !mode && <button className="btn-block" style={{ marginBottom: 12 }} onClick={() => setMode('reopen')}>Problem came back? Reopen</button>}
    {['New', 'Reviewed'].includes(c.status) && <button className="btn-block danger" style={{ marginBottom: 12 }} onClick={() => act('cancel', {})}>Withdraw complaint</button>}
    <div className="tcard"><h4>Progress</h4><div className="timeline">{c.timeline.map((e: any, i: number) => <div key={i} className="ev"><b>{e.status}</b> <span className="small muted">· {when(e.at)}</span>{e.note && <div className="small">{e.note}</div>}</div>)}</div>
      {c.tenantRating && <div className="small muted">Your rating: {'★'.repeat(c.tenantRating)}</div>}</div>
  </>;
}
