import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NumberingService } from '../../common/numbering.service';
import { fromBaisa, toBaisa } from '../../common/money';
import { daysBetween, todayOman } from '../../common/dates';

const STEP: Record<string, number> = { Monthly: 1, Quarterly: 3, 'Half-yearly': 6, Yearly: 12 };
const idx = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
const ymOf = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
const lastDayOf = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();

export interface LedgerLine { date: string; kind: 'Rent' | 'Charge' | 'Payment' | 'Credit'; ref: string; id: string; description: string; debit: string; credit: string; balance: string }
export interface OpenItem { kind: 'Rent' | 'Charge'; id: string; ref: string; date: string; period?: string; amount: string; paid: string; outstanding: string; daysOverdue: number }
export interface Aging { current: string; d0_30: string; d31_60: string; d61_90: string; d90plus: string; total: string }
export interface TenantLedger { tenantId: string; balance: string; unappliedCredit: string; aging: Aging; open: OpenItem[]; lines: LedgerLine[]; lastPaymentDate: string | null }

/**
 * Rent billing and tenant ledgers.
 * - Invoices are created in advance on the first day of each billing period (monthly / quarterly / half-yearly / yearly),
 *   from the contract's billFrom month up to the current month, never past the expiry month. Idempotent.
 * - The ledger = invoices + charges (debits) − verified payments and credit notes (credits).
 *   Credits are applied to the oldest debit first (FIFO), which gives per-invoice outstanding amounts and ageing.
 */
@Injectable()
export class LedgerService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('Billing'); private timer?: NodeJS.Timeout;
  constructor(private ds: DataSource, private num: NumberingService) {}
  onModuleInit() { const go = () => this.runBilling().then((r) => r.created && this.log.log(`Created ${r.created} invoice(s)`)).catch((e) => this.log.error(e.message)); go(); this.timer = setInterval(go, 3600_000); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  /** Generate missing rent invoices up to and including `upTo` (YYYY-MM, default current month). */
  async runBilling(upTo = todayOman().slice(0, 7), contractId?: string): Promise<{ created: number; upTo: string }> {
    const rows: any[] = await this.ds.query(
      `SELECT id, tenant_id, bill_from, expiry_date, monthly_rent, vat_rate, payment_frequency, rent_due_day FROM contracts
       WHERE status IN ('Active','Ended','Terminated') AND bill_from IS NOT NULL ${contractId ? 'AND id = $1' : ''}`, contractId ? [contractId] : []);
    let created = 0;
    for (const c of rows) {
      const step = STEP[c.payment_frequency] || 1, start = idx(c.bill_from.slice(0, 7)), end = idx(c.expiry_date.slice(0, 7)), last = Math.min(end, idx(upTo));
      if (start > last) continue;
      const have = new Set<string>((await this.ds.query(`SELECT period FROM invoices WHERE contract_id = $1`, [c.id])).map((r: any) => r.period));
      for (let p = start; p <= last; p += step) {
        const period = ymOf(p); if (have.has(period)) continue;
        const months = Math.min(step, end - p + 1);
        const rent = toBaisa(c.monthly_rent) * months, vat = Math.round(rent * Number(c.vat_rate));
        const due = `${period}-${String(Math.min(c.rent_due_day, lastDayOf(period))).padStart(2, '0')}`;
        await this.ds.transaction(async (em) => {
          const no = await this.num.next(em, 'invoice', 'INV-', 6);
          const r = await em.query(
            `INSERT INTO invoices (invoice_no, contract_id, tenant_id, period, months, due_date, rent, vat, total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT ON CONSTRAINT uq_invoice_contract_period DO NOTHING RETURNING id`,
            [no, c.id, c.tenant_id, period, months, due, fromBaisa(rent), fromBaisa(vat), fromBaisa(rent + vat)]);
          if (r.length) created++;
        });
      }
    }
    return { created, upTo };
  }

  /** Ledgers for many tenants at once (3 queries). */
  async ledgers(tenantIds: string[], asOf = todayOman()): Promise<Map<string, TenantLedger>> {
    const out = new Map<string, TenantLedger>(); if (!tenantIds.length) return out;
    const [inv, chg, pay] = await Promise.all([
      this.ds.query(`SELECT id, invoice_no, tenant_id, period, months, due_date, total, vat FROM invoices WHERE tenant_id = ANY($1) AND due_date <= $2`, [tenantIds, asOf]),
      this.ds.query(`SELECT id, charge_no, tenant_id, date, amount, description, kind FROM ledger_charges WHERE tenant_id = ANY($1) AND date <= $2`, [tenantIds, asOf]),
      this.ds.query(`SELECT id, receipt_no, tenant_id, date, amount, method, reference FROM payments WHERE tenant_id = ANY($1) AND status = 'Verified' AND date <= $2`, [tenantIds, asOf]),
    ]);
    const by = (rows: any[]) => { const m = new Map<string, any[]>(); for (const r of rows) (m.get(r.tenant_id) ?? m.set(r.tenant_id, []).get(r.tenant_id)!).push(r); return m; };
    const I = by(inv), C = by(chg), P = by(pay);
    for (const t of tenantIds) {
      const debits: { kind: 'Rent' | 'Charge'; id: string; ref: string; date: string; period?: string; amt: number; desc: string }[] = [];
      const credits: { kind: 'Payment' | 'Credit'; id: string; ref: string; date: string; amt: number; desc: string }[] = [];
      for (const r of I.get(t) || []) debits.push({ kind: 'Rent', id: r.id, ref: r.invoice_no, date: r.due_date, period: r.period, amt: toBaisa(r.total),
        desc: `Rent ${r.period}${r.months > 1 ? ` (+${r.months - 1} mo)` : ''}${toBaisa(r.vat) ? ' incl. VAT' : ''}` });
      for (const r of C.get(t) || []) { const a = toBaisa(r.amount); (a >= 0 ? debits : credits).push({ kind: a >= 0 ? 'Charge' : 'Credit', id: r.id, ref: r.charge_no, date: r.date, amt: Math.abs(a), desc: r.description } as any); }
      for (const r of P.get(t) || []) credits.push({ kind: 'Payment', id: r.id, ref: r.receipt_no, date: r.date, amt: toBaisa(r.amount), desc: `Payment — ${r.method}${r.reference ? ' (' + r.reference + ')' : ''}` });
      debits.sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref));
      // FIFO allocation of all credits to debits
      let pool = credits.reduce((s, c) => s + c.amt, 0);
      const open: OpenItem[] = []; const ag = { current: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
      for (const d of debits) {
        const paid = Math.min(d.amt, pool); pool -= paid; const o = d.amt - paid; if (o <= 0) continue;
        const late = daysBetween(d.date, asOf);
        if (late <= 0) ag.current += o; else if (late <= 30) ag.d0_30 += o; else if (late <= 60) ag.d31_60 += o; else if (late <= 90) ag.d61_90 += o; else ag.d90plus += o;
        open.push({ kind: d.kind, id: d.id, ref: d.ref, date: d.date, period: d.period, amount: fromBaisa(d.amt), paid: fromBaisa(paid), outstanding: fromBaisa(o), daysOverdue: Math.max(0, late) });
      }
      // Statement lines in date order with running balance
      const all = [...debits.map((d) => ({ ...d, dr: d.amt, cr: 0 })), ...credits.map((c) => ({ ...c, dr: 0, cr: c.amt }))]
        .sort((a, b) => a.date.localeCompare(b.date) || b.dr - a.dr || a.ref.localeCompare(b.ref));
      let run = 0;
      const lines: LedgerLine[] = all.map((l) => { run += l.dr - l.cr; return { date: l.date, kind: l.kind, ref: l.ref, id: l.id, description: l.desc, debit: fromBaisa(l.dr), credit: fromBaisa(l.cr), balance: fromBaisa(run) }; });
      const total = ag.current + ag.d0_30 + ag.d31_60 + ag.d61_90 + ag.d90plus;
      const lastPay = (P.get(t) || []).map((p: any) => p.date).sort().pop() ?? null;
      out.set(t, { tenantId: t, balance: fromBaisa(run), unappliedCredit: fromBaisa(pool), lastPaymentDate: lastPay, open, lines,
        aging: { current: fromBaisa(ag.current), d0_30: fromBaisa(ag.d0_30), d31_60: fromBaisa(ag.d31_60), d61_90: fromBaisa(ag.d61_90), d90plus: fromBaisa(ag.d90plus), total: fromBaisa(total) } });
    }
    return out;
  }
  async ledger(tenantId: string) { return (await this.ledgers([tenantId])).get(tenantId)!; }
}
