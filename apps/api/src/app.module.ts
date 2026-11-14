import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { config } from './config';
import { dataSourceOptions } from './database/data-source';
import { ENTITIES } from './database/entities';
import { AuthGuard, Public } from './common/auth';
import { AuditInterceptor } from './common/audit.interceptor';
import { NumberingService } from './common/numbering.service';
import { AuthController } from './modules/auth/auth.controller';
import { UsersController } from './modules/users/users.controller';
import { PropertiesController } from './modules/properties/properties.controller';
import { TenantsController } from './modules/tenants/tenants.controller';
import { ContractsController, ContractsService } from './modules/contracts/contracts.controller';
import { ImportsController } from './modules/imports/imports.controller';
import { DashboardController } from './modules/dashboard/dashboard.controller';
import { AuditController } from './modules/audit/audit.controller';
import { LedgerService } from './modules/billing/ledger.service';
import { BillingController } from './modules/billing/billing.controller';
import { PaymentsController } from './modules/payments/payments.controller';
import { ChequesController } from './modules/cheques/cheques.controller';
import { RecoveryController } from './modules/recovery/recovery.controller';

@Controller('health')
class HealthController { @Public() @Get() ok() { return { status: 'ok', time: new Date().toISOString() }; } }

@Module({
  imports: [
    TypeOrmModule.forRoot(dataSourceOptions),
    TypeOrmModule.forFeature(ENTITIES),
    JwtModule.register({ global: true, secret: config.jwtSecret, signOptions: { expiresIn: config.jwtExpiresIn as any } }),
  ],
  controllers: [HealthController, AuthController, UsersController, PropertiesController, TenantsController, ContractsController, ImportsController, DashboardController, AuditController, BillingController, PaymentsController, ChequesController, RecoveryController],
  providers: [
    NumberingService, ContractsService, LedgerService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
