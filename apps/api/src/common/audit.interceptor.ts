import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Observable, tap } from 'rxjs';
import { AuditLog } from '../database/entities';

const REDACT = ['password', 'newPassword', 'currentPassword', 'token'];
const clean = (b: any) => {
  if (!b || typeof b !== 'object') return null;
  const o: any = Array.isArray(b) ? [...b] : { ...b };
  for (const k of REDACT) if (k in o) o[k] = '***';
  const s = JSON.stringify(o); return s.length > 20000 ? { truncated: true } : o;
};

/** Writes every change (POST/PUT/PATCH/DELETE) to the audit_log table: who, when, what. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private ds: DataSource) {}
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest(); const res = ctx.switchToHttp().getResponse();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next.handle();
    const write = (status: number) => this.ds.getRepository(AuditLog).insert({
      userId: req.user?.id ?? null, userEmail: req.user?.email ?? (req.body?.email || ''), method: req.method,
      path: String(req.originalUrl).slice(0, 300), statusCode: status, body: clean(req.body),
    }).catch(() => undefined);
    return next.handle().pipe(tap({ next: () => write(res.statusCode), error: (e) => write(e?.status || 500) }));
  }
}
