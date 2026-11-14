import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsBoolean, IsEnum, IsInt, IsNumberString, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Contract, ContractStatus, EContractStatus, PaymentFrequency, Role, Tenant, Unit } from '../../database/entities';
import { AuthUser, buildingScope, CurrentUser, Roles } from '../../common/auth';
import { NumberingService } from '../../common/numbering.service';
import { omr, mulOmr } from '../../common/money';
import { LedgerService } from '../billing/ledger.service';
import { addDays, addMonths, daysBetween, todayOman } from '../../common/dates';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const VAT_RATE = '0.0500';
/** Municipality registration fee on annual rent. Confirm the current rate per municipality. */
export const MUNICIPALITY_FEE_RATE = Number(process.env.MUNICIPALITY_FEE_RATE || '0.03');

class CreateContractDto {
  @IsUUID() tenantId: string; @IsUUID() unitId: string;
  @Matches(DATE) startDate: string; @IsOptional() @Matches(DATE) expiryDate?: string; @IsOptional() @Matches(DATE) tenancyFrom?: string;
  @IsNumberString() monthlyRent: string; @IsOptional() @IsNumberString() securityDeposit?: string;
  @IsOptional() @IsEnum(PaymentFrequency) paymentFrequency?: PaymentFrequency;
  @IsOptional() @IsInt() @Min(1) @Max(28) rentDueDay?: number; @IsOptional() @IsInt() @Min(0) @Max(12) noticeMonths?: number;
  @IsOptional() @IsBoolean() vatApplicable?: boolean; @IsOptional() @IsBoolean() asDraft?: boolean; @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  /** First day rent is billed. Default: the later of the start date and the 1st of the current month (older rent = opening balance). */
  @IsOptional() @Matches(DATE) billFrom?: string;
}
class UpdateContractDto {
  @IsOptional() @Matches(DATE) startDate?: string; @IsOptional() @Matches(DATE) expiryDate?: string;
  @IsOptional() @IsNumberString() monthlyRent?: string; @IsOptional() @IsNumberString() securityDeposit?: string;
  @IsOptional() @IsEnum(PaymentFrequency) paymentFrequency?: PaymentFrequency;
  @IsOptional() @IsInt() @Min(1) @Max(28) rentDueDay?: number; @IsOptional() @IsInt() @Min(0) @Max(12) noticeMonths?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
class EndContractDto { @Matches(DATE) endDate: string; @IsOptional() @IsBoolean() early?: boolean; @IsOptional() @IsString() @MaxLength(500) reason?: string }
class EStepDto {
  @IsEnum(EContractStatus) step: EContractStatus;
  @IsOptional() @IsString() @MaxLength(60) regNo?: string; @IsOptional() @Matches(DATE) regDate?: string; @IsOptional() @IsNumberString() fee?: string;
}
class RenewDto { @IsInt() @Min(1) @Max(60) months: number; @IsNumberString() monthlyRent: string }

const STAFF = [Role.PROPERTY_MANAGER, Role.FINANCE, Role.RECOVERY, Role.MAINTENANCE_SUPERVISOR, Role.EXECUTIVE];
const NEXT_E: Record<EContractStatus, EContractStatus | null> = {
  [EContractStatus.DRAFT]: EContractStatus.SENT, [EContractStatus.SENT]: EContractStatus.TENANT_ACCEPTED,
  [EContractStatus.TENANT_ACCEPTED]: EContractStatus.LANDLORD_APPROVED, [EContractStatus.LANDLORD_APPROVED]: EContractStatus.REGISTERED, [EContractStatus.REGISTERED]: null,
};

@Injectable()
export class ContractsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(private ds: DataSource, private num: NumberingService) {}
  onModuleInit() { this.refreshStatuses().catch(() => undefined); this.timer = setInterval(() => this.refreshStatuses().catch(() => undefined), 3600_000); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  /** Upcoming → Active on the start date; Active → Ended after the expiry date. Runs hourly. */
  async refreshStatuses() {
    const t = todayOman();
    await this.ds.query(`UPDATE contracts SET status='Active', updated_at=now() WHERE status='Upcoming' AND start_date <= $1 AND expiry_date >= $1`, [t]);
    await this.ds.query(`UPDATE contracts SET status='Ended', updated_at=now() WHERE status IN ('Active','Upcoming') AND expiry_date < $1`, [t]);
  }

  statusFor(start: string, expiry: string): ContractStatus {
    const t = todayOman(); return expiry < t ? ContractStatus.ENDED : start > t ? ContractStatus.UPCOMING : ContractStatus.ACTIVE;
  }

  /** Throws if another live contract on the unit overlaps the period. */
  async assertNoOverlap(em: EntityManager, unitId: string, start: string, expiry: string, exceptId?: string) {
    const rows = await em.query(
      `SELECT contract_no FROM contracts WHERE unit_id=$1 AND status IN ('Active','Upcoming','Draft') AND start_date <= $3 AND expiry_date >= $2 ${exceptId ? 'AND id <> $4' : ''} LIMIT 1`,
      exceptId ? [unitId, start, expiry, exceptId] : [unitId, start, expiry]);
    if (rows.length) throw new ConflictException(`Unit already has contract ${rows[0].contract_no} in this period`);
  }

  async create(em: EntityManager, d: CreateContractDto, unit: Unit): Promise<Contract> {
    const expiry = d.expiryDate || addDays(addMonths(d.startDate, 12), -1);
    if (expiry < d.startDate) throw new BadRequestException('Expiry date is before the start date');
    await this.assertNoOverlap(em, unit.id, d.startDate, expiry);
    const vat = d.vatApplicable ?? unit.vatApplicable;
    return em.save(Contract, em.create(Contract, {
      contractNo: await this.num.next(em, 'contract', 'CTR-'), tenantId: d.tenantId, unitId: unit.id,
      startDate: d.startDate, expiryDate: expiry, tenancyFrom: d.tenancyFrom || d.startDate,
      billFrom: d.billFrom ? (d.billFrom < d.startDate ? d.startDate : d.billFrom) : (d.startDate > todayOman().slice(0, 8) + '01' ? d.startDate : todayOman().slice(0, 8) + '01'),
      monthlyRent: omr(d.monthlyRent), securityDeposit: omr(d.securityDeposit ?? d.monthlyRent),
      paymentFrequency: d.paymentFrequency ?? PaymentFrequency.MONTHLY, rentDueDay: d.rentDueDay ?? 1,
      noticeMonths: d.noticeMonths ?? (vat ? 3 : 1), vatRate: vat ? VAT_RATE : '0',
      status: d.asDraft ? ContractStatus.DRAFT : this.statusFor(d.startDate, expiry), notes: d.notes ?? '',
    }));
  }
}

@Controller('contracts')
export class ContractsController {
  constructor(private ds: DataSource, private svc: ContractsService, @InjectRepository(Contract) private contracts: Repository<Contract>, private ledger: LedgerService) {}

  private async load(u: AuthUser, id: string) {
    const c = await this.contracts.findOne({ where: { id }, relations: { tenant: true, unit: { building: true } } });
    if (!c) throw new NotFoundException();
    if (u.role === Role.TENANT) { if (c.tenantId !== u.tenantId) throw new ForbiddenException(); return c; }
    const s = buildingScope(u); if (s && !s.includes(c.unit.buildingId)) throw new ForbiddenException('Contract is outside your assigned buildings');
    return c;
  }

  @Get() @Roles(...STAFF)
  async list(@CurrentUser() u: AuthUser, @Query('status') status?: string, @Query('buildingId') buildingId?: string,
    @Query('tenantId') tenantId?: string, @Query('expiringWithinDays') within?: string, @Query('eStatus') eStatus?: string) {
    const s = buildingScope(u); const p: unknown[] = []; const w: string[] = ['TRUE'];
    const add = (sql: string, v: unknown) => { p.push(v); w.push(sql.replace('?', '$' + p.length)); };
    if (s) add('un.building_id = ANY(?)', s);
    if (status) add('c.status = ?', status);
    if (eStatus) add('c.e_status = ?', eStatus);
    if (buildingId) add('un.building_id = ?', buildingId);
    if (tenantId) add('c.tenant_id = ?', tenantId);
    if (within) { add('c.expiry_date <= ?', addDays(todayOman(), parseInt(within, 10) || 90)); w.push(`c.status = 'Active'`); }
    const rows = await this.ds.query(`
      SELECT c.*, t.name AS tenant_name, t.tenant_no, un.unit_no, un.unit_type, b.name AS building_name, b.id AS building_id, b.municipality
      FROM contracts c JOIN tenants t ON t.id=c.tenant_id JOIN units un ON un.id=c.unit_id JOIN buildings b ON b.id=un.building_id
      WHERE ${w.join(' AND ')} ORDER BY c.expiry_date LIMIT 1000`, p);
    const today = todayOman();
    return rows.map((r: any) => ({
      id: r.id, contractNo: r.contract_no, status: r.status, eStatus: r.e_status, startDate: r.start_date, expiryDate: r.expiry_date,
      daysToExpiry: daysBetween(today, r.expiry_date), monthlyRent: omr(r.monthly_rent), securityDeposit: omr(r.security_deposit), vatRate: r.vat_rate,
      paymentFrequency: r.payment_frequency, rentDueDay: r.rent_due_day, noticeMonths: r.notice_months,
      municipalityRegNo: r.municipality_reg_no, municipalityRegDate: r.municipality_reg_date, municipalityFee: omr(r.municipality_fee),
      tenant: { id: r.tenant_id, name: r.tenant_name, tenantNo: r.tenant_no },
      unit: { id: r.unit_id, unitNo: r.unit_no, unitType: r.unit_type }, building: { id: r.building_id, name: r.building_name, municipality: r.municipality },
    }));
  }

  @Get(':id') @Roles(...STAFF, Role.TENANT)
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.load(u, id); }

  @Post() @Roles(Role.PROPERTY_MANAGER)
  async create(@CurrentUser() u: AuthUser, @Body() d: CreateContractDto) {
    const c = await this.ds.transaction(async (em) => {
      const unit = await em.findOne(Unit, { where: { id: d.unitId } }); if (!unit) throw new BadRequestException('Unknown unit');
      const s = buildingScope(u); if (s && !s.includes(unit.buildingId)) throw new ForbiddenException('Unit is outside your assigned buildings');
      if (!(await em.exists(Tenant, { where: { id: d.tenantId } }))) throw new BadRequestException('Unknown tenant');
      return this.svc.create(em, d, unit);
    });
    await this.ledger.runBilling(undefined, c.id); // bill immediately
    return c;
  }

  @Patch(':id') @Roles(Role.PROPERTY_MANAGER)
  async update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: UpdateContractDto) {
    const c = await this.load(u, id);
    const termsChange = ['startDate', 'expiryDate', 'monthlyRent', 'paymentFrequency', 'rentDueDay'].some((k) => (d as any)[k] !== undefined);
    if (termsChange && c.eStatus === EContractStatus.REGISTERED) throw new ConflictException('Registered contracts cannot change terms; use renewal or amendment');
    return this.ds.transaction(async (em) => {
      const start = d.startDate ?? c.startDate, exp = d.expiryDate ?? c.expiryDate;
      if (exp < start) throw new BadRequestException('Expiry date is before the start date');
      if (d.startDate || d.expiryDate) await this.svc.assertNoOverlap(em, c.unitId, start, exp, c.id);
      Object.assign(c, d, { startDate: start, expiryDate: exp });
      if (d.monthlyRent) c.monthlyRent = omr(d.monthlyRent); if (d.securityDeposit) c.securityDeposit = omr(d.securityDeposit);
      if (c.status !== ContractStatus.DRAFT && termsChange) c.status = this.svc.statusFor(start, exp);
      const { tenant, unit, ...plain } = c as any; return em.save(Contract, plain);
    });
  }

  /** Draft → Active/Upcoming. */
  @Post(':id/activate') @HttpCode(200) @Roles(Role.PROPERTY_MANAGER)
  async activate(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const c = await this.load(u, id); if (c.status !== ContractStatus.DRAFT) throw new ConflictException('Only draft contracts can be activated');
    await this.contracts.update(id, { status: this.svc.statusFor(c.startDate, c.expiryDate) }); await this.ledger.runBilling(undefined, id); return this.load(u, id);
  }

  /** End or terminate early; the unit becomes vacant from the day after. */
  @Post(':id/end') @HttpCode(200) @Roles(Role.PROPERTY_MANAGER)
  async end(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: EndContractDto) {
    const c = await this.load(u, id);
    if (![ContractStatus.ACTIVE, ContractStatus.UPCOMING].includes(c.status)) throw new ConflictException('Contract is not active');
    if (d.endDate < c.startDate) throw new BadRequestException('End date is before the start date');
    await this.contracts.update(id, { expiryDate: d.endDate < c.expiryDate ? d.endDate : c.expiryDate, status: d.early ? ContractStatus.TERMINATED : ContractStatus.ENDED,
      notes: (c.notes ? c.notes + '\n' : '') + `${todayOman()}: ended ${d.endDate}${d.reason ? ' — ' + d.reason : ''}` });
    return this.load(u, id);
  }

  /** E-contract workflow: Draft → Sent → Tenant accepted → Landlord approved → Registered. */
  @Post(':id/e-status') @HttpCode(200) @Roles(Role.PROPERTY_MANAGER)
  async eStep(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: EStepDto) {
    const c = await this.load(u, id);
    if (NEXT_E[c.eStatus] !== d.step) throw new ConflictException(`Next step from "${c.eStatus}" is "${NEXT_E[c.eStatus] ?? 'none'}"`);
    const patch: Partial<Contract> = { eStatus: d.step };
    if (d.step === EContractStatus.REGISTERED) {
      if (!d.regNo) throw new BadRequestException('Registration number is required');
      patch.municipalityRegNo = d.regNo; patch.municipalityRegDate = d.regDate || todayOman();
      patch.municipalityFee = d.fee ? omr(d.fee) : mulOmr(mulOmr(c.monthlyRent, 12), MUNICIPALITY_FEE_RATE);
    }
    await this.contracts.update(id, patch); return this.load(u, id);
  }

  /** Create the renewal contract starting the day after expiry (continuous tenancy). */
  @Post(':id/renew') @Roles(Role.PROPERTY_MANAGER)
  async renew(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: RenewDto) {
    const c = await this.load(u, id);
    if (![ContractStatus.ACTIVE, ContractStatus.ENDED].includes(c.status)) throw new ConflictException('Only active or ended contracts can be renewed');
    const start = addDays(c.expiryDate, 1);
    return this.ds.transaction(async (em) => {
      const n = await this.svc.create(em, { tenantId: c.tenantId, unitId: c.unitId, startDate: start, expiryDate: addDays(addMonths(start, d.months), -1), tenancyFrom: c.tenancyFrom,
        monthlyRent: d.monthlyRent, securityDeposit: c.securityDeposit, paymentFrequency: c.paymentFrequency, rentDueDay: c.rentDueDay, noticeMonths: c.noticeMonths,
        vatApplicable: Number(c.vatRate) > 0, billFrom: start }, c.unit);
      await em.update(Contract, n.id, { renewalOf: c.id }); return em.findOne(Contract, { where: { id: n.id } });
    });
  }
}
