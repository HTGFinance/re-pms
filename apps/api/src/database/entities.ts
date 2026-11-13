/**
 * RE-PMS data model.
 * One central PostgreSQL database for all buildings (no per-building databases).
 * Money is stored as NUMERIC(14,3) — Omani Rial with 3 decimals (baisa) — and handled as strings
 * in TypeScript to avoid floating-point errors. See common/money.ts.
 */
import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, JoinTable, ManyToMany, ManyToOne,
  OneToMany, PrimaryColumn, PrimaryGeneratedColumn, Unique, UpdateDateColumn,
} from 'typeorm';

const money = { type: 'numeric' as const, precision: 14, scale: 3, default: 0 };

export enum Role {
  ADMIN = 'ADMIN',                       // full access, user management
  PROPERTY_MANAGER = 'PROPERTY_MANAGER', // buildings, units, tenants, contracts
  FINANCE = 'FINANCE',                   // ledgers, budgets, verification, reports
  RECOVERY = 'RECOVERY',                 // rent collection and arrears
  MAINTENANCE_SUPERVISOR = 'MAINTENANCE_SUPERVISOR',
  TECHNICIAN = 'TECHNICIAN',
  EXECUTIVE = 'EXECUTIVE',               // read-only dashboards
  TENANT = 'TENANT',                     // own data only
}

export enum BuildingType { RESIDENTIAL = 'Residential', COMMERCIAL = 'Commercial', MIXED = 'Mixed use', WAREHOUSE = 'Warehouse', OTHER = 'Other' }
export enum TenantStatus { ACTIVE = 'Active', INACTIVE = 'Inactive', VACATED = 'Vacated', BLACKLISTED = 'Blacklisted' }
export enum ContractStatus { DRAFT = 'Draft', UPCOMING = 'Upcoming', ACTIVE = 'Active', ENDED = 'Ended', TERMINATED = 'Terminated' }
export enum EContractStatus { DRAFT = 'Draft', SENT = 'Sent to tenant', TENANT_ACCEPTED = 'Tenant accepted', LANDLORD_APPROVED = 'Landlord approved', REGISTERED = 'Registered' }
export enum PaymentFrequency { MONTHLY = 'Monthly', QUARTERLY = 'Quarterly', HALF_YEARLY = 'Half-yearly', YEARLY = 'Yearly' }
export enum PaymentStatus { PENDING = 'Pending', VERIFIED = 'Verified', REJECTED = 'Rejected' }
export enum PaymentMethod { GATEWAY = 'Online gateway', BANK_TRANSFER = 'Bank transfer', CASH = 'Cash', CHEQUE = 'Cheque', CARD = 'Card (POS)', OPENING = 'Opening advance' }

@Entity('buildings')
export class Building {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column({ length: 20 }) code: string;           // e.g. B1
  @Index({ unique: true }) @Column({ length: 150 }) name: string;
  @Column({ type: 'enum', enum: BuildingType, default: BuildingType.RESIDENTIAL }) type: BuildingType;
  @Column({ length: 200, default: '' }) location: string;
  @Column({ name: 'address_code', length: 200, default: '' }) addressCode: string; // way / building / plot no.
  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true }) lat: string | null;
  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true }) lng: string | null;
  @Column({ length: 100, default: '' }) municipality: string;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @OneToMany(() => Unit, (u) => u.building) units: Unit[];
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

@Entity('units')
@Unique('uq_unit_building_no', ['building', 'unitNo'])
export class Unit {
  @PrimaryGeneratedColumn('uuid') id: string;
  @ManyToOne(() => Building, (b) => b.units, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'building_id' }) building: Building;
  @Column({ name: 'building_id' }) buildingId: string;
  @Column({ name: 'unit_no', length: 30 }) unitNo: string;
  @Column({ name: 'unit_type', length: 60, default: '' }) unitType: string; // Flat 2BHK, Retail Shop, Office, Warehouse…
  @Column({ name: 'listed_rent', ...money }) listedRent: string;
  @Column({ name: 'vat_applicable', default: false }) vatApplicable: boolean;
  @Column({ name: 'area_sqm', type: 'numeric', precision: 10, scale: 2, nullable: true }) areaSqm: string | null;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column({ name: 'tenant_no', length: 20 }) tenantNo: string; // T-0001
  @Index() @Column({ length: 200 }) name: string;
  @Column({ length: 30, default: '' }) mobile: string;
  @Column({ length: 150, default: '' }) email: string;
  @Column({ name: 'id_type', length: 60, default: '' }) idType: string;
  @Column({ name: 'id_number', length: 60, default: '' }) idNumber: string;
  @Column({ length: 60, default: '' }) nationality: string;
  @Column({ type: 'enum', enum: TenantStatus, default: TenantStatus.ACTIVE }) status: TenantStatus;
  @OneToMany(() => Contract, (c) => c.tenant) contracts: Contract[];
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

@Entity('contracts')
export class Contract {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column({ name: 'contract_no', length: 20 }) contractNo: string; // CTR-0001
  @ManyToOne(() => Tenant, (t) => t.contracts, { nullable: false }) @JoinColumn({ name: 'tenant_id' }) tenant: Tenant;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @ManyToOne(() => Unit, { nullable: false }) @JoinColumn({ name: 'unit_id' }) unit: Unit;
  @Index() @Column({ name: 'unit_id' }) unitId: string;
  @Column({ name: 'start_date', type: 'date' }) startDate: string;
  @Column({ name: 'expiry_date', type: 'date' }) expiryDate: string;
  @Column({ name: 'tenancy_from', type: 'date' }) tenancyFrom: string; // first day of the continuous tenancy (renewals keep it)
  @Column({ name: 'monthly_rent', ...money }) monthlyRent: string;
  @Column({ name: 'security_deposit', ...money }) securityDeposit: string;
  @Column({ name: 'payment_frequency', type: 'enum', enum: PaymentFrequency, default: PaymentFrequency.MONTHLY }) paymentFrequency: PaymentFrequency;
  @Column({ name: 'rent_due_day', type: 'smallint', default: 1 }) rentDueDay: number;
  @Column({ name: 'notice_months', type: 'smallint', default: 1 }) noticeMonths: number;
  @Column({ name: 'vat_rate', type: 'numeric', precision: 5, scale: 4, default: 0 }) vatRate: string; // 0.0500 = 5%
  @Column({ type: 'enum', enum: ContractStatus, default: ContractStatus.DRAFT }) status: ContractStatus;
  @Column({ name: 'e_status', type: 'enum', enum: EContractStatus, default: EContractStatus.DRAFT }) eStatus: EContractStatus;
  @Column({ name: 'municipality_reg_no', length: 60, default: '' }) municipalityRegNo: string;
  @Column({ name: 'municipality_reg_date', type: 'date', nullable: true }) municipalityRegDate: string | null;
  @Column({ name: 'municipality_fee', ...money }) municipalityFee: string;
  @Column({ name: 'renewal_of', type: 'uuid', nullable: true }) renewalOf: string | null;
  @Column({ type: 'text', default: '' }) notes: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

/** Rent obligations (phase 2 generates these monthly from active contracts). */
@Entity('invoices')
@Unique('uq_invoice_contract_period', ['contractId', 'period'])
export class Invoice {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column({ name: 'invoice_no', length: 20 }) invoiceNo: string;
  @Column({ name: 'contract_id' }) contractId: string;
  @ManyToOne(() => Contract) @JoinColumn({ name: 'contract_id' }) contract: Contract;
  @Index() @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 7 }) period: string; // YYYY-MM
  @Index() @Column({ name: 'due_date', type: 'date' }) dueDate: string;
  @Column(money) rent: string;
  @Column(money) vat: string;
  @Column(money) total: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}

/** Other debits to a tenant: opening balances, recoverable maintenance, fees. */
@Entity('ledger_charges')
export class LedgerCharge {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column({ name: 'charge_no', length: 20 }) chargeNo: string;
  @Index() @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ type: 'date' }) date: string;
  @Column(money) amount: string;
  @Column({ length: 300 }) description: string;
  @Column({ length: 40, default: 'Other' }) kind: string; // Opening balance, Maintenance, Fee, Other
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column({ name: 'receipt_no', length: 20 }) receiptNo: string;
  @Index() @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ type: 'date' }) date: string;
  @Column(money) amount: string;
  @Column({ type: 'enum', enum: PaymentMethod }) method: PaymentMethod;
  @Column({ length: 100, default: '' }) reference: string;
  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING }) status: PaymentStatus;
  @Column({ name: 'attachment', length: 300, default: '' }) attachment: string;
  @Column({ name: 'recorded_by', type: 'uuid', nullable: true }) recordedBy: string | null;
  @Column({ name: 'verified_by', type: 'uuid', nullable: true }) verifiedBy: string | null;
  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true }) verifiedAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}

@Entity('budgets')
@Unique('uq_budget_building_period', ['buildingId', 'period'])
export class Budget {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'building_id' }) buildingId: string;
  @ManyToOne(() => Building, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'building_id' }) building: Building;
  @Column({ length: 7 }) period: string; // YYYY-MM
  @Column({ name: 'rental_income', ...money }) rentalIncome: string;
  @Column(money) collection: string;
  @Column(money) maintenance: string;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column({ length: 150 }) email: string;
  @Column({ length: 150 }) name: string;
  @Column({ name: 'password_hash', length: 100, select: false }) passwordHash: string;
  @Column({ type: 'enum', enum: Role }) role: Role;
  /** Buildings this user may see. Empty = all buildings (ignored for ADMIN/EXECUTIVE/FINANCE). */
  @ManyToMany(() => Building) @JoinTable({ name: 'user_buildings', joinColumn: { name: 'user_id' }, inverseJoinColumn: { name: 'building_id' } }) buildings: Building[];
  /** For TENANT logins: the tenant record they may see. */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true }) tenantId: string | null;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true }) lastLoginAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}

@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Index() @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId: string | null;
  @Column({ name: 'user_email', length: 150, default: '' }) userEmail: string;
  @Column({ length: 10 }) method: string;
  @Column({ length: 300 }) path: string;
  @Column({ name: 'status_code', type: 'smallint' }) statusCode: number;
  @Column({ type: 'jsonb', nullable: true }) body: unknown;
  @Index() @CreateDateColumn({ name: 'at', type: 'timestamptz' }) at: Date;
}

/** Document number counters (T-0001, CTR-0001, RCP-0001 …), incremented atomically. */
@Entity('counters')
export class Counter {
  @PrimaryColumn({ length: 20 }) key: string;
  @Column({ type: 'int', default: 0 }) value: number;
}

export const ENTITIES = [Building, Unit, Tenant, Contract, Invoice, LedgerCharge, Payment, Budget, User, AuditLog, Counter];
