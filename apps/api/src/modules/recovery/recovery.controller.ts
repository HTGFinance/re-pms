import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Role } from '../../database/entities';
import { AuthUser, buildingScope, CurrentUser, Roles } from '../../common/auth';
import { addDays, todayOman } from '../../common/dates';
import { fromBaisa, omr, toBaisa } from '../../common/money';
import { LedgerService } from '../billing/ledger.service';

const ROLES = [Role.RECOVERY, Role.FINANCE, Role.PROPERTY_MANAGER, Role.EXECUTIVE];
const YM = /^\d{4}-\d{2}$/;

/** Rent recovery reports: monthly schedule, arrears with ageing, collection summary. */
@Controller('recovery')
export class RecoveryController {
  constructor(private ds: DataSource, private ledger: LedgerService) {}

  /** Tenants (with their current unit) in the user's buildings, optionally one building. */
  private async tenants(u: AuthUser, buildingId?: string) {
    const s = buildingScope(u); const p: unknown[] = []; const w = ['TRUE'];
    if (s) { p.push(s); w.push(`un.building_id = ANY($${p.length})`); }
    if (buildingId) { p.push(buildingId); w.push(`un.building_id = $${p.length}`); }
    return this.ds.query(`
      SELECT DISTINCT ON (t.id) t.id, t.name, t.tenant_no, t.mobile, c.id AS contract_id, c.contract_no, c.status AS contract_status, un.unit_no, b.id AS building_id, b.name AS building_name
      FROM tenants t JOIN contracts c ON c.tenant_id=t.id JOIN units un ON un.id=c.unit_id JOIN buildings b ON b.id=un.building_id
      WHERE ${w.join(' AND ')} ORDER BY t.id, (c.status='Active') DESC, c.start_date DESC`, p);
  }

  /** Rent schedule for one month: every invoice of the month with billed / collected / outstanding. */
  @Get('schedule') @Roles(...ROLES)
  async schedule(@CurrentUser() u: AuthUser, @Query('period') period = todayOman().slice(0, 7), @Query('buildingId') buildingId?: string) {
    if (!YM.test(period)) throw new BadRequestException('period must be YYYY-MM');
    const ts = await this.tenants(u, buildingId); const tmap = new Map<string, any>(ts.map((t: any) => [t.id, t]));
    if (!ts.length) return { period, rows: [], totals: { billed: '0.000', collected: '0.000', outstanding: '0.000' } };
    const inv = await this.ds.query(`SELECT i.*, c.contract_no, un.unit_no, b.name AS building_name, b.id AS building_id FROM invoices i JOIN contracts c ON c.id=i.contract_id
      JOIN units un ON un.id=c.unit_id JOIN buildings b ON b.id=un.building_id WHERE i.period=$1 AND i.tenant_id = ANY($2) ${buildingId ? 'AND b.id = $3' : ''} ORDER BY b.name, un.unit_no`,
      buildingId ? [period, ts.map((t: any) => t.id), buildingId] : [period, ts.map((t: any) => t.id)]);
    const L = await this.ledger.ledgers([...new Set<string>(inv.map((i: any) => i.tenant_id))], addDays(period + '-01', 400)); // include future-dated items of the month
    let tb = 0, tc = 0;
    const rows = inv.map((i: any) => {
      const l = L.get(i.tenant_id)!; const open = l.open.find((o) => o.id === i.id);
      const out = open ? toBaisa(open.outstanding) : 0; const billed = toBaisa(i.total); tb += billed; tc += billed - out;
      const t = tmap.get(i.tenant_id);
      return { invoiceId: i.id, invoiceNo: i.invoice_no, tenant: { id: i.tenant_id, name: t?.name, tenantNo: t?.tenant_no, mobile: t?.mobile }, building: i.building_name, unit: i.unit_no,
        contractNo: i.contract_no, months: i.months, dueDate: i.due_date, rent: omr(i.rent), vat: omr(i.vat), billed: omr(i.total), collected: fromBaisa(billed - out), outstanding: fromBaisa(out),
        status: out === 0 ? 'Paid' : out === billed ? 'Unpaid' : 'Partly paid', lastPaymentDate: l.lastPaymentDate };
    });
    return { period, rows, totals: { billed: fromBaisa(tb), collected: fromBaisa(tc), outstanding: fromBaisa(tb - tc) } };
  }

  /** Tenants who owe money, with ageing buckets (by due date). */
  @Get('arrears') @Roles(...ROLES)
  async arrears(@CurrentUser() u: AuthUser, @Query('buildingId') buildingId?: string) {
    const ts = await this.tenants(u, buildingId); const L = await this.ledger.ledgers(ts.map((t: any) => t.id));
    const rows = ts.map((t: any) => ({ t, l: L.get(t.id)! })).filter((x: any) => toBaisa(x.l.aging.total) - toBaisa(x.l.aging.current) > 0)
      .map(({ t, l }: any) => ({ tenant: { id: t.id, name: t.name, tenantNo: t.tenant_no, mobile: t.mobile }, building: t.building_name, unit: t.unit_no, contractNo: t.contract_no, contractStatus: t.contract_status,
        aging: l.aging, overdue: fromBaisa(toBaisa(l.aging.total) - toBaisa(l.aging.current)), balance: l.balance, lastPaymentDate: l.lastPaymentDate,
        oldestDueDate: l.open.find((o: any) => o.daysOverdue > 0)?.date ?? null }))
      .sort((a: any, b: any) => toBaisa(b.overdue) - toBaisa(a.overdue));
    const sum = (k: string) => fromBaisa(rows.reduce((s: number, r: any) => s + toBaisa(r.aging[k]), 0));
    return { asOf: todayOman(), rows, totals: { d0_30: sum('d0_30'), d31_60: sum('d31_60'), d61_90: sum('d61_90'), d90plus: sum('d90plus'), overdue: fromBaisa(rows.reduce((s: number, r: any) => s + toBaisa(r.overdue), 0)) } };
  }

  /** Headline figures for the recovery page. */
  @Get('summary') @Roles(...ROLES)
  async summary(@CurrentUser() u: AuthUser, @Query('period') period = todayOman().slice(0, 7)) {
    if (!YM.test(period)) throw new BadRequestException('period must be YYYY-MM');
    const sch = await this.schedule(u, period); const arr = await this.arrears(u);
    const ids = (await this.tenants(u)).map((t: any) => t.id);
    const to = addDays(period.slice(0, 7) + '-01', 31).slice(0, 7) + '-01';
    const [cash] = ids.length ? await this.ds.query(`SELECT COALESCE(SUM(amount),0) AS a FROM payments WHERE status='Verified' AND tenant_id = ANY($1) AND date >= $2 AND date < $3`, [ids, period + '-01', to]) : [{ a: 0 }];
    const [pend] = ids.length ? await this.ds.query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(amount),0) AS a FROM payments WHERE status='Pending' AND tenant_id = ANY($1)`, [ids]) : [{ n: 0, a: 0 }];
    const [chq] = ids.length ? await this.ds.query(`SELECT COUNT(*) FILTER (WHERE status='In hand' AND due_date <= $2)::int AS due30, COALESCE(SUM(amount) FILTER (WHERE status='In hand' AND due_date <= $2),0) AS due30_amt,
      COUNT(*) FILTER (WHERE status='In hand' AND due_date <= $3)::int AS due_now, COUNT(*) FILTER (WHERE status='Bounced')::int AS bounced, COALESCE(SUM(amount) FILTER (WHERE status='Bounced'),0) AS bounced_amt,
      COALESCE(SUM(amount) FILTER (WHERE status='In hand'),0) AS in_hand FROM cheques WHERE tenant_id = ANY($1)`, [ids, addDays(todayOman(), 30), todayOman()]) : [{}];
    const b = toBaisa(sch.totals.billed);
    return { period, billed: sch.totals.billed, collectedAgainstBilling: sch.totals.collected, outstandingThisPeriod: sch.totals.outstanding,
      collectionRate: b ? Math.round((toBaisa(sch.totals.collected) / b) * 1000) / 10 : null, cashReceived: omr(cash.a),
      pendingVerification: { count: pend.n, amount: omr(pend.a) }, totalOverdue: arr.totals.overdue, tenantsInArrears: arr.rows.length,
      cheques: { inHand: omr(chq.in_hand ?? 0), dueWithin30Days: chq.due30 ?? 0, dueWithin30DaysAmount: omr(chq.due30_amt ?? 0), dueForDepositNow: chq.due_now ?? 0, bounced: chq.bounced ?? 0, bouncedAmount: omr(chq.bounced_amt ?? 0) } };
  }
}
