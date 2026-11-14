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
/** Complaint workflow (spec section 4C). 'Work completed' moves straight to 'Tenant confirmation pending'. */
export enum ComplaintStatus { NEW = 'New', REVIEWED = 'Reviewed', ASSIGNED = 'Technician assigned', IN_PROGRESS = 'Work in progress', AWAITING = 'Awaiting materials / approval', COMPLETED = 'Work completed', CONFIRMATION = 'Tenant confirmation pending', CLOSED = 'Closed', CANCELLED = 'Cancelled' }
export enum Priority { LOW = 'Low', MEDIUM = 'Medium', HIGH = 'High', URGENT = 'Urgent' }
export enum NoticeStatus { SUBMITTED = 'Submitted', ACKNOWLEDGED = 'Acknowledged', INSPECTION_SCHEDULED = 'Inspection scheduled', INSPECTED = 'Inspection done', HANDED_OVER = 'Keys handed over', SETTLED = 'Settled', CANCELLED = 'Cancelled' }
/** Who bears a maintenance cost (spec section 4D). */
export enum CostClass { COMPANY = 'Company responsibility', TENANT = 'Tenant responsibility', RECOVERABLE = 'Recoverable from tenant', PENDING = 'Pending approval' }
export enum ApprovalStatus { NOT_NEEDED = 'Not needed', PENDING = 'Pending', APPROVED = 'Approved', REJECTED = 'Rejected' }
export enum ChequeStatus { IN_HAND = 'In hand', DEPOSITED = 'Deposited', CLEARED = 'Cleared', BOUNCED = 'Bounced', REPLACED = 'Replaced', RETURNED = 'Returned to tenant', CANCELLED = 'Cancelled' }

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
  @Column({ name: 'building_id', type: 'uuid' }) buildingId: string;
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
  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
  @ManyToOne(() => Unit, { nullable: false }) @JoinColumn({ name: 'unit_id' }) unit: Unit;
  @Index() @Column({ name: 'unit_id', type: 'uuid' }) unitId: string;
  @Column({ name: 'start_date', type: 'date' }) startDate: string;
  @Column({ name: 'expiry_date', type: 'date' }) expiryDate: string;
  @Column({ name: 'tenancy_from', type: 'date' }) tenancyFrom: string; // first day of the continuous tenancy (renewals keep it)
  /** First month the system bills rent for. Imported contracts start billing at go-live (older arrears come in as opening balance). */
  @Column({ name: 'bill_from', type: 'date', nullable: true }) billFrom: string | null;
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
  @Column({ name: 'tenant_accepted_at', type: 'timestamptz', nullable: true }) tenantAcceptedAt: Date | null;
  @Column({ name: 'tenant_accepted_ip', length: 60, default: '' }) tenantAcceptedIp: string;
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
  @Column({ name: 'contract_id', type: 'uuid' }) contractId: string;
  @ManyToOne(() => Contract) @JoinColumn({ name: 'contract_id' }) contract: Contract;
  @Index() @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
  @Column({ length: 7 }) period: string; // first month covered, YYYY-MM
  @Column({ type: 'smallint', default: 1 }) months: number; // months covered (3 for quarterly …)
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
  @Index() @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
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
  @Index() @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
  @Column({ type: 'date' }) date: string;
  @Column(money) amount: string;
  @Column({ type: 'enum', enum: PaymentMethod }) method: PaymentMethod;
  @Column({ length: 100, default: '' }) reference: string;
  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING }) status: PaymentStatus;
  @Column({ name: 'attachment', length: 300, default: '' }) attachment: string;
  @Column({ type: 'text', default: '' }) notes: string;
  @Column({ name: 'reject_reason', length: 300, default: '' }) rejectReason: string;
  @Column({ name: 'cheque_id', type: 'uuid', nullable: true }) chequeId: string | null;
  @Column({ name: 'recorded_by', type: 'uuid', nullable: true }) recordedBy: string | null;
  @Column({ name: 'verified_by', type: 'uuid', nullable: true }) verifiedBy: string | null;
  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true }) verifiedAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}

/** Post-dated cheques received from tenants. A cheque becomes a payment only when it clears. */
@Entity('cheques')
@Unique('uq_cheque_bank_no', ['bank', 'chequeNo', 'tenantId'])
export class Cheque {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column({ name: 'ref_no', length: 20 }) refNo: string; // PDC-00001
  @Index() @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
  @Column({ name: 'contract_id', type: 'uuid', nullable: true }) contractId: string | null;
  @Column({ name: 'cheque_no', length: 30 }) chequeNo: string;
  @Column({ length: 80 }) bank: string;
  @Column(money) amount: string;
  @Index() @Column({ name: 'due_date', type: 'date' }) dueDate: string;
  @Index() @Column({ type: 'enum', enum: ChequeStatus, default: ChequeStatus.IN_HAND }) status: ChequeStatus;
  @Column({ name: 'deposited_on', type: 'date', nullable: true }) depositedOn: string | null;
  @Column({ name: 'cleared_on', type: 'date', nullable: true }) clearedOn: string | null;
  @Column({ name: 'bounced_on', type: 'date', nullable: true }) bouncedOn: string | null;
  @Column({ name: 'bounce_reason', length: 200, default: '' }) bounceReason: string;
  @Column({ name: 'replaced_by', type: 'uuid', nullable: true }) replacedBy: string | null;
  @Column({ name: 'payment_id', type: 'uuid', nullable: true }) paymentId: string | null;
  @Column({ name: 'received_by', type: 'uuid', nullable: true }) receivedBy: string | null;
  @Column({ type: 'text', default: '' }) notes: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

/** Configurable complaint categories and subcategories (admin can add or retire). */
@Entity('maintenance_categories')
@Unique('uq_category_sub', ['category', 'subcategory'])
export class MaintenanceCategory {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ length: 60 }) category: string;
  @Column({ length: 80 }) subcategory: string;
  @Column({ name: 'sort_order', type: 'smallint', default: 0 }) sortOrder: number;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
}

@Entity('complaints')
export class Complaint {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column({ name: 'ref_no', length: 20 }) refNo: string; // CMP-00001
  @Index() @Column({ name: 'tenant_id', type: 'uuid', nullable: true }) tenantId: string | null; // null = raised by staff (e.g. common area)
  @Index() @Column({ name: 'unit_id', type: 'uuid', nullable: true }) unitId: string | null;
  @Index() @Column({ name: 'building_id', type: 'uuid' }) buildingId: string;
  @Column({ length: 60 }) category: string;
  @Column({ length: 80 }) subcategory: string;
  @Column({ length: 150, default: '' }) title: string;
  @Column({ type: 'text' }) description: string;
  @Column({ type: 'enum', enum: Priority, default: Priority.MEDIUM }) priority: Priority;
  @Index() @Column({ type: 'enum', enum: ComplaintStatus, default: ComplaintStatus.NEW }) status: ComplaintStatus;
  @Column({ name: 'assigned_to', type: 'uuid', nullable: true }) assignedTo: string | null;
  @Column({ name: 'expected_date', type: 'date', nullable: true }) expectedDate: string | null;
  @Column({ name: 'preferred_visit', length: 150, default: '' }) preferredVisit: string; // tenant's preferred visit time
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt: Date | null;
  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true }) closedAt: Date | null;
  @Column({ name: 'reopen_count', type: 'smallint', default: 0 }) reopenCount: number;
  @Column({ name: 'tenant_rating', type: 'smallint', nullable: true }) tenantRating: number | null; // 1–5
  @Column({ name: 'tenant_feedback', type: 'text', default: '' }) tenantFeedback: string;
  @Column({ name: 'created_by', type: 'uuid', nullable: true }) createdBy: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

/** Every status change / note on a complaint: the timeline the tenant and staff see. */
@Entity('complaint_events')
export class ComplaintEvent {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Index() @Column({ name: 'complaint_id', type: 'uuid' }) complaintId: string;
  @Column({ length: 40 }) status: string;
  @Column({ type: 'text', default: '' }) note: string;
  @Column({ name: 'visible_to_tenant', default: true }) visibleToTenant: boolean;
  @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId: string | null;
  @Column({ name: 'user_name', length: 150, default: '' }) userName: string;
  @CreateDateColumn({ name: 'at', type: 'timestamptz' }) at: Date;
}

/** Uploaded files (complaint photos, transfer receipts, documents). Stored on disk under UPLOAD_DIR. */
@Entity('attachments')
@Index('ix_attachment_owner', ['ownerType', 'ownerId'])
export class Attachment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'owner_type', length: 30 }) ownerType: string; // complaint | payment | contract | tenant
  @Column({ name: 'owner_id', type: 'uuid' }) ownerId: string;
  @Column({ length: 30, default: 'file' }) kind: string; // tenant-photo | before | after | receipt | document
  @Column({ name: 'original_name', length: 200 }) originalName: string;
  @Column({ length: 100 }) mime: string;
  @Column({ type: 'int' }) size: number;
  @Column({ name: 'storage_key', length: 200 }) storageKey: string;
  @Column({ name: 'uploaded_by', type: 'uuid', nullable: true }) uploadedBy: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}

/** In-app notifications (SMS / WhatsApp delivery is added in phase 6). */
@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId: string | null;
  @Index() @Column({ name: 'tenant_id', type: 'uuid', nullable: true }) tenantId: string | null;
  @Column({ length: 150 }) title: string;
  @Column({ type: 'text' }) body: string;
  @Column({ length: 200, default: '' }) link: string;
  @Column({ name: 'read_at', type: 'timestamptz', nullable: true }) readAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}

@Entity('vacate_notices')
export class VacateNotice {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column({ name: 'ref_no', length: 20 }) refNo: string; // NTV-00001
  @Index() @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
  @Index() @Column({ name: 'contract_id', type: 'uuid' }) contractId: string;
  @Column({ name: 'submitted_on', type: 'date' }) submittedOn: string;
  @Column({ name: 'proposed_date', type: 'date' }) proposedDate: string;
  @Column({ name: 'notice_months', type: 'smallint' }) noticeMonths: number;
  @Column({ name: 'notice_end', type: 'date' }) noticeEnd: string;        // submitted + notice period
  @Column({ name: 'final_rent_date', type: 'date' }) finalRentDate: string; // later of proposed date and notice end
  @Column({ type: 'text', default: '' }) reason: string;
  @Column({ type: 'enum', enum: NoticeStatus, default: NoticeStatus.SUBMITTED }) status: NoticeStatus;
  @Column({ name: 'inspection_date', type: 'date', nullable: true }) inspectionDate: string | null;
  @Column({ name: 'handover_date', type: 'date', nullable: true }) handoverDate: string | null;
  @Column({ name: 'staff_note', type: 'text', default: '' }) staffNote: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

/** Cost lines recorded against a maintenance job. A job can have several (e.g. two visits, materials bought later). */
@Entity('maintenance_costs')
export class MaintenanceCost {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ name: 'complaint_id', type: 'uuid' }) complaintId: string;
  @Index() @Column({ name: 'building_id', type: 'uuid' }) buildingId: string; // copied from the job for fast reporting
  @Column({ name: 'unit_id', type: 'uuid', nullable: true }) unitId: string | null;
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true }) tenantId: string | null;
  @Index() @Column({ name: 'work_date', type: 'date' }) workDate: string;
  @Column({ name: 'technician_id', type: 'uuid', nullable: true }) technicianId: string | null; // responsible technician
  @Column({ ...money }) material: string;
  @Column({ ...money }) labour: string;
  @Column({ ...money }) contractor: string;
  @Column({ name: 'contractor_name', length: 150, default: '' }) contractorName: string;
  @Column({ ...money }) other: string;
  @Column({ ...money }) total: string;
  @Column({ length: 500, default: '' }) description: string;
  @Column({ type: 'enum', enum: CostClass, default: CostClass.COMPANY }) classification: CostClass;
  @Index() @Column({ name: 'approval_status', type: 'enum', enum: ApprovalStatus, default: ApprovalStatus.NOT_NEEDED }) approvalStatus: ApprovalStatus;
  @Column({ name: 'approval_reason', length: 200, default: '' }) approvalReason: string; // why approval is needed
  @Column({ name: 'recorded_by', type: 'uuid', nullable: true }) recordedBy: string | null;
  @Column({ name: 'approved_by', type: 'uuid', nullable: true }) approvedBy: string | null;
  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true }) approvedAt: Date | null;
  @Column({ name: 'reject_reason', length: 300, default: '' }) rejectReason: string;
  @Column({ name: 'charge_id', type: 'uuid', nullable: true }) chargeId: string | null; // tenant ledger charge for recoverable costs
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

@Entity('budgets')
@Unique('uq_budget_building_period', ['buildingId', 'period'])
export class Budget {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'building_id', type: 'uuid' }) buildingId: string;
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
  /** Set for new tenant logins / password resets: the user must choose a new password before using the system. */
  @Column({ name: 'must_change_password', default: false }) mustChangePassword: boolean;
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

export const ENTITIES = [Building, Unit, Tenant, Contract, Invoice, LedgerCharge, Payment, Cheque, Budget, User, AuditLog, Counter,
  MaintenanceCategory, Complaint, ComplaintEvent, Attachment, Notification, VacateNotice, MaintenanceCost];
