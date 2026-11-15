import { config } from '../../config';
import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import ExcelJS from 'exceljs';
import { DataSource } from 'typeorm';
import { Role } from '../../database/entities';
import { AuthUser, buildingScope, CurrentUser, Roles } from '../../common/auth';
import { fromBaisa, toBaisa } from '../../common/money';
import { addDays, addMonths, daysBetween, todayOman } from '../../common/dates';
import { LedgerService } from '../billing/ledger.service';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SPENT = `approval_status IN ('Not needed','Approved')`;
const ROLES = [Role.EXECUTIVE, Role.FINANCE, Role.PROPERTY_MANAGER];
type Range = { from: string; to: string; asAt: string };
type Money = number; // baisa inside this file; converted with fromBaisa on output

const lastDayOf = (ym: string) => addDays(addMonths(ym + '-01', 1), -1);
/** Months touching the range with the share of each month inside it; months that have not started yet count 0. */
function monthShares(r: Range) {
  const out: { m: string; share: number; billed: boolean }[] = []; let m = r.from.slice(0, 7); const today = todayOman();
  const end = r.to < today ? r.to : today; // budget runs only to today, like the actuals
  while (m <= r.to.slice(0, 7)) {
    const ms = m + '-01', me = lastDayOf(m); const dim = daysBetween(ms, me) + 1;
    const a = r.from > ms ? r.from : ms, b = end < me ? end : me;
    out.push({ m, share: a > b ? 0 : (daysBetween(a, b) + 1) / dim, billed: ms >= r.from && ms <= r.to && ms <= today });
    m = addMonths(ms, 1).slice(0, 7);
  }
  return out;
}

/**
 * Group management dashboard. Everything is for one period (any from–to) and optionally one building,
 * plus "today" figures (arrears, compliance) and a year-to-date block. Amounts in OMR (strings, 3 decimals).
 * - Rent billed = invoices due in the period (rent is billed in advance on the due date).
 * - Collected against billing = part of those invoices settled by payments (oldest dues first), as at today.
 * - Cash received = verified payments dated in the period.
 * - Maintenance = approved / not-needing-approval cost lines with work date in the period.
 * - NOI = rent billed (excl. VAT) − maintenance.
 * - Budgets are monthly per building, pro-rated by days and counted only up to today (so they compare with actuals to date).
 */
@Controller('executive')
export class ExecutiveController {
  constructor(private ds: DataSource, private ledger: LedgerService) {}

  private range(from?: string, to?: string): Range {
    const t = todayOman(); const f = from && DATE.test(from) ? from : t.slice(0, 4) + '-01-01'; const e = to && DATE.test(to) ? to : t;
    if (f > e) throw new BadRequestException('"from" is after "to"');
    return { from: f, to: e, asAt: e < t ? e : t };
  }
  private buildings(u: AuthUser, buildingId?: string): Promise<{ id: string; name: string; type: string; location: string }[]> {
    const s = buildingScope(u); const p: unknown[] = []; const w = ['b.is_active'];
    if (s) { p.push(s); w.push(`b.id = ANY($${p.length})`); } if (buildingId) { p.push(buildingId); w.push(`b.id = $${p.length}`); }
    return this.ds.query(`SELECT id, name, type, location FROM buildings b WHERE ${w.join(' AND ')} ORDER BY name`, p);
  }

  /** All raw figures for a set of buildings and a range. `paid` maps invoice id → amount settled (baisa). */
  private async figures(bids: string[], r: Range, paid: Map<string, number>) {
    const [inv, cash, mnt, units, budgets, vac] = await Promise.all([
      this.ds.query(`SELECT i.id, i.rent, i.vat, i.total, i.due_date, un.building_id FROM invoices i JOIN contracts c ON c.id=i.contract_id JOIN units un ON un.id=c.unit_id
        WHERE i.due_date BETWEEN $1 AND $2 AND un.building_id = ANY($3)`, [r.from, r.to, bids]),
      this.ds.query(`SELECT p.amount, p.date, lc.building_id FROM payments p
        JOIN LATERAL (SELECT un.building_id FROM contracts c JOIN units un ON un.id=c.unit_id WHERE c.tenant_id=p.tenant_id ORDER BY (c.status='Active') DESC, c.start_date DESC LIMIT 1) lc ON TRUE
        WHERE p.status='Verified' AND p.date BETWEEN $1 AND $2 AND lc.building_id = ANY($3)`, [r.from, r.to, bids]),
      this.ds.query(`SELECT total, work_date, building_id FROM maintenance_costs WHERE ${SPENT} AND work_date BETWEEN $1 AND $2 AND building_id = ANY($3)`, [r.from, r.to, bids]),
      this.ds.query(`SELECT un.id, un.building_id, un.listed_rent,
        EXISTS (SELECT 1 FROM contracts c WHERE c.unit_id=un.id AND c.status IN ('Active','Ended','Terminated') AND c.tenancy_from <= $1 AND c.expiry_date >= $1) AS occupied
        FROM units un WHERE un.is_active AND un.building_id = ANY($2)`, [r.asAt, bids]),
      this.ds.query(`SELECT building_id, period, rental_income, collection, maintenance FROM budgets WHERE building_id = ANY($1) AND period BETWEEN $2 AND $3`, [bids, r.from.slice(0, 7), r.to.slice(0, 7)]),
      // vacancy loss: listed rent of units empty on the 1st of each billing month in the range
      this.ds.query(`SELECT un.building_id, to_char(m, 'YYYY-MM') AS month, un.listed_rent FROM units un
        CROSS JOIN generate_series(date_trunc('month', $1::date), date_trunc('month', $2::date), interval '1 month') m
        WHERE un.is_active AND un.building_id = ANY($3) AND m::date >= $1::date AND m::date <= $4::date
          AND NOT EXISTS (SELECT 1 FROM contracts c WHERE c.unit_id=un.id AND c.status IN ('Active','Ended','Terminated') AND c.tenancy_from <= m::date AND c.expiry_date >= m::date)`, [r.from, r.to, bids, r.asAt]),
    ]);
    return { inv, cash, mnt, units, budgets, vac, paid };
  }

  private summarise(f: any, r: Range, bid?: string) {
    const by = (rows: any[]) => bid ? rows.filter((x) => x.building_id === bid) : rows;
    const inv = by(f.inv), cash = by(f.cash), mnt = by(f.mnt), units = by(f.units), budgets = by(f.budgets), vac = by(f.vac);
    const sum = (rows: any[], k: string) => rows.reduce((s: number, x: any) => s + toBaisa(x[k]), 0);
    const rent = sum(inv, 'rent'), vat = sum(inv, 'vat'), billed = sum(inv, 'total'), against = inv.reduce((s: number, i: any) => s + (f.paid.get(i.id) || 0), 0);
    const cashIn = sum(cash, 'amount'), maint = sum(mnt, 'total');
    const shares = new Map(monthShares(r).map((x) => [x.m, x.share]));
    const bud = { rent: 0, collection: 0, maintenance: 0 };
    for (const b of budgets) { const s = shares.get(b.period) || 0; bud.rent += toBaisa(b.rental_income) * s; bud.collection += toBaisa(b.collection) * s; bud.maintenance += toBaisa(b.maintenance) * s; }
    const occ = units.filter((x: any) => x.occupied).length;
    return { rent, vat, billed, against, cash: cashIn, maint, noi: rent - maint, units: units.length, occupied: occ, vacancyLoss: sum(vac, 'listed_rent'),
      budget: { rent: Math.round(bud.rent), collection: Math.round(bud.collection), maintenance: Math.round(bud.maintenance), noi: Math.round(bud.rent - bud.maintenance) } };
  }
  private out(x: any) {
    const o = (v: Money) => fromBaisa(v);
    const varr = (a: Money, b: Money, cost = false) => ({ budget: o(b), actual: o(a), variance: o(a - b), variancePct: b ? Math.round(((a - b) / b) * 1000) / 10 : null, favourable: b ? (cost ? a <= b : a >= b) : null });
    return { rentBilled: o(x.rent), vat: o(x.vat), billedInclVat: o(x.billed), collectedAgainstBilling: o(x.against), collectionRate: x.billed ? Math.round((x.against / x.billed) * 1000) / 10 : null,
      cashReceived: o(x.cash), maintenance: o(x.maint), noi: o(x.noi), units: x.units, occupied: x.occupied, occupancy: x.units ? Math.round((x.occupied / x.units) * 1000) / 10 : 0, vacancyLoss: o(x.vacancyLoss),
      budgetVsActual: { rentalIncome: varr(x.rent, x.budget.rent), collections: varr(x.cash, x.budget.collection), maintenance: varr(x.maint, x.budget.maintenance, true), noi: varr(x.noi, x.budget.noi) } };
  }

  /** Map invoice id → amount settled (baisa), using the ledger's oldest-first allocation as at today. */
  private async allocation(bids: string[]) {
    const ts: string[] = (await this.ds.query(`SELECT DISTINCT c.tenant_id FROM contracts c JOIN units un ON un.id=c.unit_id WHERE un.building_id = ANY($1)`, [bids])).map((x: any) => x.tenant_id);
    const L = await this.ledger.ledgers(ts); const paid = new Map<string, number>(); const aging = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, current: 0 }; let balance = 0; let inArrears = 0;
    const invs: any[] = ts.length ? await this.ds.query(`SELECT id, total, tenant_id FROM invoices WHERE tenant_id = ANY($1) AND due_date <= $2`, [ts, todayOman()]) : [];
    const openById = new Map<string, number>();
    for (const l of L.values()) {
      for (const o of l.open) openById.set(o.id, toBaisa(o.outstanding));
      for (const k of Object.keys(aging) as (keyof typeof aging)[]) aging[k] += toBaisa((l.aging as any)[k]);
      balance += toBaisa(l.balance); if (toBaisa(l.aging.total) - toBaisa(l.aging.current) > 0) inArrears++;
    }
    for (const i of invs) paid.set(i.id, toBaisa(i.total) - (openById.get(i.id) || 0));
    return { paid, aging, balance, inArrears };
  }

  @Get('dashboard') @Roles(...ROLES)
  async dashboard(@CurrentUser() u: AuthUser, @Query('from') qf?: string, @Query('to') qt?: string, @Query('buildingId') buildingId?: string) {
    const r = this.range(qf, qt); const bl = await this.buildings(u, buildingId); const bids = bl.map((b) => b.id);
    if (!bids.length) throw new BadRequestException('No buildings to show');
    const alloc = await this.allocation(bids);
    const today = todayOman(); const ytd: Range = { from: today.slice(0, 4) + '-01-01', to: today, asAt: today };
    const [f, fy] = await Promise.all([this.figures(bids, r, alloc.paid), this.figures(bids, ytd, alloc.paid)]);
    const total = this.summarise(f, r), year = this.summarise(fy, ytd);
    // monthly series (each month of the range, clipped to the range)
    const months = monthShares(r).filter((x) => x.share > 0);
    const monthly = await Promise.all(months.map(async ({ m }) => {
      const mr: Range = { from: (m + '-01' < r.from ? r.from : m + '-01'), to: (lastDayOf(m) > r.to ? r.to : lastDayOf(m)), asAt: '' }; mr.asAt = mr.to < today ? mr.to : today;
      const s = this.summarise(await this.figures(bids, mr, alloc.paid), mr);
      return { month: m, rent: fromBaisa(s.rent), budgetRent: fromBaisa(s.budget.rent), billed: fromBaisa(s.billed), collected: fromBaisa(s.against), cash: fromBaisa(s.cash), budgetCollection: fromBaisa(s.budget.collection),
        maintenance: fromBaisa(s.maint), budgetMaintenance: fromBaisa(s.budget.maintenance), occupancy: s.units ? Math.round((s.occupied / s.units) * 1000) / 10 : 0 };
    }));
    // today: compliance and operations
    const [c] = await this.ds.query(`SELECT
      (SELECT COUNT(*) FROM contracts c JOIN units un ON un.id=c.unit_id WHERE un.building_id=ANY($1) AND c.status='Active' AND c.expiry_date BETWEEN $2 AND $3)::int AS expiring90,
      (SELECT COUNT(*) FROM contracts c JOIN units un ON un.id=c.unit_id WHERE un.building_id=ANY($1) AND c.status IN ('Active','Upcoming') AND c.e_status<>'Registered')::int AS unregistered,
      (SELECT COALESCE(SUM(c.security_deposit),0) FROM contracts c JOIN units un ON un.id=c.unit_id WHERE un.building_id=ANY($1) AND c.status='Active') AS deposits,
      (SELECT COALESCE(SUM(c.monthly_rent*(1+c.vat_rate)),0) FROM contracts c JOIN units un ON un.id=c.unit_id WHERE un.building_id=ANY($1) AND c.status='Active') AS rent_roll,
      (SELECT COUNT(*) FROM complaints WHERE building_id=ANY($1) AND status IN ('New','Reviewed','Technician assigned','Work in progress','Awaiting materials / approval'))::int AS open_complaints,
      (SELECT COUNT(*) FROM complaints WHERE building_id=ANY($1) AND status IN ('New','Reviewed','Technician assigned','Work in progress','Awaiting materials / approval') AND expected_date < CURRENT_DATE)::int AS overdue_complaints,
      (SELECT COUNT(*) FROM maintenance_costs WHERE building_id=ANY($1) AND approval_status='Pending')::int AS pending_costs,
      (SELECT COUNT(*) FROM vacate_notices n JOIN contracts c ON c.id=n.contract_id JOIN units un ON un.id=c.unit_id WHERE un.building_id=ANY($1) AND n.status NOT IN ('Settled','Cancelled'))::int AS notices
      `, [bids, today, addDays(today, 90)]);
    const tids: string[] = (await this.ds.query(`SELECT DISTINCT c.tenant_id FROM contracts c JOIN units un ON un.id=c.unit_id WHERE un.building_id = ANY($1)`, [bids])).map((x: any) => x.tenant_id);
    const [q] = tids.length ? await this.ds.query(`SELECT COUNT(*) FILTER (WHERE status='In hand')::int AS in_hand, COALESCE(SUM(amount) FILTER (WHERE status='In hand'),0) AS in_hand_amt,
      COUNT(*) FILTER (WHERE status='In hand' AND due_date <= $2)::int AS due30, COALESCE(SUM(amount) FILTER (WHERE status='In hand' AND due_date <= $2),0) AS due30_amt,
      COUNT(*) FILTER (WHERE status='Bounced')::int AS bounced, COALESCE(SUM(amount) FILTER (WHERE status='Bounced'),0) AS bounced_amt FROM cheques WHERE tenant_id = ANY($1)`, [tids, addDays(today, 30)]) : [{}];
    const [pp] = tids.length ? await this.ds.query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(amount),0) AS a FROM payments WHERE status='Pending' AND tenant_id = ANY($1)`, [tids]) : [{ n: 0, a: 0 }];
    const a = alloc.aging;
    return {
      period: r, ytd: { from: ytd.from, to: ytd.to, ...this.out(year) }, totals: this.out(total), monthly,
      buildings: bl.map((b) => ({ id: b.id, name: b.name, type: b.type, location: b.location, ...this.out(this.summarise(f, r, b.id)) })),
      today: { asOf: today, outstanding: fromBaisa(alloc.balance), tenantsInArrears: alloc.inArrears,
        aging: { notDue: fromBaisa(a.current), d0_30: fromBaisa(a.d0_30), d31_60: fromBaisa(a.d31_60), d61_90: fromBaisa(a.d61_90), d90plus: fromBaisa(a.d90plus), over60: fromBaisa(a.d61_90 + a.d90plus) },
        monthlyRentRoll: fromBaisa(toBaisa(c.rent_roll)), depositsHeld: fromBaisa(toBaisa(c.deposits)), expiringWithin90Days: c.expiring90, notRegistered: c.unregistered, openNotices: c.notices,
        openComplaints: c.open_complaints, overdueComplaints: c.overdue_complaints, costsAwaitingApproval: c.pending_costs, paymentsAwaitingVerification: { count: pp.n, amount: fromBaisa(toBaisa(pp.a)) },
        cheques: { inHand: q.in_hand ?? 0, inHandAmount: fromBaisa(toBaisa(q.in_hand_amt ?? 0)), dueWithin30Days: q.due30 ?? 0, dueWithin30DaysAmount: fromBaisa(toBaisa(q.due30_amt ?? 0)), bounced: q.bounced ?? 0, bouncedAmount: fromBaisa(toBaisa(q.bounced_amt ?? 0)) } },
    };
  }

  /** Board pack: the dashboard for the chosen period as an Excel workbook. */
  @Get('report.xlsx') @Roles(...ROLES)
  async report(@CurrentUser() u: AuthUser, @Res() res: Response, @Query('from') qf?: string, @Query('to') qt?: string, @Query('buildingId') buildingId?: string) {
    const d = await this.dashboard(u, qf, qt, buildingId); const r = d.period; const t = d.totals; const OMR = '#,##0.000';
    const wb = new ExcelJS.Workbook(); wb.creator = config.brandName;
    const head = (ws: ExcelJS.Worksheet, cols: [string, number][]) => { ws.columns = cols.map(([h, w]) => ({ header: h, width: w })); const row = ws.getRow(1); row.font = { bold: true, color: { argb: 'FFFFFFFF' } }; row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } }; ws.views = [{ state: 'frozen', ySplit: 1 }]; };
    const s1 = wb.addWorksheet('Summary'); s1.columns = [{ width: 42 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 12 }];
    s1.addRow([`Property portfolio — ${r.from} to ${r.to}`]).font = { bold: true, size: 14 }; s1.addRow([`Prepared ${todayOman()} · occupancy as at ${r.asAt}`]); s1.addRow([]);
    const kv = (label: string, v: any, money = true) => { const row = s1.addRow([label, money ? Number(v) : v]); if (money) row.getCell(2).numFmt = OMR; };
    kv('Occupancy %', t.occupancy, false); kv('Units occupied / total', `${t.occupied} / ${t.units}`, false); kv('Rent billed (excl. VAT)', t.rentBilled); kv('VAT billed', t.vat); kv('Collected against billing', t.collectedAgainstBilling);
    kv('Collection rate %', t.collectionRate ?? '—', false); kv('Cash received', t.cashReceived); kv('Maintenance', t.maintenance); kv('Net operating income (rent − maintenance)', t.noi); kv('Vacancy loss (listed rent of empty units)', t.vacancyLoss);
    s1.addRow([]); const h = s1.addRow(['Budget vs actual', 'Budget', 'Actual', 'Variance', 'Var %']); h.font = { bold: true };
    for (const [label, x] of [['Rental income (excl. VAT)', t.budgetVsActual.rentalIncome], ['Collections (cash)', t.budgetVsActual.collections], ['Maintenance', t.budgetVsActual.maintenance], ['Net operating income', t.budgetVsActual.noi]] as [string, any][]) {
      const row = s1.addRow([label, Number(x.budget), Number(x.actual), Number(x.variance), x.variancePct ?? '']); [2, 3, 4].forEach((i) => (row.getCell(i).numFmt = OMR));
      if (x.favourable !== null) row.getCell(4).font = { color: { argb: x.favourable ? 'FF2E8B57' : 'FFC0392B' } };
    }
    s1.addRow([]); s1.addRow(['Today', d.today.asOf]).font = { bold: true };
    kv('Total outstanding rent', d.today.outstanding); kv('Overdue 1–30 days', d.today.aging.d0_30); kv('Overdue 31–60 days', d.today.aging.d31_60); kv('Overdue 61–90 days', d.today.aging.d61_90); kv('Overdue over 90 days', d.today.aging.d90plus);
    kv('Security deposits held', d.today.depositsHeld); kv('Monthly rent roll (incl. VAT)', d.today.monthlyRentRoll); kv('Contracts expiring within 90 days', d.today.expiringWithin90Days, false); kv('Contracts not registered', d.today.notRegistered, false);
    kv('Cheques due within 30 days', d.today.cheques.dueWithin30DaysAmount); kv('Bounced cheques', d.today.cheques.bouncedAmount); kv('Open complaints', d.today.openComplaints, false);
    const s2 = wb.addWorksheet('Buildings'); head(s2, [['Building', 28], ['Occupancy %', 12], ['Rent budget', 14], ['Rent actual', 14], ['Collection %', 12], ['Cash received', 14], ['Maint. budget', 14], ['Maint. actual', 14], ['NOI', 14], ['Vacancy loss', 14]]);
    d.buildings.forEach((b: any) => { const row = s2.addRow([b.name, b.occupancy, Number(b.budgetVsActual.rentalIncome.budget), Number(b.rentBilled), b.collectionRate ?? '', Number(b.cashReceived), Number(b.budgetVsActual.maintenance.budget), Number(b.maintenance), Number(b.noi), Number(b.vacancyLoss)]); [3, 4, 6, 7, 8, 9, 10].forEach((i) => (row.getCell(i).numFmt = OMR)); });
    const s3 = wb.addWorksheet('Monthly'); head(s3, [['Month', 10], ['Rent', 14], ['Rent budget', 14], ['Billed incl. VAT', 15], ['Collected', 14], ['Cash', 14], ['Collection budget', 16], ['Maintenance', 14], ['Maint. budget', 14], ['Occupancy %', 12]]);
    d.monthly.forEach((m: any) => { const row = s3.addRow([m.month, Number(m.rent), Number(m.budgetRent), Number(m.billed), Number(m.collected), Number(m.cash), Number(m.budgetCollection), Number(m.maintenance), Number(m.budgetMaintenance), m.occupancy]); [2, 3, 4, 5, 6, 7, 8, 9].forEach((i) => (row.getCell(i).numFmt = OMR)); });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${config.brandName.replace(/[^A-Za-z0-9]+/g, '_')}_Executive_${r.from}_to_${r.to}.xlsx"`);
    await wb.xlsx.write(res); res.end();
  }
}
