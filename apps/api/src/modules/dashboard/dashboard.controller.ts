import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Role } from '../../database/entities';
import { AuthUser, buildingScope, CurrentUser, Roles } from '../../common/auth';
import { addDays, todayOman } from '../../common/dates';
import { omr } from '../../common/money';

/** Phase 1 summary for the admin home page. Full executive dashboard (budget vs actual, periods) is phase 5. */
@Controller('dashboard')
export class DashboardController {
  constructor(private ds: DataSource) {}

  @Get('summary') @Roles(Role.PROPERTY_MANAGER, Role.FINANCE, Role.RECOVERY, Role.MAINTENANCE_SUPERVISOR, Role.EXECUTIVE)
  async summary(@CurrentUser() u: AuthUser) {
    const s = buildingScope(u); const t = todayOman();
    const scope = s ? 'AND un.building_id = ANY($3)' : '';
    const p = s ? [t, addDays(t, 90), s] : [t, addDays(t, 90)];
    const [r] = await this.ds.query(`
      SELECT
        (SELECT COUNT(DISTINCT un.building_id) FROM units un WHERE un.is_active ${scope})::int AS buildings,
        (SELECT COUNT(*) FROM units un WHERE un.is_active ${scope})::int AS units,
        (SELECT COUNT(*) FROM contracts c JOIN units un ON un.id=c.unit_id WHERE c.status='Active' ${scope})::int AS occupied,
        (SELECT COALESCE(SUM(c.monthly_rent * (1 + c.vat_rate)),0) FROM contracts c JOIN units un ON un.id=c.unit_id WHERE c.status='Active' ${scope}) AS rent_roll,
        (SELECT COALESCE(SUM(c.security_deposit),0) FROM contracts c JOIN units un ON un.id=c.unit_id WHERE c.status='Active' ${scope}) AS deposits,
        (SELECT COUNT(*) FROM contracts c JOIN units un ON un.id=c.unit_id WHERE c.status='Active' AND c.expiry_date BETWEEN $1 AND $2 ${scope})::int AS expiring90,
        (SELECT COUNT(*) FROM contracts c JOIN units un ON un.id=c.unit_id WHERE c.status IN ('Active','Upcoming') AND c.e_status <> 'Registered' ${scope})::int AS unregistered,
        (SELECT COUNT(*) FROM contracts c JOIN units un ON un.id=c.unit_id WHERE c.status='Draft' ${scope})::int AS drafts`, p);
    return { asOf: t, buildings: r.buildings, units: r.units, occupied: r.occupied, vacant: r.units - r.occupied,
      occupancy: r.units ? Math.round((r.occupied / r.units) * 1000) / 10 : 0, monthlyRentRoll: omr(r.rent_roll), depositsHeld: omr(r.deposits),
      expiringWithin90Days: r.expiring90, notRegistered: r.unregistered, draftContracts: r.drafts };
  }
}
