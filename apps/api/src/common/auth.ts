import { CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../database/entities';

export interface AuthUser { id: string; email: string; name: string; role: Role; tenantId: string | null; buildingIds: string[]; mustChangePassword?: boolean }

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const ROLES = 'roles';
/** Restrict a route to these roles (ADMIN always allowed). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);

/** Roles that see every building regardless of assigned scope. */
export const ALL_BUILDINGS_ROLES = [Role.ADMIN, Role.EXECUTIVE, Role.FINANCE];
/** null = no restriction; otherwise the list of building ids the user may access. */
export const buildingScope = (u: AuthUser): string[] | null =>
  ALL_BUILDINGS_ROLES.includes(u.role) || u.buildingIds.length === 0 ? null : u.buildingIds;

/** Global guard: verifies the JWT (Bearer header or httpOnly cookie) then checks @Roles. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.repms_token;
    if (!token) throw new UnauthorizedException('Not signed in');
    try { req.user = await this.jwt.verifyAsync<AuthUser>(token); }
    catch { throw new UnauthorizedException('Session expired, please sign in again'); }
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, targets);
    const u: AuthUser = req.user;
    // New logins with a temporary password may only change it (and sign out / read their identity)
    if (u.mustChangePassword && !/\/api\/auth\/(change-password|me|logout)/.test(req.originalUrl)) throw new ForbiddenException('Please choose a new password first');
    if (roles && u.role !== Role.ADMIN && !roles.includes(u.role)) throw new ForbiddenException('Your role does not allow this action');
    // Tenants may only use routes explicitly opened to them
    if (u.role === Role.TENANT && !(roles && roles.includes(Role.TENANT)) && !String(req.originalUrl).startsWith('/api/auth/')) throw new ForbiddenException('Not available to tenant accounts');
    return true;
  }
}

/** Throws unless the tenant belongs to the user's buildings (or the user is the tenant). */
export async function assertTenantAccess(ds: import('typeorm').DataSource, u: AuthUser, tenantId: string) {
  if (u.role === Role.TENANT) { if (u.tenantId !== tenantId) throw new ForbiddenException(); return; }
  const s = buildingScope(u); if (!s) return;
  const r = await ds.query(`SELECT EXISTS (SELECT 1 FROM contracts c JOIN units un ON un.id=c.unit_id WHERE c.tenant_id=$1 AND un.building_id = ANY($2)) AS ok,
    NOT EXISTS (SELECT 1 FROM contracts WHERE tenant_id=$1) AS none`, [tenantId, s]);
  if (!r[0].ok && !r[0].none) throw new ForbiddenException('Tenant is outside your assigned buildings');
}
/** SQL fragment + params limiting tenants to the user's buildings; `alias` is the tenant id column. */
export function tenantScopeSql(u: AuthUser, alias: string, params: unknown[]): string {
  const s = buildingScope(u); if (!s) return 'TRUE';
  params.push(s);
  return `EXISTS (SELECT 1 FROM contracts sc JOIN units su ON su.id=sc.unit_id WHERE sc.tenant_id=${alias} AND su.building_id = ANY($${params.length}))`;
}
