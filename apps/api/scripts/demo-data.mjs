// Loads realistic sample data for sales demos and screenshots.
// Run on an EMPTY demo database only (after migrations and `SEED_DEMO=true` seed), with the API running:
//   node scripts/demo-data.mjs
// Creates tenants, contracts from 1 Jan, payments (most up to date, some in arrears), cheques,
// complaints in every stage, maintenance costs, a budget for the year, and demo logins:
//   ceo@demo.om, finance@demo.om, pm@demo.om, tenant@demo.om  (password: Demo!Pass2026)
import ExcelJS from 'exceljs';
import pg from 'pg';
const API = process.env.API_URL || 'http://localhost:4000/api';
const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@example.om', password: process.env.ADMIN_PASSWORD || 'ChangeMe!2026' };
const PW = 'Demo!Pass2026';
const db = new pg.Client({ host: process.env.DB_HOST || 'localhost', port: +(process.env.DB_PORT || 5432), user: process.env.DB_USER || 'repms', password: process.env.DB_PASSWORD || 'repms', database: process.env.DB_NAME || 'repms' });
await db.connect();
async function call(method, path, token, body, form) {
  const r = await fetch(API + path, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body && !form ? { 'Content-Type': 'application/json' } : {}) }, body: form ?? (body ? JSON.stringify(body) : undefined) });
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
  if (r.status >= 400) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 300)}`);
  return d;
}
const login = async (e, p) => (await call('POST', '/auth/login', null, { email: e, password: p })).token;
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date());
const Y = today.slice(0, 4), M = Number(today.slice(5, 7));
const d = (m, day) => `${Y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const admin = await login(ADMIN.email, ADMIN.password);
const user = async (email, name, role) => { await call('POST', '/users', admin, { email, name, role, password: 'TempPass!2026x', buildingIds: [] }); const t = await login(email, 'TempPass!2026x'); await call('POST', '/auth/change-password', t, { currentPassword: 'TempPass!2026x', newPassword: PW }); return login(email, PW); };
const fin = await user('finance@demo.om', 'Finance Officer', 'FINANCE');
const fin2 = await user('cashier@demo.om', 'Recovery Officer', 'RECOVERY');
const pm = await user('pm@demo.om', 'Property Manager', 'PROPERTY_MANAGER');
await user('ceo@demo.om', 'Group CEO', 'EXECUTIVE');
const sup = await user('maintenance@demo.om', 'Maintenance Supervisor', 'MAINTENANCE_SUPERVISOR');
await call('POST', '/users', admin, { email: 'tech1@demo.om', name: 'Rashid (Technician)', role: 'TECHNICIAN', password: PW, buildingIds: [] });
await call('POST', '/users', admin, { email: 'tech2@demo.om', name: 'Anil (Technician)', role: 'TECHNICIAN', password: PW, buildingIds: [] });
const techs = (await call('GET', '/users', admin)).filter((u) => u.role === 'TECHNICIAN');

const people = ['Ahmed Al Balushi', 'Fatma Al Hinai', 'Rajesh Kumar', 'Salim Al Rawahi', 'Maryam Al Lawati', 'John Mathew', 'Khalid Al Saadi', 'Aisha Al Harthy', 'Imran Qureshi', 'Said Al Maskari', 'Noor Al Zadjali', 'Peter Fernandes', 'Hilal Al Busaidi', 'Zainab Al Kindi', 'Vikram Nair', 'Yousuf Al Amri', 'Huda Al Jabri', 'Thomas George', 'Badr Al Shukaili', 'Layla Al Farsi', 'Arif Hussain', 'Mohammed Al Mamari', 'Sara Al Rashdi', 'Daniel Joseph', 'Hamed Al Wahaibi', 'Muna Al Siyabi', 'Faisal Khan', 'Ali Al Habsi', 'Reem Al Mukhaini', 'Suresh Pillai', 'Nasser Al Ghafri', 'Amina Al Raisi', 'George Thomas', 'Sultan Al Kalbani', 'Shaikha Al Abri', 'Ravi Shankar', 'Talal Al Yahyai', 'Asma Al Hashmi', 'Kevin DSouza', 'Majid Al Ruqaishi', 'Hanan Al Nabhani', 'Sameer Patel', 'Juma Al Mahrouqi', 'Rahma Al Hosni', 'Abdullah Al Ismaili', 'Priya Menon', 'Saif Al Rumhi', 'Lubna Al Shibli', 'Omar Farooq', 'Khamis Al Battashi', 'Bushra Al Sinani', 'Anthony Rodrigues', 'Hamood Al Hadhrami', 'Nadia Al Kharusi', 'Waleed Al Riyami', 'Deepa Varghese', 'Ibrahim Al Hajri', 'Wafa Al Mandhari', 'Naveed Akhtar', 'Mazin Al Shidhani', 'Ruqaiya Al Toobi', 'Joseph Antony', 'Adil Al Marhoobi', 'Salma Al Qasmi', 'Haitham Al Musalhi', 'Shirin Kapoor', 'Ahmed Al Fazari', 'Zahra Al Aufi'];
const firms = ['Gulf Trading LLC', 'Coastal Pharmacy', 'Bright Minds Training', 'Desert Logistics SAOC', 'Al Noor Optics', 'Prime Engineering LLC', 'Sea Breeze Café', 'Muscat Tech Services', 'Oasis Dental Clinic', 'Falcon Freight LLC', 'Green Valley Supermarket', 'Horizon Consulting', 'Wadi Auto Parts', 'Silver Sands Travel', 'Al Jazeera Electronics', 'Pearl Beauty Salon', 'Summit Insurance Brokers', 'Atlas Cold Storage', 'Nizwa Furniture House', 'Bluewave IT Solutions', 'Sohar Steel Supplies'];
// Grow the sample buildings to a realistic mid-size portfolio
const target = { Residential: 36, Commercial: 16, Warehouse: 6 };
for (const b of await call('GET', '/buildings', admin)) {
  const have = (await call('GET', '/units?buildingId=' + b.id, admin)).length; const want = target[b.type] ?? 10;
  for (let i = have + 1; i <= want; i++) {
    const floor = Math.ceil(i / 6), no = `${floor}${String(((i - 1) % 6) + 1).padStart(2, '0')}`;
    const [ut, base, step] = b.type === 'Residential' ? [pick(['1 BHK', '2 BHK', '2 BHK', '3 BHK']), 200, 40] : b.type === 'Warehouse' ? ['Warehouse', 1400, 100] : [pick(['Office', 'Shop', 'Showroom']), 450, 50];
    await call('POST', '/units', admin, { buildingId: b.id, unitNo: (b.type === 'Warehouse' ? 'W-' : b.type === 'Commercial' ? 'C-' : 'A-') + no, unitType: ut, listedRent: String(base + step * Math.floor(rnd() * 5)), vatApplicable: b.type !== 'Residential' });
  }
}
const units = await call('GET', '/units', admin);
const buildings = await call('GET', '/buildings', admin);
const bType = Object.fromEntries(buildings.map((b) => [b.id, b.type]));
let pi = 0, fi = 0, n = 0; const tenants = [];
for (const u of units) {
  if (rnd() < 0.08) continue; // vacant
  const commercial = bType[u.buildingId] !== 'Residential';
  const name = commercial ? firms[fi++ % firms.length] + (fi > firms.length ? ' ' + fi : '') : people[pi++ % people.length] + (pi > people.length ? ' ' + pi : '');
  const t = await call('POST', '/tenants', admin, { name, mobile: '+968 9' + String(1000000 + Math.floor(rnd() * 8999999)), email: `t${++n}@tenants.demo.om`, nationality: 'Omani' });
  const startM = rnd() < 0.7 ? 1 : 1 + Math.floor(rnd() * Math.max(1, M - 2));
  const expiryM = rnd() < 0.2 ? M + 1 : 12; const expiry = `${expiryM > 12 ? +Y + 1 : Y}-${String(((expiryM - 1) % 12) + 1).padStart(2, '0')}-${expiryM === 12 ? 31 : 28}`;
  const rent = String(Number(u.listedRent || (commercial ? 600 : 300)));
  const c = await call('POST', '/contracts', pm, { tenantId: t.id, unitId: u.id, startDate: d(startM, 1), expiryDate: startM === 1 ? expiry : `${+Y + 1}-${String(startM).padStart(2, '0')}-01`, monthlyRent: rent, securityDeposit: rent, billFrom: d(startM, 1), rentDueDay: 5 });
  tenants.push({ t, c, startM, rent: Number(rent), commercial });
}
// Payments: most tenants pay each month by the 5th; some are behind.
for (const x of tenants) {
  const inv = (await db.query(`SELECT period, total FROM invoices WHERE tenant_id=$1 AND due_date <= $2 ORDER BY due_date`, [x.t.id, today])).rows;
  const r = rnd(); const behind = r < 0.72 ? 0 : r < 0.88 ? 1 : r < 0.96 ? 2 : 3;
  x.behind = behind; const payN = Math.max(0, inv.length - behind);
  for (let i = 0; i < payN; i++) {
    const per = String(inv[i].period).slice(0, 7); const day = 1 + Math.floor(rnd() * 9); let date = `${per}-${String(day).padStart(2, '0')}`; if (date > today) date = today;
    const method = pick(['Bank transfer', 'Bank transfer', 'Cash', 'Card (POS)']);
    const p = await call('POST', '/payments', fin2, { tenantId: x.t.id, date, amount: String(inv[i].total), method, reference: (method === 'Cash' ? 'CASH' : 'TRF') + Math.floor(rnd() * 1e7) });
    await call('POST', `/payments/${p.id}/verify`, fin, {});
  }
  if (behind === 0 && rnd() < 0.2) await call('POST', '/payments', fin2, { tenantId: x.t.id, date: today, amount: String(x.rent), method: 'Bank transfer', reference: 'PEND' + n++ }); // awaiting verification
}
// Post-dated cheques for some commercial tenants
for (const x of tenants.filter((_, i) => i % 6 === 0).slice(0, 5)) await call('POST', '/cheques/series', fin, { tenantId: x.t.id, contractId: x.c.id, bank: pick(['Bank Muscat', 'Bank Dhofar', 'NBO', 'Sohar International']), firstChequeNo: String(100000 + Math.floor(rnd() * 800000)), firstDueDate: d(Math.min(M + 1, 12), 5), count: 3, amount: String(x.rent), intervalMonths: 1 });

// Complaints in every stage, with costs
const cats = [['Repair', 'Plumbing', 'Kitchen sink leaking under the cabinet'], ['Repair', 'AC', 'AC in bedroom not cooling'], ['Repair', 'Electrical', 'Power socket in living room not working'], ['Service', 'AC servicing', 'Quarterly AC service'], ['Cleaning', 'Water tank cleaning', 'Water tank cleaning for the building'], ['Painting', 'Unit painting', 'Repaint unit before new tenant'], ['Replacement', 'Appliances', 'Water heater replacement'], ['Repair', 'Civil works', 'Crack in bathroom tiles']];
const statuses = ['Closed', 'Closed', 'Closed', 'Closed', 'Closed', 'Closed', 'Tenant confirmation pending', 'Work in progress', 'Technician assigned', 'New', 'Awaiting materials / approval', 'Reviewed'];
const occ = tenants.map((x) => x);
for (let i = 0; i < 60; i++) {
  const x = occ[Math.floor(rnd() * occ.length)]; const [category, subcategory, description] = pick(cats);
  const job = await call('POST', '/complaints', sup, { buildingId: units.find((u) => u.id === x.c.unitId)?.buildingId, unitId: x.c.unitId, category, subcategory, description, priority: pick(['Low', 'Medium', 'Medium', 'High', 'Urgent']) });
  const month = i < 50 ? 1 + Math.floor(rnd() * M) : M; const day = Math.min(1 + Math.floor(rnd() * 26), month === M ? Number(today.slice(8)) : 28);
  const target = i < 46 ? 'Closed' : statuses[i % statuses.length];
  const tech = pick(techs);
  if (target !== 'New' && target !== 'Reviewed') await call('PATCH', `/complaints/${job.id}`, sup, { assignedTo: tech.id, expectedDate: d(month, Math.min(day + 3, 28)) });
  const path = { 'Reviewed': ['Reviewed'], 'Technician assigned': [], 'Work in progress': ['Work in progress'], 'Awaiting materials / approval': ['Work in progress', 'Awaiting materials / approval'], 'Tenant confirmation pending': ['Work in progress', 'Work completed'], 'Closed': ['Work in progress', 'Work completed'] }[target] || [];
  for (const s of path) await call('POST', `/complaints/${job.id}/status`, sup, { status: s, note: s === 'Work completed' ? 'Job done and tested' : undefined });
  if (['Closed', 'Tenant confirmation pending', 'Work in progress'].includes(target)) {
    const material = (25 + Math.floor(rnd() * 160)).toString(), labour = (20 + Math.floor(rnd() * 70)).toString();
    await call('POST', `/complaints/${job.id}/costs`, sup, { workDate: d(month, day), technicianId: tech.id, material, labour, contractor: category === 'Painting' ? '120' : undefined, contractorName: category === 'Painting' ? 'Al Waha Painting' : undefined, classification: 'Company responsibility', description: description });
  }
  const start = d(month, day), done = target === 'Closed' && month < M ? d(month, Math.min(day + 1 + Math.floor(rnd() * 3), 28)) : today;
  await db.query(`UPDATE complaints SET created_at=$2::date + time '09:30', completed_at = CASE WHEN completed_at IS NULL THEN NULL ELSE $3::date + time '15:00' END WHERE id=$1`, [job.id, start, done]);
  await db.query(`UPDATE complaint_events SET at = $2::date + time '09:30' + (id % 50) * interval '1 minute' WHERE complaint_id=$1`, [job.id, start]);
  if (target === 'Closed') await db.query(`UPDATE complaints SET status='Closed', closed_at=$2::date + time '18:00', tenant_rating=$3 WHERE id=$1`, [job.id, done, 4 + Math.round(rnd())]);
}
// The demo tenant: one month behind, with a job in progress
const star = tenants.find((x) => x.behind === 1 && !x.commercial) || tenants[0];
const sj = await call('POST', '/complaints', sup, { buildingId: units.find((u) => u.id === star.c.unitId).buildingId, unitId: star.c.unitId, category: 'Repair', subcategory: 'AC', description: 'Living room AC making noise and not cooling', priority: 'High' });
await call('PATCH', `/complaints/${sj.id}`, sup, { assignedTo: techs[0].id, expectedDate: today }); await call('POST', `/complaints/${sj.id}/status`, sup, { status: 'Work in progress', note: 'Technician on the way' });
// Finance approves the costs the supervisor recorded (maker-checker)
for (const k of await call('GET', '/maintenance-costs?approval=Pending', fin)) await call('POST', `/maintenance-costs/${k.id}/approve`, fin, {});
// Budget for the year (slightly above actual so variances look realistic)
const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Budget'); ws.addRow(['Year', 'Month', 'Building', 'Rental Income Budget', 'Collection Budget', 'Maintenance Budget']);
for (const b of buildings) {
  const roll = tenants.filter((x) => units.find((u) => u.id === x.c.unitId)?.buildingId === b.id).reduce((s, x) => s + x.rent, 0);
  const full = units.filter((u) => u.buildingId === b.id).reduce((s, u) => s + Number(u.listedRent || 0), 0);
  for (let m = 1; m <= 12; m++) ws.addRow([+Y, m, b.name, Math.round(roll * (0.97 + rnd() * 0.06)), Math.round(roll * (0.95 + rnd() * 0.05)), Math.round(roll * 0.022)]);
}
const fd = new FormData(); fd.append('file', new Blob([Buffer.from(await wb.xlsx.writeBuffer())]), 'budget.xlsx'); await call('POST', '/imports/budget?commit=true', fin, null, fd);
// Tenant app login for demos
const demoT = star.t; const lg = await call('POST', `/tenants/${demoT.id}/login`, pm, {});
const t0 = await login(demoT.email, lg.temporaryPassword || lg.password); await call('POST', '/auth/change-password', t0, { currentPassword: lg.temporaryPassword || lg.password, newPassword: PW });
await db.query(`UPDATE users SET email='tenant@demo.om' WHERE email=$1`, [demoT.email]);
console.log(`Demo data loaded: ${tenants.length} tenants, ${units.length} units. Logins: ceo@demo.om, finance@demo.om, pm@demo.om, maintenance@demo.om, tenant@demo.om — password ${PW}`);
await db.end();
