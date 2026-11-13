'use client';
/** Small client for the RE-PMS API. All calls go to /api on the same origin (see next.config.ts). */
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const r = await fetch('/api' + path, {
    method: opts.method || (opts.body || opts.form ? 'POST' : 'GET'),
    credentials: 'include',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  if (r.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/login')) { window.location.href = '/login'; throw new ApiError(401, 'Please sign in'); }
  const text = await r.text(); let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) { const m = data?.message; throw new ApiError(r.status, Array.isArray(m) ? m.join('; ') : m || r.statusText); }
  return data as T;
}

export type Role = 'ADMIN' | 'PROPERTY_MANAGER' | 'FINANCE' | 'RECOVERY' | 'MAINTENANCE_SUPERVISOR' | 'TECHNICIAN' | 'EXECUTIVE' | 'TENANT';
export interface Me { id: string; email: string; name: string; role: Role; tenantId: string | null; buildingIds: string[] }
export const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Administrator', PROPERTY_MANAGER: 'Property manager', FINANCE: 'Finance', RECOVERY: 'Rent recovery', MAINTENANCE_SUPERVISOR: 'Maintenance supervisor', TECHNICIAN: 'Technician', EXECUTIVE: 'Executive (view only)', TENANT: 'Tenant' };
export const can = (me: Me | null, ...roles: Role[]) => !!me && (me.role === 'ADMIN' || roles.includes(me.role));

export const omr = (v: string | number | null | undefined) => {
  const n = Number(v ?? 0); return 'OMR ' + n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
};
export const num3 = (v: string | number | null | undefined) => Number(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
export const fmtDate = (s?: string | null) => s ? new Date(s.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
export const mapUrl = (lat?: string | null, lng?: string | null) => lat && lng ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` : '';
