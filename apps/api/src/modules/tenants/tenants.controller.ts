import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsEmail, IsEnum, IsOptional, IsString, Length, MaxLength, ValidateIf } from 'class-validator';
import { DataSource, Repository } from 'typeorm';
import { Role, Tenant, TenantStatus } from '../../database/entities';
import { AuthUser, buildingScope, CurrentUser, Roles } from '../../common/auth';
import { NumberingService } from '../../common/numbering.service';

class TenantDto {
  @IsString() @Length(1, 200) name: string; @IsOptional() @IsString() @MaxLength(30) mobile?: string;
  @IsOptional() @ValidateIf((o) => !!o.email) @IsEmail() email?: string; @IsOptional() @IsString() @MaxLength(60) idType?: string;
  @IsOptional() @IsString() @MaxLength(60) idNumber?: string; @IsOptional() @IsString() @MaxLength(60) nationality?: string;
  @IsOptional() @IsEnum(TenantStatus) status?: TenantStatus;
}
class UpdateTenantDto {
  @IsOptional() @IsString() @Length(1, 200) name?: string; @IsOptional() @IsString() @MaxLength(30) mobile?: string;
  @IsOptional() @ValidateIf((o) => !!o.email) @IsEmail() email?: string; @IsOptional() @IsString() @MaxLength(60) idType?: string;
  @IsOptional() @IsString() @MaxLength(60) idNumber?: string; @IsOptional() @IsString() @MaxLength(60) nationality?: string;
  @IsOptional() @IsEnum(TenantStatus) status?: TenantStatus;
}
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

  @Patch(':id') @Roles(Role.PROPERTY_MANAGER)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() d: UpdateTenantDto) {
    const t = await this.tenants.findOneBy({ id }); if (!t) throw new NotFoundException();
    Object.assign(t, d); if (d.email !== undefined) t.email = d.email.toLowerCase(); return this.tenants.save(t);
  }
}
