import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Response } from 'express';
import { DataSource } from 'typeorm';
import { Attachment, Complaint, ComplaintStatus as S, MaintenanceCategory, NoticeStatus, Payment, Priority, Role, Unit, User, VacateNotice } from '../../database/entities';
import { AuthUser, buildingScope, CurrentUser, Roles } from '../../common/auth';
import { FilesService, MAX_FILE_BYTES } from '../../common/files.service';
import { NotifyService } from '../../common/notify.service';
import { NumberingService } from '../../common/numbering.service';
import { ComplaintsService, OPEN_STATUSES } from './complaints.service';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STAFF = [Role.MAINTENANCE_SUPERVISOR, Role.PROPERTY_MANAGER, Role.TECHNICIAN, Role.EXECUTIVE];
const MANAGERS = [Role.MAINTENANCE_SUPERVISOR, Role.PROPERTY_MANAGER];

class StaffComplaintDto {
  @IsUUID() buildingId: string; @IsOptional() @IsUUID() unitId?: string; @IsString() @Length(1, 60) category: string; @IsString() @Length(1, 80) subcategory: string;
  @IsOptional() @IsString() @MaxLength(150) title?: string; @IsString() @Length(3, 4000) description: string; @IsOptional() @IsEnum(Priority) priority?: Priority;
}
class UpdateDto {
  @IsOptional() @IsEnum(Priority) priority?: Priority; @IsOptional() @ValidateIf((o) => o.assignedTo !== null) @IsUUID() assignedTo?: string | null;
  @IsOptional() @ValidateIf((o) => o.expectedDate !== null) @Matches(DATE) expectedDate?: string | null;
  @IsOptional() @IsString() @Length(1, 60) category?: string; @IsOptional() @IsString() @Length(1, 80) subcategory?: string;
}
class StatusDto { @IsEnum(S) status: S; @IsOptional() @IsString() @MaxLength(2000) note?: string; @IsOptional() @IsBoolean() internal?: boolean }
class NoteDto { @IsString() @Length(1, 2000) note: string; @IsOptional() @IsBoolean() internal?: boolean }
class CategoryDto { @IsString() @Length(1, 60) category: string; @IsString() @Length(1, 80) subcategory: string; @IsOptional() @IsInt() @Min(0) @Max(999) sortOrder?: number }
class CategoryUpdateDto { @IsOptional() @IsBoolean() isActive?: boolean; @IsOptional() @IsInt() @Min(0) @Max(999) sortOrder?: number }
class NoticeUpdateDto {
  @IsOptional() @IsEnum(NoticeStatus) status?: NoticeStatus; @IsOptional() @Matches(DATE) inspectionDate?: string; @IsOptional() @Matches(DATE) handoverDate?: string;
  @IsOptional() @IsString() @MaxLength(2000) staffNote?: string;
}

@Controller()
export class ComplaintsController {
  constructor(private ds: DataSource, private svc: ComplaintsService, private files: FilesService, private notify: NotifyService, private num: NumberingService) {}

  private async access(u: AuthUser, c: Complaint) {
    const s = buildingScope(u); if (s && !s.includes(c.buildingId)) throw new ForbiddenException('Complaint is outside your assigned buildings');
    if (u.role === Role.TECHNICIAN && c.assignedTo !== u.id) throw new ForbiddenException('This job is not assigned to you');
  }

  @Get('complaints') @Roles(...STAFF)
  async list(@CurrentUser() u: AuthUser, @Query('status') status?: string, @Query('buildingId') buildingId?: string, @Query('open') open?: string,
    @Query('assignedTo') assignedTo?: string, @Query('tenantId') tenantId?: string, @Query('overdue') overdue?: string) {
    const p: unknown[] = []; const w = ['TRUE'];
    const add = (sql: string, v: unknown) => { p.push(v); w.push(sql.replace(/\?/g, '$' + p.length)); };
    const s = buildingScope(u); if (s) add('c.building_id = ANY(?)', s);
    if (u.role === Role.TECHNICIAN) add('c.assigned_to = ?', u.id);
    if (status) add('c.status = ?', status); if (buildingId) add('c.building_id = ?', buildingId); if (assignedTo) add('c.assigned_to = ?', assignedTo); if (tenantId) add('c.tenant_id = ?', tenantId);
    if (open === 'true') add('c.status = ANY(?)', OPEN_STATUSES);
    if (overdue === 'true') { add('c.status = ANY(?)', OPEN_STATUSES); w.push('c.expected_date < CURRENT_DATE'); }
    const rows = await this.ds.query(`
      SELECT c.*, t.name AS tenant_name, t.tenant_no, t.mobile AS tenant_mobile, un.unit_no, b.name AS building_name, b.lat, b.lng, b.address_code, au.name AS assigned_name,
        (SELECT COUNT(*) FROM attachments a WHERE a.owner_type='complaint' AND a.owner_id=c.id)::int AS file_count
      FROM complaints c JOIN buildings b ON b.id=c.building_id LEFT JOIN tenants t ON t.id=c.tenant_id LEFT JOIN units un ON un.id=c.unit_id LEFT JOIN users au ON au.id=c.assigned_to
      WHERE ${w.join(' AND ')} ORDER BY (c.status IN ('Closed','Cancelled')), CASE c.priority WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, c.created_at DESC LIMIT 1000`, p);
    return rows.map((r: any) => ({ ...this.svc.shape(r, false), fileCount: r.file_count, overdue: OPEN_STATUSES.includes(r.status) && r.expected_date && r.expected_date < new Date().toISOString().slice(0, 10) }));
  }

  @Get('complaints/summary') @Roles(...STAFF)
  async summary(@CurrentUser() u: AuthUser) {
    const s = buildingScope(u); const p: unknown[] = s ? [s] : []; const w = s ? 'building_id = ANY($1)' : 'TRUE';
    const [r] = await this.ds.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='New')::int AS new,
      COUNT(*) FILTER (WHERE status IN ('New','Reviewed','Technician assigned','Work in progress','Awaiting materials / approval'))::int AS open,
      COUNT(*) FILTER (WHERE status IN ('Work in progress','Awaiting materials / approval'))::int AS in_progress,
      COUNT(*) FILTER (WHERE status='Tenant confirmation pending')::int AS awaiting_tenant,
      COUNT(*) FILTER (WHERE status IN ('New','Reviewed','Technician assigned','Work in progress','Awaiting materials / approval') AND expected_date < CURRENT_DATE)::int AS overdue,
      ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/86400) FILTER (WHERE completed_at IS NOT NULL)::numeric, 1) AS avg_days,
      ROUND(AVG(tenant_rating)::numeric, 1) AS avg_rating FROM complaints WHERE ${w}`, p);
    return { total: r.total, new: r.new, open: r.open, inProgress: r.in_progress, awaitingTenant: r.awaiting_tenant, overdue: r.overdue, avgResolutionDays: r.avg_days ? Number(r.avg_days) : null, avgRating: r.avg_rating ? Number(r.avg_rating) : null };
  }

  /** People a job can be assigned to. */
  @Get('complaints/assignees') @Roles(...MANAGERS)
  assignees() { return this.ds.query(`SELECT id, name, role FROM users WHERE is_active AND role IN ('TECHNICIAN','MAINTENANCE_SUPERVISOR') ORDER BY role DESC, name`); }

  @Get('complaints/:id') @Roles(...STAFF)
  async get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { await this.access(u, await this.svc.get(id)); return this.svc.detail(id, false); }

  /** Staff-raised job (e.g. common area, or reported by phone). */
  @Post('complaints') @Roles(...MANAGERS)
  async create(@CurrentUser() u: AuthUser, @Body() d: StaffComplaintDto) {
    const s = buildingScope(u); if (s && !s.includes(d.buildingId)) throw new ForbiddenException('Building is outside your assigned buildings');
    await this.svc.assertCategory(d.category, d.subcategory);
    let tenantId: string | null = null;
    if (d.unitId) {
      const un = await this.ds.getRepository(Unit).findOneBy({ id: d.unitId }); if (!un || un.buildingId !== d.buildingId) throw new BadRequestException('Unit is not in this building');
      tenantId = (await this.ds.query(`SELECT tenant_id FROM contracts WHERE unit_id=$1 AND status='Active' LIMIT 1`, [d.unitId]))[0]?.tenant_id ?? null;
    }
    const c = await this.ds.transaction(async (em) => {
      const c = await em.save(Complaint, em.create(Complaint, { ...d, unitId: d.unitId ?? null, tenantId, title: d.title ?? '', refNo: await this.num.next(em, 'complaint', 'CMP-', 5), createdBy: u.id }));
      await this.svc.event(em, c.id, S.NEW, 'Raised by staff', u); return c;
    });
    return this.svc.detail(c.id, false);
  }

  @Patch('complaints/:id') @Roles(...MANAGERS)
  async update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: UpdateDto) {
    const c = await this.svc.get(id); await this.access(u, c);
    if (d.category || d.subcategory) await this.svc.assertCategory(d.category ?? c.category, d.subcategory ?? c.subcategory);
    if (d.assignedTo) { const a = await this.ds.getRepository(User).findOneBy({ id: d.assignedTo }); if (!a || !a.isActive || ![Role.TECHNICIAN, Role.MAINTENANCE_SUPERVISOR].includes(a.role)) throw new BadRequestException('Assign to an active technician or supervisor'); }
    await this.ds.transaction(async (em) => {
      const notes: string[] = [];
      if (d.priority && d.priority !== c.priority) notes.push(`Priority: ${d.priority}`);
      if (d.expectedDate !== undefined && d.expectedDate !== c.expectedDate) notes.push(d.expectedDate ? `Expected completion: ${d.expectedDate}` : 'Expected date cleared');
      if (d.assignedTo !== undefined && d.assignedTo !== c.assignedTo) notes.push(d.assignedTo ? 'Assigned to ' + (await em.findOneBy(User, { id: d.assignedTo }))!.name : 'Unassigned');
      Object.assign(c, d); await em.save(Complaint, c);
      const shared = notes.filter((n) => !n.startsWith('Priority')), internal = notes.filter((n) => n.startsWith('Priority'));
      if (internal.length) await this.svc.event(em, id, c.status, internal.join(' · '), u, false); // priority is a staff matter
      if (shared.length) await this.svc.event(em, id, c.status, shared.join(' · '), u, true);
      // assigning a technician to a new/reviewed complaint moves it to 'Technician assigned'
      if (d.assignedTo && [S.NEW, S.REVIEWED].includes(c.status)) await this.svc.move(em, c, S.ASSIGNED, '', u);
    });
    return this.svc.detail(id, false);
  }

  @Post('complaints/:id/status') @HttpCode(200) @Roles(...MANAGERS, Role.TECHNICIAN)
  async status(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: StatusDto) {
    const c = await this.svc.get(id); await this.access(u, c); this.svc.assertMove(c, d.status);
    if (u.role === Role.TECHNICIAN && ![S.IN_PROGRESS, S.AWAITING, S.COMPLETED].includes(d.status)) throw new ForbiddenException('Technicians can mark work in progress, awaiting materials, or completed');
    if (d.status === S.ASSIGNED && !c.assignedTo) throw new BadRequestException('Choose who the job is assigned to first');
    if (d.status === S.CANCELLED && !d.note) throw new BadRequestException('Give the reason for cancelling');
    await this.ds.transaction((em) => this.svc.move(em, c, d.status, d.note ?? '', u));
    return this.svc.detail(id, false);
  }

  @Post('complaints/:id/notes') @Roles(...MANAGERS, Role.TECHNICIAN)
  async note(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: NoteDto) {
    const c = await this.svc.get(id); await this.access(u, c);
    await this.ds.transaction(async (em) => { await this.svc.event(em, id, c.status, d.note, u, !d.internal); if (!d.internal && c.tenantId) await this.notify.tenant(c.tenantId, `Update on complaint ${c.refNo}`, d.note, `/t/complaints/${id}`, em); });
    return this.svc.detail(id, false);
  }

  /** Before / after photos from the maintenance team (field "files", up to 6). */
  @Post('complaints/:id/files') @Roles(...MANAGERS, Role.TECHNICIAN)
  @UseInterceptors(FilesInterceptor('files', 6, { limits: { fileSize: MAX_FILE_BYTES } }))
  async upload(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @UploadedFiles() files: Express.Multer.File[], @Query('kind') kind = 'after') {
    if (!['before', 'after', 'internal'].includes(kind)) throw new BadRequestException('kind must be before, after or internal');
    const c = await this.svc.get(id); await this.access(u, c); if (!files?.length) throw new BadRequestException('Attach at least one file');
    files.forEach((f) => this.files.check(f));
    await this.ds.transaction(async (em) => { for (const f of files) await this.files.save(em, f, 'complaint', id, kind, u.id); });
    return this.svc.detail(id, false);
  }

  /** Download a file. Tenants may open only their own complaint / payment files. */
  @Get('files/:id') @Roles(...STAFF, Role.FINANCE, Role.RECOVERY, Role.TENANT)
  async file(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const a = await this.ds.getRepository(Attachment).findOneBy({ id }); if (!a) throw new NotFoundException();
    if (a.ownerType === 'complaint') {
      const c = await this.svc.get(a.ownerId);
      if (u.role === Role.TENANT) { if (c.tenantId !== u.tenantId || a.kind === 'internal') throw new ForbiddenException(); }
      else if ([Role.FINANCE, Role.RECOVERY].includes(u.role)) throw new ForbiddenException(); else await this.access(u, c);
    } else if (a.ownerType === 'payment') {
      const p = await this.ds.getRepository(Payment).findOneBy({ id: a.ownerId });
      if (!p || (u.role === Role.TENANT ? p.tenantId !== u.tenantId : ![Role.ADMIN, Role.FINANCE, Role.RECOVERY].includes(u.role))) throw new ForbiddenException();
    } else if (u.role === Role.TENANT) throw new ForbiddenException();
    res.setHeader('Content-Type', a.mime); res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(a.originalName)}"`); res.setHeader('X-Content-Type-Options', 'nosniff');
    this.files.stream(a).pipe(res);
  }

  // ---- categories (configurable by admin) ----
  @Get('maintenance-categories') @Roles(...STAFF, Role.TENANT)
  categories(@Query('all') all?: string) { return this.ds.getRepository(MaintenanceCategory).find({ where: all === 'true' ? {} : { isActive: true }, order: { sortOrder: 'ASC', category: 'ASC', subcategory: 'ASC' } }); }
  @Post('maintenance-categories') @Roles(Role.ADMIN)
  addCategory(@Body() d: CategoryDto) { return this.ds.getRepository(MaintenanceCategory).save({ ...d, sortOrder: d.sortOrder ?? 900 }); }
  @Patch('maintenance-categories/:id') @Roles(Role.ADMIN)
  async updCategory(@Param('id', ParseUUIDPipe) id: string, @Body() d: CategoryUpdateDto) { await this.ds.getRepository(MaintenanceCategory).update(id, d); return this.ds.getRepository(MaintenanceCategory).findOneBy({ id }); }

  // ---- notices to vacate (staff side) ----
  @Get('notices') @Roles(Role.PROPERTY_MANAGER, Role.FINANCE, Role.RECOVERY, Role.EXECUTIVE)
  async notices(@CurrentUser() u: AuthUser, @Query('open') open?: string) {
    const s = buildingScope(u); const p: unknown[] = []; const w = ['TRUE'];
    if (s) { p.push(s); w.push(`un.building_id = ANY($${p.length})`); }
    if (open === 'true') w.push(`n.status NOT IN ('Settled','Cancelled')`);
    return this.ds.query(`SELECT n.*, t.name AS tenant_name, t.mobile, c.contract_no, c.security_deposit, c.expiry_date, un.unit_no, b.name AS building_name
      FROM vacate_notices n JOIN tenants t ON t.id=n.tenant_id JOIN contracts c ON c.id=n.contract_id JOIN units un ON un.id=c.unit_id JOIN buildings b ON b.id=un.building_id
      WHERE ${w.join(' AND ')} ORDER BY (n.status IN ('Settled','Cancelled')), n.final_rent_date`, p);
  }

  @Patch('notices/:id') @Roles(Role.PROPERTY_MANAGER)
  async updNotice(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() d: NoticeUpdateDto) {
    const n = await this.ds.getRepository(VacateNotice).findOneBy({ id }); if (!n) throw new NotFoundException();
    const [{ building_id }] = await this.ds.query(`SELECT un.building_id FROM contracts c JOIN units un ON un.id=c.unit_id WHERE c.id=$1`, [n.contractId]);
    const s = buildingScope(u); if (s && !s.includes(building_id)) throw new ForbiddenException();
    const before = n.status; Object.assign(n, d); await this.ds.getRepository(VacateNotice).save(n);
    const parts = [d.status && d.status !== before ? `Status: ${d.status}` : '', d.inspectionDate ? `Final inspection: ${d.inspectionDate}` : '', d.handoverDate ? `Key handover: ${d.handoverDate}` : '', d.staffNote ?? ''].filter(Boolean);
    if (parts.length) await this.notify.tenant(n.tenantId, `Notice to vacate ${n.refNo}`, parts.join(' · '), '/t/notice');
    return n;
  }
}
