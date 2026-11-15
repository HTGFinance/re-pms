import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { InjectRepository } from '@nestjs/typeorm';
import { IsEmail, IsEnum, Matches, IsOptional, IsString, Length, MaxLength, ValidateIf } from 'class-validator';
import { DataSource, Repository } from 'typeorm';
import { Role, Tenant, TenantStatus, User } from '../../database/entities';
import { AuthUser, buildingScope, CurrentUser, Roles } from '../../common/auth';
import { NumberingService } from '../../common/numbering.service';

export class TenantDto {
  @IsString() @Length(1, 200) name: string; @IsOptional() @IsString() @MaxLength(30) mobile?: string;
  @IsOptional() @ValidateIf((o) => !!o.email) @IsEmail() email?: string; @IsOptional() @IsString() @MaxLength(60) idType?: string;
  @IsOptional() @IsString() @MaxLength(60) idNumber?: string; @IsOptional() @IsString() @MaxLength(60) nationality?: string;
  @IsOptional() @IsEnum(TenantStatus) status?: TenantStatus;
  @IsOptional() @ValidateIf((o) => !!o.idExpiry) @Matches(/^\d{4}-\d{2}-\d{2}$/) idExpiry?: string | null; @IsOptional() @IsString() @MaxLength(60) passportNo?: string;
  @IsOptional() @ValidateIf((o) => !!o.passportExpiry) @Matches(/^\d{4}-\d{2}-\d{2}$/) passportExpiry?: string | null;
}
class UpdateTenantDto {
  @IsOptional() @IsString() @Length(1, 200) name?: string; @IsOptional() @IsString() @MaxLength(30) mobile?: string;
  @IsOptional() @ValidateIf((o) => !!o.email) @IsEmail() email?: string; @IsOptional() @IsString() @MaxLength(60) idType?: string;
  @IsOptional() @IsString() @MaxLength(60) idNumber?: string; @IsOptional() @IsString() @MaxLength(60) nationality?: string;
  @IsOptional() @IsEnum(TenantStatus) status?: TenantStatus;
  @IsOptional() @ValidateIf((o) => !!o.idExpiry) @Matches(/^\d{4}-\d{2}-\d{2}$/) idExpiry?: string | null; @IsOptional() @IsString() @MaxLength(60) passportNo?: string;
  @IsOptional() @ValidateIf((o) => !!o.passportExpiry) @Matches(/^\d{4}-\d{2}-\d{2}$/) passportExpiry?: string | null;
}
class LoginDto { @IsOptional() @ValidateIf((o) => !!o.email) @IsEmail() email?: string }
/** Readable temporary password, e.g. 'Hk7m-Qp3x-Zr9t' (no look-alike characters). */
const tempPassword = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; return [0, 1, 2].map(() => Array.from({ length: 4 }, () => a[randomInt(a.length)]).join('')).join('-'); };
const STAFF = [Role.PROPERTY_MANAGER, Role.FINANCE, Role.RECOVERY, Role.MAINTENANCE_SUPERVISOR, Role.EXECUTIVE];

@Controller('tenants')
export class TenantsController {
  constructor(@InjectRepository(Tenant) private tenants: Repository<Tenant>, private ds: DataSource, private num: NumberingService) {}

  /** Tenants visible to the user: those with a contract in their buildings (or with no contract yet). */
  @Get() @Roles(...STAFF)
  async list(@CurrentUser() u: AuthUser, @Query('q') q?: string, @Query('status') status?: string) {
    const s = buildingScope(u); const p: unknown[] = []; const w: string[] = ['TRUE'];
    if (q) { p.push('%' + q.toLowerCase() + '%'); w.push(`(lower(t.name) LIKE $${p.length} OR lower(t.tenant_no) LIKE $${p.length} OR t.mobile LIKE $${p.length} OR lower(t.id_number) LIKE $${p.length})`); }
    if (status) { p.push(status); w.push(`t.status = $${p.length}`); }
    if (s) { p.push(s); w.push(`(NOT EXISTS (SELECT 1 FROM contracts c0 WHERE c0.tenant_id=t.id) OR EXISTS (SELECT 1 FROM contracts c1 JOIN units u1 ON u1.id=c1.unit_id WHERE c1.tenant_id=t.id AND u1.building_id = ANY($${p.length})))`); }
    const rows = await this.ds.query(`
      SELECT t.*, c.contract_no, c.expiry_date, un.unit_no, b.name AS building_name
      FROM tenants t
      LEFT JOIN LATERAL (SELECT * FROM contracts c WHERE c.tenant_id=t.id ORDER BY (c.status='Active') DESC, c.start_date DESC LIMIT 1) c ON TRUE
      LEFT JOIN units un ON un.id=c.unit_id LEFT JOIN buildings b ON b.id=un.building_id
      WHERE ${w.join(' AND ')} ORDER BY t.name LIMIT 500`, p);
    return rows.map((r: any) => ({ id: r.id, tenantNo: r.tenant_no, name: r.name, mobile: r.mobile, email: r.email, idType: r.id_type, idNumber: r.id_number, nationality: r.nationality, status: r.status,
      current: r.contract_no ? { contractNo: r.contract_no, expiryDate: r.expiry_date, unitNo: r.unit_no, buildingName: r.building_name } : null }));
  }

  @Get(':id') @Roles(...STAFF, Role.TENANT)
  async get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    if (u.role === Role.TENANT && u.tenantId !== id) throw new ForbiddenException();
    const t = await this.tenants.findOne({ where: { id }, relations: { contracts: { unit: { building: true } } } });
    if (!t) throw new NotFoundException();
    const s = buildingScope(u);
    if (s && u.role !== Role.TENANT && t.contracts.length && !t.contracts.some((c) => s.includes(c.unit.buildingId))) throw new ForbiddenException('Tenant is outside your assigned buildings');
    t.contracts.sort((a, b) => b.startDate.localeCompare(a.startDate));
    return t;
  }

  @Post() @Roles(Role.PROPERTY_MANAGER)
  create(@Body() d: TenantDto) {
    return this.ds.transaction(async (em) => em.save(Tenant, em.create(Tenant, { ...d, email: (d.email || '').toLowerCase(), tenantNo: await this.num.next(em, 'tenant', 'T-') })));
  }

  /** Tenant app login: creates it (or resets the password). The temporary password is shown once; the tenant must change it at first sign-in. */
  @Post(':id/login') @Roles(Role.PROPERTY_MANAGER)
  async createLogin(@Param('id', ParseUUIDPipe) id: string, @Body() d: LoginDto) {
    const t = await this.tenants.findOneBy({ id }); if (!t) throw new NotFoundException();
    const users = this.ds.getRepository(User);
    let u = await users.findOne({ where: { tenantId: id, role: Role.TENANT } });
    const email = (d.email || u?.email || t.email || '').toLowerCase().trim();
    if (!email) throw new BadRequestException('Add the tenant\'s email address first (it is their login)');
    const clash = await users.findOne({ where: { email } }); if (clash && clash.id !== u?.id) throw new ConflictException('This email is already used by another login');
    const pw = tempPassword();
    if (u) { u.email = email; u.isActive = true; u.mustChangePassword = true; (u as any).passwordHash = await bcrypt.hash(pw, 10); await users.save(u); }
    else u = await users.save(users.create({ email, name: t.name, role: Role.TENANT, tenantId: id, mustChangePassword: true, passwordHash: await bcrypt.hash(pw, 10) }));
    if (!t.email) await this.tenants.update(id, { email });
    return { email, temporaryPassword: pw, note: 'Give this to the tenant privately. They must choose a new password when they first sign in.' };
  }

  @Get(':id/login') @Roles(Role.PROPERTY_MANAGER)
  async loginStatus(@Param('id', ParseUUIDPipe) id: string) {
    const u = await this.ds.getRepository(User).findOne({ where: { tenantId: id, role: Role.TENANT } });
    return u ? { exists: true, email: u.email, isActive: u.isActive, mustChangePassword: u.mustChangePassword, lastLoginAt: u.lastLoginAt } : { exists: false };
  }

  @Patch(':id') @Roles(Role.PROPERTY_MANAGER)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() d: UpdateTenantDto) {
    const t = await this.tenants.findOneBy({ id }); if (!t) throw new NotFoundException();
    Object.assign(t, d); if (d.email !== undefined) t.email = d.email.toLowerCase(); return this.tenants.save(t);
  }
}
