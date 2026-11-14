import { BadRequestException, Controller, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import ExcelJS from 'exceljs';
import { DataSource, EntityManager } from 'typeorm';
import { Budget, Building, BuildingType, Contract, LedgerCharge, Payment, PaymentMethod, PaymentStatus, Role, Tenant, TenantStatus, Unit } from '../../database/entities';
import { AuthUser, buildingScope, CurrentUser, Roles } from '../../common/auth';
import { NumberingService } from '../../common/numbering.service';
import { omr, toBaisa, fromBaisa } from '../../common/money';
import { addDays, parseDate, todayOman } from '../../common/dates';
import { ContractsService } from '../contracts/contracts.controller';
import { LedgerService } from '../billing/ledger.service';

type Row = Record<string, unknown>;
export type ImportType = 'units' | 'tenants' | 'budget' | 'payments';

/** Column definitions — the first row of the sheet must hold these headings (order free, * = required). */
export const TEMPLATES: Record<ImportType, { sheet: string; cols: string[]; roles: Role[] }> = {
  units: { sheet: 'Units', roles: [Role.PROPERTY_MANAGER], cols: ['Building*', 'Building Code', 'Building Type', 'Location', 'Unit No*', 'Unit Type', 'Listed Rent', 'VAT Applicable (Y/N)'] },
  tenants: { sheet: 'Tenant Master', roles: [Role.PROPERTY_MANAGER], cols: ['Tenant Name*', 'Mobile', 'Email', 'ID Type', 'ID Number', 'Nationality', 'Building*', 'Unit No*', 'Unit Type', 'Contract Start*', 'Contract Expiry', 'Monthly Rent*', 'Security Deposit', 'Payment Frequency', 'Rent Due Day', 'Notice Period (Months)', 'VAT Applicable (Y/N)', 'Opening Balance'] },
  budget: { sheet: 'Budget', roles: [Role.FINANCE], cols: ['Year*', 'Month*', 'Building*', 'Rental Income Budget', 'Collection Budget', 'Maintenance Budget'] },
  payments: { sheet: 'Payments', roles: [Role.FINANCE], cols: ['Tenant No or Name*', 'Payment Date*', 'Amount*', 'Method', 'Reference*'] },
};

const nk = (k: unknown) => String(k ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const get = (r: Row, ...keys: string[]): unknown => { for (const k of keys) { const v = r[nk(k)]; if (v !== undefined && v !== null && String(v).trim() !== '') return v; } return ''; };
const str = (r: Row, ...k: string[]) => String(get(r, ...k)).trim();
const num = (v: unknown) => { if (v === '' || v === null || v === undefined) return NaN; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : NaN; };
const yn = (v: unknown): boolean | null => { const s = String(v ?? '').trim().toLowerCase(); return s ? ['y', 'yes', 'true', '1'].includes(s) : null; };
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const month = (v: unknown) => { const n = num(v); if (n >= 1 && n <= 12) return Math.round(n); const i = MONTHS.indexOf(String(v).trim().toLowerCase().slice(0, 3)); return i >= 0 ? i + 1 : 0; };
const isFlat = (k: string) => /flat|apartment|villa|studio|bhk|residential/i.test(k);
const FREQ: Record<string, string> = { monthly: 'Monthly', quarterly: 'Quarterly', halfyearly: 'Half-yearly', yearly: 'Yearly', annual: 'Yearly' };
const METHOD: Record<string, PaymentMethod> = { cash: PaymentMethod.CASH, cheque: PaymentMethod.CHEQUE, check: PaymentMethod.CHEQUE, banktransfer: PaymentMethod.BANK_TRANSFER, transfer: PaymentMethod.BANK_TRANSFER, card: PaymentMethod.CARD, cardpos: PaymentMethod.CARD, onlinegateway: PaymentMethod.GATEWAY, online: PaymentMethod.GATEWAY };

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    const o = v as any;
    if ('result' in o) return o.result ?? '';
    if ('richText' in o) return o.richText.map((t: any) => t.text).join('');
    if ('text' in o) return o.text;
    return '';
  }
  return v;
}
function parseCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (ch === '"') q = false; else f += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(f); f = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); out.push(row); row = []; f = ''; }
    else f += ch;
  }
  if (f !== '' || row.length) { row.push(f); out.push(row); }
  return out;
}
async function readRows(file: Express.Multer.File, sheetName: string): Promise<{ rows: Row[]; sheet: string }> {
  let grid: unknown[][]; let sheet = 'CSV';
  if (/\.csv$/i.test(file.originalname)) grid = parseCsv(file.buffer.toString('utf8').replace(/^﻿/, ''));
  else {
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(file.buffer as any); } catch { throw new BadRequestException('Could not read the file. Please upload .xlsx or .csv'); }
    const ws = wb.worksheets.find((w) => nk(w.name) === nk(sheetName)) || wb.worksheets[0];
    if (!ws) throw new BadRequestException('The workbook has no sheets'); sheet = ws.name;
    grid = [];
    ws.eachRow({ includeEmpty: false }, (r) => { const vals: unknown[] = []; for (let c = 1; c <= r.cellCount; c++) vals.push(cellValue(r.getCell(c).value)); grid.push(vals); });
  }
  if (grid.length < 2) throw new BadRequestException('The sheet has no data rows under the headings');
  const head = grid[0].map(nk);
  const rows = grid.slice(1).map((vals) => { const o: Row = {}; head.forEach((h, i) => { if (h) o[h] = vals[i] ?? ''; }); return o; })
    .filter((o) => Object.values(o).some((v) => String(v ?? '').trim() !== ''));
  if (rows.length > 5000) throw new BadRequestException('Maximum 5,000 rows per import');
  return { rows, sheet };
}

interface Checked { line: number; ok: boolean; message: string; data?: any; raw: Row }

@Controller('imports')
export class ImportsController {
  constructor(private ds: DataSource, private num: NumberingService, private contracts: ContractsService, private ledger: LedgerService) {}

  /** Download an empty template workbook for an import type. */
  @Get('templates/:type') @Roles(Role.PROPERTY_MANAGER, Role.FINANCE)
  async template(@Param('type') type: ImportType, @Res() res: Response) {
    const t = TEMPLATES[type]; if (!t) throw new BadRequestException('Unknown import type');
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(t.sheet);
    ws.addRow(t.cols.map((c) => c.replace('*', '')));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };
    t.cols.forEach((c, i) => { ws.getColumn(i + 1).width = Math.max(14, c.length + 3); });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="RE-PMS_${t.sheet.replace(/ /g, '_')}_template.xlsx"`);
    await wb.xlsx.write(res); res.end();
  }

  /** Upload a file. commit=false (default) returns a row-by-row preview; commit=true imports all valid rows in one transaction. */
  @Post(':type') @Roles(Role.PROPERTY_MANAGER, Role.FINANCE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async upload(@CurrentUser() u: AuthUser, @Param('type') type: ImportType, @UploadedFile() file: Express.Multer.File, @Query('commit') commit?: string) {
    const t = TEMPLATES[type]; if (!t) throw new BadRequestException('Unknown import type');
    if (u.role !== Role.ADMIN && !t.roles.includes(u.role)) throw new BadRequestException(`Your role cannot import ${type}`);
    if (!file) throw new BadRequestException('Attach a file in the "file" field');
    const { rows, sheet } = await readRows(file, t.sheet);
    const result = await this.ds.transaction(async (em) => {
      const checked = await this.validate(em, u, type, rows);
      const valid = checked.filter((c) => c.ok);
      if (commit === 'true') { for (const c of valid) await this.apply(em, u, type, c); }
      return { type, sheet, committed: commit === 'true', total: rows.length, valid: valid.length, errors: rows.length - valid.length,
        rows: checked.map(({ line, ok, message, raw }) => ({ line, ok, message, raw })) };
    });
    if (result.committed && type === 'tenants') await this.ledger.runBilling();
    return result;
  }

  private async validate(em: EntityManager, u: AuthUser, type: ImportType, rows: Row[]): Promise<Checked[]> {
    const buildings = await em.find(Building); const s = buildingScope(u);
    const findB = (v: string) => { const x = v.toLowerCase(); return buildings.find((b) => b.name.toLowerCase() === x || b.code.toLowerCase() === x); };
    const units = await em.find(Unit);
    const findU = (b: Building | undefined, no: string) => b && units.find((x) => x.buildingId === b.id && x.unitNo.toLowerCase() === no.toLowerCase());
    const seen = new Set<string>(); const out: Checked[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], e: string[] = []; let msg = '', data: any = {};
      if (type === 'units') {
        const bn = str(r, 'Building', 'Building Name'), no = str(r, 'Unit No', 'Unit', 'Unit Number');
        if (!bn) e.push('Building missing'); if (!no) e.push('Unit no. missing');
        const b = bn ? findB(bn) : undefined; if (b && s && !s.includes(b.id)) e.push('Building outside your assigned buildings');
        const rent = num(get(r, 'Listed Rent', 'Rent')); if (!isNaN(rent) && rent < 0) e.push('Listed rent is negative');
        const key = bn.toLowerCase() + '|' + no.toLowerCase(); if (bn && no) { if (seen.has(key)) e.push('Duplicate row in file'); seen.add(key); }
        msg = (b ? '' : 'New building · ') + (findU(b, no) ? 'Update unit' : 'New unit'); data = { bn, no };
      } else if (type === 'tenants') {
        const name = str(r, 'Tenant Name', 'Name'), bn = str(r, 'Building', 'Building Name'), no = str(r, 'Unit No', 'Unit', 'Flat No');
        const start = parseDate(get(r, 'Contract Start', 'Start Date')), expRaw = get(r, 'Contract Expiry', 'Expiry Date', 'End Date'), exp = parseDate(expRaw);
        const rent = num(get(r, 'Monthly Rent', 'Rent'));
        if (!name) e.push('Tenant name missing'); if (!bn) e.push('Building missing'); if (!no) e.push('Unit no. missing');
        if (!start) e.push('Contract start missing or not a date'); if (expRaw && !exp) e.push('Contract expiry is not a date');
        if (!(rent > 0)) e.push('Monthly rent missing'); if (start && exp && exp < start) e.push('Expiry is before start');
        const b = bn ? findB(bn) : undefined; if (b && s && !s.includes(b.id)) e.push('Building outside your assigned buildings');
        const un = findU(b, no);
        if (un && start) {
          const expiry = exp || addDays(start, 364);
          const clash = await em.query(`SELECT c.contract_no, t.name FROM contracts c JOIN tenants t ON t.id=c.tenant_id WHERE c.unit_id=$1 AND c.status IN ('Active','Upcoming','Draft') AND c.start_date <= $3 AND c.expiry_date >= $2 LIMIT 1`, [un.id, start, expiry]);
          if (clash.length) e.push(`Unit already let to ${clash[0].name} (${clash[0].contract_no})`);
        }
        const key = bn.toLowerCase() + '|' + no.toLowerCase(); if (bn && no) { if (seen.has(key)) e.push('Same unit appears twice in file'); seen.add(key); }
        msg = 'New tenant & contract' + (b ? '' : ' · new building') + (un ? '' : ' · new unit'); data = { name, bn, no, start, exp, rent };
      } else if (type === 'budget') {
        const y = num(get(r, 'Year')), m = month(get(r, 'Month')), bn = str(r, 'Building', 'Building Name'), b = bn ? findB(bn) : undefined;
        const v = { rent: num(get(r, 'Rental Income Budget', 'Rental Income')), col: num(get(r, 'Collection Budget', 'Collections')), mnt: num(get(r, 'Maintenance Budget', 'Maintenance')) };
        if (!(y >= 2000 && y <= 2100)) e.push('Year missing/invalid'); if (!m) e.push('Month missing/invalid');
        if (!bn) e.push('Building missing'); else if (!b) e.push(`Unknown building "${bn}" — import it in Units first`);
        if ([v.rent, v.col, v.mnt].every(isNaN)) e.push('No budget amounts');
        const period = `${y}-${String(m).padStart(2, '0')}`; const key = (b?.id || bn) + period; if (seen.has(key)) e.push('Duplicate row in file'); seen.add(key);
        msg = b ? `${b.name} · ${period}` : ''; data = { buildingId: b?.id, period, v };
      } else {
        const tv = str(r, 'Tenant No or Name', 'Tenant No', 'Tenant ID', 'Tenant Name', 'Tenant');
        const found = tv ? await em.query(`SELECT id, name FROM tenants WHERE lower(tenant_no)=lower($1) OR lower(name)=lower($1) LIMIT 2`, [tv]) : [];
        const d = parseDate(get(r, 'Payment Date', 'Date')), a = num(get(r, 'Amount')), ref = str(r, 'Reference', 'Ref');
        const mraw = nk(get(r, 'Method', 'Payment Method')), method = mraw ? METHOD[mraw] : PaymentMethod.BANK_TRANSFER;
        if (!tv) e.push('Tenant missing'); else if (!found.length) e.push(`Tenant "${tv}" not found`); else if (found.length > 1) e.push('Name matches more than one tenant — use the tenant number');
        if (!d) e.push('Date missing/invalid'); else if (d > todayOman()) e.push('Date is in the future');
        if (!(a > 0)) e.push('Amount missing'); if (!ref) e.push('Reference missing'); if (mraw && !method) e.push('Unknown method');
        if (found.length === 1 && ref) {
          if ((await em.query(`SELECT 1 FROM payments WHERE tenant_id=$1 AND reference=$2 AND status<>'Rejected' LIMIT 1`, [found[0].id, ref])).length) e.push('Reference already recorded');
          const k = found[0].id + '|' + ref; if (seen.has(k)) e.push('Duplicate row in file'); seen.add(k);
        }
        msg = found.length === 1 ? `${found[0].name} · OMR ${omr(a || 0)}` : ''; data = { tenantId: found[0]?.id, d, a, ref, method };
      }
      out.push({ line: i + 2, ok: !e.length, message: e.length ? e.join('; ') : msg, data, raw: r });
    }
    return out;
  }

  private async apply(em: EntityManager, u: AuthUser, type: ImportType, c: Checked) {
    const r = c.raw, d = c.data;
    const ensureBuilding = async (bn: string) => {
      let b = await em.createQueryBuilder(Building, 'b').where('lower(b.name)=lower(:v) OR lower(b.code)=lower(:v)', { v: bn }).getOne();
      if (!b) {
        const code = str(r, 'Building Code') || await this.num.next(em, 'building', 'B', 2);
        const bt = str(r, 'Building Type'); const type = (Object.values(BuildingType) as string[]).find((x) => x.toLowerCase() === bt.toLowerCase()) as BuildingType | undefined;
        b = await em.save(Building, em.create(Building, { code, name: bn, type: type ?? BuildingType.RESIDENTIAL, location: str(r, 'Location') }));
      }
      return b;
    };
    const ensureUnit = async (b: Building, no: string, rent: number) => {
      let un = await em.findOne(Unit, { where: { buildingId: b.id, unitNo: no } });
      const kind = str(r, 'Unit Type'), vat = yn(get(r, 'VAT Applicable (Y/N)', 'VAT Applicable', 'VAT'));
      if (!un) un = em.create(Unit, { buildingId: b.id, unitNo: no, unitType: kind, listedRent: omr(isNaN(rent) ? 0 : rent), vatApplicable: vat ?? (!isFlat(kind) && b.type !== BuildingType.RESIDENTIAL) });
      else { if (kind) un.unitType = kind; if (!isNaN(rent) && type === 'units') un.listedRent = omr(rent); if (vat !== null) un.vatApplicable = vat; }
      return em.save(Unit, un);
    };
    if (type === 'units') {
      const b = await ensureBuilding(d.bn);
      if (str(r, 'Location') && !b.location) await em.update(Building, b.id, { location: str(r, 'Location') });
      await ensureUnit(b, d.no, num(get(r, 'Listed Rent', 'Rent')));
    } else if (type === 'tenants') {
      const b = await ensureBuilding(d.bn); const un = await ensureUnit(b, d.no, d.rent);
      const tenant = await em.save(Tenant, em.create(Tenant, { tenantNo: await this.num.next(em, 'tenant', 'T-'), name: d.name, mobile: str(r, 'Mobile', 'Phone'),
        email: str(r, 'Email').toLowerCase(), idType: str(r, 'ID Type'), idNumber: str(r, 'ID Number', 'Civil ID'), nationality: str(r, 'Nationality'), status: TenantStatus.ACTIVE }));
      const dep = num(get(r, 'Security Deposit', 'Deposit')), due = num(get(r, 'Rent Due Day')), nm = num(get(r, 'Notice Period (Months)', 'Notice Period'));
      await this.contracts.create(em, { tenantId: tenant.id, unitId: un.id, startDate: d.start, expiryDate: d.exp || undefined, monthlyRent: String(d.rent),
        securityDeposit: isNaN(dep) ? undefined : String(dep), paymentFrequency: (FREQ[nk(get(r, 'Payment Frequency'))] as any) || undefined,
        rentDueDay: due >= 1 && due <= 28 ? Math.round(due) : undefined, noticeMonths: nm >= 0 && nm <= 12 ? Math.round(nm) : undefined,
        vatApplicable: yn(get(r, 'VAT Applicable (Y/N)', 'VAT Applicable', 'VAT')) ?? undefined }, un);
      const ob = num(get(r, 'Opening Balance', 'Outstanding')); const obDate = addDays(todayOman().slice(0, 7) + '-01', -1);
      if (ob > 0) await em.save(LedgerCharge, em.create(LedgerCharge, { chargeNo: await this.num.next(em, 'charge', 'CHG-'), tenantId: tenant.id, date: obDate, amount: omr(ob), kind: 'Opening balance', description: 'Opening balance brought forward (import)' }));
      if (ob < 0) await em.save(Payment, em.create(Payment, { receiptNo: await this.num.next(em, 'receipt', 'RCP-', 5), tenantId: tenant.id, date: obDate, amount: fromBaisa(-toBaisa(ob)), method: PaymentMethod.OPENING, reference: 'Opening advance', status: PaymentStatus.VERIFIED, recordedBy: u.id, verifiedBy: u.id, verifiedAt: new Date() }));
    } else if (type === 'budget') {
      const ex = await em.findOne(Budget, { where: { buildingId: d.buildingId, period: d.period } });
      const b = ex ?? em.create(Budget, { buildingId: d.buildingId, period: d.period, rentalIncome: '0', collection: '0', maintenance: '0' });
      if (!isNaN(d.v.rent)) b.rentalIncome = omr(d.v.rent); if (!isNaN(d.v.col)) b.collection = omr(d.v.col); if (!isNaN(d.v.mnt)) b.maintenance = omr(d.v.mnt);
      await em.save(Budget, b);
    } else {
      await em.save(Payment, em.create(Payment, { receiptNo: await this.num.next(em, 'receipt', 'RCP-', 5), tenantId: d.tenantId, date: d.d, amount: omr(d.a), method: d.method,
        reference: d.ref, status: PaymentStatus.VERIFIED, recordedBy: u.id, verifiedBy: u.id, verifiedAt: new Date() }));
    }
  }
}
