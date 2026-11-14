import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { Request } from 'express';
import * as bcrypt from 'bcryptjs';
import { DataSource, IsNull } from 'typeorm';
import { Complaint, ComplaintStatus as S, Contract, EContractStatus, Notification, NoticeStatus, Payment, PaymentMethod, PaymentStatus, Role, User, VacateNotice } from '../../database/entities';
import { AuthUser, CurrentUser, Roles } from '../../common/auth';
import { FilesService, MAX_FILE_BYTES } from '../../common/files.service';
import { NotifyService } from '../../common/notify.service';
import { NumberingService } from '../../common/numbering.service';
import { fromBaisa, omr, toBaisa } from '../../common/money';
import { addMonths, todayOman } from '../../common/dates';
import { LedgerService } from '../billing/ledger.service';
import { ComplaintsService, TENANT_LABEL } from '../complaints/complaints.service';

class ComplaintDto {
  @IsOptional() @IsUUID() unitId?: string; @IsString() @Length(1, 60) category: string; @IsString() @Length(1, 80) subcategory: string;
  @IsOptional() @IsString() @MaxLength(150) title?: string; @IsString() @Length(5, 4000) description: string; @IsOptional() @IsString() @MaxLength(150) preferredVisit?: string;
}
class ConfirmDto { @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number; @IsOptional() @IsString() @MaxLength(1000) feedback?: string }
class ReopenDto { @IsString() @Length(3, 1000) reason: string }
class TransferDto { @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string; @Matches(/^\d+(\.\d{1,3})?$/) amount: string; @IsString() @Length(1, 100) reference: string; @IsOptional() @IsString() @MaxLength(500) notes?: string }
class AcceptDto { @IsString() password: string }
class NoticeDto { @IsUUID() contractId: string; @Matches(/^\d{4}-\d{2}-\d{2}$/) proposedDate: string; @IsOptional() @IsString() @MaxLength(1000) reason?: string }

/** The tenant app. Every route works only on the signed-in tenant's own records. */
@Controller('me') @Roles(Role.TENANT)
export class MeController {
  constructor(private ds: DataSource, private ledger: LedgerService, private complaints: ComplaintsService, private files: FilesService, private notify: NotifyService, private num: NumberingService) {}

  private tid(u: AuthUser) { if (u.role !== Role.TENANT || !u.tenantId) throw new ForbiddenException('Tenant accounts only'); return u.tenantId; }
  private contracts(tenantId: string) {
    return this.ds.query(`SELECT c.*, un.unit_no, un.unit_type, b.id AS building_id, b.name AS building_name, b.address_code, b.location, b.lat, b.lng, b.municipality
      FROM contracts c JOIN units un ON un.id=c.unit_id JOIN buildings b ON b.id=un.building_id WHERE c.tenant_id=$1 AND c.status IN ('Active','Upcoming','Ended','Terminated') ORDER BY (c.status='Active') DESC, c.start_date DESC`, [tenantId]);
  }
  private shapeContract(c: any) {
    return { id: c.id, contractNo: c.contract_no, status: c.status, eStatus: c.e_status, startDate: c.start_date, expiryDate: c.expiry_date, monthlyRent: omr(c.monthly_rent), vatRate: c.vat_rate,
      securityDeposit: omr(c.security_deposit), paymentFrequency: c.payment_frequency, rentDueDay: c.rent_due_day, noticeMonths: c.notice_months, municipalityRegNo: c.municipality_reg_no,
      tenantAcceptedAt: c.tenant_accepted_at, unit: { no: c.unit_no, type: c.unit_type }, building: { id: c.building_id, name: c.building_name, addressCode: c.address_code, location: c.location, lat: c.lat, lng: c.lng, municipality: c.municipality } };
  }

  /** Home screen: who I am, my flat, what I owe, what needs my attention. */
  @Get()
  async home(@CurrentUser() u: AuthUser) {
    const t = this.tid(u);
    const [tenant] = await this.ds.query(`SELECT id, tenant_no, name, mobile, email, id_type, id_number, nationality, status FROM tenants WHERE id=$1`, [t]);
    const cs = (await this.contracts(t)).map((c: any) => this.shapeContract(c));
    const l = await this.ledger.ledger(t); const month = todayOman().slice(0, 7);
    const currentDue = l.open.filter((o) => o.kind === 'Rent' && o.period === month).reduce((s, o) => s + toBaisa(o.outstanding), 0);
    const [counts] = await this.ds.query(`SELECT (SELECT COUNT(*) FROM complaints WHERE tenant_id=$1 AND status NOT IN ('Closed','Cancelled'))::int AS open_complaints,
      (SELECT COUNT(*) FROM complaints WHERE tenant_id=$1 AND status='Tenant confirmation pending')::int AS to_confirm,
      (SELECT COUNT(*) FROM notifications WHERE tenant_id=$1 AND read_at IS NULL)::int AS unread,
      (SELECT COALESCE(SUM(amount),0) FROM payments WHERE tenant_id=$1 AND status='Pending') AS pending`, [t]);
    return { tenant: { id: tenant.id, tenantNo: tenant.tenant_no, name: tenant.name, mobile: tenant.mobile, email: tenant.email, idType: tenant.id_type, idNumber: tenant.id_number, nationality: tenant.nationality },
      contracts: cs, toAccept: cs.filter((c: any) => c.eStatus === EContractStatus.SENT).map((c: any) => c.id),
      account: { balance: l.balance, currentDue: fromBaisa(currentDue), previousDue: fromBaisa(Math.max(0, toBaisa(l.balance) - currentDue)), overdue: fromBaisa(toBaisa(l.aging.total) - toBaisa(l.aging.current)),
        advance: l.unappliedCredit, pendingPayments: omr(counts.pending), lastPaymentDate: l.lastPaymentDate },
      openComplaints: counts.open_complaints, complaintsToConfirm: counts.to_confirm, unreadNotifications: counts.unread };
  }

  @Get('ledger') async myLedger(@CurrentUser() u: AuthUser) { const l = await this.ledger.ledger(this.tid(u)); return { balance: l.balance, aging: l.aging, open: l.open, lines: l.lines, unappliedCredit: l.unappliedCredit }; }

  @Get('bank-details') bank() {
    return { bank: process.env.RENT_BANK_NAME || '', accountName: process.env.RENT_ACCOUNT_NAME || '', accountNo: process.env.RENT_ACCOUNT_NO || '', iban: process.env.RENT_IBAN || '',
      note: 'Use your tenant number as the transfer reference, then upload the bank receipt here.' };
  }

  @Get('payments')
  async payments(@CurrentUser() u: AuthUser) {
    const rows = await this.ds.query(`SELECT p.id, p.receipt_no, p.date, p.amount, p.method, p.reference, p.status, p.reject_reason FROM payments p WHERE p.tenant_id=$1 ORDER BY p.date DESC, p.receipt_no DESC`, [this.tid(u)]);
    return rows.map((r: any) => ({ id: r.id, receiptNo: r.receipt_no, date: r.date, amount: omr(r.amount), method: r.method, reference: r.reference, status: r.status, rejectReason: r.reject_reason }));
  }

  /** Report a bank transfer with the receipt (field "receipt"). Stays Pending until finance checks the bank statement. */
  @Post('payments') @UseInterceptors(FileInterceptor('receipt', { limits: { fileSize: MAX_FILE_BYTES } }))
  async transfer(@CurrentUser() u: AuthUser, @Body() d: TransferDto, @UploadedFile() receipt: Express.Multer.File) {
    const t = this.tid(u);
    if (!receipt) throw new BadRequestException('Attach the bank transfer receipt (photo or PDF)');
    this.files.check(receipt);
    if (toBaisa(d.amount) <= 0) throw new BadRequestException('Amount must be more than zero');
    if (d.date > todayOman()) throw new BadRequestException('Transfer date cannot be in the future');
    if ((await this.ds.query(`SELECT 1 FROM payments WHERE tenant_id=$1 AND reference=$2 AND status<>'Rejected' LIMIT 1`, [t, d.reference])).length) throw new ConflictException('A payment with this reference was already submitted');
    const p = await this.ds.transaction(async (em) => {
      const p = await em.save(Payment, em.create(Payment, { receiptNo: await this.num.next(em, 'receipt', 'RCP-', 5), tenantId: t, date: d.date, amount: omr(d.amount), method: PaymentMethod.BANK_TRANSFER,
        reference: d.reference, notes: d.notes ?? 'Submitted by tenant', status: PaymentStatus.PENDING, recordedBy: u.id }));
      const a = await this.files.save(em, receipt, 'payment', p.id, 'receipt', u.id); p.attachment = a.id; await em.save(Payment, p);
      await this.notify.tenant(t, 'Payment received for checking', `We received your transfer of ${omr(d.amount)} (ref. ${d.reference}). It will show on your account once our finance team confirms it with the bank.`, '/t/pay', em);
      return p;
    });
    return { id: p.id, receiptNo: p.receiptNo, status: p.status };
  }

  @Get('contracts/:id')
  async contract(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const c = (await this.contracts(this.tid(u))).find((x: any) => x.id === id); if (!c) throw new NotFoundException(); return this.shapeContract(c);
  }

  /** Accept a contract sent for e-acceptance, confirmed with the tenant's password (SMS one-time code in phase 6). */
  @Post('contracts/:id/accept') @HttpCode(200)
  async accept(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: AcceptDto, @Req() req: Request) {
    const t = this.tid(u);
    const c = await this.ds.getRepository(Contract).findOneBy({ id, tenantId: t }); if (!c) throw new NotFoundException();
    if (c.eStatus !== EContractStatus.SENT) throw new ConflictException('This contract is not waiting for your acceptance');
    const me = await this.ds.getRepository(User).findOne({ where: { id: u.id }, select: { id: true, passwordHash: true } });
    if (!me || !(await bcrypt.compare(d.password, me.passwordHash))) throw new BadRequestException('Password is not correct');
    await this.ds.getRepository(Contract).update(id, { eStatus: EContractStatus.TENANT_ACCEPTED, tenantAcceptedAt: new Date(), tenantAcceptedIp: String(req.ip || '').slice(0, 60) });
    return { ok: true, eStatus: EContractStatus.TENANT_ACCEPTED };
  }

  // ---- complaints ----
  @Get('categories') cats() { return this.ds.query(`SELECT category, subcategory FROM maintenance_categories WHERE is_active ORDER BY sort_order, category, subcategory`); }

  @Get('complaints')
  async myComplaints(@CurrentUser() u: AuthUser) {
    const rows = await this.ds.query(`SELECT c.*, un.unit_no, b.name AS building_name FROM complaints c JOIN buildings b ON b.id=c.building_id LEFT JOIN units un ON un.id=c.unit_id
      WHERE c.tenant_id=$1 ORDER BY (c.status IN ('Closed','Cancelled')), c.created_at DESC`, [this.tid(u)]);
    return rows.map((r: any) => this.complaints.shape(r, true));
  }

  @Get('complaints/:id')
  async myComplaint(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const c = await this.complaints.get(id); if (c.tenantId !== this.tid(u)) throw new NotFoundException(); return this.complaints.detail(id, true);
  }

  /** Submit a complaint with up to 5 photos (field "photos"). The flat is taken from the tenant's active contract. */
  @Post('complaints') @UseInterceptors(FilesInterceptor('photos', 5, { limits: { fileSize: MAX_FILE_BYTES } }))
  async submit(@CurrentUser() u: AuthUser, @Body() d: ComplaintDto, @UploadedFiles() photos: Express.Multer.File[] = []) {
    const t = this.tid(u);
    await this.complaints.assertCategory(d.category, d.subcategory);
    const active = (await this.contracts(t)).filter((c: any) => c.status === 'Active');
    if (!active.length) throw new BadRequestException('You need an active contract to raise a complaint');
    const c0 = d.unitId ? active.find((c: any) => c.unit_id === d.unitId) : active[0]; if (!c0) throw new BadRequestException('That unit is not under your active contract');
    photos.forEach((f) => this.files.check(f));
    const id = await this.ds.transaction(async (em) => {
      const c = await em.save(Complaint, em.create(Complaint, { refNo: await this.num.next(em, 'complaint', 'CMP-', 5), tenantId: t, unitId: c0.unit_id, buildingId: c0.building_id,
        category: d.category, subcategory: d.subcategory, title: d.title ?? '', description: d.description, preferredVisit: d.preferredVisit ?? '', createdBy: u.id }));
      for (const f of photos) await this.files.save(em, f, 'complaint', c.id, 'tenant-photo', u.id);
      await this.complaints.event(em, c.id, S.NEW, 'Submitted by tenant', u);
      await this.notify.tenant(t, `Complaint ${c.refNo} received`, 'Thank you. Our maintenance team will review it and keep you updated here.', `/t/complaints/${c.id}`, em);
      return c.id;
    });
    return this.complaints.detail(id, true);
  }

  /** Tenant confirms the problem is solved (optional 1–5 rating). */
  @Post('complaints/:id/confirm') @HttpCode(200)
  async confirm(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: ConfirmDto) {
    const c = await this.complaints.get(id); if (c.tenantId !== this.tid(u)) throw new NotFoundException();
    if (c.status !== S.CONFIRMATION) throw new ConflictException(`This complaint is "${TENANT_LABEL[c.status]}" — there is nothing to confirm yet`);
    await this.ds.transaction(async (em) => { c.tenantRating = d.rating ?? null; c.tenantFeedback = d.feedback ?? ''; await this.complaints.move(em, c, S.CLOSED, 'Tenant confirmed the problem is solved' + (d.rating ? ` (rating ${d.rating}/5)` : ''), u); });
    return this.complaints.detail(id, true);
  }

  /** Tenant says the problem is not solved: back to review. */
  @Post('complaints/:id/reopen') @HttpCode(200)
  async reopen(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: ReopenDto) {
    const c = await this.complaints.get(id); if (c.tenantId !== this.tid(u)) throw new NotFoundException();
    const recentClose = c.status === S.CLOSED && c.closedAt && Date.now() - new Date(c.closedAt).getTime() < 30 * 864e5;
    if (c.status !== S.CONFIRMATION && !recentClose) throw new ConflictException('Only completed complaints (or closed within 30 days) can be reopened');
    await this.ds.transaction((em) => this.complaints.move(em, c, S.REVIEWED, `Reopened by tenant: ${d.reason}`, u));
    return this.complaints.detail(id, true);
  }

  /** Withdraw a complaint before work starts. */
  @Post('complaints/:id/cancel') @HttpCode(200)
  async cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const c = await this.complaints.get(id); if (c.tenantId !== this.tid(u)) throw new NotFoundException();
    if (![S.NEW, S.REVIEWED].includes(c.status)) throw new ConflictException('Work has already been scheduled; please contact the office to cancel');
    await this.ds.transaction((em) => this.complaints.move(em, c, S.CANCELLED, 'Withdrawn by tenant', u));
    return this.complaints.detail(id, true);
  }

  // ---- notice to vacate ----
  @Get('notices')
  notices(@CurrentUser() u: AuthUser) {
    return this.ds.query(`SELECT n.*, c.contract_no, c.security_deposit, un.unit_no, b.name AS building_name FROM vacate_notices n JOIN contracts c ON c.id=n.contract_id JOIN units un ON un.id=c.unit_id
      JOIN buildings b ON b.id=un.building_id WHERE n.tenant_id=$1 ORDER BY n.created_at DESC`, [this.tid(u)]);
  }

  /** Notice period is worked out automatically; rent runs to the later of the proposed date and the end of the notice period. */
  @Post('notices')
  async giveNotice(@CurrentUser() u: AuthUser, @Body() d: NoticeDto) {
    const t = this.tid(u); const today = todayOman();
    const c = await this.ds.getRepository(Contract).findOneBy({ id: d.contractId, tenantId: t }); if (!c || c.status !== 'Active') throw new BadRequestException('Choose your active contract');
    if (d.proposedDate < today) throw new BadRequestException('The vacating date cannot be in the past');
    if (await this.ds.getRepository(VacateNotice).exists({ where: { contractId: c.id, status: NoticeStatus.SUBMITTED } }) ||
      (await this.ds.query(`SELECT 1 FROM vacate_notices WHERE contract_id=$1 AND status NOT IN ('Settled','Cancelled')`, [c.id])).length) throw new ConflictException('A notice is already open for this contract');
    const noticeEnd = addMonths(today, c.noticeMonths); const finalRentDate = d.proposedDate > noticeEnd ? d.proposedDate : noticeEnd;
    const n = await this.ds.transaction(async (em) => {
      const n = await em.save(VacateNotice, em.create(VacateNotice, { refNo: await this.num.next(em, 'notice', 'NTV-', 5), tenantId: t, contractId: c.id, submittedOn: today, proposedDate: d.proposedDate,
        noticeMonths: c.noticeMonths, noticeEnd, finalRentDate, reason: d.reason ?? '' }));
      await this.notify.tenant(t, `Notice to vacate ${n.refNo} received`, `Your notice period is ${c.noticeMonths} month(s), so rent is payable until ${finalRentDate}. We will contact you to arrange the final inspection.`, '/t/notice', em);
      return n;
    });
    return n;
  }

  // ---- notifications ----
  @Get('notifications')
  notifications(@CurrentUser() u: AuthUser) { return this.ds.getRepository(Notification).find({ where: { tenantId: this.tid(u) }, order: { createdAt: 'DESC' }, take: 100 }); }
  @Post('notifications/read-all') @HttpCode(200)
  async readAll(@CurrentUser() u: AuthUser) { await this.ds.getRepository(Notification).update({ tenantId: this.tid(u), readAt: IsNull() }, { readAt: new Date() }); return { ok: true }; }
}
