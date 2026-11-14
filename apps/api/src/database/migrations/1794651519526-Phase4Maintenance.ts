import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase4Maintenance1794651519526 implements MigrationInterface {
    name = 'Phase4Maintenance1794651519526'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."maintenance_costs_classification_enum" AS ENUM('Company responsibility', 'Tenant responsibility', 'Recoverable from tenant', 'Pending approval')`);
        await queryRunner.query(`CREATE TYPE "public"."maintenance_costs_approval_status_enum" AS ENUM('Not needed', 'Pending', 'Approved', 'Rejected')`);
        await queryRunner.query(`CREATE TABLE "maintenance_costs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "complaint_id" uuid NOT NULL, "building_id" uuid NOT NULL, "unit_id" uuid, "tenant_id" uuid, "work_date" date NOT NULL, "technician_id" uuid, "material" numeric(14,3) NOT NULL DEFAULT '0', "labour" numeric(14,3) NOT NULL DEFAULT '0', "contractor" numeric(14,3) NOT NULL DEFAULT '0', "contractor_name" character varying(150) NOT NULL DEFAULT '', "other" numeric(14,3) NOT NULL DEFAULT '0', "total" numeric(14,3) NOT NULL DEFAULT '0', "description" character varying(500) NOT NULL DEFAULT '', "classification" "public"."maintenance_costs_classification_enum" NOT NULL DEFAULT 'Company responsibility', "approval_status" "public"."maintenance_costs_approval_status_enum" NOT NULL DEFAULT 'Not needed', "approval_reason" character varying(200) NOT NULL DEFAULT '', "recorded_by" uuid, "approved_by" uuid, "approved_at" TIMESTAMP WITH TIME ZONE, "reject_reason" character varying(300) NOT NULL DEFAULT '', "charge_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1d03ff65d9368286efda9d5448a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_245cc08c68d8af62546c380558" ON "maintenance_costs"  ("complaint_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_ff51b186b86e96fdb4ecf2b9ad" ON "maintenance_costs"  ("building_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_7f4e408f932f340eef457f4acd" ON "maintenance_costs"  ("work_date") `);
        await queryRunner.query(`CREATE INDEX "IDX_c952de64aadec798ca01838dd4" ON "maintenance_costs"  ("approval_status") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_c952de64aadec798ca01838dd4"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7f4e408f932f340eef457f4acd"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ff51b186b86e96fdb4ecf2b9ad"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_245cc08c68d8af62546c380558"`);
        await queryRunner.query(`DROP TABLE "maintenance_costs"`);
        await queryRunner.query(`DROP TYPE "public"."maintenance_costs_approval_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."maintenance_costs_classification_enum"`);
    }

}
