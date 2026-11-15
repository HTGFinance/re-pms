import { config } from '../../config';
import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';
import { Response } from 'express';
import ExcelJS from 'exceljs';
import { DataSource, EntityManager } from 'typeorm';
import { ApprovalStatus, Complaint, CostClass, LedgerCharge, MaintenanceCost, Role } from '../../database/entities';
import { AuthUser, buildingScope, CurrentUser, Roles } from '../../common/auth';
import { NumberingService } from '../../common/numbering.service';
import { NotifyService } from '../../common/notify.service';
import { addOmr, fromBaisa, omr, toBaisa } from '../../common/money';
import { addMonths, daysBetween, todayOman } from '../../common/dates';
import { ComplaintsService } from '../complaints/complaints.service';

const DATE = /^\d{4}-\d{2}-\d{2}$/; const AMT = /^\d+(\.\d{1,3})?$/;
/** Costs above this total (OMR) need management approval. */
export const APPROVAL_LIMIT = Number(process.env.MAINTENANCE_APPROVAL_LIMIT || '200');
const RECORDERS = [Role.MAINTENANCE_SUPERVISOR, Role.PROPERTY_MANAGER, Role.TECHNICIAN];
const APPROVERS = [Role.PROPERTY_MANAGER, Role.FINANCE];
const VIEWERS = [Role.MAINTENANCE_SUPERVISOR, Role.PROPERTY_MANAGER, Role.FINANCE, Role.EXECUTIVE];

class CostDto {
  @Matches(DATE) workDate: string; @IsOptional() @IsUUID() technicianId?: string;
  @IsOptional() @Matches(AMT) material?: string; @IsOptional() @Matches(AMT) labour?: string; @IsOptional() @Matches(AMT) contractor?: string;
  @IsOptional() @IsString() @MaxLength(150) contractorName?: string; @IsOptional() @Matches(AMT) other?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string; @IsEnum(CostClass) classification: CostClass;
}
class CostUpdateDto {
  @IsOptional() @Matches(DATE) workDate?: string; @IsOptional() @ValidateIf((o) => o.technicianId !== null) @IsUUID() technicianId?: string | null;
  @IsOptional() @Matches(AMT) material?: string; @IsOptional() @Matches(AMT) labour?: string; @IsOptional() @Matches(AMT) contractor?: string;
  @IsOptional() @IsString() @MaxLength(150) contractorName?: string; @IsOptional() @Matches(AMT) other?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string; @IsOptional() @IsEnum(CostClass) classification?: CostClass;
}
class ApproveDto { @IsOptional() @IsEnum(CostClass) classification?: CostClass }
class RejectDto { @IsString() @MaxLength(300) reason: string }

/** Why a cost needs approval ('' = it does not). */
export function approvalReason(classification: CostClass, total: string): string {
  const r: string[] = [];
  if (classification === CostClass.PENDING) r.push('responsibility to be decided');
  if (classification === CostClass.RECOVERABLE) r.push('will be charged to the tenant');
  if (toBaisa(total) > APPROVAL_LIMIT * 1000) r.push(`above OMR ${APPROVAL_LIMIT}`);
  return r.join('; ');
}
const SPENT = `approval_status IN ('Not needed','Approved')`;

@Controller()
export class MaintenanceController {
  constructor(private ds: DataSource, private complaints: ComplaintsService, private num: NumberingService, private notify: NotifyService) {}

  private async job(u: AuthUser, complaintId: string) {
    const c = await this.complaints.get(complaintId);
    const s = buildingScope(u); if (s && !s.includes(c.buildingId)) throw new ForbiddenException('Job is outside your assigned buildings');
    if (u.role === Role.TECHNICIAN && c.assignedTo !== u.id) throw new ForbiddenException('This job is not assigned to you');
    return c;
  }
  private async cost(u: AuthUser, id: string) {
    const k = await this.ds.getRepository(MaintenanceCost).findOneBy({ id }); if (!k) throw new NotFoundException('Cost not found');
    const s = buildingScope(u); if (s && !s.includes(k.buildingId) && ![Role.FINANCE, Role.ADMIN, Role.EXECUTIVE].includes(u.role)) throw new ForbiddenException();
    return k;
  }
  private shape(k: any) {
    return { id: k.id, complaintId: k.complaint_id ?? k.complaintId, workDate: k.work_date ?? k.workDate, technician: (k.technician_id ?? k.technicianId) ? { id: k.technician_id ?? k.technicianId, name: k.technician_name } : null,
      material: omr(k.material), labour: omr(k.labour), contractor: omr(k.contractor), contractorName: k.contractor_name ?? k.contractorName, other: omr(k.other), total: omr(k.total),
      description: k.description, classification: k.classification, approvalStatus: k.approval_status ?? k.approvalStatus, approvalReason: k.approval_reason ?? k.approvalReason,
      rejectReason: k.reject_reason ?? k.rejectReason, recordedBy: k.recorded_by_name, approvedBy: k.approved_by_name, approvedAt: k.approved_at ?? k.approvedAt, chargeId: k.charge_id ?? k.chargeId,
      refNo: k.ref_no, unit: k.unit_label, recordedById: k.recorded_by ?? k.recordedBy };
  }
  private costSql(where: string) {
    return `SELECT k.*, c.ref_no, COALESCE(b.name || ' ' || un.unit_no, b.name) AS unit_label, tu.name AS technician_name, ru.name AS recorded_by_name, au.name AS approved_by_name
      FROM maintenance_costs k JOIN complaints c ON c.id=k.complaint_id JOIN buildings b ON b.id=k.building_id LEFT JOIN units un ON un.id=k.unit_id
      LEFT JOIN users tu ON tu.id=k.technician_id LEFT JOIN users ru ON ru.id=k.recorded_by LEFT JOIN users au ON au.id=k.approved_by WHERE ${where}`;
  }
  private totals(d: { material?: string; labour?: string; contractor?: string; other?: string }) {
    const t = addOmr(d.material || 0, d.labour || 0, d.contractor || 0, d.other || 0);
    if (toBaisa(t) <= 0) throw new BadRequestException('Enter at least one amount (material, labour, contractor or other)');
    return t;
  }

  // ---------- costs on a job ----------
  @Get('complaints/:id/costs') @Roles(...RECORDERS, Role.FINANCE, Role.EXECUTIVE)
  async list(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    if (u.role !== Role.FINANCE) await this.job(u, id);
    const rows = await this.ds.query(this.costSql('k.complaint_id = $1') + ' ORDER BY k.work_date, k.created_at', [id]);
    const items = rows.map((r: any) => this.shape(r));
    const sumOf = (st: string[]) => fromBaisa(rows.filter((r: any) => st.includes(r.approval_status)).reduce((s: number, r: any) => s + toBaisa(r.total), 0));
    return { items, total: sumOf(['Not needed', 'Approved']), pending: sumOf(['Pending']), approvalLimit: APPROVAL_LIMIT };
  }

  @Post('complaints/:id/costs') @Roles(...RECORDERS)
  async add(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: CostDto) {
    const c = await this.job(u, id);
    if (d.workDate > todayOman()) throw new BadRequestException('Work date cannot be in the future');
    if (d.classification === CostClass.RECOVERABLE && !c.tenantId) throw new BadRequestException('This job has no tenant, so the cost cannot be recovered from a tenant');
    const total = this.totals(d); const reason = approvalReason(d.classification, total);
    const k = await this.ds.getRepository(MaintenanceCost).save(this.ds.getRepository(MaintenanceCost).create({
      complaintId: id, buildingId: c.buildingId, unitId: c.unitId, tenantId: c.tenantId, workDate: d.workDate, technicianId: d.technicianId ?? c.assignedTo ?? (u.role === Role.TECHNICIAN ? u.id : null),
      material: omr(d.material || 0), labour: omr(d.labour || 0), contractor: omr(d.contractor || 0), contractorName: d.contractorName ?? '', other: omr(d.other || 0), total,
      description: d.description ?? '', classification: d.classification, approvalStatus: reason ? ApprovalStatus.PENDING : ApprovalStatus.NOT_NEEDED, approvalReason: reason, recordedBy: u.id }));
    return this.shape({ ...k, approval_status: k.approvalStatus });
  }

  @Patch('maintenance-costs/:id') @Roles(...RECORDERS)
  async update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: CostUpdateDto) {
    const k = await this.cost(u, id); const c = await this.job(u, k.complaintId);
    if (k.approvalStatus === ApprovalStatus.APPROVED || k.chargeId) throw new ConflictException('Approved costs cannot be changed; record a correcting entry instead');
    if (u.role === Role.TECHNICIAN && k.recordedBy !== u.id) throw new ForbiddenException('You can change only costs you recorded');
    Object.assign(k, d);
    for (const f of ['material', 'labour', 'contractor', 'other'] as const) if (d[f] !== undefined) k[f] = omr(d[f]!);
    if (k.classification === CostClass.RECOVERABLE && !c.tenantId) throw new BadRequestException('This job has no tenant to recover the cost from');
    k.total = this.totals(k); const reason = approvalReason(k.classification, k.total);
    k.approvalReason = reason; k.approvalStatus = reason ? ApprovalStatus.PENDING : ApprovalStatus.NOT_NEEDED; k.rejectReason = ''; k.approvedBy = null; k.approvedAt = null;
    await this.ds.getRepository(MaintenanceCost).save(k); return this.shape({ ...k, approval_status: k.approvalStatus });
  }

  @Delete('maintenance-costs/:id') @Roles(...RECORDERS)
  async remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const k = await this.cost(u, id); await this.job(u, k.complaintId);
    if (k.approvalStatus === ApprovalStatus.APPROVED || k.chargeId) throw new ConflictException('Approved costs cannot be deleted');
    if (u.role === Role.TECHNICIAN && k.recordedBy !== u.id) throw new ForbiddenException('You can delete only costs you recorded');
    await this.ds.getRepository(MaintenanceCost).delete(id); return { ok: true };
  }

  // ---------- approvals ----------
  @Get('maintenance-costs') @Roles(...VIEWERS)
  async queue(@CurrentUser() u: AuthUser, @Query('approval') approval?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const p: unknown[] = []; const w = ['TRUE'];
    const s = buildingScope(u); if (s) { p.push(s); w.push(`k.building_id = ANY($${p.length})`); }
    if (approval) { p.push(approval); w.push(`k.approval_status = $${p.length}`); }
    if (from) { p.push(from); w.push(`k.work_date >= $${p.length}`); } if (to) { p.push(to); w.push(`k.work_date <= $${p.length}`); }
    const rows = await this.ds.query(this.costSql(w.join(' AND ')) + ' ORDER BY k.work_date DESC LIMIT 2000', p);
    return rows.map((r: any) => ({ ...this.shape(r), canApprove: r.approval_status === 'Pending' && r.recorded_by !== u.id && (u.role === Role.ADMIN || APPROVERS.includes(u.role)) }));
  }

  /** Approve a cost (approver ≠ recorder). Recoverable costs are charged to the tenant's ledger. */
  @Post('maintenance-costs/:id/approve') @HttpCode(200) @Roles(...APPROVERS)
  async approve(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: ApproveDto) {
    const k = await this.cost(u, id);
    if (k.approvalStatus !== ApprovalStatus.PENDING) throw new ConflictException(`Cost is ${k.approvalStatus.toLowerCase()}, not pending`);
    if (k.recordedBy === u.id) throw new ForbiddenException('You recorded this cost; a different person must approve it');
    const final = d.classification ?? k.classification;
    if (final === CostClass.PENDING) throw new BadRequestException('Choose who bears the cost: company, tenant, or recoverable from tenant');
    if (final === CostClass.RECOVERABLE && !k.tenantId) throw new BadRequestException('This job has no tenant to recover the cost from');
    const c = await this.complaints.get(k.complaintId);
    await this.ds.transaction(async (em: EntityManager) => {
      k.classification = final; k.approvalStatus = ApprovalStatus.APPROVED; k.approvedBy = u.id; k.approvedAt = new Date();
      if (final === CostClass.RECOVERABLE) {
        const ch = await em.save(LedgerCharge, em.create(LedgerCharge, { chargeNo: await this.num.next(em, 'charge', 'CHG-'), tenantId: k.tenantId!, date: k.workDate, amount: k.total,
          kind: 'Maintenance', description: `Recoverable maintenance — ${c.refNo} (${c.subcategory})${k.description ? ': ' + k.description.slice(0, 120) : ''}` }));
        k.chargeId = ch.id;
        await this.notify.tenant(k.tenantId!, 'Maintenance charge added', `A charge of ${omr(k.total)} for complaint ${c.refNo} (${c.subcategory}) has been added to your account.`, '/t/pay', em);
      }
      await em.save(MaintenanceCost, k);
    });
    return this.shape({ ...k, approval_status: k.approvalStatus });
  }

  @Post('maintenance-costs/:id/reject') @HttpCode(200) @Roles(...APPROVERS)
  async reject(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: RejectDto) {
    const k = await this.cost(u, id);
    if (k.approvalStatus !== ApprovalStatus.PENDING) throw new ConflictException(`Cost is ${k.approvalStatus.toLowerCase()}, not pending`);
    if (k.recordedBy === u.id) throw new ForbiddenException('You recorded this cost; a different person must review it');
    k.approvalStatus = ApprovalStatus.REJECTED; k.rejectReason = d.reason; k.approvedBy = u.id; k.approvedAt = new Date();
    await this.ds.getRepository(MaintenanceCost).save(k); return this.shape({ ...k, approval_status: k.approvalStatus });
  }

  // ---------- dashboard ----------
  private range(from?: string, to?: string) {
    const t = todayOman(); const f = from && DATE.test(from) ? from : t.slice(0, 8) + '01'; const e = to && DATE.test(to) ? to : t;
    if (f > e) throw new BadRequestException('"from" is after "to"'); return { from: f, to: e };
  }
  private scope(u: AuthUser, buildingId: string | undefined, col: string, p: unknown[]) {
    const w: string[] = []; const s = buildingScope(u);
    if (s) { p.push(s); w.push(`${col} = ANY($${p.length})`); } if (buildingId) { p.push(buildingId); w.push(`${col} = $${p.length}`); }
    return w.length ? w.join(' AND ') : 'TRUE';
  }

  @Get('maintenance/dashboard') @Roles(...VIEWERS)
  async dashboard(@CurrentUser() u: AuthUser, @Query('from') qf?: string, @Query('to') qt?: string, @Query('buildingId') buildingId?: string) {
    const { from, to } = this.range(qf, qt); const p: unknown[] = [from, to]; const sc = this.scope(u, buildingId, 'c.building_id', p);
    const open = `c.status IN ('New','Reviewed','Technician assigned','Work in progress','Awaiting materials / approval')`;
    const [k] = await this.ds.query(`SELECT
      COUNT(*) FILTER (WHERE c.created_at::date BETWEEN $1 AND $2)::int AS received,
      COUNT(*) FILTER (WHERE c.completed_at::date BETWEEN $1 AND $2)::int AS completed,
      COUNT(*) FILTER (WHERE c.status='New')::int AS new_now, COUNT(*) FILTER (WHERE ${open})::int AS open_now,
      COUNT(*) FILTER (WHERE c.status IN ('Work in progress','Awaiting materials / approval'))::int AS wip_now,
      COUNT(*) FILTER (WHERE c.status='Tenant confirmation pending')::int AS awaiting_tenant,
      COUNT(*) FILTER (WHERE ${open} AND c.expected_date < CURRENT_DATE)::int AS overdue_now,
      ROUND((AVG(EXTRACT(EPOCH FROM (c.completed_at - c.created_at))/86400) FILTER (WHERE c.completed_at::date BETWEEN $1 AND $2))::numeric, 1) AS avg_days,
      ROUND((AVG(c.tenant_rating) FILTER (WHERE c.closed_at::date BETWEEN $1 AND $2))::numeric, 1) AS avg_rating,
      COUNT(*) FILTER (WHERE c.reopen_count > 0 AND c.completed_at::date BETWEEN $1 AND $2)::int AS reopened
      FROM complaints c WHERE c.status <> 'Cancelled' AND ${sc}`, p);
    const pk: unknown[] = [from, to]; const sk = this.scope(u, buildingId, 'k.building_id', pk);
    const cls = await this.ds.query(`SELECT classification, COALESCE(SUM(total),0) AS amt, COUNT(*)::int AS n FROM maintenance_costs k WHERE ${SPENT} AND k.work_date BETWEEN $1 AND $2 AND ${sk} GROUP BY classification`, pk);
    const pp: unknown[] = []; const spp = this.scope(u, buildingId, 'k.building_id', pp); // awaiting approval now (any date)
    const [pend] = await this.ds.query(`SELECT COALESCE(SUM(total),0) AS amt, COUNT(*)::int AS n FROM maintenance_costs k WHERE approval_status='Pending' AND ${spp}`, pp);
    const [split] = await this.ds.query(`SELECT COALESCE(SUM(material),0) AS material, COALESCE(SUM(labour),0) AS labour, COALESCE(SUM(contractor),0) AS contractor, COALESCE(SUM(other),0) AS other, COALESCE(SUM(total),0) AS total
      FROM maintenance_costs k WHERE ${SPENT} AND k.work_date BETWEEN $1 AND $2 AND ${sk}`, pk);
    // budget for the period (monthly budgets pro-rated by days)
    const pb: unknown[] = []; const sb = this.scope(u, buildingId, 'building_id', pb);
    const budgets = await this.ds.query(`SELECT period, SUM(maintenance) AS m FROM budgets WHERE ${sb} GROUP BY period`, pb);
    let budget = 0;
    const upTo = to < todayOman() ? to : todayOman(); // budget counted only up to today, like actual spend
    for (const r of budgets) { const ms = r.period + '-01', me = addMonths(ms, 1); const dim = daysBetween(ms, me); const monthEnd = new Date(Date.parse(me + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);
      const a = from > ms ? from : ms; const end = upTo < monthEnd ? upTo : monthEnd; if (a > end) continue; budget += toBaisa(r.m) * (daysBetween(a, end) + 1) / dim; }
    // 12-month trend ending at "to"
    const start = addMonths(to.slice(0, 8) + '01', -11);
    const pt: unknown[] = [start, to]; const st = this.scope(u, buildingId, 'k.building_id', pt);
    const costM = await this.ds.query(`SELECT to_char(work_date,'YYYY-MM') AS m, SUM(total) AS amt FROM maintenance_costs k WHERE ${SPENT} AND work_date BETWEEN $1 AND $2 AND ${st} GROUP BY 1`, pt);
    const pc: unknown[] = [start, to]; const scc = this.scope(u, buildingId, 'c.building_id', pc);
    const recM = await this.ds.query(`SELECT to_char(created_at AT TIME ZONE 'Asia/Muscat','YYYY-MM') AS m, COUNT(*)::int AS n FROM complaints c WHERE status<>'Cancelled' AND (created_at AT TIME ZONE 'Asia/Muscat')::date BETWEEN $1 AND $2 AND ${scc} GROUP BY 1`, pc);
    const doneM = await this.ds.query(`SELECT to_char(completed_at AT TIME ZONE 'Asia/Muscat','YYYY-MM') AS m, COUNT(*)::int AS n FROM complaints c WHERE completed_at IS NOT NULL AND (completed_at AT TIME ZONE 'Asia/Muscat')::date BETWEEN $1 AND $2 AND ${scc} GROUP BY 1`, pc);
    const months = Array.from({ length: 12 }, (_, i) => addMonths(start, i).slice(0, 7));
    const pick = (rows: any[], m: string, f: string) => rows.find((r) => r.m === m)?.[f] ?? 0;
    const trend = months.map((m) => ({ month: m, cost: omr(pick(costM, m, 'amt')), received: pick(recM, m, 'n'), completed: pick(doneM, m, 'n') }));
    // by building
    const p2: unknown[] = [from, to]; const s2 = this.scope(u, buildingId, 'b.id', p2);
    const byB = await this.ds.query(`SELECT b.id, b.name,
      (SELECT COUNT(*) FROM complaints c WHERE c.building_id=b.id AND c.status<>'Cancelled' AND c.created_at::date BETWEEN $1 AND $2)::int AS received,
      (SELECT COUNT(*) FROM complaints c WHERE c.building_id=b.id AND ${open})::int AS open_now,
      (SELECT COALESCE(SUM(total),0) FROM maintenance_costs k WHERE k.building_id=b.id AND ${SPENT} AND k.work_date BETWEEN $1 AND $2) AS cost,
      (SELECT COALESCE(SUM(total),0) FROM maintenance_costs k WHERE k.building_id=b.id AND ${SPENT} AND k.work_date BETWEEN $1 AND $2 AND k.classification='Company responsibility') AS company_cost,
      (SELECT COUNT(*) FROM units un WHERE un.building_id=b.id AND un.is_active)::int AS units
      FROM buildings b WHERE b.is_active AND ${s2} ORDER BY b.name`, p2);
    // by category
    const p3: unknown[] = [from, to]; const s3 = this.scope(u, buildingId, 'c.building_id', p3);
    const byC = await this.ds.query(`SELECT c.category, COUNT(*)::int AS n, COALESCE(SUM((SELECT SUM(total) FROM maintenance_costs k WHERE k.complaint_id=c.id AND ${SPENT})),0) AS cost
      FROM complaints c WHERE c.status<>'Cancelled' AND c.created_at::date BETWEEN $1 AND $2 AND ${s3} GROUP BY c.category ORDER BY n DESC`, p3);
    // technicians
    const p4: unknown[] = [from, to]; const s4 = this.scope(u, buildingId, 'c.building_id', p4);
    const tech = await this.ds.query(`SELECT us.id, us.name, us.role,
      COUNT(c.id) FILTER (WHERE c.created_at::date BETWEEN $1 AND $2 OR ${open})::int AS assigned,
      COUNT(c.id) FILTER (WHERE c.completed_at::date BETWEEN $1 AND $2)::int AS completed,
      COUNT(c.id) FILTER (WHERE ${open})::int AS open_now,
      COUNT(c.id) FILTER (WHERE ${open} AND c.expected_date < CURRENT_DATE)::int AS overdue_now,
      ROUND((AVG(EXTRACT(EPOCH FROM (c.completed_at - c.created_at))/86400) FILTER (WHERE c.completed_at::date BETWEEN $1 AND $2))::numeric, 1) AS avg_days,
      COUNT(c.id) FILTER (WHERE c.completed_at::date BETWEEN $1 AND $2 AND c.expected_date IS NOT NULL AND (c.completed_at AT TIME ZONE 'Asia/Muscat')::date <= c.expected_date)::int AS on_time,
      ROUND((AVG(c.tenant_rating) FILTER (WHERE c.closed_at::date BETWEEN $1 AND $2))::numeric, 1) AS rating,
      COUNT(c.id) FILTER (WHERE c.reopen_count > 0 AND c.completed_at::date BETWEEN $1 AND $2)::int AS reopened,
      (SELECT COALESCE(SUM(total),0) FROM maintenance_costs k WHERE k.technician_id=us.id AND ${SPENT} AND k.work_date BETWEEN $1 AND $2) AS cost
      FROM users us LEFT JOIN complaints c ON c.assigned_to=us.id AND c.status<>'Cancelled' AND ${s4}
      WHERE us.role IN ('TECHNICIAN','MAINTENANCE_SUPERVISOR') AND us.is_active GROUP BY us.id ORDER BY completed DESC, us.name`, p4);
    const spent = cls.reduce((s: number, r: any) => s + toBaisa(r.amt), 0);
    return { from, to, approvalLimit: APPROVAL_LIMIT,
      kpis: { received: k.received, completed: k.completed, newNow: k.new_now, openNow: k.open_now, wipNow: k.wip_now, awaitingTenant: k.awaiting_tenant, overdueNow: k.overdue_now,
        avgResolutionDays: k.avg_days === null ? null : Number(k.avg_days), avgRating: k.avg_rating === null ? null : Number(k.avg_rating), reopened: k.reopened },
      spend: { total: fromBaisa(spent), budget: fromBaisa(Math.round(budget)), pendingApproval: omr(pend?.amt ?? 0), pendingCount: pend?.n ?? 0,
        byClass: Object.values(CostClass).filter((c) => c !== CostClass.PENDING).map((c) => ({ classification: c, amount: omr(cls.find((r: any) => r.classification === c)?.amt ?? 0) })),
        split: { material: omr(split.material), labour: omr(split.labour), contractor: omr(split.contractor), other: omr(split.other) } },
      trend,
      buildings: byB.map((b: any) => ({ id: b.id, name: b.name, units: b.units, received: b.received, openNow: b.open_now, cost: omr(b.cost), companyCost: omr(b.company_cost), costPerUnit: b.units ? fromBaisa(Math.round(toBaisa(b.cost) / b.units)) : '0.000' })),
      categories: byC.map((c: any) => ({ category: c.category, count: c.n, cost: omr(c.cost) })),
      technicians: tech.map((t: any) => ({ id: t.id, name: t.name, role: t.role, assigned: t.assigned, completed: t.completed, openNow: t.open_now, overdueNow: t.overdue_now,
        avgDays: t.avg_days === null ? null : Number(t.avg_days), onTimeRate: t.completed ? Math.round((t.on_time / t.completed) * 100) : null, rating: t.rating === null ? null : Number(t.rating), reopened: t.reopened, cost: omr(t.cost) })) };
  }

  /** Maintenance history for a building or a unit: every job with its total cost. */
  @Get('maintenance/history') @Roles(...VIEWERS)
  async history(@CurrentUser() u: AuthUser, @Query('buildingId') buildingId?: string, @Query('unitId') unitId?: string) {
    if (!buildingId && !unitId) throw new BadRequestException('Give buildingId or unitId');
    const p: unknown[] = []; const w = [this.scope(u, buildingId, 'c.building_id', p)];
    if (unitId) { p.push(unitId); w.push(`c.unit_id = $${p.length}`); }
    const rows = await this.ds.query(`SELECT c.id, c.ref_no, c.created_at, c.completed_at, c.status, c.category, c.subcategory, c.title, c.tenant_rating, un.unit_no, t.name AS tenant_name, au.name AS assigned_name,
      COALESCE((SELECT SUM(total) FROM maintenance_costs k WHERE k.complaint_id=c.id AND ${SPENT}),0) AS cost,
      COALESCE((SELECT SUM(total) FROM maintenance_costs k WHERE k.complaint_id=c.id AND ${SPENT} AND k.classification='Recoverable from tenant'),0) AS recovered
      FROM complaints c LEFT JOIN units un ON un.id=c.unit_id LEFT JOIN tenants t ON t.id=c.tenant_id LEFT JOIN users au ON au.id=c.assigned_to
      WHERE ${w.join(' AND ')} ORDER BY c.created_at DESC LIMIT 2000`, p);
    const jobs = rows.map((r: any) => ({ id: r.id, refNo: r.ref_no, reportedAt: r.created_at, completedAt: r.completed_at, status: r.status, category: r.category, subcategory: r.subcategory, title: r.title,
      unit: r.unit_no || 'Common area', tenant: r.tenant_name, technician: r.assigned_name, rating: r.tenant_rating, cost: omr(r.cost), recovered: omr(r.recovered) }));
    const byUnit = new Map<string, { unit: string; jobs: number; cost: number }>();
    for (const j of jobs) { const e = byUnit.get(j.unit) ?? { unit: j.unit, jobs: 0, cost: 0 }; e.jobs++; e.cost += toBaisa(j.cost); byUnit.set(j.unit, e); }
    return { jobs, units: [...byUnit.values()].sort((a, b) => b.cost - a.cost).map((x) => ({ unit: x.unit, jobs: x.jobs, cost: fromBaisa(x.cost) })), total: fromBaisa(jobs.reduce((s: number, j: any) => s + toBaisa(j.cost), 0)) };
  }

  /** Monthly maintenance performance report as an Excel workbook. */
  @Get('maintenance/report.xlsx') @Roles(...VIEWERS)
  async report(@CurrentUser() u: AuthUser, @Res() res: Response, @Query('from') qf?: string, @Query('to') qt?: string, @Query('buildingId') buildingId?: string) {
    const d = await this.dashboard(u, qf, qt, buildingId); const { from, to } = d;
    const p: unknown[] = [from, to]; const sc = this.scope(u, buildingId, 'c.building_id', p);
    const jobs = await this.ds.query(`SELECT c.ref_no, c.created_at, c.completed_at, c.closed_at, b.name AS building, un.unit_no, t.name AS tenant, c.category, c.subcategory, c.title, c.priority, c.status, au.name AS technician, c.expected_date, c.tenant_rating, c.reopen_count,
      COALESCE((SELECT SUM(total) FROM maintenance_costs k WHERE k.complaint_id=c.id AND ${SPENT}),0) AS cost
      FROM complaints c JOIN buildings b ON b.id=c.building_id LEFT JOIN units un ON un.id=c.unit_id LEFT JOIN tenants t ON t.id=c.tenant_id LEFT JOIN users au ON au.id=c.assigned_to
      WHERE (c.created_at::date BETWEEN $1 AND $2 OR c.completed_at::date BETWEEN $1 AND $2) AND ${sc} ORDER BY c.created_at`, p);
    const pk: unknown[] = [from, to]; const sk = this.scope(u, buildingId, 'k.building_id', pk);
    const costs = await this.ds.query(this.costSql(`k.work_date BETWEEN $1 AND $2 AND ${sk}`) + ' ORDER BY k.work_date', pk);
    const wb = new ExcelJS.Workbook(); wb.creator = config.brandName;
    const head = (ws: ExcelJS.Worksheet, cols: [string, number][]) => { ws.columns = cols.map(([h, w]) => ({ header: h, width: w })); const r = ws.getRow(1); r.font = { bold: true, color: { argb: 'FFFFFFFF' } }; r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } }; ws.views = [{ state: 'frozen', ySplit: 1 }]; };
    const OMR = '#,##0.000';
    const s1 = wb.addWorksheet('Summary'); s1.columns = [{ width: 38 }, { width: 18 }];
    s1.addRow([`Maintenance performance report ${from} to ${to}`]).font = { bold: true, size: 14 }; s1.addRow([]);
    const kp = d.kpis; const sp = d.spend;
    ([['Complaints received', kp.received], ['Completed', kp.completed], ['Open now', kp.openNow], ['New (not yet reviewed)', kp.newNow], ['Work in progress now', kp.wipNow], ['Awaiting tenant confirmation', kp.awaitingTenant],
      ['Overdue now', kp.overdueNow], ['Average resolution (days)', kp.avgResolutionDays ?? '—'], ['Average tenant rating (1–5)', kp.avgRating ?? '—'], ['Reopened by tenant', kp.reopened], [],
      ['Maintenance spend (OMR)', Number(sp.total)], ['Budget for the period (OMR)', Number(sp.budget)], ['Variance (budget − spend)', Number(sp.budget) - Number(sp.total)], ['Awaiting approval (OMR)', Number(sp.pendingApproval)],
      ...sp.byClass.map((c) => [`  ${c.classification}`, Number(c.amount)]), ['  Material', Number(sp.split.material)], ['  Labour', Number(sp.split.labour)], ['  Contractors', Number(sp.split.contractor)], ['  Other', Number(sp.split.other)]] as any[])
      .forEach((r) => { const row = s1.addRow(r); if (typeof r[1] === 'number' && String(r[0]).match(/OMR|Variance|^  /)) row.getCell(2).numFmt = OMR; });
    const s2 = wb.addWorksheet('Monthly trend'); head(s2, [['Month', 12], ['Received', 12], ['Completed', 12], ['Cost (OMR)', 16]]);
    d.trend.forEach((t) => { s2.addRow([t.month, t.received, t.completed, Number(t.cost)]).getCell(4).numFmt = OMR; });
    const s3 = wb.addWorksheet('Buildings'); head(s3, [['Building', 30], ['Units', 8], ['Received', 10], ['Open now', 10], ['Cost (OMR)', 14], ['Company cost', 14], ['Cost per unit', 14]]);
    d.buildings.forEach((b: any) => { const r = s3.addRow([b.name, b.units, b.received, b.openNow, Number(b.cost), Number(b.companyCost), Number(b.costPerUnit)]); [5, 6, 7].forEach((i) => (r.getCell(i).numFmt = OMR)); });
    const s4 = wb.addWorksheet('Technicians'); head(s4, [['Technician', 26], ['Assigned', 10], ['Completed', 10], ['Open now', 10], ['Overdue now', 11], ['Avg days', 10], ['On time %', 10], ['Rating', 8], ['Reopened', 10], ['Cost (OMR)', 14]]);
    d.technicians.forEach((t: any) => { s4.addRow([t.name, t.assigned, t.completed, t.openNow, t.overdueNow, t.avgDays ?? '', t.onTimeRate ?? '', t.rating ?? '', t.reopened, Number(t.cost)]).getCell(10).numFmt = OMR; });
    const s5 = wb.addWorksheet('Jobs'); head(s5, [['Ref', 12], ['Reported', 12], ['Completed', 12], ['Building', 24], ['Unit', 10], ['Tenant', 24], ['Category', 14], ['Subcategory', 20], ['Title', 30], ['Priority', 9], ['Status', 24], ['Technician', 20], ['Expected', 12], ['Rating', 8], ['Reopened', 9], ['Cost (OMR)', 13]]);
    const dt = (v: any) => (v ? new Date(v).toISOString().slice(0, 10) : '');
    jobs.forEach((j: any) => { s5.addRow([j.ref_no, dt(j.created_at), dt(j.completed_at), j.building, j.unit_no || 'Common area', j.tenant || '', j.category, j.subcategory, j.title, j.priority, j.status, j.technician || '', j.expected_date || '', j.tenant_rating ?? '', j.reopen_count, Number(j.cost)]).getCell(16).numFmt = OMR; });
    const s6 = wb.addWorksheet('Costs'); head(s6, [['Job', 12], ['Work date', 12], ['Building / unit', 26], ['Technician', 20], ['Material', 12], ['Labour', 12], ['Contractor', 12], ['Contractor name', 20], ['Other', 10], ['Total', 12], ['Who bears it', 24], ['Approval', 12], ['Description', 40]]);
    costs.forEach((k: any) => { const r = s6.addRow([k.ref_no, k.work_date, k.unit_label, k.technician_name || '', Number(k.material), Number(k.labour), Number(k.contractor), k.contractor_name, Number(k.other), Number(k.total), k.classification, k.approval_status, k.description]); [5, 6, 7, 9, 10].forEach((i) => (r.getCell(i).numFmt = OMR)); });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${config.brandName.replace(/[^A-Za-z0-9]+/g, '_')}_Maintenance_${from}_to_${to}.xlsx"`);
    await wb.xlsx.write(res); res.end();
  }
}
