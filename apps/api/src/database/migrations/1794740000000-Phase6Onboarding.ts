import { MigrationInterface, QueryRunner } from 'typeorm';

/** Tenant onboarding: passport and ID expiry, payment mode on contracts, one-time app invitations. */
export class Phase6Onboarding1794740000000 implements MigrationInterface {
  name = 'Phase6Onboarding1794740000000';
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "tenants" ADD "id_expiry" date, ADD "passport_no" character varying(60) NOT NULL DEFAULT '', ADD "passport_expiry" date`);
    await q.query(`ALTER TABLE "contracts" ADD "payment_mode" character varying(30) NOT NULL DEFAULT 'Bank transfer'`);
    await q.query(`CREATE TABLE "invitations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "token_hash" character varying(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "revoked_at" TIMESTAMP WITH TIME ZONE, "emailed_to" character varying(150) NOT NULL DEFAULT '', "created_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_invitations" PRIMARY KEY ("id"), CONSTRAINT "FK_invitations_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE)`);
    await q.query(`CREATE INDEX "IDX_invitations_tenant" ON "invitations" ("tenant_id")`);
    await q.query(`CREATE UNIQUE INDEX "IDX_invitations_token" ON "invitations" ("token_hash")`);
  }
  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "invitations"`);
    await q.query(`ALTER TABLE "contracts" DROP COLUMN "payment_mode"`);
    await q.query(`ALTER TABLE "tenants" DROP COLUMN "passport_expiry", DROP COLUMN "passport_no", DROP COLUMN "id_expiry"`);
  }
}
