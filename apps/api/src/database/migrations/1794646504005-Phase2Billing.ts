import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase2Billing1794646504005 implements MigrationInterface {
    name = 'Phase2Billing1794646504005'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."cheques_status_enum" AS ENUM('In hand', 'Deposited', 'Cleared', 'Bounced', 'Replaced', 'Returned to tenant', 'Cancelled')`);
        await queryRunner.query(`CREATE TABLE "cheques" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ref_no" character varying(20) NOT NULL, "tenant_id" uuid NOT NULL, "contract_id" uuid, "cheque_no" character varying(30) NOT NULL, "bank" character varying(80) NOT NULL, "amount" numeric(14,3) NOT NULL DEFAULT '0', "due_date" date NOT NULL, "status" "public"."cheques_status_enum" NOT NULL DEFAULT 'In hand', "deposited_on" date, "cleared_on" date, "bounced_on" date, "bounce_reason" character varying(200) NOT NULL DEFAULT '', "replaced_by" uuid, "payment_id" uuid, "received_by" uuid, "notes" text NOT NULL DEFAULT '', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_cheque_bank_no" UNIQUE ("bank", "cheque_no", "tenant_id"), CONSTRAINT "PK_b87771b4d5f52b7e5bf4498e912" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_35ef3bfc6b4a9518010b2ad31f" ON "cheques"  ("ref_no") `);
        await queryRunner.query(`CREATE INDEX "IDX_6026e1f058d64bf36d02996a3f" ON "cheques"  ("tenant_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_4ac43deaa1f928bd85436d3457" ON "cheques"  ("due_date") `);
        await queryRunner.query(`CREATE INDEX "IDX_c6f1ac9f061d4b81bd29273a05" ON "cheques"  ("status") `);
        await queryRunner.query(`ALTER TABLE "contracts" ADD "bill_from" date`);
        // Existing contracts bill from their start date
        await queryRunner.query(`UPDATE "contracts" SET "bill_from" = "start_date" WHERE "bill_from" IS NULL`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD "months" smallint NOT NULL DEFAULT '1'`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "notes" text NOT NULL DEFAULT ''`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "reject_reason" character varying(300) NOT NULL DEFAULT ''`);
        await queryRunner.query(`ALTER TABLE "payments" ADD "cheque_id" uuid`);
        await queryRunner.query(`DROP INDEX "public"."IDX_440f531f452dcc4389d201b9d4"`);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "tenant_id" TYPE uuid USING "tenant_id"::uuid`); // convert in place, keeps data
        await queryRunner.query(`DROP INDEX "public"."IDX_397547f2f07082ecf7f66a8ec3"`);
        await queryRunner.query(`ALTER TABLE "ledger_charges" ALTER COLUMN "tenant_id" TYPE uuid USING "tenant_id"::uuid`); // convert in place, keeps data
        await queryRunner.query(`DROP INDEX "public"."IDX_9109b53fca5cef7720aca72974"`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "tenant_id" TYPE uuid USING "tenant_id"::uuid`); // convert in place, keeps data
        await queryRunner.query(`CREATE INDEX "IDX_440f531f452dcc4389d201b9d4" ON "invoices"  ("tenant_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_397547f2f07082ecf7f66a8ec3" ON "ledger_charges"  ("tenant_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_9109b53fca5cef7720aca72974" ON "payments"  ("tenant_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_9109b53fca5cef7720aca72974"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_397547f2f07082ecf7f66a8ec3"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_440f531f452dcc4389d201b9d4"`);
        await queryRunner.query(`ALTER TABLE "payments" ALTER COLUMN "tenant_id" TYPE character varying USING "tenant_id"::text`); // convert in place, keeps data
        await queryRunner.query(`CREATE INDEX "IDX_9109b53fca5cef7720aca72974" ON "payments" USING btree ("tenant_id") `);
        await queryRunner.query(`ALTER TABLE "ledger_charges" ALTER COLUMN "tenant_id" TYPE character varying USING "tenant_id"::text`); // convert in place, keeps data
        await queryRunner.query(`CREATE INDEX "IDX_397547f2f07082ecf7f66a8ec3" ON "ledger_charges" USING btree ("tenant_id") `);
        await queryRunner.query(`ALTER TABLE "invoices" ALTER COLUMN "tenant_id" TYPE character varying USING "tenant_id"::text`); // convert in place, keeps data
        await queryRunner.query(`CREATE INDEX "IDX_440f531f452dcc4389d201b9d4" ON "invoices" USING btree ("tenant_id") `);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "cheque_id"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "reject_reason"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "notes"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "months"`);
        await queryRunner.query(`ALTER TABLE "contracts" DROP COLUMN "bill_from"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c6f1ac9f061d4b81bd29273a05"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4ac43deaa1f928bd85436d3457"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6026e1f058d64bf36d02996a3f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_35ef3bfc6b4a9518010b2ad31f"`);
        await queryRunner.query(`DROP TABLE "cheques"`);
        await queryRunner.query(`DROP TYPE "public"."cheques_status_enum"`);
    }

}
