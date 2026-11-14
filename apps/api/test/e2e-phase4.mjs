// Phase 4 end-to-end checks: maintenance costs, approvals, recoverable charges, dashboard figures, history, Excel report.
import ExcelJS from 'exceljs';
const API = process.env.API_URL || 'http://localhost:4000/api';
const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@example.om', password: process.env.ADMIN_PASSWORD || 'ChangeMe!2026' };
let pass = 0, fail = 0;
const ok = (cond, msg, extra) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra)?.slice(0, 500) : ''); } };
async function call(method, path, token, body, form, raw) {
  const r = await fetch(API + path, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body && !form ? { 'Content-Type': 'application/json' } : {}) }, body: form ?? (body ? JSON.stringify(body) : undefined) });
  if (raw) return { status: r.status, type: r.headers.get('content-type'), buf: Buffer.from(await r.arrayBuffer()) };
  let data = null; const txt = await r.text(); try { data = JSON.parse(txt); } catch { data = txt; }
  return { status: r.status, data };
}
const login = async (e, p) => (await call('POST', '/auth/login', null, { email: e, password: p })).data;
const s = Date.now().toString().slice(-6);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date());
const n3 = (x) => Number(x);

const admin = (await login(ADMIN.email, ADMIN.password)).token;
let uN = 0; const mk = async (role) => { const email = `p4${role.toLowerCase()}${s}-${++uN}@example.om`; await call('POST', '/users', admin, { email, name: `${role} ${uN}`, role, password: 'Str0ngPass!word' }); const l = await login(email, 'Str0ngPass!word'); return { token: l.token, id: l.user.id }; };
const sup = await mk('MAINTENANCE_SUPERVISOR'), tech = await mk('TECHNICIAN'), tech2 = await mk('TECHNICIAN'), pm = await mk('PROPERTY_MANAGER'), fin = await mk('FINANCE');
const bld = (await call('POST', '/buildings', admin, { code: 'P' + s, name: 'P4 Tower ' + s, type: 'Residential' })).data;
const unit = (await call('POST', '/units', admin, { buildingId: bld.id, unitNo: '101', listedRent: '300' })).data;
const t = (await call('POST', '/tenants', admin, { name: 'P4 Tenant ' + s })).data;
await call('POST', '/contracts', admin, { tenantId: t.id, unitId: unit.id, startDate: today.slice(0, 8) + '01', monthlyRent: '300' });
const job = (await call('POST', '/complaints', sup.token, { buildingId: bld.id, unitId: unit.id, category: 'Repair', subcategory: 'Plumbing', title: 'Burst pipe', description: 'Pipe burst under kitchen sink' })).data;
const common = (await call('POST', '/complaints', sup.token, { buildingId: bld.id, category: 'Cleaning', subcategory: 'Water tank cleaning', description: 'Quarterly tank cleaning' })).data;
await call('PATCH', `/complaints/${job.id}`, sup.token, { assignedTo: tech.id, expectedDate: today });
const bal0 = n3((await call('GET', `/ledger/${t.id}`, admin)).data.balance);

console.log('Recording costs');
const c1 = await call('POST', `/complaints/${job.id}/costs`, tech.token, { workDate: today, material: '20', labour: '15', classification: 'Company responsibility', description: 'New pipe + fitting' });
ok(c1.status === 201 && c1.data.total === '35.000' && c1.data.approvalStatus === 'Not needed' && c1.data.technician?.id === tech.id, 'technician records material 20 + labour 15 = 35.000, company cost, no approval needed', c1.data);
ok((await call('POST', `/complaints/${job.id}/costs`, tech.token, { workDate: today, classification: 'Company responsibility' })).status === 400, 'a cost with no amounts is rejected');
ok((await call('POST', `/complaints/${job.id}/costs`, tech.token, { workDate: '2099-01-01', labour: '5', classification: 'Company responsibility' })).status === 400, 'future work date rejected');
ok((await call('POST', `/complaints/${job.id}/costs`, tech2.token, { workDate: today, labour: '5', classification: 'Company responsibility' })).status === 403, 'technician cannot add costs to a job not assigned to them');
ok((await call('POST', `/complaints/${common.id}/costs`, sup.token, { workDate: today, contractor: '40', classification: 'Recoverable from tenant' })).status === 400, 'common-area job cannot be recovered from a tenant');

console.log('Approvals');
const c2 = (await call('POST', `/complaints/${job.id}/costs`, tech.token, { workDate: today, material: '12.5', classification: 'Recoverable from tenant', description: 'Tenant damaged the tap' })).data;
ok(c2.approvalStatus === 'Pending' && /charged to the tenant/.test(c2.approvalReason), 'recoverable cost needs approval', c2);
ok(n3((await call('GET', `/ledger/${t.id}`, admin)).data.balance) === bal0, 'nothing is charged to the tenant before approval');
ok((await call('POST', `/maintenance-costs/${c2.id}/approve`, tech.token, {})).status === 403 && (await call('POST', `/maintenance-costs/${c2.id}/approve`, sup.token, {})).status === 403, 'technicians and supervisors cannot approve');
const ap = await call('POST', `/maintenance-costs/${c2.id}/approve`, pm.token, {});
ok(ap.data.approvalStatus === 'Approved' && !!ap.data.chargeId, 'property manager approves → tenant charge created');
ok(n3((await call('GET', `/ledger/${t.id}`, admin)).data.balance) === bal0 + 12.5, 'tenant ledger increases by 12.500');
const c3 = (await call('POST', `/complaints/${job.id}/costs`, sup.token, { workDate: today, contractor: '250', contractorName: 'Al Noor Plumbing LLC', classification: 'Company responsibility' })).data;
ok(c3.approvalStatus === 'Pending' && /above OMR 200/.test(c3.approvalReason), 'company cost over OMR 200 needs approval', c3);
ok((await call('POST', `/maintenance-costs/${c3.id}/approve`, fin.token, {})).data.approvalStatus === 'Approved', 'finance approves it');
const c4 = (await call('POST', `/complaints/${job.id}/costs`, sup.token, { workDate: today, other: '18', classification: 'Pending approval' })).data;
ok((await call('POST', `/maintenance-costs/${c4.id}/approve`, pm.token, {})).status === 400, '"pending approval" needs a final decision on who pays');
const a4 = (await call('POST', `/maintenance-costs/${c4.id}/approve`, pm.token, { classification: 'Tenant responsibility' })).data;
ok(a4.classification === 'Tenant responsibility' && !a4.chargeId, 'approved as tenant responsibility (no charge: tenant paid directly)');
const c5 = (await call('POST', `/complaints/${job.id}/costs`, sup.token, { workDate: today, labour: '30', classification: 'Recoverable from tenant' })).data;
const own = (await call('POST', `/complaints/${job.id}/costs`, pm.token, { workDate: today, labour: '30', classification: 'Recoverable from tenant' })).data;
ok((await call('POST', `/maintenance-costs/${own.id}/approve`, pm.token, {})).status === 403, 'maker-checker: cannot approve a cost you recorded');
await call('DELETE', `/maintenance-costs/${own.id}`, pm.token);
ok((await call('POST', `/maintenance-costs/${c5.id}/reject`, pm.token, { reason: 'Normal wear and tear' })).data.approvalStatus === 'Rejected', 'cost rejected with reason');
const q = (await call('GET', '/maintenance-costs?approval=Pending', pm.token)).data; ok(Array.isArray(q) && q.every((x) => x.approvalStatus === 'Pending'), 'approval queue lists pending costs');

console.log('Editing rules');
const e1 = await call('PATCH', `/maintenance-costs/${c1.data.id}`, tech.token, { labour: '99' }); ok(e1.status === 200, 'unapproved cost can be corrected by its recorder', e1);
await call('PATCH', `/maintenance-costs/${c1.data.id}`, tech.token, { labour: '15' });
ok((await call('PATCH', `/maintenance-costs/${c3.id}`, sup.token, { contractor: '10' })).status === 409 && (await call('DELETE', `/maintenance-costs/${c2.id}`, pm.token)).status === 409, 'approved costs cannot be changed or deleted');
const c6 = (await call('POST', `/complaints/${common.id}/costs`, sup.token, { workDate: today, contractor: '300', classification: 'Company responsibility' })).data;
const e6 = (await call('PATCH', `/maintenance-costs/${c6.id}`, sup.token, { contractor: '9' })).data;
ok(c6.approvalStatus === 'Pending' && e6.approvalStatus === 'Not needed' && e6.total === '9.000', 'reducing below the limit removes the need for approval');

console.log('Dashboard');
await call('POST', `/complaints/${job.id}/status`, tech.token, { status: 'Work completed', note: 'Fixed' });
const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Budget'); ws.addRow(['Year', 'Month', 'Building', 'Maintenance Budget']); ws.addRow([Number(today.slice(0, 4)), Number(today.slice(5, 7)), bld.name, 310]);
const fd = new FormData(); fd.append('file', new Blob([Buffer.from(await wb.xlsx.writeBuffer())]), 'b.xlsx'); await call('POST', '/imports/budget?commit=true', admin, null, fd);
const d = (await call('GET', `/maintenance/dashboard?buildingId=${bld.id}`, pm.token)).data;
const cls = Object.fromEntries(d.spend.byClass.map((x) => [x.classification, n3(x.amount)]));
ok(n3(d.spend.total) === 324.5, 'spend this month = 35 + 12.5 + 250 + 18 + 9 = 324.500 (rejected and pending excluded)', d.spend);
ok(cls['Company responsibility'] === 294 && cls['Recoverable from tenant'] === 12.5 && cls['Tenant responsibility'] === 18, 'split by who pays: company 294, recoverable 12.5, tenant 18', cls);
ok(n3(d.spend.split.material) === 32.5 && n3(d.spend.split.labour) === 15 && n3(d.spend.split.contractor) === 259 && n3(d.spend.split.other) === 18, 'split by material / labour / contractor / other', d.spend.split);
ok(n3(d.spend.budget) > 0 && n3(d.spend.budget) <= 310, `maintenance budget for the month so far: ${d.spend.budget} of 310`, d.spend.budget);
ok(d.kpis.received === 2 && d.kpis.completed === 1 && d.kpis.awaitingTenant === 1 && d.kpis.avgResolutionDays !== null, 'counts: 2 received, 1 completed (awaiting tenant), resolution time measured', d.kpis);
ok(n3(d.trend[11].cost) === 324.5 && d.trend.length === 12, '12-month trend ends with this month\'s spend');
ok(d.buildings.length === 1 && n3(d.buildings[0].cost) === 324.5 && n3(d.buildings[0].costPerUnit) === 324.5, 'building-wise cost and cost per unit');
const tr = d.technicians.find((x) => x.id === tech.id); ok(tr && tr.completed === 1 && tr.onTimeRate === 100 && n3(tr.cost) === 315.5, 'technician performance: completed on time; costs of their jobs 315.500 (35 + 12.5 + 250 + 18)', tr);
ok((await call('GET', '/maintenance/dashboard', tech.token)).status === 403, 'technicians do not see the management dashboard');

console.log('History and report');
const h = (await call('GET', `/maintenance/history?buildingId=${bld.id}`, sup.token)).data;
ok(h.jobs.length === 2 && n3(h.total) === 324.5 && h.units.find((x) => x.unit === '101')?.jobs === 1 && h.units.some((x) => x.unit === 'Common area'), 'building history: jobs, cost per unit and common area', h.units);
const hu = (await call('GET', `/maintenance/history?unitId=${unit.id}`, sup.token)).data; ok(hu.jobs.length === 1 && n3(hu.jobs[0].recovered) === 12.5, 'unit history shows recovered amount');
const rep = await call('GET', `/maintenance/report.xlsx?buildingId=${bld.id}`, fin.token, null, null, true);
ok(rep.status === 200 && /spreadsheetml/.test(rep.type), 'monthly report downloads as Excel');
const rb = new ExcelJS.Workbook(); await rb.xlsx.load(rep.buf);
const names = rb.worksheets.map((w) => w.name); const costRows = rb.getWorksheet('Costs').rowCount - 1;
ok(['Summary', 'Monthly trend', 'Buildings', 'Technicians', 'Jobs', 'Costs'].every((n) => names.includes(n)) && costRows === 6, `report sheets: ${names.join(', ')}; ${costRows} cost lines`, { names, costRows });

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
