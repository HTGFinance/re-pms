// End-to-end API test. Run against a running API with demo seed data:
//   API_URL=http://localhost:4000/api ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run test:e2e
import ExcelJS from 'exceljs';
const API = process.env.API_URL || 'http://localhost:4000/api';
const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@example.om', password: process.env.ADMIN_PASSWORD || 'ChangeMe!2026' };
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg); } };
async function call(method, path, token, body, raw) {
  const r = await fetch(API + path, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body && !raw ? { 'Content-Type': 'application/json' } : {}) }, body: raw ? body : body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
const login = async (email, password) => (await call('POST', '/auth/login', null, { email, password })).data?.token;
const stamp = Date.now().toString().slice(-6);

console.log('Auth');
ok((await call('GET', '/health')).status === 200, 'health is public');
ok((await call('GET', '/buildings')).status === 401, 'buildings need login');
ok((await call('POST', '/auth/login', null, { email: ADMIN.email, password: 'wrong-password' })).status === 401, 'wrong password rejected');
const admin = await login(ADMIN.email, ADMIN.password); ok(!!admin, 'admin logs in');
ok((await call('GET', '/auth/me', admin)).data?.role === 'ADMIN', 'me returns ADMIN');

console.log('Properties');
const bl = (await call('GET', '/buildings', admin)).data; ok(Array.isArray(bl) && bl.length >= 4, `lists ${bl.length} buildings`);
const B1 = bl.find((b) => b.code === 'B1'), B3 = bl.find((b) => b.code === 'B3');
const units = (await call('GET', '/units?buildingId=' + B1.id, admin)).data; ok(units.length >= 8, 'units of B1');
ok((await call('POST', '/units', admin, { buildingId: B1.id, unitNo: '101' })).status === 409, 'duplicate unit rejected');
const nu = await call('POST', '/units', admin, { buildingId: B1.id, unitNo: 'T' + stamp, unitType: 'Flat 1BHK', listedRent: '210.5' });
ok(nu.status === 201 && nu.data.listedRent === '210.500', 'unit created with 3-decimal rent');

console.log('Users & building scope');
const pmEmail = `pm${stamp}@example.om`;
const pm = await call('POST', '/users', admin, { email: pmEmail, name: 'PM Muscat', role: 'PROPERTY_MANAGER', password: 'Str0ngPass!word', buildingIds: [B1.id] });
ok(pm.status === 201 && !pm.data.passwordHash, 'property manager created (no hash returned)');
const pmTok = await login(pmEmail, 'Str0ngPass!word');
const pmB = (await call('GET', '/buildings', pmTok)).data; ok(pmB.length === 1 && pmB[0].code === 'B1', 'PM sees only assigned building');
ok((await call('POST', '/units', pmTok, { buildingId: B3.id, unitNo: 'X' + stamp })).status === 403, 'PM cannot add unit outside scope');
ok((await call('GET', '/users', pmTok)).status === 403, 'PM cannot manage users');

console.log('Tenants & contracts');
const t = await call('POST', '/tenants', pmTok, { name: 'Test Tenant ' + stamp, mobile: '+968 90000000', email: 'TEST@Example.om', idType: 'Civil ID', idNumber: 'C' + stamp });
ok(t.status === 201 && /^T-\d{4}$/.test(t.data.tenantNo) && t.data.email === 'test@example.om', `tenant ${t.data?.tenantNo} created`);
const unitId = nu.data.id;
const c = await call('POST', '/contracts', pmTok, { tenantId: t.data.id, unitId, startDate: '2026-01-01', monthlyRent: '210.500' });
ok(c.status === 201 && c.data.expiryDate === '2026-12-31' && c.data.status === 'Active', `contract ${c.data?.contractNo}: default 12-month term, Active`);
ok(c.data.securityDeposit === '210.500' && c.data.noticeMonths === 1 && Number(c.data.vatRate) === 0, 'deposit defaults to 1 month, residential: 1 month notice, no VAT');
ok((await call('POST', '/contracts', pmTok, { tenantId: t.data.id, unitId, startDate: '2026-06-01', monthlyRent: '200' })).status === 409, 'overlapping contract on same unit rejected');
const units2 = (await call('GET', '/units?buildingId=' + B1.id, pmTok)).data; ok(units2.find((x) => x.id === unitId).status === 'Occupied', 'unit shows Occupied with tenant');
const exp = (await call('GET', '/contracts?expiringWithinDays=90', pmTok)).data; const ex = exp.find((x) => x.id === c.data.id); ok(!!ex, 'contract appears in expiring-within-90-days');
ok(ex && ex.expiryDate === '2026-12-31' && Number.isInteger(ex.daysToExpiry), 'list dates are exact (no time-zone shift) and days-to-expiry is a number');
ok((await call('POST', `/contracts/${c.data.id}/e-status`, pmTok, { step: 'Registered' })).status === 409, 'e-contract steps cannot be skipped');
for (const step of ['Sent to tenant', 'Tenant accepted', 'Landlord approved']) await call('POST', `/contracts/${c.data.id}/e-status`, pmTok, { step });
ok((await call('POST', `/contracts/${c.data.id}/e-status`, pmTok, { step: 'Registered' })).status === 400, 'registration needs a number');
const reg = await call('POST', `/contracts/${c.data.id}/e-status`, pmTok, { step: 'Registered', regNo: 'MM-TEST-' + stamp });
ok(reg.data.eStatus === 'Registered' && reg.data.municipalityFee === '75.780', 'registered; fee = 3% of annual rent (210.500 × 12 × 3% = 75.780)');
ok((await call('PATCH', `/contracts/${c.data.id}`, pmTok, { monthlyRent: '250' })).status === 409, 'registered contract terms are locked');
const ren = await call('POST', `/contracts/${c.data.id}/renew`, pmTok, { months: 12, monthlyRent: '220.000' });
ok(ren.status === 201 && ren.data.startDate === '2027-01-01' && ren.data.status === 'Upcoming' && ren.data.renewalOf === c.data.id, 'renewal starts day after expiry, Upcoming');

console.log('Excel import');
const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Tenant Master');
ws.addRow(['Tenant Name', 'Mobile', 'Building', 'Unit No', 'Contract Start', 'Contract Expiry', 'Monthly Rent', 'Opening Balance', 'VAT Applicable (Y/N)']);
ws.addRow(['Import Tenant A ' + stamp, '+968 91111111', 'Al Saada Towers', 'A6', new Date(Date.UTC(2026, 9, 1)), '30/09/2027', 300, 150, 'N']);
ws.addRow(['Import Tenant B ' + stamp, '', 'New Tower ' + stamp, 'G-01', '2026-11-01', '', 380, -380, 'N']);
ws.addRow(['', '', 'Al Saada Towers', 'A6', 'not a date', '', 0, '', '']);
const buf = Buffer.from(await wb.xlsx.writeBuffer());
const form = () => { const f = new FormData(); f.append('file', new Blob([buf]), 'tenants.xlsx'); return f; };
const prev = await call('POST', '/imports/tenants', admin, form(), true);
ok(prev.status === 201 && prev.data.valid === 2 && prev.data.errors === 1 && !prev.data.committed, 'preview: 2 valid, 1 error, nothing saved');
ok(/Tenant name missing/.test(prev.data.rows[2].message) && /not a date/.test(prev.data.rows[2].message), 'error row explains each problem');
const com = await call('POST', '/imports/tenants?commit=true', admin, form(), true); ok(com.data?.committed && com.data.valid === 2, 'commit imports valid rows');
const again = await call('POST', '/imports/tenants', admin, form(), true); ok(again.data.valid === 0, 're-upload: units now already let → all rows flagged');
const nb = (await call('GET', '/buildings', admin)).data.find((b) => b.name === 'New Tower ' + stamp); ok(!!nb, 'new building created by import');
ok((await call('POST', '/imports/budget', pmTok, form(), true)).status === 400, 'PM cannot import budget');

console.log('Dashboard & audit');
const sum = (await call('GET', '/dashboard/summary', admin)).data; ok(sum.units > 0 && sum.occupied >= 3 && typeof sum.monthlyRentRoll === 'string', `summary: ${sum.occupied}/${sum.units} occupied, rent roll ${sum.monthlyRentRoll}`);
const audit = (await call('GET', '/audit?limit=50', admin)).data; ok(audit.some((a) => a.path.includes('/contracts') && a.userEmail === pmEmail), 'changes are written to the audit log with user');
ok(audit.every((a) => !JSON.stringify(a.body || {}).includes('Str0ngPass')), 'passwords are redacted in the audit log');

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
