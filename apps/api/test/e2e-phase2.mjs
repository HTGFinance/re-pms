// Phase 2 end-to-end checks: billing, ledger, payments (maker-checker), credit notes, cheques, recovery reports.
// Run against a running API with demo seed data:  npm run test:e2e
const API = process.env.API_URL || 'http://localhost:4000/api';
const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@example.om', password: process.env.ADMIN_PASSWORD || 'ChangeMe!2026' };
let pass = 0, fail = 0;
const ok = (cond, msg, extra) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
async function call(method, path, token, body) {
  const r = await fetch(API + path, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
const login = async (email, password) => (await call('POST', '/auth/login', null, { email, password })).data?.token;
const stamp = Date.now().toString().slice(-6);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date());
const month = today.slice(0, 7), month1 = month + '-01';
const ym = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 7); };
const n3 = (s) => Number(s);

const admin = await login(ADMIN.email, ADMIN.password);
const bl = (await call('GET', '/buildings', admin)).data; const B1 = bl.find((b) => b.code === 'B1'), B3 = bl.find((b) => b.code === 'B3');
let uN = 0; const mkUser = async (role, buildingIds = []) => { const email = `${role.toLowerCase()}${stamp}-${++uN}@example.om`; await call('POST', '/users', admin, { email, name: role + ' ' + stamp, role, password: 'Str0ngPass!word', buildingIds }); return login(email, 'Str0ngPass!word'); };
const fin = await mkUser('FINANCE'), fin2 = await mkUser('FINANCE'), rec = await mkUser('RECOVERY', [B1.id]), pm = await mkUser('PROPERTY_MANAGER');
const mkUnit = async (b, no, rent, vat) => (await call('POST', '/units', admin, { buildingId: b.id, unitNo: no + stamp, listedRent: rent, vatApplicable: vat })).data;
const mkTenant = async (name) => (await call('POST', '/tenants', admin, { name: name + ' ' + stamp })).data;

console.log('Billing');
const uA = await mkUnit(B1, 'A', '230', false), tA = await mkTenant('Monthly Tenant');
const cA = (await call('POST', '/contracts', admin, { tenantId: tA.id, unitId: uA.id, startDate: '2026-01-01', monthlyRent: '230', billFrom: ym(month1, -2) + '-01' })).data;
let lA = (await call('GET', `/ledger/${tA.id}`, admin)).data;
ok(lA.lines.filter((l) => l.kind === 'Rent').length === 3 && n3(lA.balance) === 690, 'monthly contract billed from bill-from month to current month (3 × 230 = 690)', lA.balance);
const uD = await mkUnit(B1, 'D', '210', false), tD = await mkTenant('Default Tenant');
await call('POST', '/contracts', admin, { tenantId: tD.id, unitId: uD.id, startDate: '2026-01-01', monthlyRent: '210' });
const lD = (await call('GET', `/ledger/${tD.id}`, admin)).data;
ok(lD.lines.length === 1 && lD.lines[0].description.includes(month), 'past start date: billing starts this month by default (older rent = opening balance)', lD.lines);
const uQ = await mkUnit(B3, 'Q', '650', true), tQ = await mkTenant('Quarterly Co');
const qStart = ym(month1, -2) + '-01';
await call('POST', '/contracts', admin, { tenantId: tQ.id, unitId: uQ.id, startDate: qStart, monthlyRent: '650', paymentFrequency: 'Quarterly', rentDueDay: 5, billFrom: qStart });
const lQ = (await call('GET', `/ledger/${tQ.id}`, admin)).data;
ok(lQ.lines.length === 1 && n3(lQ.balance) === 2047.5, 'quarterly commercial: one invoice for 3 months + VAT 5% (1,950 + 97.5 = 2,047.500)', lQ.balance);
ok(lQ.lines[0].date === qStart.slice(0, 8) + '05', 'invoice due on the contract rent-due day', lQ.lines[0].date);
const run = await call('POST', '/billing/run', fin, {}); ok(run.status === 200 && run.data.created === 0, 'billing run is idempotent (no duplicates)', run.data);
ok((await call('POST', '/billing/run', rec, {})).status === 403, 'recovery staff cannot run billing');

console.log('Payments & maker-checker');
const p1 = await call('POST', '/payments', rec, { tenantId: tA.id, date: today, amount: '300', method: 'Cash', reference: 'C' + stamp });
ok(p1.status === 201 && p1.data.status === 'Pending' && /^RCP-\d{5}$/.test(p1.data.receiptNo), 'recovery records cash → Pending receipt', p1.data);
lA = (await call('GET', `/ledger/${tA.id}`, admin)).data;
ok(n3(lA.balance) === 690 && lA.pendingPayments.length === 1, 'pending payment does not reduce the balance yet');
ok((await call('POST', `/payments/${p1.data.id}/verify`, rec)).status === 403, 'recovery staff cannot verify');
const pl = (await call('GET', '/payments?status=Pending', fin)).data; ok(pl.find((x) => x.id === p1.data.id)?.canVerify === true, 'finance sees it in the verification queue');
ok((await call('POST', `/payments/${p1.data.id}/verify`, fin)).data?.status === 'Verified', 'finance verifies');
lA = (await call('GET', `/ledger/${tA.id}`, admin)).data;
ok(n3(lA.balance) === 390, 'verified payment reduces the balance (690 − 300 = 390)', lA.balance);
ok(lA.open.length === 2 && n3(lA.open[0].outstanding) === 160 && n3(lA.open[0].paid) === 70 && n3(lA.open[1].outstanding) === 230, 'payment settles the oldest month first (month 1 paid, month 2 part-paid 70)', lA.open);
const ag = lA.aging; ok(n3(ag.total) === 390 && Math.abs(n3(ag.current) + n3(ag.d0_30) + n3(ag.d31_60) + n3(ag.d61_90) + n3(ag.d90plus) - 390) < 0.001, 'ageing buckets add up to the balance', ag);
const own = await call('POST', '/payments', fin, { tenantId: tA.id, date: today, amount: '50', method: 'Bank transfer', reference: 'T' + stamp });
ok((await call('POST', `/payments/${own.data.id}/verify`, fin)).status === 403, 'maker-checker: finance cannot verify a payment they recorded');
ok((await call('POST', `/payments/${own.data.id}/reject`, fin2, { reason: 'Not on bank statement' })).data?.status === 'Rejected', 'a second finance user can reject it');
ok((await call('POST', `/payments/${own.data.id}/verify`, fin2)).status === 409, 'rejected payment cannot then be verified');
ok((await call('POST', '/payments', rec, { tenantId: tA.id, date: today, amount: '10', method: 'Cash', reference: 'C' + stamp })).status === 409, 'duplicate reference rejected');
ok((await call('POST', '/payments', rec, { tenantId: tA.id, date: '2099-01-01', amount: '10', method: 'Cash', reference: 'F' + stamp })).status === 400, 'future-dated payment rejected');
ok((await call('POST', '/payments', rec, { tenantId: tA.id, date: today, amount: '10', method: 'Cheque', reference: 'X' + stamp })).status === 400, 'cheques must go through the cheque register');
ok((await call('POST', '/payments', rec, { tenantId: tQ.id, date: today, amount: '10', method: 'Cash', reference: 'S' + stamp })).status === 403, 'recovery staff limited to their buildings');
ok((await call('GET', `/payments/${p1.data.id}/receipt`, rec)).data?.receiptNo === p1.data.receiptNo, 'receipt available for verified payment');

console.log('Charges & credit notes');
ok((await call('POST', '/charges', pm, { tenantId: tA.id, date: today, amount: '-20', kind: 'Credit note', description: 'Goodwill' })).status === 400, 'property manager cannot issue a credit note');
await call('POST', '/charges', fin, { tenantId: tA.id, date: today, amount: '-20', kind: 'Credit note', description: 'Goodwill' });
await call('POST', '/charges', pm, { tenantId: tA.id, date: today, amount: '15.250', kind: 'Maintenance', description: 'Broken window (recoverable)' });
lA = (await call('GET', `/ledger/${tA.id}`, admin)).data;
ok(n3(lA.balance) === 385.25, 'credit note and recoverable charge post to the ledger (390 − 20 + 15.250 = 385.250)', lA.balance);

console.log('Cheques (PDC)');
const s1 = await call('POST', '/cheques/series', rec, { tenantId: tA.id, contractId: cA.id, bank: 'Bank Muscat', firstChequeNo: '000123', firstDueDate: today, count: 3, amount: '230', intervalMonths: 1 });
ok(s1.status === 201 && s1.data.map((c) => c.chequeNo).join(',') === '000123,000124,000125' && s1.data[1].dueDate.slice(0, 7) === ym(today, 1), 'series of 3 monthly cheques, numbers keep leading zeros', s1.data?.map?.((c) => [c.chequeNo, c.dueDate]));
ok((await call('POST', '/cheques/series', rec, { tenantId: tA.id, bank: 'Bank Muscat', firstChequeNo: '000124', firstDueDate: today, count: 1, amount: '1', intervalMonths: 1 })).status === 409, 'same cheque cannot be recorded twice');
ok((await call('POST', `/cheques/${s1.data[1].id}/deposit`, rec, {})).status === 400, 'cannot deposit a cheque before its date');
ok((await call('POST', `/cheques/${s1.data[0].id}/deposit`, rec, {})).data?.status === 'Deposited', 'due cheque deposited');
ok((await call('POST', `/cheques/${s1.data[0].id}/clear`, rec, {})).status === 403, 'recovery cannot mark cleared (finance confirms from bank statement)');
const cl = await call('POST', `/cheques/${s1.data[0].id}/clear`, fin, {}); ok(cl.data?.status === 'Cleared' && !!cl.data.paymentId, 'finance marks cleared → payment created');
lA = (await call('GET', `/ledger/${tA.id}`, admin)).data; ok(n3(lA.balance) === 155.25, 'cleared cheque reduces the balance (385.250 − 230 = 155.250)', lA.balance);
const s2 = (await call('POST', '/cheques/series', rec, { tenantId: tA.id, bank: 'NBO', firstChequeNo: '9' + stamp, firstDueDate: today, count: 1, amount: '230', intervalMonths: 1 })).data[0];
await call('POST', `/cheques/${s2.id}/deposit`, rec, {});
const bo = await call('POST', `/cheques/${s2.id}/bounce`, fin, { reason: 'Insufficient funds', bounceFee: '10' });
lA = (await call('GET', `/ledger/${tA.id}`, admin)).data;
ok(bo.data?.status === 'Bounced' && n3(lA.balance) === 165.25, 'bounced cheque: no payment, bounce fee 10 charged (165.250)', lA.balance);
const rp = await call('POST', `/cheques/${s2.id}/replace`, rec, { chequeNo: '8' + stamp, bank: 'NBO', dueDate: today });
const after = (await call('GET', `/cheques?tenantId=${tA.id}`, admin)).data;
ok(rp.status === 201 && after.find((c) => c.id === s2.id).status === 'Replaced' && after.find((c) => c.id === rp.data.id).status === 'In hand', 'bounced cheque replaced by a new one in hand');

console.log('Recovery reports');
const sch = (await call('GET', `/recovery/schedule?period=${month}`, fin)).data;
const rowA = sch.rows.find((r) => r.tenant.id === tA.id);
ok(rowA && rowA.status === 'Partly paid' && n3(rowA.outstanding) === 140, 'schedule: this month part-paid 90, 140 outstanding (older months settled first)', rowA);
ok(Math.abs(n3(sch.totals.billed) - n3(sch.totals.collected) - n3(sch.totals.outstanding)) < 0.001, 'schedule totals: billed = collected + outstanding', sch.totals);
const recSch = (await call('GET', `/recovery/schedule?period=${month}`, rec)).data; ok(recSch.rows.every((r) => r.building === B1.name), 'recovery user sees only their building in the schedule');
const arr = (await call('GET', '/recovery/arrears', fin)).data; const aA = arr.rows.find((r) => r.tenant.id === tA.id);
ok(aA && n3(aA.balance) === 165.25, 'arrears list shows the tenant with the correct balance', aA);
const sm = (await call('GET', `/recovery/summary?period=${month}`, fin)).data;
ok(sm.cheques.inHand && typeof sm.collectionRate === 'number' && sm.pendingVerification.count >= 0, 'summary: billed, collection rate, cheques and pending queue', sm);

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
