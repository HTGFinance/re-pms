import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsBoolean, IsEnum, IsNumberString, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { Repository, DataSource } from 'typeorm';
import { Building, BuildingType, ContractStatus, Role, Unit } from '../../database/entities';
import { AuthUser, buildingScope, CurrentUser, Roles } from '../../common/auth';
import { omr } from '../../common/money';

class BuildingDto {
  @IsString() @Length(1, 20) code: string; @IsString() @Length(1, 150) name: string;
  @IsOptional() @IsEnum(BuildingType) type?: BuildingType; @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsString() @MaxLength(200) addressCode?: string; @IsOptional() @IsNumberString() lat?: string; @IsOptional() @IsNumberString() lng?: string;
  @IsOptional() @IsString() @MaxLength(100) municipality?: string; @IsOptional() @IsBoolean() isActive?: boolean;
}
class UpdateBuildingDto {
  @IsOptional() @IsString() @Length(1, 20) code?: string; @IsOptional() @IsString() @Length(1, 150) name?: string;
  @IsOptional() @IsEnum(BuildingType) type?: BuildingType; @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsString() @MaxLength(200) addressCode?: string; @IsOptional() @IsNumberString() lat?: string; @IsOptional() @IsNumberString() lng?: string;
  @IsOptional() @IsString() @MaxLength(100) municipality?: string; @IsOptional() @IsBoolean() isActive?: boolean;
}
class UnitDto {
  @IsUUID() buildingId: string; @IsString() @Length(1, 30) unitNo: string; @IsOptional() @IsString() @MaxLength(60) unitType?: string;
  @IsOptional() @IsNumberString() listedRent?: string; @IsOptional() @IsBoolean() vatApplicable?: boolean; @IsOptional() @IsNumberString() areaSqm?: string;
}
class UpdateUnitDto {
  @IsOptional() @IsString() @Length(1, 30) unitNo?: string; @IsOptional() @IsString() @MaxLength(60) unitType?: string;
  @IsOptional() @IsNumberString() listedRent?: string; @IsOptional() @IsBoolean() vatApplicable?: boolean; @IsOptional() @IsNumberString() areaSqm?: string; @IsOptional() @IsBoolean() isActive?: boolean;
}

const STAFF = [Role.PROPERTY_MANAGER, Role.FINANCE, Role.RECOVERY, Role.MAINTENANCE_SUPERVISOR, Role.TECHNICIAN, Role.EXECUTIVE];

@Controller()
export class PropertiesController {
  constructor(@InjectRepository(Building) private buildings: Repository<Building>, @InjectRepository(Unit) private units: Repository<Unit>, private ds: DataSource) {}

  private check(u: AuthUser, buildingId: string) { const s = buildingScope(u); if (s && !s.includes(buildingId)) throw new ForbiddenException('This building is outside your assigned buildings'); }

  /** Buildings with unit and occupancy counts. */
  @Get('buildings') @Roles(...STAFF)
  async listBuildings(@CurrentUser() u: AuthUser) {
    const s = buildingScope(u);
    const rows = await this.ds.query(`
      SELECT b.*, COUNT(un.id)::int AS units,
        COUNT(un.id) FILTER (WHERE EXISTS (SELECT 1 FROM contracts c WHERE c.unit_id = un.id AND c.status = 'Active'))::int AS occupied
      FROM buildings b LEFT JOIN units un ON un.building_id = b.id AND un.is_active
      ${s ? 'WHERE b.id = ANY($1)' : ''} GROUP BY b.id ORDER BY b.code`, s ? [s] : []);
    return rows.map((r: any) => ({ id: r.id, code: r.code, name: r.name, type: r.type, location: r.location, addressCode: r.address_code, lat: r.lat, lng: r.lng, municipality: r.municipality, isActive: r.is_active, units: r.units, occupied: r.occupied }));
  }

  @Post('buildings') @Roles(Role.PROPERTY_MANAGER)
  async createBuilding(@Body() d: BuildingDto) {
    if (await this.buildings.exists({ where: [{ code: d.code }, { name: d.name }] })) throw new ConflictException('A building with this code or name already exists');
    return this.buildings.save(this.buildings.create(d as Partial<Building>));
  }

  @Patch('buildings/:id') @Roles(Role.PROPERTY_MANAGER)
  async updateBuilding(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: UpdateBuildingDto) {
    this.check(u, id); const b = await this.buildings.findOneBy({ id }); if (!b) throw new NotFoundException();
    Object.assign(b, d); return this.buildings.save(b);
  }

  /** Units, optionally for one building, with current tenant and contract. */
  @Get('units') @Roles(...STAFF)
  async listUnits(@CurrentUser() u: AuthUser, @Query('buildingId') buildingId?: string, @Query('status') status?: 'Occupied' | 'Vacant') {
    const s = buildingScope(u); const p: unknown[] = []; const w: string[] = ['un.is_active'];
    if (s) { p.push(s); w.push(`un.building_id = ANY($${p.length})`); }
    if (buildingId) { p.push(buildingId); w.push(`un.building_id = $${p.length}`); }
    const rows = await this.ds.query(`
      SELECT un.id, un.unit_no, un.unit_type, un.listed_rent, un.vat_applicable, un.area_sqm, un.building_id, b.name AS building_name, b.code AS building_code,
        c.id AS contract_id, c.contract_no, c.expiry_date, c.monthly_rent, t.id AS tenant_id, t.name AS tenant_name, t.tenant_no
      FROM units un JOIN buildings b ON b.id = un.building_id
      LEFT JOIN contracts c ON c.unit_id = un.id AND c.status = 'Active'
      LEFT JOIN tenants t ON t.id = c.tenant_id
      WHERE ${w.join(' AND ')} ORDER BY b.code, un.unit_no`, p);
    return rows.map((r: any) => ({ id: r.id, unitNo: r.unit_no, unitType: r.unit_type, listedRent: omr(r.listed_rent), vatApplicable: r.vat_applicable, areaSqm: r.area_sqm,
      buildingId: r.building_id, buildingName: r.building_name, buildingCode: r.building_code, status: r.contract_id ? 'Occupied' : 'Vacant',
      contract: r.contract_id ? { id: r.contract_id, contractNo: r.contract_no, expiryDate: r.expiry_date, monthlyRent: omr(r.monthly_rent) } : null,
      tenant: r.tenant_id ? { id: r.tenant_id, name: r.tenant_name, tenantNo: r.tenant_no } : null }))
      .filter((x: any) => !status || x.status === status);
  }

  @Post('units') @Roles(Role.PROPERTY_MANAGER)
  async createUnit(@CurrentUser() u: AuthUser, @Body() d: UnitDto) {
    this.check(u, d.buildingId);
    if (!(await this.buildings.exists({ where: { id: d.buildingId } }))) throw new BadRequestException('Unknown building');
    if (await this.units.exists({ where: { buildingId: d.buildingId, unitNo: d.unitNo } })) throw new ConflictException('This unit number already exists in the building');
    return this.units.save(this.units.create({ ...d, listedRent: d.listedRent ? omr(d.listedRent) : '0.000' }));
  }

  @Patch('units/:id') @Roles(Role.PROPERTY_MANAGER)
  async updateUnit(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: UpdateUnitDto) {
    const un = await this.units.findOneBy({ id }); if (!un) throw new NotFoundException(); this.check(u, un.buildingId);
    if (d.isActive === false && await this.ds.query(`SELECT 1 FROM contracts WHERE unit_id=$1 AND status IN ('${ContractStatus.ACTIVE}','${ContractStatus.UPCOMING}') LIMIT 1`, [id]).then((r) => r.length))
      throw new ConflictException('Unit has an active or upcoming contract');
    Object.assign(un, d); if (d.listedRent) un.listedRent = omr(d.listedRent); return this.units.save(un);
  }
}
