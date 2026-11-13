/**
 * OMR money helpers. All arithmetic is done in integer baisa (1 OMR = 1000 baisa)
 * so totals never pick up floating-point errors. Values cross the API as strings "123.450".
 */
export const toBaisa = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  if (!isFinite(n)) throw new Error(`Invalid amount: ${v}`);
  return Math.round(n * 1000);
};
export const fromBaisa = (b: number): string => {
  const neg = b < 0; const a = Math.abs(Math.round(b));
  return (neg ? '-' : '') + Math.floor(a / 1000) + '.' + String(a % 1000).padStart(3, '0');
};
export const omr = (v: string | number) => fromBaisa(toBaisa(v));
export const addOmr = (...vals: (string | number)[]) => fromBaisa(vals.reduce<number>((s, v) => s + toBaisa(v), 0));
export const mulOmr = (v: string | number, rate: string | number) => fromBaisa(Math.round(toBaisa(v) * Number(rate)));
