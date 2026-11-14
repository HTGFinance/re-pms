# RE-PMS — Real Estate Property Management System

One integrated system for the group's residential and commercial properties: buildings, units, tenants, contracts,
rent collection, maintenance and financial reporting. One central PostgreSQL database for all buildings; amounts in
Omani Rial with 3 decimals (baisa). Designed to connect to Odoo later.

| Part | Technology | Folder |
|---|---|---|
| API (business rules, security, database) | NestJS 12 · TypeORM · PostgreSQL 16 | `apps/api` |
| Web portal (staff screens) | Next.js 16 · React 19 | `apps/web` |
| Deployment | Docker Compose (db + api + web) | `docker-compose.yml` |

## Build status

| Area | Status |
|---|---|
| Logins (email + password), roles, building-level access | Done |
| Buildings & units (address code, map location, VAT flag) | Done |
| Tenants (tenant master, search) | Done |
| Contracts: create, overlap check, draft/active/upcoming/ended, renewal, early termination | Done |
| E-contract stages and municipality registration (number, date, fee) | Done |
| Excel/CSV import with preview: units, tenant master (with opening balance), budget, payments | Done |
| Admin dashboard summary, users & roles, audit log of every change | Done |
| **Phase 2:** rent billing by payment frequency (with VAT), tenant ledger and statement, ageing | Done |
| **Phase 2:** payments with maker-checker verification, receipts, charges and credit notes | Done |
| **Phase 2:** post-dated cheque register (deposit, clear, bounce, replace), rent recovery page (schedule, arrears, verification queue) | Done |
| Phase 3 — tenant mobile app · Phase 4 — maintenance app · Phase 5 — executive dashboard (budget vs actual, periods) · Phase 6 — payment gateway, SMS/WhatsApp, Odoo | Planned |

The clickable prototype that defines the target screens is published separately (see project notes).

## Roles

| Role | Can do | Buildings |
|---|---|---|
| Administrator | Everything, including users and audit log | All |
| Property manager | Buildings, units, tenants, contracts, tenant/unit imports | Assigned (none = all) |
| Finance | Verify/reject payments, clear/bounce cheques, credit notes, run billing, budget and payment imports | All |
| Rent recovery | Record payments (pending), receive and deposit cheques, arrears follow-up | Assigned |
| Maintenance supervisor / Technician | View properties (work orders in phase 4) | Assigned |
| Executive | View only | All |
| Tenant | Own data only (tenant app in phase 3) | — |

## Deploy on a cloud server (recommended)

Needs a Linux server (2 vCPU, 4 GB RAM is enough to start) with Docker installed, and a domain name, e.g. `pms.yourcompany.om`.

```bash
git clone https://github.com/HTGFinance/re-pms.git && cd re-pms
cp .env.example .env          # then edit .env: set every value marked CHANGE
docker compose up -d --build  # starts database, API (runs migrations automatically) and web portal
docker compose run --rm api npm run seed:prod   # creates the first admin login from ADMIN_EMAIL / ADMIN_PASSWORD
```

The portal listens on port 3000. Put HTTPS in front of it (Nginx, Caddy, or the cloud provider's load balancer) and keep
`COOKIE_SECURE=true`. Only port 443 should be open to the internet; the database and API are not exposed.

After the first sign-in: change the admin password, create staff users under **Users & roles**, then load data under
**Data import** (Buildings & units first, then Tenant master).

### Settings (`.env`)

| Setting | Meaning |
|---|---|
| `DB_*` | PostgreSQL connection. With Docker Compose leave `DB_HOST=db`. For a managed database set its host and `DB_SSL=true`. |
| `JWT_SECRET` | Long random string used to sign logins. Required; changing it signs everyone out. |
| `JWT_EXPIRES_IN` | How long a login lasts (default `12h`). |
| `CORS_ORIGIN` | The portal's public address, e.g. `https://pms.yourcompany.om`. |
| `MUNICIPALITY_FEE_RATE` | Lease registration fee on annual rent (default `0.03` = 3%). Confirm the current rate. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | First admin login, used only by the seed step. |

### Backups

Back up the database daily and keep copies off the server:

```bash
docker compose exec -T db pg_dump -U "$DB_USER" -Fc "$DB_NAME" > backup_$(date +%F).dump
# restore: docker compose exec -T db pg_restore -U "$DB_USER" -d "$DB_NAME" --clean < backup_YYYY-MM-DD.dump
```

### Updating to a new version

```bash
git pull && docker compose up -d --build   # database migrations run automatically when the API starts
```

## Local development

Requirements: Node.js 20+, PostgreSQL 14+.

```bash
# API
cd apps/api && npm install
export DB_HOST=localhost DB_USER=repms DB_PASSWORD=repms DB_NAME=repms TZ=Asia/Muscat
npm run migration:run
SEED_DEMO=true npm run seed      # admin user + 4 sample buildings / 23 units
npm run dev                       # http://localhost:4000/api

# Web (second terminal)
cd apps/web && npm install && npm run dev    # http://localhost:3000
```

Tests: with the API running on demo data, `cd apps/api && npm run test:e2e` runs 72 end-to-end checks: phase 1 (login, permissions,
building scope, contracts, e-contract workflow, registration fee, renewal, Excel import, audit log) and phase 2 (billing, VAT,
ledger allocation and ageing, maker-checker, credit notes, cheques, recovery reports).

### Changing the database

Edit `apps/api/src/database/entities.ts`, then generate and commit a migration:

```bash
cd apps/api && npm run migration:generate -- src/database/migrations/<ShortName>
```

Never change the database by hand in production; migrations keep every environment in step.

## How the code is organised

```
apps/api/src
  config.ts                 settings from .env
  database/entities.ts      all tables (one place to read the data model)
  database/migrations/      schema changes, applied in order
  database/seed.ts          first admin + optional demo data
  common/auth.ts            login check, @Roles(), building scope
  common/audit.interceptor  writes every change to audit_log (passwords redacted)
  common/money.ts           OMR arithmetic in integer baisa (no rounding errors)
  common/dates.ts           Oman dates, Excel date parsing (dd/mm/yyyy)
  modules/<area>/           one folder per area: auth, users, properties, tenants, contracts, imports, dashboard, audit,
                            billing (invoices + ledger engine), payments, cheques, recovery
apps/web
  app/login                 sign-in page
  app/(portal)/...          staff pages (dashboard, properties, tenants, contracts, recovery, cheques, imports, users, audit)
  components/               layout (Shell) and shared UI pieces
  lib/api.ts                API client and formatting helpers
```

## How billing and collections work

- **Billing.** Rent is billed in advance on the first day of each period (monthly, quarterly, half-yearly or yearly, per contract) from the contract's *bill-from* month until expiry. VAT at 5% is added for commercial units. Billing runs automatically every hour and straight away when a contract is created, activated or imported; finance can also run it from the API.
- **Bill-from date.** For a contract whose start date is in the past, billing starts in the current month unless an earlier *bill-from* date is entered. Rent owed from before go-live is brought in as the tenant's **Opening Balance** (tenant master import).
- **Partial months** are billed as whole months (contracts normally start on the 1st).
- **Ledger.** What a tenant owes = invoices + charges − verified payments − credit notes. Payments always settle the oldest unpaid item first, which gives the per-invoice outstanding amounts and the ageing (1–30, 31–60, 61–90, 90+ days past due date).
- **Maker-checker.** Recovery staff (or anyone) record a payment as *Pending*; it does not reduce the balance until a **different** finance user verifies it. The recorder can never verify or reject their own entry.
- **Cheques.** Received cheques sit *In hand* and cannot be deposited before their date. A cheque becomes a payment only when finance marks it *Cleared*; a *Bounced* cheque leaves the rent unpaid, can carry a bounce fee, and is then *Replaced*.

## Rules built into the system

- Amounts are stored as `NUMERIC(14,3)` and calculated in baisa; never as floating-point numbers.
- A unit cannot have two contracts that overlap in time.
- Contracts move Draft → Upcoming → Active → Ended automatically by date (checked hourly).
- Registered contracts cannot have their terms edited; use renewal.
- Imports check every row first; nothing is saved until **Import** is pressed, and then all valid rows are saved together.
- Every create, change and delete is logged with the user and time.

## API overview

All routes are under `/api` and need a login except `/health` and `/auth/login`.

| Method & path | Purpose |
|---|---|
| `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password` | Sign-in |
| `GET/POST /users`, `PATCH /users/:id` | Staff users (admin) |
| `GET/POST /buildings`, `PATCH /buildings/:id` | Buildings with unit and occupancy counts |
| `GET/POST /units`, `PATCH /units/:id` | Units with current tenant (`?buildingId=`, `?status=Vacant`) |
| `GET/POST /tenants`, `GET/PATCH /tenants/:id` | Tenants (`?q=` search) |
| `GET/POST /contracts`, `GET/PATCH /contracts/:id` | Contracts (`?status=`, `?expiringWithinDays=90`) |
| `POST /contracts/:id/activate` · `/end` · `/renew` · `/e-status` | Contract actions |
| `GET /imports/templates/:type` · `POST /imports/:type?commit=true` | Excel templates and import (`units`, `tenants`, `budget`, `payments`) |
| `POST /billing/run` · `GET /ledger/:tenantId` | Generate rent invoices; tenant statement, open items, ageing |
| `GET/POST /charges` | Charges and credit notes |
| `GET/POST /payments` · `POST /payments/:id/verify` · `/reject` · `GET /payments/:id/receipt` | Payments and verification |
| `GET /cheques` · `POST /cheques/series` · `/:id/deposit` · `/clear` · `/bounce` · `/replace` · `/return` | Cheque register |
| `GET /recovery/schedule?period=YYYY-MM` · `/recovery/arrears` · `/recovery/summary` | Recovery reports |
| `GET /dashboard/summary`, `GET /audit` | Summary figures, audit log |
