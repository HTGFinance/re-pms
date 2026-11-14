import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Attachment, Complaint, ComplaintEvent, ComplaintStatus as S, Role } from '../../database/entities';
import { AuthUser } from '../../common/auth';
import { NotifyService } from '../../common/notify.service';

/** Allowed staff moves. 'Work completed' is turned into 'Tenant confirmation pending' automatically. */
export const STAFF_FLOW: Record<S, S[]> = {
  [S.NEW]: [S.REVIEWED, S.ASSIGNED, S.CANCELLED],
  [S.REVIEWED]: [S.ASSIGNED, S.AWAITING, S.CANCELLED],
  [S.ASSIGNED]: [S.IN_PROGRESS, S.AWAITING, S.COMPLETED],
  [S.IN_PROGRESS]: [S.AWAITING, S.COMPLETED],
  [S.AWAITING]: [S.IN_PROGRESS, S.ASSIGNED],
  [S.COMPLETED]: [],
  [S.CONFIRMATION]: [S.CLOSED, S.IN_PROGRESS],
  [S.CLOSED]: [S.REVIEWED],
  [S.CANCELLED]: [],
};
/** Labels the tenant sees (spec section 3D). */
export const TENANT_LABEL: Record<S, string> = {
  [S.NEW]: 'Complaint received', [S.REVIEWED]: 'Under review', [S.ASSIGNED]: 'Assigned to maintenance', [S.IN_PROGRESS]: 'Work in progress',
  [S.AWAITING]: 'Work in progress', [S.COMPLETED]: 'Completed', [S.CONFIRMATION]: 'Tenant confirmation pending', [S.CLOSED]: 'Closed', [S.CANCELLED]: 'Cancelled',
};
export const AUTO_CLOSE_DAYS = parseInt(process.env.COMPLAINT_AUTO_CLOSE_DAYS || '7', 10);
export const OPEN_STATUSES = [S.NEW, S.REVIEWED, S.ASSIGNED, S.IN_PROGRESS, S.AWAITING];

@Injectable()
export class ComplaintsService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('Complaints'); private timer?: NodeJS.Timeout;
  constructor(private ds: DataSource, private notify: NotifyService) {}
  onModuleInit() { const go = () => this.autoClose().catch((e) => this.log.error(e.message)); go(); this.timer = setInterval(go, 3600_000); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  event(em: EntityManager, complaintId: string, status: string, note: string, u: AuthUser | null, visibleToTenant = true) {
    return em.save(ComplaintEvent, em.create(ComplaintEvent, { complaintId, status, note, visibleToTenant, userId: u?.id ?? null, userName: u ? (u.role === Role.TENANT ? 'Tenant' : u.name) : 'System' }));
  }

  /** Move a complaint to a new status with a timeline entry and tenant notification. */
  async move(em: EntityManager, c: Complaint, to: S, note: string, u: AuthUser | null) {
    const from = c.status;
    if (to === S.COMPLETED) {
      c.completedAt = new Date();
      await this.event(em, c.id, S.COMPLETED, note, u);
      to = c.tenantId ? S.CONFIRMATION : S.CLOSED;
    }
    c.status = to;
    if (to === S.CLOSED) c.closedAt = new Date();
    if (to === S.REVIEWED && (from === S.CONFIRMATION || from === S.CLOSED)) { c.reopenCount += 1; c.completedAt = null; c.closedAt = null; }
    await em.save(Complaint, c);
    // The completion note sits on the 'Work completed' entry, so the confirmation entry carries none
    await this.event(em, c.id, to, to === S.CONFIRMATION ? '' : note, u);
    if (c.tenantId && TENANT_LABEL[from] !== TENANT_LABEL[to]) {
      const ask = to === S.CONFIRMATION ? ' Please confirm in the app whether the problem is solved, or reopen it.' : '';
      await this.notify.tenant(c.tenantId, `Complaint ${c.refNo}: ${TENANT_LABEL[to]}`, (note ? note + ' ' : '') + ask, `/t/complaints/${c.id}`, em);
    }
    return c;
  }

  async get(id: string) {
    const c = await this.ds.getRepository(Complaint).findOneBy({ id }); if (!c) throw new NotFoundException('Complaint not found'); return c;
  }

  /** Full detail: complaint + timeline + attachments + names. */
  async detail(id: string, forTenant: boolean) {
    const [c] = await this.ds.query(`
      SELECT c.*, t.name AS tenant_name, t.tenant_no, t.mobile AS tenant_mobile, un.unit_no, b.name AS building_name, b.lat, b.lng, b.address_code, au.name AS assigned_name
      FROM complaints c JOIN buildings b ON b.id=c.building_id LEFT JOIN tenants t ON t.id=c.tenant_id LEFT JOIN units un ON un.id=c.unit_id LEFT JOIN users au ON au.id=c.assigned_to
      WHERE c.id=$1`, [id]);
    if (!c) throw new NotFoundException('Complaint not found');
    const events = await this.ds.query(`SELECT status, note, user_name, at, visible_to_tenant FROM complaint_events WHERE complaint_id=$1 ${forTenant ? 'AND visible_to_tenant' : ''} ORDER BY at, id`, [id]);
    const files = await this.ds.getRepository(Attachment).find({ where: { ownerType: 'complaint', ownerId: id }, order: { createdAt: 'ASC' } });
    return this.shape(c, forTenant, events, files);
  }

  shape(c: any, forTenant: boolean, events?: any[], files?: Attachment[]) {
    const status: S = c.status;
    const out: any = { id: c.id, refNo: c.ref_no, category: c.category, subcategory: c.subcategory, title: c.title, description: c.description, priority: c.priority,
      status, statusLabel: TENANT_LABEL[status], expectedDate: c.expected_date, preferredVisit: c.preferred_visit, reportedAt: c.created_at, completedAt: c.completed_at,
      closedAt: c.closed_at, reopenCount: c.reopen_count, tenantRating: c.tenant_rating, tenantFeedback: c.tenant_feedback,
      unit: c.unit_no ? `${c.building_name} ${c.unit_no}` : c.building_name, building: { id: c.building_id, name: c.building_name, lat: c.lat, lng: c.lng, addressCode: c.address_code },
      assignedTo: c.assigned_to ? { id: c.assigned_to, name: c.assigned_name } : null };
    if (!forTenant) { out.tenant = c.tenant_id ? { id: c.tenant_id, name: c.tenant_name, tenantNo: c.tenant_no, mobile: c.tenant_mobile } : null; out.nextSteps = STAFF_FLOW[status]; }
    if (events) out.timeline = events.map((e) => ({ status: forTenant ? (TENANT_LABEL[e.status as S] ?? e.status) : e.status, note: e.note, by: e.user_name, at: e.at, ...(forTenant ? {} : { visibleToTenant: e.visible_to_tenant }) }));
    if (files) out.files = files.filter((f) => !forTenant || f.kind !== 'internal').map((f) => ({ id: f.id, kind: f.kind, name: f.originalName, mime: f.mime, size: f.size, url: `/api/files/${f.id}` }));
    return out;
  }

  /** Close complaints the tenant has not answered within AUTO_CLOSE_DAYS. */
  async autoClose() {
    const rows: Complaint[] = await this.ds.getRepository(Complaint).createQueryBuilder('c')
      .where('c.status = :s', { s: S.CONFIRMATION }).andWhere(`c.completed_at < now() - (:d || ' days')::interval`, { d: String(AUTO_CLOSE_DAYS) }).getMany();
    for (const c of rows) await this.ds.transaction((em) => this.move(em, c, S.CLOSED, `Closed automatically: no reply from the tenant within ${AUTO_CLOSE_DAYS} days of completion.`, null));
    if (rows.length) this.log.log(`Auto-closed ${rows.length} complaint(s)`);
  }

  async assertCategory(category: string, subcategory: string) {
    const ok = await this.ds.query(`SELECT 1 FROM maintenance_categories WHERE category=$1 AND subcategory=$2 AND is_active`, [category, subcategory]);
    if (!ok.length) throw new BadRequestException('Choose a category and subcategory from the list');
  }

  assertMove(c: Complaint, to: S) {
    if (!STAFF_FLOW[c.status].includes(to)) throw new ConflictException(`From "${c.status}" the next step can be: ${STAFF_FLOW[c.status].join(', ') || 'none'}`);
  }
}
