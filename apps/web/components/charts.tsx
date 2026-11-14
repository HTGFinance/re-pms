'use client';
/** Lightweight SVG charts (no external library). */
const COLORS = ['#1f3a5f', '#2a9d8f', '#e9b949', '#e76f51', '#4f86c6', '#94a3b8'];
const fmt = (v: number) => v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : v % 1 ? v.toFixed(1) : String(v);

export function BarChart({ labels, series, line, height = 220 }: { labels: string[]; series: { name: string; values: number[]; color?: string }[]; line?: { name: string; values: number[] }; height?: number }) {
  const W = 640, H = height, pad = { l: 44, r: 10, t: 12, b: 34 };
  const max = Math.max(1, ...series.flatMap((s) => s.values), ...(line?.values || [])) * 1.1;
  const cw = (W - pad.l - pad.r) / labels.length, bw = Math.max(3, (cw * 0.72) / series.length);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f / 1.1);
  return <div>
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img">
      {ticks.map((t, i) => <g key={i}><line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e3e8ef" /><text x={pad.l - 6} y={y(t) + 4} fontSize="10" textAnchor="end" fill="#64748b">{fmt(Math.round(t))}</text></g>)}
      {labels.map((l, i) => <g key={l + i}>
        {series.map((s, j) => { const v = s.values[i] || 0; const x = pad.l + i * cw + (cw - bw * series.length) / 2 + j * bw;
          return <rect key={j} x={x} y={y(v)} width={bw - 1} height={Math.max(0, H - pad.b - y(v))} fill={s.color || COLORS[j]} rx="2"><title>{`${s.name} ${l}: ${v.toLocaleString('en-US')}`}</title></rect>; })}
        <text x={pad.l + i * cw + cw / 2} y={H - pad.b + 14} fontSize="10" textAnchor="middle" fill="#64748b">{l}</text></g>)}
      {line && <polyline fill="none" stroke="#e9b949" strokeWidth="2.5" points={line.values.map((v, i) => `${pad.l + i * cw + cw / 2},${y(v)}`).join(' ')} />}
      {line && line.values.map((v, i) => <circle key={i} cx={pad.l + i * cw + cw / 2} cy={y(v)} r="3" fill="#e9b949"><title>{`${line.name} ${labels[i]}: ${v.toLocaleString('en-US')}`}</title></circle>)}
    </svg>
    <div className="row small" style={{ gap: 14, justifyContent: 'center' }}>{series.map((s, j) => <span key={s.name}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: s.color || COLORS[j], marginRight: 5 }} />{s.name}</span>)}
      {line && <span><span style={{ display: 'inline-block', width: 14, height: 3, background: '#e9b949', marginRight: 5, verticalAlign: 'middle' }} />{line.name}</span>}</div>
  </div>;
}

/** Horizontal bars for parts of a whole (label, value, share). */
export function HBars({ items, unit = '', suffix = '', max: fixedMax, share = true }: { items: { label: string; value: number; color?: string }[]; unit?: string; suffix?: string; max?: number; share?: boolean }) {
  const max = fixedMax || Math.max(1, ...items.map((i) => i.value)); const total = items.reduce((s, i) => s + i.value, 0);
  return <div>{items.map((it, i) => <div key={it.label} style={{ marginBottom: 9 }}>
    <div className="row small" style={{ justifyContent: 'space-between' }}><span>{it.label}</span><b>{unit}{it.value.toLocaleString('en-US', { minimumFractionDigits: unit ? 3 : 0, maximumFractionDigits: unit ? 3 : 0 })}{suffix}{share && total ? <span className="muted" style={{ fontWeight: 400 }}> · {Math.round((it.value / total) * 100)}%</span> : null}</b></div>
    <div style={{ height: 9, background: '#eef2f7', borderRadius: 5, marginTop: 3 }}><div style={{ width: `${(it.value / max) * 100}%`, height: '100%', background: it.color || COLORS[i % COLORS.length], borderRadius: 5 }} /></div>
  </div>)}</div>;
}
