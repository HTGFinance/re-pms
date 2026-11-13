/** Date helpers working on ISO 'YYYY-MM-DD' strings in Oman time (no time-zone drift). */
export const todayOman = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const pd = (s: string) => new Date(s + 'T00:00:00Z');
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => { const d = pd(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export const addMonths = (s: string, n: number) => { const d = pd(s); d.setUTCMonth(d.getUTCMonth() + n); return iso(d); };
export const daysBetween = (a: string, b: string) => Math.round((pd(b).getTime() - pd(a).getTime()) / 864e5);
export const isIsoDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(pd(s).getTime());
/** Parse spreadsheet dates: Excel serials, JS Dates, 'YYYY-MM-DD', 'DD/MM/YYYY' (Oman day-first), '15-Jan-2026'. */
export function parseDate(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) return iso(new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())));
  if (typeof v === 'number' && v > 20000 && v < 80000) return iso(new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5));
  const s = String(v).trim(); let m: RegExpMatchArray | null;
  const p2 = (x: string) => x.padStart(2, '0');
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return `${m[1]}-${p2(m[2])}-${p2(m[3])}`;
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) return `${m[3]}-${p2(m[2])}-${p2(m[1])}`;
  const d = new Date(s + ' UTC'); return isNaN(d.getTime()) ? '' : iso(d);
}
