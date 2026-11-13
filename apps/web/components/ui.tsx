'use client';
import { ReactNode, useEffect, useState } from 'react';

export const Kpi = ({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'warn' }) =>
  <div className={`card kpi ${tone || ''}`}><div className="l">{label}</div><div className="v">{value}</div>{sub && <div className="s">{sub}</div>}</div>;

const PILL: Record<string, string> = { Active: 'p-green', Occupied: 'p-green', Registered: 'p-green', Verified: 'p-green', Upcoming: 'p-blue', 'Sent to tenant': 'p-amber', 'Tenant accepted': 'p-blue', 'Landlord approved': 'p-purple', Draft: 'p-gray', Vacant: 'p-gray', Ended: 'p-gray', Terminated: 'p-red', Inactive: 'p-gray', Vacated: 'p-gray', Blacklisted: 'p-red', Pending: 'p-amber', Rejected: 'p-red' };
export const Pill = ({ s }: { s: string }) => <span className={`pill ${PILL[s] || 'p-gray'}`}>{s}</span>;

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="box"><h2>{title}</h2>{children}</div></div>;
}
export const Field = ({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) =>
  <div className={full ? 'full' : ''}><label>{label}</label>{children}</div>;
export const Err = ({ msg }: { msg?: string | null }) => msg ? <div className="err">{msg}</div> : null;

/** Load data with loading/error state. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null); const [error, setError] = useState<string | null>(null); const [tick, setTick] = useState(0);
  useEffect(() => { let live = true; setError(null); fn().then((d) => live && setData(d)).catch((e) => live && setError(e.message)); return () => { live = false; }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, reload: () => setTick((t) => t + 1) };
}
