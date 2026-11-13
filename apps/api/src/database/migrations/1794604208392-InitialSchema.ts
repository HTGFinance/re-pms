import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1794604208392 implements MigrationInterface {
    name = 'InitialSchema1794604208392'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."buildings_type_enum" AS ENUM('Residential', 'Commercial', 'Mixed use', 'Warehouse', 'Other')`);
        await queryRunner.query(`CREATE TABLE "buildings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying(20) NOT NULL, "name" character varying(150) NOT NULL, "type" "public"."buildings_type_enum" NOT NULL DEFAULT 'Residential', "location" character varying(200) NOT NULL DEFAULT '', "address_code" character varying(200) NOT NULL DEFAULT '', "lat" numeric(9,6), "lng" numeric(9,6), "municipality" character varying(100) NOT NULL DEFAULT '', "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_bc65c1acce268c383e41a69003a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_314c7f29d7f9121e116ccc29b8" ON "buildings" ("code") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_3f5a7e0aabca27edc3806fdb29" ON "buildings" ("name") `);
        await queryRunner.query(`CREATE TABLE "units" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "building_id" uuid NOT NULL, "unit_no" character varying(30) NOT NULL, "unit_type" character varying(60) NOT NULL DEFAULT '', "listed_rent" numeric(14,3) NOT NULL DEFAULT '0', "vat_applicable" boolean NOT NULL DEFAULT false, "area_sqm" numeric(10,2), "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_unit_building_no" UNIQUE ("building_id", "unit_no"), CONSTRAINT "PK_5a8f2f064919b587d93936cb223" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."tenants_status_enum" AS ENUM('Active', 'Inactive', 'Vacated', 'Blacklisted')`);
        await queryRunner.query(`CREATE TABLE "tenants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_no" character varying(20) NOT NULL, "name" character varying(200) NOT NULL, "mobile" character varying(30) NOT NULL DEFAULT '', "email" character varying(150) NOT NULL DEFAULT '', "id_type" character varying(60) NOT NULL DEFAULT '', "id_number" character varying(60) NOT NULL DEFAULT '', "nationality" character varying(60) NOT NULL DEFAULT '', "status" "public"."tenants_status_enum" NOT NULL DEFAULT 'Active', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_53be67a04681c66b87ee27c9321" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_227afd331d8a2ebe38816bd95d" ON "tenants" ("tenant_no") `);
        await queryRunner.query(`CREATE INDEX "IDX_32731f181236a46182a38c992a" ON "tenants" ("name") `);
        await queryRunner.query(`CREATE TYPE "public"."contracts_payment_frequency_enum" AS ENUM('Monthly', 'Quarterly', 'Half-yearly', 'Yearly')`);
        await queryRunner.query(`CREATE TYPE "public"."contracts_status_enum" AS ENUM('Draft', 'Upcoming', 'Active', 'Ended', 'Terminated')`);
        await queryRunner.query(`CREATE TYPE "public"."contracts_e_status_enum" AS ENUM('Draft', 'Sent to tenant', 'Tenant accepted', 'Landlord approved', 'Registered')`);
        await queryRunner.query(`CREATE TABLE "contracts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "contract_no" character varying(20) NOT NULL, "tenant_id" uuid NOT NULL, "unit_id" uuid NOT NULL, "start_date" date NOT NULL, "expiry_date" date NOT NULL, "tenancy_from" date NOT NULL, "monthly_rent" numeric(14,3) NOT NULL DEFAULT '0', "security_deposit" numeric(14,3) NOT NULL DEFAULT '0', "payment_frequency" "public"."contracts_payment_frequency_enum" NOT NULL DEFAULT 'Monthly', "rent_due_day" smallint NOT NULL DEFAULT '1', "notice_months" smallint NOT NULL DEFAULT '1', "vat_rate" numeric(5,4) NOT NULL DEFAULT '0', "status" "public"."contracts_status_enum" NOT NULL DEFAULT 'Draft', "e_status" "public"."contracts_e_status_enum" NOT NULL DEFAULT 'Draft', "municipality_reg_no" character varying(60) NOT NULL DEFAULT '', "municipality_reg_date" date, "municipality_fee" numeric(14,3) NOT NULL DEFAULT '0', "renewal_of" uuid, "notes" text NOT NULL DEFAULT '', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_2c7b8f3a7b1acdd49497d83d0fb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_793609267045de22b8de569717" ON "contracts" ("contract_no") `);
        await queryRunner.query(`CREATE INDEX "IDX_b2104bd98efc7bc148feff9b1f" ON "contracts" ("unit_id") `);
        await queryRunner.query(`CREATE TABLE "invoices" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "invoice_no" character varying(20) NOT NULL, "contract_id" uuid NOT NULL, "tenant_id" character varying NOT NULL, "period" character varying(7) NOT NULL, "due_date" date NOT NULL, "rent" numeric(14,3) NOT NULL DEFAULT '0', "vat" numeric(14,3) NOT NULL DEFAULT '0', "total" numeric(14,3) NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_invoice_contract_period" UNIQUE ("contract_id", "period"), CONSTRAINT "PK_668cef7c22a427fd822cc1be3ce" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_37669c562a2525929927d9d691" ON "invoices" ("invoice_no") `);
        await queryRunner.query(`CREATE INDEX "IDX_440f531f452dcc4389d201b9d4" ON "invoices" ("tenant_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_0457ee681a50419881ea2ee796" ON "invoices" ("due_date") `);
        await queryRunner.query(`CREATE TABLE "ledger_charges" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "charge_no" character varying(20) NOT NULL, "tenant_id" character varying NOT NULL, "date" date NOT NULL, "amount" numeric(14,3) NOT NULL DEFAULT '0', "description" character varying(300) NOT NULL, "kind" character varying(40) NOT NULL DEFAULT 'Other', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1b0e025b94dec7efecf5152b183" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_79da6681fd727458b572e782e5" ON "ledger_charges" ("charge_no") `);
        await queryRunner.query(`CREATE INDEX "IDX_397547f2f07082ecf7f66a8ec3" ON "ledger_charges" ("tenant_id") `);
        await queryRunner.query(`CREATE TYPE "public"."payments_method_enum" AS ENUM('Online gateway', 'Bank transfer', 'Cash', 'Cheque', 'Card (POS)', 'Opening advance')`);
        await queryRunner.query(`CREATE TYPE "public"."payments_status_enum" AS ENUM('Pending', 'Verified', 'Rejected')`);
        await queryRunner.query(`CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "receipt_no" character varying(20) NOT NULL, "tenant_id" character varying NOT NULL, "date" date NOT NULL, "amount" numeric(14,3) NOT NULL DEFAULT '0', "method" "public"."payments_method_enum" NOT NULL, "reference" character varying(100) NOT NULL DEFAULT '', "status" "public"."payments_status_enum" NOT NULL DEFAULT 'Pending', "attachment" character varying(300) NOT NULL DEFAULT '', "recorded_by" uuid, "verified_by" uuid, "verified_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_3b98272cba74c32fe41248e7e3" ON "payments" ("receipt_no") `);
        await queryRunner.query(`CREATE INDEX "IDX_9109b53fca5cef7720aca72974" ON "payments" ("tenant_id") `);
        await queryRunner.query(`CREATE TABLE "budgets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "building_id" uuid NOT NULL, "period" character varying(7) NOT NULL, "rental_income" numeric(14,3) NOT NULL DEFAULT '0', "collection" numeric(14,3) NOT NULL DEFAULT '0', "maintenance" numeric(14,3) NOT NULL DEFAULT '0', "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_budget_building_period" UNIQUE ("building_id", "period"), CONSTRAINT "PK_9c8a51748f82387644b773da482" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('ADMIN', 'PROPERTY_MANAGER', 'FINANCE', 'RECOVERY', 'MAINTENANCE_SUPERVISOR', 'TECHNICIAN', 'EXECUTIVE', 'TENANT')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(150) NOT NULL, "name" character varying(150) NOT NULL, "password_hash" character varying(100) NOT NULL, "role" "public"."users_role_enum" NOT NULL, "tenant_id" uuid, "is_active" boolean NOT NULL DEFAULT true, "last_login_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `);
        await queryRunner.query(`CREATE TABLE "audit_log" ("id" BIGSERIAL NOT NULL, "user_id" uuid, "user_email" character varying(150) NOT NULL DEFAULT '', "method" character varying(10) NOT NULL, "path" character varying(300) NOT NULL, "status_code" smallint NOT NULL, "body" jsonb, "at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_cb11bd5b662431ea0ac455a27d" ON "audit_log" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_ba27cef5b8b2b1a756e06ebcc5" ON "audit_log" ("at") `);
        await queryRunner.query(`CREATE TABLE "counters" ("key" character varying(20) NOT NULL, "value" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_c6c33328f872db2d0aaabbacbc8" PRIMARY KEY ("key"))`);
        await queryRunner.query(`CREATE TABLE "user_buildings" ("user_id" uuid NOT NULL, "building_id" uuid NOT NULL, CONSTRAINT "PK_662d3b89625d22e91fee8c960fd" PRIMARY KEY ("user_id", "building_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d904ee327fc667b3068b4b731e" ON "user_buildings" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_2bf010340136cf30f02af53f8f" ON "user_buildings" ("building_id") `);
        await queryRunner.query(`ALTER TABLE "units" ADD CONSTRAINT "FK_173b4aee6c28c4db7e929760d80" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "contracts" ADD CONSTRAINT "FK_99f99bdfee2d227b320d4d7c70e" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "contracts" ADD CONSTRAINT "FK_b2104bd98efc7bc148feff9b1f1" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD CONSTRAINT "FK_2a1393659dc4aa043ed203c8886" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "budgets" ADD CONSTRAINT "FK_bade3c51a2f079d874751eb9168" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_buildings" ADD CONSTRAINT "FK_d904ee327fc667b3068b4b731ee" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "user_buildings" ADD CONSTRAINT "FK_2bf010340136cf30f02af53f8f3" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_buildings" DROP CONSTRAINT "FK_2bf010340136cf30f02af53f8f3"`);
        await queryRunner.query(`ALTER TABLE "user_buildings" DROP CONSTRAINT "FK_d904ee327fc667b3068b4b731ee"`);
        await queryRunner.query(`ALTER TABLE "budgets" DROP CONSTRAINT "FK_bade3c51a2f079d874751eb9168"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP CONSTRAINT "FK_2a1393659dc4aa043ed203c8886"`);
        await queryRunner.query(`ALTER TABLE "contracts" DROP CONSTRAINT "FK_b2104bd98efc7bc148feff9b1f1"`);
        await queryRunner.query(`ALTER TABLE "contracts" DROP CONSTRAINT "FK_99f99bdfee2d227b320d4d7c70e"`);
        await queryRunner.query(`ALTER TABLE "units" DROP CONSTRAINT "FK_173b4aee6c28c4db7e929760d80"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2bf010340136cf30f02af53f8f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d904ee327fc667b3068b4b731e"`);
        await queryRunner.query(`DROP TABLE "user_buildings"`);
        await queryRunner.query(`DROP TABLE "counters"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ba27cef5b8b2b1a756e06ebcc5"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cb11bd5b662431ea0ac455a27d"`);
        await queryRunner.query(`DROP TABLE "audit_log"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`DROP TABLE "budgets"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9109b53fca5cef7720aca72974"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3b98272cba74c32fe41248e7e3"`);
        await queryRunner.query(`DROP TABLE "payments"`);
        await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."payments_method_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_397547f2f07082ecf7f66a8ec3"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_79da6681fd727458b572e782e5"`);
        await queryRunner.query(`DROP TABLE "ledger_charges"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0457ee681a50419881ea2ee796"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_440f531f452dcc4389d201b9d4"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_37669c562a2525929927d9d691"`);
        await queryRunner.query(`DROP TABLE "invoices"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b2104bd98efc7bc148feff9b1f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_793609267045de22b8de569717"`);
        await queryRunner.query(`DROP TABLE "contracts"`);
        await queryRunner.query(`DROP TYPE "public"."contracts_e_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."contracts_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."contracts_payment_frequency_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_32731f181236a46182a38c992a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_227afd331d8a2ebe38816bd95d"`);
        await queryRunner.query(`DROP TABLE "tenants"`);
        await queryRunner.query(`DROP TYPE "public"."tenants_status_enum"`);
        await queryRunner.query(`DROP TABLE "units"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3f5a7e0aabca27edc3806fdb29"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_314c7f29d7f9121e116ccc29b8"`);
        await queryRunner.query(`DROP TABLE "buildings"`);
        await queryRunner.query(`DROP TYPE "public"."buildings_type_enum"`);
    }

}
