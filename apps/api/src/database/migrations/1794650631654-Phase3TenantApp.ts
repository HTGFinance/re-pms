import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase3TenantApp1794650631654 implements MigrationInterface {
    name = 'Phase3TenantApp1794650631654'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "maintenance_categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "category" character varying(60) NOT NULL, "subcategory" character varying(80) NOT NULL, "sort_order" smallint NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "uq_category_sub" UNIQUE ("category", "subcategory"), CONSTRAINT "PK_ab736076431643cc769f720171a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."complaints_priority_enum" AS ENUM('Low', 'Medium', 'High', 'Urgent')`);
        await queryRunner.query(`CREATE TYPE "public"."complaints_status_enum" AS ENUM('New', 'Reviewed', 'Technician assigned', 'Work in progress', 'Awaiting materials / approval', 'Work completed', 'Tenant confirmation pending', 'Closed', 'Cancelled')`);
        await queryRunner.query(`CREATE TABLE "complaints" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ref_no" character varying(20) NOT NULL, "tenant_id" uuid, "unit_id" uuid, "building_id" uuid NOT NULL, "category" character varying(60) NOT NULL, "subcategory" character varying(80) NOT NULL, "title" character varying(150) NOT NULL DEFAULT '', "description" text NOT NULL, "priority" "public"."complaints_priority_enum" NOT NULL DEFAULT 'Medium', "status" "public"."complaints_status_enum" NOT NULL DEFAULT 'New', "assigned_to" uuid, "expected_date" date, "preferred_visit" character varying(150) NOT NULL DEFAULT '', "completed_at" TIMESTAMP WITH TIME ZONE, "closed_at" TIMESTAMP WITH TIME ZONE, "reopen_count" smallint NOT NULL DEFAULT '0', "tenant_rating" smallint, "tenant_feedback" text NOT NULL DEFAULT '', "created_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4b7566a2a489c2cc7c12ed076ad" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_bdd6aa6b32b19d8ac3904999d2" ON "complaints"  ("ref_no") `);
        await queryRunner.query(`CREATE INDEX "IDX_3898e047e545e9554128c37733" ON "complaints"  ("tenant_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_f84f980f73f2d3b3d7db635d18" ON "complaints"  ("unit_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_b23c5f23f51b0e6fd841c8814d" ON "complaints"  ("building_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_208ad761b4359509cd2f43da87" ON "complaints"  ("status") `);
        await queryRunner.query(`CREATE TABLE "complaint_events" ("id" BIGSERIAL NOT NULL, "complaint_id" uuid NOT NULL, "status" character varying(40) NOT NULL, "note" text NOT NULL DEFAULT '', "visible_to_tenant" boolean NOT NULL DEFAULT true, "user_id" uuid, "user_name" character varying(150) NOT NULL DEFAULT '', "at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e9979b3ca11620b323d58446a38" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_1f884003b0ce325855f85a1b22" ON "complaint_events"  ("complaint_id") `);
        await queryRunner.query(`CREATE TABLE "attachments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "owner_type" character varying(30) NOT NULL, "owner_id" uuid NOT NULL, "kind" character varying(30) NOT NULL DEFAULT 'file', "original_name" character varying(200) NOT NULL, "mime" character varying(100) NOT NULL, "size" integer NOT NULL, "storage_key" character varying(200) NOT NULL, "uploaded_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_5e1f050bcff31e3084a1d662412" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_attachment_owner" ON "attachments"  ("owner_type", "owner_id") `);
        await queryRunner.query(`CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid, "tenant_id" uuid, "title" character varying(150) NOT NULL, "body" text NOT NULL, "link" character varying(200) NOT NULL DEFAULT '', "read_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_9a8a82462cab47c73d25f49261" ON "notifications"  ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_d93ddd7e1b890535ecafbb334e" ON "notifications"  ("tenant_id") `);
        await queryRunner.query(`CREATE TYPE "public"."vacate_notices_status_enum" AS ENUM('Submitted', 'Acknowledged', 'Inspection scheduled', 'Inspection done', 'Keys handed over', 'Settled', 'Cancelled')`);
        await queryRunner.query(`CREATE TABLE "vacate_notices" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ref_no" character varying(20) NOT NULL, "tenant_id" uuid NOT NULL, "contract_id" uuid NOT NULL, "submitted_on" date NOT NULL, "proposed_date" date NOT NULL, "notice_months" smallint NOT NULL, "notice_end" date NOT NULL, "final_rent_date" date NOT NULL, "reason" text NOT NULL DEFAULT '', "status" "public"."vacate_notices_status_enum" NOT NULL DEFAULT 'Submitted', "inspection_date" date, "handover_date" date, "staff_note" text NOT NULL DEFAULT '', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_92797d07d10d206e30b9cff2317" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_235d3e1bad6c4ff10dbf6feec3" ON "vacate_notices"  ("ref_no") `);
        await queryRunner.query(`CREATE INDEX "IDX_4df1a1117e49ba6d2c0a1def4e" ON "vacate_notices"  ("tenant_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_213f8fae2d15c39fd9ea3154e5" ON "vacate_notices"  ("contract_id") `);
        await queryRunner.query(`ALTER TABLE "contracts" ADD "tenant_accepted_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "contracts" ADD "tenant_accepted_ip" character varying(60) NOT NULL DEFAULT ''`);
        await queryRunner.query(`ALTER TABLE "users" ADD "must_change_password" boolean NOT NULL DEFAULT false`);
        // Default complaint categories (spec section 4B + general flat issues); admins can change them later
        await queryRunner.query(`INSERT INTO "maintenance_categories" ("category", "subcategory", "sort_order") VALUES ('Repair', 'Plumbing', 1), ('Repair', 'Electrical', 2), ('Repair', 'AC', 3), ('Repair', 'Civil works', 4), ('Repair', 'Other repairs', 5), ('Replacement', 'Equipment', 6), ('Replacement', 'Fixtures', 7), ('Replacement', 'Appliances', 8), ('Replacement', 'Other replacement items', 9), ('Service', 'AC servicing', 10), ('Service', 'Equipment servicing', 11), ('Service', 'Electrical servicing', 12), ('Service', 'General servicing', 13), ('Cleaning', 'General cleaning', 14), ('Cleaning', 'Deep cleaning', 15), ('Cleaning', 'Water tank cleaning', 16), ('Cleaning', 'Other cleaning', 17), ('Painting', 'Internal painting', 18), ('Painting', 'External painting', 19), ('Painting', 'Unit painting', 20), ('Flat / unit', 'Doors & locks', 21), ('Flat / unit', 'Windows', 22), ('Flat / unit', 'Water leakage / damp', 23), ('Flat / unit', 'Pest control', 24), ('Flat / unit', 'Lift', 25), ('Flat / unit', 'Parking', 26), ('Flat / unit', 'Security', 27), ('Flat / unit', 'Noise / neighbours', 28), ('Flat / unit', 'Other flat issue', 29), ('Other', 'Other maintenance', 30) ON CONFLICT DO NOTHING`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "must_change_password"`);
        await queryRunner.query(`ALTER TABLE "contracts" DROP COLUMN "tenant_accepted_ip"`);
        await queryRunner.query(`ALTER TABLE "contracts" DROP COLUMN "tenant_accepted_at"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_213f8fae2d15c39fd9ea3154e5"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4df1a1117e49ba6d2c0a1def4e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_235d3e1bad6c4ff10dbf6feec3"`);
        await queryRunner.query(`DROP TABLE "vacate_notices"`);
        await queryRunner.query(`DROP TYPE "public"."vacate_notices_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d93ddd7e1b890535ecafbb334e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9a8a82462cab47c73d25f49261"`);
        await queryRunner.query(`DROP TABLE "notifications"`);
        await queryRunner.query(`DROP INDEX "public"."ix_attachment_owner"`);
        await queryRunner.query(`DROP TABLE "attachments"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1f884003b0ce325855f85a1b22"`);
        await queryRunner.query(`DROP TABLE "complaint_events"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_208ad761b4359509cd2f43da87"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b23c5f23f51b0e6fd841c8814d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f84f980f73f2d3b3d7db635d18"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3898e047e545e9554128c37733"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bdd6aa6b32b19d8ac3904999d2"`);
        await queryRunner.query(`DROP TABLE "complaints"`);
        await queryRunner.query(`DROP TYPE "public"."complaints_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."complaints_priority_enum"`);
        await queryRunner.query(`DROP TABLE "maintenance_categories"`);
    }

}
