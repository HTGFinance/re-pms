import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { DataSource } from 'typeorm';
import { Payment, PaymentMethod, PaymentStatus, Role } from '../../database/entities';
import { assertTenantAccess, AuthUser, CurrentUser, Roles, tenantScopeSql } from '../../common/auth';
import { NumberingService } from '../../common/numbering.service';
import { omr, toBaisa } from '../../common/money';
import { todayOman } from '../../common/dates';

const MANUAL = [PaymentMethod.CASH, PaymentMethod.BANK_TRANSFER, PaymentMethod.CARD];
class RecordDto {
  @IsUUID() tenantId: string; @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string; @Matches(/^\d+(\.\d{1,3})?$/) amount: string;
  @IsEnum(PaymentMethod) method: PaymentMethod; @IsString() @MaxLength(100) reference: string; @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
class RejectDto { @IsString() @MaxLength(300) reason: string }
/** Roles that may verify or reject payments (ADMIN is always allowed by the guard). */
export const VERIFIERS = [Role.FINANCE];

@Controller('payments')
export class PaymentsController {
  constructor(private ds: DataSource, private num: NumberingService) {}

  @Get() @Roles(Role.FINANCE, Role.RECOVERY, Role.PROPERTY_MANAGER, Role.EXECUTIVE)
  async list(@CurrentUser() u: AuthUser, @Query('status') status?: string, @Query('tenantId') tenantId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const p: unknown[] = []; const w = [tenantScopeSql(u, 'p.tenant_id', p)];
    const add = (sql: string, v: unknown) => { p.push(v); w.push(sql.replace('?', '$' + p.length)); };
    if (status) add('p.status = ?', status); if (tenantId) add('p.tenant_id = ?', tenantId); if (from) add('p.date >= ?', from); if (to) add('p.date <= ?', to);
    const rows = await this.ds.query(`
      SELECT p.*, t.name AS tenant_name, t.tenant_no, ru.name AS recorded_by_name, vu.name AS verified_by_name
      FROM payments p JOIN tenants t ON t.id=p.tenant_id LEFT JOIN users ru ON ru.id=p.recorded_by LEFT JOIN users vu ON vu.id=p.verified_by
      WHERE ${w.join(' AND ')} ORDER BY p.date DESC, p.receipt_no DESC LIMIT 1000`, p);
    return rows.map((r: any) => ({ id: r.id, receiptNo: r.receipt_no, date: r.date, amount: omr(r.amount), method: r.method, reference: r.reference, status: r.status, notes: r.notes,
      rejectReason: r.reject_reason, chequeId: r.cheque_id, tenant: { id: r.tenant_id, name: r.tenant_name, tenantNo: r.tenant_no },
      recordedBy: r.recorded_by_name, verifiedBy: r.verified_by_name, verifiedAt: r.verified_at,
      canVerify: r.status === 'Pending' && r.recorded_by !== u.id && (u.role === Role.ADMIN || VERIFIERS.includes(u.role)) }));
  }

  /** Record a cash / transfer / card receipt. It stays Pending until a different, authorised person verifies it. */
  @Post() @Roles(Role.RECOVERY, Role.FINANCE, Role.PROPERTY_MANAGER)
  async record(@CurrentUser() u: AuthUser, @Body() d: RecordDto) {
    if (!MANUAL.includes(d.method)) throw new BadRequestException(`Use ${MANUAL.join(', ')}. Cheques go in the cheque register; gateway payments arrive automatically.`);
    if (toBaisa(d.amount) <= 0) throw new BadRequestException('Amount must be more than zero');
    if (d.date > todayOman()) throw new BadRequestException('Payment date cannot be in the future');
    await assertTenantAccess(this.ds, u, d.tenantId);
    if (d.reference && (await this.ds.query(`SELECT 1 FROM payments WHERE tenant_id=$1 AND reference=$2 AND method=$3 AND status<>'Rejected' LIMIT 1`, [d.tenantId, d.reference, d.method])).length)
      throw new ConflictException('This reference is already recorded for the tenant');
    return this.ds.transaction(async (em) => em.save(Payment, em.create(Payment, {
      receiptNo: await this.num.next(em, 'receipt', 'RCP-', 5), tenantId: d.tenantId, date: d.date, amount: omr(d.amount), method: d.method,
      reference: d.reference, notes: d.notes ?? '', status: PaymentStatus.PENDING, recordedBy: u.id })));
  }

  private async load(id: string) { const p = await this.ds.getRepository(Payment).findOneBy({ id }); if (!p) throw new NotFoundException(); return p; }

  /** Maker-checker: finance verifies against the bank statement / cash count. The recorder cannot verify their own entry. */
  @Post(':id/verify') @HttpCode(200) @Roles(...VERIFIERS)
  async verify(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const p = await this.load(id); await assertTenantAccess(this.ds, u, p.tenantId);
    if (p.status !== PaymentStatus.PENDING) throw new ConflictException(`Payment is already ${p.status}`);
    if (p.recordedBy === u.id) throw new ForbiddenException('You recorded this payment; a different person must verify it');
    await this.ds.getRepository(Payment).update(id, { status: PaymentStatus.VERIFIED, verifiedBy: u.id, verifiedAt: new Date() });
    return this.load(id);
  }

  @Post(':id/reject') @HttpCode(200) @Roles(...VERIFIERS)
  async reject(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: RejectDto) {
    const p = await this.load(id); await assertTenantAccess(this.ds, u, p.tenantId);
    if (p.status !== PaymentStatus.PENDING) throw new ConflictException(`Payment is already ${p.status}`);
    if (p.recordedBy === u.id) throw new ForbiddenException('You recorded this payment; a different person must review it');
    await this.ds.getRepository(Payment).update(id, { status: PaymentStatus.REJECTED, verifiedBy: u.id, verifiedAt: new Date(), rejectReason: d.reason });
    return this.load(id);
  }

  /** Receipt data for printing (verified payments only). */
  @Get(':id/receipt') @Roles(Role.FINANCE, Role.RECOVERY, Role.PROPERTY_MANAGER, Role.TENANT)
  async receipt(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const p = await this.load(id); await assertTenantAccess(this.ds, u, p.tenantId);
    if (p.status !== PaymentStatus.VERIFIED) throw new ConflictException('A receipt is issued only for verified payments');
    const [t] = await this.ds.query(`SELECT t.name, t.tenant_no, un.unit_no, b.name AS building FROM tenants t
      LEFT JOIN LATERAL (SELECT unit_id FROM contracts WHERE tenant_id=t.id ORDER BY (status='Active') DESC, start_date DESC LIMIT 1) c ON TRUE
      LEFT JOIN units un ON un.id=c.unit_id LEFT JOIN buildings b ON b.id=un.building_id WHERE t.id=$1`, [p.tenantId]);
    return { receiptNo: p.receiptNo, date: p.date, amount: omr(p.amount), method: p.method, reference: p.reference, tenant: t, verifiedAt: p.verifiedAt };
  }
}
