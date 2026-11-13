import { Controller, Get, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, Role } from '../../database/entities';
import { Roles } from '../../common/auth';

@Controller('audit') @Roles(Role.ADMIN)
export class AuditController {
  constructor(@InjectRepository(AuditLog) private log: Repository<AuditLog>) {}
  @Get() list(@Query('limit') limit = '200') { return this.log.find({ order: { id: 'DESC' }, take: Math.min(1000, parseInt(limit, 10) || 200) }); }
}
