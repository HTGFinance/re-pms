// Phase 5 end-to-end checks: executive dashboard figures on an isolated building with known numbers.
import ExcelJS from 'exceljs';
const API = process.env.API_URL || 'http://localhost:4000/api';
const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@example.om', password: process.env.ADMIN_PASSWORD || 'ChangeMe!2026' };
let pass = 0, fail = 0;
const ok = (cond, msg, extra) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra)?.slice(0, 600) : ''); } };
async function call(method, path, token, body, form, raw) {
  const r = await fetch(API + path, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body && !form ? { 'Content-Type': 'application/json' } : {}) }, body: form ?? (body ? JSON.stringify(body) : undefined) });
  if (raw) return { status: r.status, type: r.headers.get('content-type'), buf: Buffer.from(await r.arrayBuffer()) };
  let data = null; const txt = await r.text(); try { data = JSON.parse(txt); } catch { data = txt; }
  return { status: r.status, data };
}
const login = async (e, p) => (await call('POST', '/auth/login', null, { email: e, password: p })).data;
const s = Date.now().toString().slice(-6);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date());
const ym = (n) => { const d = new Date(today.slice(0, 8) + '01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const lastDay = (first) => { const d = new Date(first + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
const m2 = ym(-2), m1 = ym(-1), m0 = ym(0), m1end = lastDay(m1);
const n3 = (x) => Number(x);

const admin = (await login(ADMIN.email, ADMIN.password)).token;
let uN = 0; const mk = async (role, buildingIds = []) => { const email = `p5${role.toLowerCase()}${s}-${++uN}@example.om`; await call('POST', '/users', admin, { email, name: `${role} ${uN}`, role, password: 'Str0ngPass!word', buildingIds }); return (await login(email, 'Str0ngPass!word')).token; };
const fin1 = await mk('FINANCE'), fin2 = await mk('FINANCE'), sup = await mk('MAINTENANCE_SUPERVISOR'), exec = await mk('EXECUTIVE'), tech = await mk('TECHNICIAN');
const bld = (await call('POST', '/buildings', admin, { code: 'E' + s, name: 'Exec Tower ' + s, type: 'Residential' })).data;
const uA = (await call('POST', '/units', admin, { buildingId: bld.id, unitNo: 'A', listedRent: '200' })).data;
await call('POST', '/units', admin, { buildingId: bld.id, unitNo: 'B', listedRent: '150' });
const t = (await call('POST', '/tenants', admin, { name: 'Exec Tenant ' + s })).data;
await call('POST', '/contracts', admin, { tenantId: t.id, unitId: uA.id, startDate: m2, monthlyRent: '200', billFrom: m2 });
const pay = async (date, amount, ref) => { const p = (await call('POST', '/payments', fin1, { tenantId: t.id, date, amount, method: 'Bank transfer', reference: ref + s })).data; await call('POST', `/payments/${p.id}/verify`, fin2, {}); };
await pay(m1.slice(0, 8) + '05', '200', 'L'); await pay(today, '250', 'T');
const job = (await call('POST', '/complaints', sup, { buildingId: bld.id, category: 'Cleaning', subcategory: 'General cleaning', description: 'Common area cleaning' })).data;
await call('POST', `/complaints/${job.id}/costs`, sup, { workDate: m1.slice(0, 8) + '10', labour: '30', classification: 'Company responsibility' });
await call('POST', `/complaints/${job.id}/costs`, sup, { workDate: today, labour: '50', classification: 'Company responsibility' });
const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Budget'); ws.addRow(['Year', 'Month', 'Building', 'Rental Income Budget', 'Collection Budget', 'Maintenance Budget']);
ws.addRow([Number(m1.slice(0, 4)), Number(m1.slice(5, 7)), bld.name, 220, 200, 30]); ws.addRow([Number(m0.slice(0, 4)), Number(m0.slice(5, 7)), bld.name, 220, 200, 40]);
const fd = new FormData(); fd.append('file', new Blob([Buffer.from(await wb.xlsx.writeBuffer())]), 'b.xlsx'); await call('POST', '/imports/budget?commit=true', admin, null, fd);

console.log('Last month (complete month)');
const L = (await call('GET', `/executive/dashboard?from=${m1}&to=${m1end}&buildingId=${bld.id}`, exec)).data; const x = L.totals;
ok(n3(x.rentBilled) === 200 && n3(x.vat) === 0 && n3(x.collectedAgainstBilling) === 200 && x.collectionRate === 100, 'rent billed 200, fully collected (100%)', x);
ok(n3(x.cashReceived) === 200 && n3(x.maintenance) === 30 && n3(x.noi) === 170, 'cash received 200, maintenance 30, NOI 170');
ok(x.units === 2 && x.occupied === 1 && x.occupancy === 50 && n3(x.vacancyLoss) === 150, 'occupancy 50% (1 of 2), vacancy loss 150 (empty unit at listed rent)', { u: x.units, o: x.occupied, v: x.vacancyLoss });
const bv = x.budgetVsActual;
ok(n3(bv.rentalIncome.budget) === 220 && n3(bv.rentalIncome.variance) === -20 && bv.rentalIncome.variancePct === -9.1 && bv.rentalIncome.favourable === false, 'rent: budget 220, actual 200, −20 (−9.1%) adverse', bv.rentalIncome);
ok(n3(bv.collections.budget) === 200 && bv.collections.favourable === true, 'collections: 200 vs budget 200, on target', bv.collections);
ok(n3(bv.maintenance.budget) === 30 && n3(bv.maintenance.actual) === 30 && bv.maintenance.favourable === true, 'maintenance 30 vs budget 30 (at or below budget = favourable)', bv.maintenance);
ok(n3(bv.noi.budget) === 190 && n3(bv.noi.actual) === 170, 'NOI: budget 190 (220 − 30), actual 170', bv.noi);
ok(L.buildings.length === 1 && n3(L.buildings[0].rentBilled) === 200 && L.monthly.length === 1, 'building table and monthly series for the month');

console.log('This month so far');
const C = (await call('GET', `/executive/dashboard?from=${m0}&to=${today}&buildingId=${bld.id}`, exec)).data; const y = C.totals;
const dim = Number(lastDay(m0).slice(8)), share = Number(today.slice(8)) / dim;
ok(n3(y.rentBilled) === 200 && n3(y.collectedAgainstBilling) === 50 && y.collectionRate === 25, 'this month\'s invoice only 50 settled (payments go to oldest dues first) → 25%', y);
ok(n3(y.cashReceived) === 250 && n3(y.maintenance) === 50, 'cash received 250, maintenance 50');
ok(Math.abs(n3(y.budgetVsActual.rentalIncome.budget) - Math.round(220000 * share) / 1000) < 0.002, `budget pro-rated for ${today.slice(8)} of ${dim} days: ${y.budgetVsActual.rentalIncome.budget}`, y.budgetVsActual.rentalIncome);
ok(n3(C.today.outstanding) === 150 && C.today.tenantsInArrears <= 1, 'today: 150 outstanding (600 billed − 450 paid)', C.today);

console.log('Three months and year to date');
const Q = (await call('GET', `/executive/dashboard?from=${m2}&to=${today}&buildingId=${bld.id}`, exec)).data;
ok(Q.monthly.length === 3 && n3(Q.monthly[0].collected) === 200 && n3(Q.totals.rentBilled) === 600 && n3(Q.totals.collectedAgainstBilling) === 450, '3 months: 600 billed, 450 collected; first month fully paid', Q.monthly.map((m) => [m.month, m.collected]));
if (m2.slice(0, 4) === today.slice(0, 4)) ok(n3(Q.ytd.rentBilled) === 600 && Q.ytd.from === today.slice(0, 4) + '-01-01', 'year-to-date block: 600 billed since 1 January', Q.ytd.rentBilled);
const F = (await call('GET', `/executive/dashboard?from=${m0}&to=${lastDay(m0)}&buildingId=${bld.id}`, exec)).data;
ok(Math.abs(n3(F.totals.budgetVsActual.rentalIncome.budget) - n3(C.totals.budgetVsActual.rentalIncome.budget)) < 0.002, 'a period running past today counts budget only up to today');

console.log('Access and report');
const other = await mk('PROPERTY_MANAGER', [(await call('GET', '/buildings', admin)).data.find((b) => b.code === 'B1').id]);
ok((await call('GET', `/executive/dashboard?buildingId=${bld.id}`, other)).status === 400, 'property manager cannot see a building outside their scope');
ok((await call('GET', '/executive/dashboard', tech)).status === 403, 'technicians have no access');
ok((await call('GET', '/executive/dashboard', exec)).data.buildings.length >= 5, 'executive sees the whole portfolio by default');
const rep = await call('GET', `/executive/report.xlsx?from=${m1}&to=${m1end}&buildingId=${bld.id}`, fin1, null, null, true);
const rb = new ExcelJS.Workbook(); await rb.xlsx.load(rep.buf); const sh = rb.getWorksheet('Summary');
let rentRow = null; sh.eachRow((r) => { if (r.getCell(1).value === 'Rental income (excl. VAT)') rentRow = r; });
ok(rep.status === 200 && ['Summary', 'Buildings', 'Monthly'].every((n) => rb.getWorksheet(n)) && rentRow && rentRow.getCell(2).value === 220 && rentRow.getCell(4).value === -20, 'board pack Excel: summary with budget vs actual, buildings, monthly');

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
