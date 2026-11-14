'use client';
import { useRouter } from 'next/navigation';
import { FormEvent, useMemo, useRef, useState } from 'react';
import { useTenant } from '@/components/TenantShell';
import { Err, useLoad } from '@/components/ui';
import { api } from '@/lib/api';

const ICON: Record<string, string> = { Repair: '🔧', Replacement: '♻️', Service: '🧰', Cleaning: '🧽', Painting: '🎨', 'Flat / unit': '🏠', Other: '📝' };
const HINT: Record<string, string> = { Repair: 'Something broken: plumbing, electrical, AC, civil', Replacement: 'Fixture or appliance to replace', Service: 'Routine servicing (AC, equipment)', Cleaning: 'Cleaning or water tank', Painting: 'Painting inside or outside', 'Flat / unit': 'Doors, windows, leaks, pests, lift, parking, neighbours', Other: 'Anything else' };

export default function NewComplaint() {
  const { home, reload } = useTenant(); const router = useRouter();
  const C = useLoad(() => api<{ category: string; subcategory: string }[]>('/me/categories'));
  const groups = useMemo(() => { const m = new Map<string, string[]>(); C.data?.forEach((c) => (m.get(c.category) ?? m.set(c.category, []).get(c.category)!).push(c.subcategory)); return m; }, [C.data]);
  const [cat, setCat] = useState(''); const [sub, setSub] = useState(''); const [title, setTitle] = useState(''); const [desc, setDesc] = useState(''); const [visit, setVisit] = useState('');
  const files = useRef<HTMLInputElement>(null); const [count, setCount] = useState(0); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const active = home?.contracts?.filter((c: any) => c.status === 'Active') || [];
  const submit = async (e: FormEvent) => { e.preventDefault(); setErr('');
    const fd = new FormData(); fd.append('category', cat); fd.append('subcategory', sub); fd.append('description', desc); if (title) fd.append('title', title); if (visit) fd.append('preferredVisit', visit);
    Array.from(files.current?.files || []).slice(0, 5).forEach((f) => fd.append('photos', f)); setBusy(true);
    try { const c = await api('/me/complaints', { form: fd }); reload(); router.replace(`/t/complaints/${c.id}`); } catch (x: any) { setErr(x.message); setBusy(false); } };
  if (!active.length && home) return <div className="empty">You need an active contract to raise a complaint. Please contact the office.</div>;
  return <form onSubmit={submit}>
    <h3 style={{ margin: '0 0 10px', color: 'var(--navy)' }}>New complaint</h3>
    {active[0] && <div className="small muted" style={{ marginBottom: 10 }}>For {active[0].building.name}, unit {active[0].unit.no}</div>}
    <Err msg={err || C.error} />
    {!cat ? <><label>What is it about?</label>
      {[...groups.keys()].map((k) => <div key={k} className="tcard" style={{ cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'center' }} onClick={() => { setCat(k); setSub(groups.get(k)!.length === 1 ? groups.get(k)![0] : ''); }}>
        <span style={{ fontSize: 24 }}>{ICON[k] || '•'}</span><div><b>{k}</b><div className="small muted">{HINT[k] || groups.get(k)!.slice(0, 4).join(', ')}</div></div></div>)}</>
    : <>
      <div className="row" style={{ marginBottom: 10 }}><span className="pill p-blue">{ICON[cat]} {cat}</span><a className="small" style={{ cursor: 'pointer', color: 'var(--teal)' }} onClick={() => { setCat(''); setSub(''); }}>change</a></div>
      <label>Type of problem</label>
      <div className="row" style={{ marginBottom: 12 }}>{groups.get(cat)!.map((s) => <button type="button" key={s} className={`sm ${sub === s ? 'primary' : ''}`} onClick={() => setSub(s)}>{s}</button>)}</div>
      <label>Short title (optional)</label><input value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Kitchen tap leaking" style={{ marginBottom: 12 }} />
      <label>Describe the problem</label><textarea value={desc} onChange={(e) => setDesc(e.target.value)} required minLength={5} maxLength={4000} placeholder="Where is it, since when, how bad?" style={{ marginBottom: 12 }} />
      <label>Photos (up to 5)</label><input ref={files} type="file" accept="image/*,application/pdf" multiple onChange={(e) => setCount(Math.min(5, e.target.files?.length || 0))} style={{ marginBottom: 4 }} />
      <div className="small muted" style={{ marginBottom: 12 }}>{count ? `${count} photo(s) selected` : 'Photos help the technician bring the right parts.'}</div>
      <label>Best time to visit (optional)</label><input value={visit} maxLength={150} onChange={(e) => setVisit(e.target.value)} placeholder="e.g. Weekdays after 4 pm" style={{ marginBottom: 16 }} />
      <button className="primary btn-block" disabled={busy || !sub}>{busy ? 'Sending…' : 'Submit complaint'}</button>
    </>}
  </form>;
}
