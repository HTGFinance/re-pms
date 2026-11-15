import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, GoneException, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, Length, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import * as QRCode from 'qrcode';
import { DataSource, IsNull } from 'typeorm';
import { config } from '../../config';
import { assertTenantAccess, AuthUser, buildingScope, CurrentUser, Public, Roles } from '../../common/auth';
import { FilesService, MAX_FILE_BYTES } from '../../common/files.service';
import { MailService } from '../../common/mail.service';
import { NumberingService } from '../../common/numbering.service';
import { Attachment, Invitation, Role, Tenant, Unit, User } from '../../database/entities';
import { ContractsService, CreateContractDto, PAYMENT_MODES } from '../contracts/contracts.controller';
import { LedgerService } from '../billing/ledger.service';
import { TenantDto } from '../tenants/tenants.controller';

/** The contract part of a new tenancy: the same rules as a contract, without the tenant (created in the same step). */
class TenancyContractDto extends CreateContractDto { @IsOptional() @IsUUID() declare tenantId: string }
class TenancyDto {
  @ValidateNested() @Type(() => TenantDto) tenant: TenantDto;
  @ValidateNested() @Type(() => TenancyContractDto) contract: TenancyContractDto;
}
class InviteDto { @IsOptional() @IsBoolean() email?: boolean }
class AcceptDto {
  @IsString() @Length(20, 100) token: string;
  @IsOptional() @ValidateIf((o) => !!o.email) @IsEmail() email?: string;
  @IsString() @MinLength(10) password: string;
}
export const DOC_KINDS = ['photo', 'passport', 'civil-id', 'contract', 'other'];
const STAFF = [Role.PROPERTY_MANAGER, Role.FINANCE, Role.RECOVERY, Role.MAINTENANCE_SUPERVISOR, Role.EXECUTIVE];
const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
/** Oman numbers: 8 digits → +968. Returns digits only, for wa.me and sms: links. */
export const phoneDigits = (m: string) => { let d = (m || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); if (d.length === 8) d = '968' + d; return d; };
const LATEST_UNIT = `SELECT b.name AS building, un.unit_no FROM contracts c JOIN units un ON un.id=c.unit_id JOIN buildings b ON b.id=un.building_id
  WHERE c.tenant_id=$1 ORDER BY (c.status='Active') DESC, c.start_date DESC LIMIT 1`;

@Controller()
export class OnboardingController {
  constructor(private ds: DataSource, private num: NumberingService, private contracts: ContractsService, private ledger: LedgerService,
    private files: FilesService, private mail: MailService, private jwt: JwtService) {}

  @Get('tenancies/options') @Roles(Role.PROPERTY_MANAGER)
  options() { return { paymentModes: PAYMENT_MODES, docKinds: DOC_KINDS, emailConfigured: this.mail.enabled, inviteDays: config.inviteDays }; }

  /** New tenancy in one step: tenant profile + contract. The app invitation follows with POST /tenants/:id/invite. */
  @Post('tenancies') @Roles(Role.PROPERTY_MANAGER)
  async create(@CurrentUser() u: AuthUser, @Body() d: TenancyDto) {
    const r = await this.ds.transaction(async (em) => {
      const unit = await em.findOne(Unit, { where: { id: d.contract.unitId } }); if (!unit) throw new BadRequestException('Choose a unit');
      const s = buildingScope(u); if (s && !s.includes(unit.buildingId)) throw new ForbiddenException('Unit is outside your assigned buildings');
      const email = (d.tenant.email || '').toLowerCase().trim();
      if (email && await em.exists(Tenant, { where: { email } })) throw new ConflictException('A tenant with this email already exists — open that tenant and add a new contract instead');
      const tenant = await em.save(Tenant, em.create(Tenant, { ...d.tenant, email, idExpiry: d.tenant.idExpiry || null, passportExpiry: d.tenant.passportExpiry || null, tenantNo: await this.num.next(em, 'tenant', 'T-') }));
      const contract = await this.contracts.create(em, { ...d.contract, tenantId: tenant.id }, unit);
      return { tenant, contract };
    });
    await this.ledger.runBilling(undefined, r.contract.id);
    return r;
  }

  // ---------- tenant photo and documents ----------
  @Get('tenants/:id/files') @Roles(...STAFF)
  async list(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await assertTenantAccess(this.ds, u, id);
    return this.ds.getRepository(Attachment).find({ where: { ownerType: 'tenant', ownerId: id }, order: { createdAt: 'DESC' } });
  }

  @Post('tenants/:id/files') @Roles(Role.PROPERTY_MANAGER)
  @UseInterceptors(FilesInterceptor('files', 8, { limits: { fileSize: MAX_FILE_BYTES } }))
  async upload(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @UploadedFiles() files: Express.Multer.File[], @Query('kind') kind = 'other') {
    if (!DOC_KINDS.includes(kind)) throw new BadRequestException(`kind must be one of ${DOC_KINDS.join(', ')}`);
    if (!(await this.ds.getRepository(Tenant).exists({ where: { id } }))) throw new NotFoundException();
    await assertTenantAccess(this.ds, u, id);
    if (!files?.length) throw new BadRequestException('Attach at least one file');
    files.forEach((f) => this.files.check(f));
    if (kind === 'photo' && (files.length > 1 || !files[0].mimetype.startsWith('image/'))) throw new BadRequestException('The tenant photo must be one image (JPG, PNG, WEBP or HEIC)');
    await this.ds.transaction(async (em) => {
      if (kind === 'photo') await em.delete(Attachment, { ownerType: 'tenant', ownerId: id, kind: 'photo' });
      for (const f of files) await this.files.save(em, f, 'tenant', id, kind, u.id);
    });
    return this.list(u, id);
  }

  @Delete('tenant-files/:id') @Roles(Role.PROPERTY_MANAGER) @HttpCode(200)
  async remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const a = await this.ds.getRepository(Attachment).findOneBy({ id, ownerType: 'tenant' }); if (!a) throw new NotFoundException();
    await assertTenantAccess(this.ds, u, a.ownerId); await this.ds.getRepository(Attachment).delete(id); return { ok: true };
  }

  // ---------- tenant app invitation ----------
  private linkBase(req: Request) {
    if (config.appUrl) return config.appUrl;
    const ref = req.headers.referer as string | undefined;
    const o = (req.headers.origin as string) || (ref ? new URL(ref).origin : '');
    return o || `${req.protocol}://${req.get('host')}`;
  }

  /** Creates a one-time link (valid INVITE_EXPIRY_DAYS), emails it when SMTP is set, and returns the link, a QR code and WhatsApp / SMS links for staff to send. */
  @Post('tenants/:id/invite') @Roles(Role.PROPERTY_MANAGER) @HttpCode(200)
  async invite(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: InviteDto, @Req() req: Request) {
    const t = await this.ds.getRepository(Tenant).findOneBy({ id }); if (!t) throw new NotFoundException();
    await assertTenantAccess(this.ds, u, id);
    const c = await this.ds.query(LATEST_UNIT, [id]);
    if (!c.length) throw new BadRequestException('Add a contract for this tenant before inviting them to the app');
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + config.inviteDays * 86400000);
    await this.ds.transaction(async (em) => {
      await em.update(Invitation, { tenantId: id, usedAt: IsNull(), revokedAt: IsNull() }, { revokedAt: new Date() });
      await em.save(Invitation, em.create(Invitation, { tenantId: id, tokenHash: sha(token), expiresAt, createdBy: u.id }));
    });
    const link = `${this.linkBase(req)}/invite?token=${token}`;
    const where = `${c[0].building}, unit ${c[0].unit_no}`;
    const first = t.name.split(' ')[0];
    const message = `Dear ${first}, welcome to ${config.brandName} (${where}). Set up your tenant app here to pay rent, report repairs and see your contract: ${link} — the link works once, for ${config.inviteDays} days.`;
    let emailSent = false;
    if (d.email !== false && t.email) {
      const html = `<div style="font-family:Arial,sans-serif;max-width:520px;color:#1d1d1b"><div style="height:6px;background:linear-gradient(90deg,#feed01 50%,#e40613 50%)"></div>
        <h2 style="margin:18px 0 6px">Welcome to ${esc(config.brandName)}</h2><p>Dear ${esc(t.name)},</p><p>Your tenancy at <b>${esc(where)}</b> is set up. Use our tenant app to pay rent, send transfer receipts, report repairs with photos and see your contract.</p>
        <p><a href="${link}" style="display:inline-block;background:#1d1d1b;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Set up my tenant app</a></p>
        <p style="font-size:13px;color:#555">Open the link on your phone, choose a password, then add the app to your home screen. The link works once, for ${config.inviteDays} days.</p></div>`;
      emailSent = await this.mail.send(t.email, `${config.brandName}: set up your tenant app`, message, html);
      if (emailSent) await this.ds.getRepository(Invitation).update({ tokenHash: sha(token) }, { emailedTo: t.email });
    }
    const digits = phoneDigits(t.mobile);
    return {
      link, expiresAt, message, emailSent, emailConfigured: this.mail.enabled, email: t.email, mobile: t.mobile,
      whatsapp: digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : null,
      sms: digits ? `sms:+${digits}?&body=${encodeURIComponent(message)}` : null,
      qr: await QRCode.toDataURL(link, { margin: 1, width: 360, errorCorrectionLevel: 'M' }),
      tenant: { name: t.name, tenantNo: t.tenantNo }, where, company: config.brandName,
    };
  }

  @Get('tenants/:id/invitation') @Roles(...STAFF)
  async status(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await assertTenantAccess(this.ds, u, id);
    const i = await this.ds.getRepository(Invitation).findOne({ where: { tenantId: id }, order: { createdAt: 'DESC' } });
    const login = await this.ds.getRepository(User).findOne({ where: { tenantId: id, role: Role.TENANT } });
    const state = login && login.isActive && !login.mustChangePassword && (!i || i.usedAt || login.lastLoginAt) ? 'Active'
      : !i || i.revokedAt ? (login ? 'Temporary password' : 'Not invited') : i.usedAt ? 'Active' : i.expiresAt < new Date() ? 'Expired' : 'Invited';
    return { state, sentAt: i?.createdAt ?? null, expiresAt: i?.expiresAt ?? null, usedAt: i?.usedAt ?? null, emailedTo: i?.emailedTo ?? '',
      login: login ? { email: login.email, lastLoginAt: login.lastLoginAt, isActive: login.isActive } : null };
  }

  private async find(token: string) {
    const i = await this.ds.getRepository(Invitation).findOneBy({ tokenHash: sha(token || '') });
    if (!i || i.revokedAt) throw new NotFoundException('This link is not valid any more. Ask the property office to send a new one.');
    if (i.usedAt) throw new GoneException('This link has already been used. Sign in with your email and password.');
    if (i.expiresAt < new Date()) throw new GoneException('This link has expired. Ask the property office to send a new one.');
    return i;
  }

  /** Public: what the invitation page shows before the tenant chooses a password. */
  @Public() @Get('invite')
  async check(@Query('token') token: string) {
    const i = await this.find(token);
    const t = await this.ds.getRepository(Tenant).findOneByOrFail({ id: i.tenantId });
    const c = await this.ds.query(LATEST_UNIT, [t.id]);
    const login = await this.ds.getRepository(User).findOne({ where: { tenantId: t.id, role: Role.TENANT } });
    return { name: t.name, building: c[0]?.building ?? '', unit: c[0]?.unit_no ?? '', email: login?.email || t.email || '', needsEmail: !(login?.email || t.email), expiresAt: i.expiresAt, company: config.brandName };
  }

  /** Public: the tenant chooses a password (and gives an email if the office had none); the link then stops working and the tenant is signed in. */
  @Public() @Post('invite/accept') @HttpCode(200)
  async accept(@Body() d: AcceptDto, @Res({ passthrough: true }) res: Response) {
    const i = await this.find(d.token);
    const user = await this.ds.transaction(async (em) => {
      const t = await em.findOneByOrFail(Tenant, { id: i.tenantId });
      let u = await em.findOne(User, { where: { tenantId: t.id, role: Role.TENANT } });
      const email = (u?.email || t.email || d.email || '').toLowerCase().trim();
      if (!email) throw new BadRequestException('Enter your email address — you will use it to sign in');
      const clash = await em.findOne(User, { where: { email } });
      if (clash && clash.id !== u?.id) throw new ConflictException('This email is already used by another account. Contact the property office.');
      const passwordHash = await bcrypt.hash(d.password, 10);
      if (u) Object.assign(u, { email, passwordHash, isActive: true, mustChangePassword: false });
      else u = em.create(User, { email, name: t.name, role: Role.TENANT, tenantId: t.id, passwordHash, isActive: true, mustChangePassword: false });
      u = await em.save(User, u);
      if (!t.email) await em.update(Tenant, t.id, { email });
      await em.update(Invitation, i.id, { usedAt: new Date() });
      return u;
    });
    const payload: AuthUser = { id: user.id, email: user.email, name: user.name, role: Role.TENANT, tenantId: user.tenantId, buildingIds: [], mustChangePassword: false };
    const token = await this.jwt.signAsync(payload);
    await this.ds.getRepository(User).update(user.id, { lastLoginAt: new Date() });
    res.cookie('repms_token', token, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 12 * 3600 * 1000, path: '/' });
    return { token, user: payload };
  }
}
