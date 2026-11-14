import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { DataSource, EntityManager } from 'typeorm';
import { Cheque, ChequeStatus, LedgerCharge, Payment, PaymentMethod, PaymentStatus, Role } from '../../database/entities';
import { assertTenantAccess, AuthUser, CurrentUser, Roles, tenantScopeSql } from '../../common/auth';
import { NumberingService } from '../../common/numbering.service';
import { omr, toBaisa } from '../../common/money';
import { addDays, addMonths, todayOman } from '../../common/dates';

const DATE = /^\d{4}-\d{2}-\d{2}$/; const AMT = /^\d+(\.\d{1,3})?$/;
class SeriesDto {
  @IsUUID() tenantId: string; @IsOptional() @IsUUID() contractId?: string; @IsString() @MaxLength(80) bank: string;
  @Matches(/^\d{1,30}$/, { message: 'First cheque number must be digits' }) firstChequeNo: string; @Matches(DATE) firstDueDate: string;
  @IsInt() @Min(1) @Max(60) count: number; @Matches(AMT) amount: string; @IsInt() @Min(1) @Max(12) intervalMonths: number; @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
class DateDto { @IsOptional() @Matches(DATE) date?: string }
class BounceDto { @IsOptional() @Matches(DATE) date?: string; @IsString() @MaxLength(200) reason: string; @IsOptional() @Matches(AMT) bounceFee?: string }
class ReplaceDto { @IsString() @MaxLength(30) chequeNo: string; @IsString() @MaxLength(80) bank: string; @Matches(DATE) dueDate: string; @IsOptional() @Matches(AMT) amount?: string }

const HANDLERS = [Role.RECOVERY, Role.FINANCE, Role.PROPERTY_MANAGER];

/** Post-dated cheque (PDC) register: In hand → Deposited → Cleared (becomes a verified payment) or Bounced → Replaced. */
@Controller('cheques')
export class ChequesController {
  constructor(private ds: DataSource, private num: NumberingService) {}

  @Get() @Roles(...HANDLERS, Role.EXECUTIVE)
  async list(@CurrentUser() u: AuthUser, @Query('status') status?: string, @Query('tenantId') tenantId?: string, @Query('dueWithinDays') within?: string) {
    const p: unknown[] = []; const w = [tenantScopeSql(u, 'q.tenant_id', p)];
    const add = (sql: string, v: unknown) => { p.push(v); w.push(sql.replace('?', '$' + p.length)); };
    if (status) add('q.status = ?', status); if (tenantId) add('q.tenant_id = ?', tenantId);
    if (within) { add('q.due_date <= ?', addDays(todayOman(), parseInt(within, 10) || 30)); w.push(`q.status = 'In hand'`); }
    const rows = await this.ds.query(`
      SELECT q.*, t.name AS tenant_name, t.tenant_no, c.contract_no, un.unit_no, b.name AS building_name
      FROM cheques q JOIN tenants t ON t.id=q.tenant_id LEFT JOIN contracts c ON c.id=q.contract_id LEFT JOIN units un ON un.id=c.unit_id LEFT JOIN buildings b ON b.id=un.building_id
      WHERE ${w.join(' AND ')} ORDER BY q.due_date, q.cheque_no LIMIT 2000`, p);
    const today = todayOman();
    return rows.map((r: any) => ({ id: r.id, refNo: r.ref_no, chequeNo: r.cheque_no, bank: r.bank, amount: omr(r.amount), dueDate: r.due_date, status: r.status,
      depositedOn: r.deposited_on, clearedOn: r.cleared_on, bouncedOn: r.bounced_on, bounceReason: r.bounce_reason, paymentId: r.payment_id, notes: r.notes,
      dueForDeposit: r.status === 'In hand' && r.due_date <= today,
      tenant: { id: r.tenant_id, name: r.tenant_name, tenantNo: r.tenant_no }, contractNo: r.contract_no, unit: r.unit_no ? `${r.building_name} ${r.unit_no}` : null }));
  }

  /** Receive a series of cheques (e.g. 12 monthly cheques). Numbers increase by one, keeping leading zeros. */
  @Post('series') @Roles(...HANDLERS)
  async series(@CurrentUser() u: AuthUser, @Body() d: SeriesDto) {
    await assertTenantAccess(this.ds, u, d.tenantId);
    if (toBaisa(d.amount) <= 0) throw new BadRequestException('Amount must be more than zero');
    if (d.contractId && !(await this.ds.query(`SELECT 1 FROM contracts WHERE id=$1 AND tenant_id=$2`, [d.contractId, d.tenantId])).length) throw new BadRequestException('Contract does not belong to this tenant');
    const width = d.firstChequeNo.length; const first = BigInt(d.firstChequeNo);
    return this.ds.transaction(async (em) => {
      const out: Cheque[] = [];
      for (let i = 0; i < d.count; i++) {
        const no = (first + BigInt(i)).toString().padStart(width, '0');
        if (await em.exists(Cheque, { where: { bank: d.bank, chequeNo: no, tenantId: d.tenantId } })) throw new ConflictException(`Cheque ${no} (${d.bank}) is already recorded`);
        out.push(await em.save(Cheque, em.create(Cheque, { refNo: await this.num.next(em, 'cheque', 'PDC-', 5), tenantId: d.tenantId, contractId: d.contractId ?? null,
          chequeNo: no, bank: d.bank, amount: omr(d.amount), dueDate: addMonths(d.firstDueDate, i * d.intervalMonths), receivedBy: u.id, notes: d.notes ?? '' })));
      }
      return out;
    });
  }

  private async move(u: AuthUser, id: string, from: ChequeStatus[], fn: (em: EntityManager, q: Cheque) => Promise<Partial<Cheque>>) {
    return this.ds.transaction(async (em) => {
      const q = await em.findOne(Cheque, { where: { id }, lock: { mode: 'pessimistic_write' } }); if (!q) throw new NotFoundException();
      await assertTenantAccess(this.ds, u, q.tenantId);
      if (!from.includes(q.status)) throw new ConflictException(`Cheque is ${q.status}; this step needs ${from.join(' or ')}`);
      await em.update(Cheque, id, await fn(em, q)); return em.findOne(Cheque, { where: { id } });
    });
  }

  /** Deposit at the bank — not before the cheque date. */
  @Post(':id/deposit') @HttpCode(200) @Roles(Role.RECOVERY, Role.FINANCE)
  deposit(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: DateDto) {
    const date = d.date || todayOman();
    return this.move(u, id, [ChequeStatus.IN_HAND], async (_em, q) => {
      if (q.dueDate > date) throw new BadRequestException(`Cheque is dated ${q.dueDate}; it cannot be deposited before then`);
      return { status: ChequeStatus.DEPOSITED, depositedOn: date };
    });
  }

  /** Cleared by the bank (finance, from the bank statement): creates a verified payment on the tenant ledger. */
  @Post(':id/clear') @HttpCode(200) @Roles(Role.FINANCE)
  clear(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: DateDto) {
    const date = d.date || todayOman();
    return this.move(u, id, [ChequeStatus.DEPOSITED], async (em, q) => {
      const pay = await em.save(Payment, em.create(Payment, { receiptNo: await this.num.next(em, 'receipt', 'RCP-', 5), tenantId: q.tenantId, date, amount: q.amount,
        method: PaymentMethod.CHEQUE, reference: `${q.bank} ${q.chequeNo}`, status: PaymentStatus.VERIFIED, recordedBy: q.receivedBy, verifiedBy: u.id, verifiedAt: new Date(), chequeId: q.id }));
      return { status: ChequeStatus.CLEARED, clearedOn: date, paymentId: pay.id };
    });
  }

  /** Returned unpaid by the bank. Optionally charge the tenant a bounce fee. */
  @Post(':id/bounce') @HttpCode(200) @Roles(Role.FINANCE)
  bounce(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: BounceDto) {
    const date = d.date || todayOman();
    return this.move(u, id, [ChequeStatus.DEPOSITED], async (em, q) => {
      if (d.bounceFee && toBaisa(d.bounceFee) > 0) await em.save(LedgerCharge, em.create(LedgerCharge, { chargeNo: await this.num.next(em, 'charge', 'CHG-'), tenantId: q.tenantId, date,
        amount: omr(d.bounceFee), kind: 'Fee', description: `Returned cheque fee — ${q.bank} ${q.chequeNo}` }));
      return { status: ChequeStatus.BOUNCED, bouncedOn: date, bounceReason: d.reason };
    });
  }

  /** Replace a bounced cheque with a new one (new cheque is In hand). */
  @Post(':id/replace') @Roles(...HANDLERS)
  async replace(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: ReplaceDto) {
    let created: Cheque | null = null;
    await this.move(u, id, [ChequeStatus.BOUNCED], async (em, q) => {
      if (await em.exists(Cheque, { where: { bank: d.bank, chequeNo: d.chequeNo, tenantId: q.tenantId } })) throw new ConflictException('That cheque is already recorded');
      created = await em.save(Cheque, em.create(Cheque, { refNo: await this.num.next(em, 'cheque', 'PDC-', 5), tenantId: q.tenantId, contractId: q.contractId, chequeNo: d.chequeNo, bank: d.bank,
        amount: d.amount ? omr(d.amount) : q.amount, dueDate: d.dueDate, receivedBy: u.id, notes: `Replaces ${q.refNo} (${q.bank} ${q.chequeNo})` }));
      return { status: ChequeStatus.REPLACED, replacedBy: created.id };
    });
    return created;
  }

  /** Give back an unused cheque (e.g. tenant left) or cancel one recorded by mistake. */
  @Post(':id/return') @HttpCode(200) @Roles(...HANDLERS)
  giveBack(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.move(u, id, [ChequeStatus.IN_HAND], async () => ({ status: ChequeStatus.RETURNED }));
  }
}
