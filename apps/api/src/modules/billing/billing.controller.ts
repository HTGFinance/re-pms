import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, BadRequestException } from '@nestjs/common';
import { IsIn, IsNumberString, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { DataSource } from 'typeorm';
import { LedgerCharge, Role } from '../../database/entities';
import { assertTenantAccess, AuthUser, CurrentUser, Roles, tenantScopeSql } from '../../common/auth';
import { NumberingService } from '../../common/numbering.service';
import { omr, toBaisa } from '../../common/money';
import { todayOman } from '../../common/dates';
import { LedgerService } from './ledger.service';

class RunDto { @IsOptional() @Matches(/^\d{4}-\d{2}$/) upTo?: string }
class ChargeDto {
  @IsUUID() tenantId: string; @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string; @Matches(/^-?\d+(\.\d{1,3})?$/) amount: string;
  @IsIn(['Maintenance', 'Fee', 'Utility', 'Penalty', 'Credit note', 'Other']) kind: string; @IsString() @MaxLength(300) description: string;
}
const STAFF = [Role.PROPERTY_MANAGER, Role.FINANCE, Role.RECOVERY, Role.EXECUTIVE];

@Controller()
export class BillingController {
  constructor(private ds: DataSource, private ledger: LedgerService, private num: NumberingService) {}

  /** Generate missing rent invoices up to a month (default: current month). Also runs automatically every hour. */
  @Post('billing/run') @HttpCode(200) @Roles(Role.FINANCE)
  run(@Body() d: RunDto) {
    if (d.upTo && d.upTo > todayOman().slice(0, 7)) throw new BadRequestException('Cannot bill future months');
    return this.ledger.runBilling(d.upTo);
  }

  /** Tenant statement: lines with running balance, open items, ageing. */
  @Get('ledger/:tenantId') @Roles(...STAFF, Role.TENANT)
  async get(@CurrentUser() u: AuthUser, @Param('tenantId', ParseUUIDPipe) tenantId: string) {
    await assertTenantAccess(this.ds, u, tenantId);
    const l = await this.ledger.ledger(tenantId);
    const pending = await this.ds.query(`SELECT id, receipt_no, date, amount, method, reference FROM payments WHERE tenant_id=$1 AND status='Pending' ORDER BY date`, [tenantId]);
    const upcoming = await this.ds.query(`SELECT invoice_no, period, due_date, total FROM invoices WHERE tenant_id=$1 AND due_date > $2 ORDER BY due_date`, [tenantId, todayOman()]);
    return { ...l, pendingPayments: pending.map((p: any) => ({ ...p, amount: omr(p.amount) })), notYetDue: upcoming.map((i: any) => ({ ...i, total: omr(i.total) })) };
  }

  @Get('charges') @Roles(Role.FINANCE, Role.PROPERTY_MANAGER, Role.RECOVERY)
  async listCharges(@CurrentUser() u: AuthUser, @Query('tenantId') tenantId?: string) {
    const p: unknown[] = []; const w = [tenantScopeSql(u, 'c.tenant_id', p)];
    if (tenantId) { p.push(tenantId); w.push(`c.tenant_id = $${p.length}`); }
    return this.ds.query(`SELECT c.*, t.name AS tenant_name FROM ledger_charges c JOIN tenants t ON t.id=c.tenant_id WHERE ${w.join(' AND ')} ORDER BY c.date DESC LIMIT 500`, p);
  }

  /** Add a debit (fee, recoverable maintenance, penalty…) or a credit note (negative amount, finance only). */
  @Post('charges') @Roles(Role.FINANCE, Role.PROPERTY_MANAGER)
  async addCharge(@CurrentUser() u: AuthUser, @Body() d: ChargeDto) {
    await assertTenantAccess(this.ds, u, d.tenantId);
    const neg = toBaisa(d.amount) < 0;
    if (toBaisa(d.amount) === 0) throw new BadRequestException('Amount cannot be zero');
    if ((neg || d.kind === 'Credit note') && ![Role.FINANCE, Role.ADMIN].includes(u.role)) throw new BadRequestException('Only finance can issue credit notes');
    if (d.kind === 'Credit note' && !neg) throw new BadRequestException('A credit note must be a negative amount');
    return this.ds.transaction(async (em) => em.save(LedgerCharge, em.create(LedgerCharge, {
      chargeNo: await this.num.next(em, 'charge', 'CHG-'), tenantId: d.tenantId, date: d.date, amount: omr(d.amount), kind: d.kind, description: d.description })));
  }
}
