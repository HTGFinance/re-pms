// Phase 3 end-to-end checks: tenant logins, tenant isolation, complaints workflow, uploads, transfers, e-acceptance, notices.
const API = process.env.API_URL || 'http://localhost:4000/api';
const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@example.om', password: process.env.ADMIN_PASSWORD || 'ChangeMe!2026' };
let pass = 0, fail = 0;
const ok = (cond, msg, extra) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra)?.slice(0, 400) : ''); } };
async function call(method, path, token, body, form) {
  const r = await fetch(API + path, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body && !form ? { 'Content-Type': 'application/json' } : {}) }, body: form ?? (body ? JSON.stringify(body) : undefined) });
  let data = null; const txt = await r.text(); try { data = JSON.parse(txt); } catch { data = txt; }
  return { status: r.status, data, type: r.headers.get('content-type') };
}
const login = async (email, password) => (await call('POST', '/auth/login', null, { email, password })).data;
const s = Date.now().toString().slice(-6);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date());
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const file = (buf, name, type) => new Blob([buf], { type });

const admin = (await login(ADMIN.email, ADMIN.password)).token;
const B1 = (await call('GET', '/buildings', admin)).data.find((b) => b.code === 'B1');
let uN = 0; const mkUser = async (role) => { const email = `p3${role.toLowerCase()}${s}-${++uN}@example.om`; await call('POST', '/users', admin, { email, name: role + ' ' + uN, role, password: 'Str0ngPass!word' }); return (await login(email, 'Str0ngPass!word')).token; };
const sup = await mkUser('MAINTENANCE_SUPERVISOR'), tech = await mkUser('TECHNICIAN'), tech2 = await mkUser('TECHNICIAN'), fin = await mkUser('FINANCE'), pm = await mkUser('PROPERTY_MANAGER');
const techId = (await call('GET', '/auth/me', tech)).data.id;
async function mkTenantWithLogin(tag) {
  const unit = (await call('POST', '/units', admin, { buildingId: B1.id, unitNo: tag + s, listedRent: '300' })).data;
  const t = (await call('POST', '/tenants', admin, { name: `Tenant ${tag} ${s}`, email: `tenant${tag.toLowerCase()}${s}@example.om`, mobile: '+968 9' + s })).data;
  const c = (await call('POST', '/contracts', admin, { tenantId: t.id, unitId: unit.id, startDate: today.slice(0, 8) + '01', monthlyRent: '300' })).data;
  return { t, c, unit };
}

console.log('Tenant logins');
const A = await mkTenantWithLogin('A'), Bt = await mkTenantWithLogin('B');
const lg = await call('POST', `/tenants/${A.t.id}/login`, pm, {});
ok(lg.status === 201 && /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(lg.data.temporaryPassword), 'property manager creates tenant login with a temporary password', lg.data);
const first = await login(lg.data.email, lg.data.temporaryPassword);
ok(first.user?.role === 'TENANT' && first.user.mustChangePassword === true, 'tenant signs in with temporary password (must change it)');
ok((await call('GET', '/me', first.token)).status === 403, 'nothing works until the password is changed');
const ch = await call('POST', '/auth/change-password', first.token, { currentPassword: lg.data.temporaryPassword, newPassword: 'MyNewFlat!2026' });
const tA = ch.data.token; ok(ch.status === 200 && !!tA, 'tenant chooses a new password and gets a fresh session');
const home = await call('GET', '/me', tA);
ok(home.status === 200 && home.data.tenant.id === A.t.id && Number(home.data.account.currentDue) === 300 && home.data.contracts[0].building.name === B1.name, 'home: own profile, flat, this month\'s rent due (300)', home.data.account);
const lgB = (await call('POST', `/tenants/${Bt.t.id}/login`, pm, {})).data; const fb = await login(lgB.email, lgB.temporaryPassword);
const tB = (await call('POST', '/auth/change-password', fb.token, { currentPassword: lgB.temporaryPassword, newPassword: 'OtherFlat!2026' })).data.token;
ok((await call('GET', `/tenants/${A.t.id}/login`, pm)).data.exists === true, 'staff can see the tenant has a login');

console.log('Tenant isolation');
ok((await call('GET', `/tenants/${A.t.id}`, tB)).status === 403, 'tenant B cannot open tenant A\'s profile');
ok((await call('GET', `/ledger/${A.t.id}`, tB)).status === 403, 'tenant B cannot open tenant A\'s ledger');
ok((await call('GET', '/buildings', tA)).status === 403 && (await call('GET', '/payments', tA)).status === 403 && (await call('GET', '/complaints', tA)).status === 403, 'tenants cannot use staff screens');

console.log('Complaints — tenant submits');
const cats = (await call('GET', '/me/categories', tA)).data;
ok(cats.some((c) => c.category === 'Flat / unit') && cats.some((c) => c.category === 'Service' && c.subcategory === 'AC servicing'), 'categories include Repair/Service/… and Flat / unit', cats.length);
const bad = new FormData(); bad.append('category', 'Repair'); bad.append('subcategory', 'Spaceship'); bad.append('description', 'Something broke');
ok((await call('POST', '/me/complaints', tA, null, bad)).status === 400, 'unknown category rejected');
const fake = new FormData(); fake.append('category', 'Repair'); fake.append('subcategory', 'AC'); fake.append('description', 'AC not cooling'); fake.append('photos', file(Buffer.from('not an image'), 'evil.jpg', 'image/jpeg'), 'evil.jpg');
ok((await call('POST', '/me/complaints', tA, null, fake)).status === 400, 'a file pretending to be a photo is rejected (content checked)');
const f1 = new FormData(); f1.append('category', 'Repair'); f1.append('subcategory', 'AC'); f1.append('title', 'Bedroom AC'); f1.append('description', 'AC in the master bedroom is not cooling since yesterday.'); f1.append('preferredVisit', 'Weekdays after 4 pm');
f1.append('photos', file(PNG, 'ac.png', 'image/png'), 'ac.png'); f1.append('photos', file(PNG, 'ac2.png', 'image/png'), 'ac2.png');
const cA = await call('POST', '/me/complaints', tA, null, f1);
ok(cA.status === 201 && /^CMP-\d{5}$/.test(cA.data.refNo) && cA.data.statusLabel === 'Complaint received' && cA.data.files.length === 2 && cA.data.unit.includes('A' + s), `complaint ${cA.data?.refNo} submitted with 2 photos, flat filled in automatically`, cA.data);
const id = cA.data.id;
ok((await call('GET', `/me/complaints/${id}`, tB)).status === 404, 'tenant B cannot see tenant A\'s complaint');
ok((await call('GET', cA.data.files[0].url.replace('/api', ''), tB)).status === 403, 'tenant B cannot open tenant A\'s photo');
const ph = await call('GET', cA.data.files[0].url.replace('/api', ''), tA); ok(ph.status === 200 && ph.type === 'image/png', 'tenant can open own photo');

console.log('Complaints — maintenance team');
const list = (await call('GET', '/complaints?open=true', sup)).data; ok(list.some((c) => c.id === id && c.tenant.name.includes('Tenant A')), 'supervisor sees the new complaint with tenant details');
ok((await call('GET', `/complaints/${id}`, tech)).status === 403, 'technician cannot open jobs not assigned to them');
const asg = await call('PATCH', `/complaints/${id}`, sup, { assignedTo: techId, priority: 'High', expectedDate: today });
ok(asg.data.status === 'Technician assigned' && asg.data.assignedTo.id === techId, 'assigning a technician moves it to "Technician assigned"', asg.data.status);
let tv = (await call('GET', `/me/complaints/${id}`, tA)).data; ok(tv.statusLabel === 'Assigned to maintenance' && tv.expectedDate === today, 'tenant sees "Assigned to maintenance" and the expected date');
ok((await call('GET', '/complaints', tech2)).data.every((c) => c.id !== id), 'other technician does not see the job');
ok((await call('POST', `/complaints/${id}/status`, tech, { status: 'Closed' })).status === 409, 'technician cannot jump to Closed');
await call('POST', `/complaints/${id}/status`, tech, { status: 'Work in progress', note: 'On site, compressor checked' });
await call('POST', `/complaints/${id}/notes`, tech, { note: 'Gas pressure low — internal', internal: true });
const up = new FormData(); up.append('files', file(PNG, 'after.png', 'image/png'), 'after.png');
ok((await call('POST', `/complaints/${id}/files?kind=after`, tech, null, up)).data.files.length === 3, 'technician uploads an after photo');
const done = await call('POST', `/complaints/${id}/status`, tech, { status: 'Work completed', note: 'Gas refilled, cooling normal' });
ok(done.data.status === 'Tenant confirmation pending', 'work completed → waits for tenant confirmation', done.data.status);
tv = (await call('GET', `/me/complaints/${id}`, tA)).data;
ok(tv.statusLabel === 'Tenant confirmation pending' && tv.timeline.some((e) => e.note === 'Gas refilled, cooling normal') && !tv.timeline.some((e) => e.note.includes('internal')), 'tenant sees the completion note, not internal notes', tv.timeline);
const notes = (await call('GET', '/me/notifications', tA)).data; ok(notes.some((n) => n.title.includes(cA.data.refNo) && n.body.includes('confirm')), 'tenant is notified to confirm');

console.log('Complaints — tenant confirms or reopens');
const ro = await call('POST', `/me/complaints/${id}/reopen`, tA, { reason: 'Still warm at night' });
ok(ro.data.statusLabel === 'Under review' && ro.data.reopenCount === 1, 'tenant reopens: back to review, reopen counted', ro.data);
await call('POST', `/complaints/${id}/status`, sup, { status: 'Technician assigned' });
await call('POST', `/complaints/${id}/status`, tech, { status: 'Work completed', note: 'Thermostat replaced' });
ok((await call('POST', `/me/complaints/${id}/confirm`, tB, {})).status === 404, 'tenant B cannot confirm tenant A\'s complaint');
const cf = await call('POST', `/me/complaints/${id}/confirm`, tA, { rating: 4, feedback: 'Fixed, thanks' });
ok(cf.data.status === 'Closed' && cf.data.tenantRating === 4, 'tenant confirms with rating 4 → Closed', cf.data.status);
ok((await call('POST', `/me/complaints/${id}/confirm`, tA, {})).status === 409, 'cannot confirm twice');
const f2 = new FormData(); f2.append('category', 'Flat / unit'); f2.append('subcategory', 'Water leakage / damp'); f2.append('description', 'Damp patch on living room wall');
const c2 = (await call('POST', '/me/complaints', tA, null, f2)).data;
ok((await call('POST', `/me/complaints/${c2.id}/cancel`, tA)).data.statusLabel === 'Cancelled', 'tenant can withdraw a complaint before work starts');
const sm = (await call('GET', '/complaints/summary', sup)).data; ok(sm.avgRating !== null && sm.total >= 2, 'summary includes average tenant rating', sm);

console.log('Bank transfer with receipt');
const nf = new FormData(); nf.append('date', today); nf.append('amount', '300'); nf.append('reference', 'TRF' + s);
ok((await call('POST', '/me/payments', tA, null, nf)).status === 400, 'transfer without receipt rejected');
const pf = new FormData(); pf.append('date', today); pf.append('amount', '300'); pf.append('reference', 'TRF' + s); pf.append('receipt', file(PDF, 'receipt.pdf', 'application/pdf'), 'receipt.pdf');
const tp = await call('POST', '/me/payments', tA, null, pf); ok(tp.status === 201 && tp.data.status === 'Pending', 'tenant reports transfer with PDF receipt → Pending', tp.data);
ok(Number((await call('GET', '/me', tA)).data.account.balance) === 300, 'balance unchanged until finance verifies');
const fp = (await call('GET', '/payments?status=Pending', fin)).data.find((p) => p.id === tp.data.id);
ok(fp && fp.canVerify && fp.attachmentUrl, 'finance sees it in the queue with the receipt attached');
ok((await call('GET', fp.attachmentUrl.replace('/api', ''), fin)).type === 'application/pdf', 'finance opens the receipt');
await call('POST', `/payments/${tp.data.id}/verify`, fin, {});
ok(Number((await call('GET', '/me', tA)).data.account.balance) === 0, 'after verification the tenant\'s balance is 0');

console.log('Contract e-acceptance');
await call('POST', `/contracts/${A.c.id}/e-status`, admin, { step: 'Sent to tenant' });
ok((await call('GET', '/me', tA)).data.toAccept.includes(A.c.id), 'contract appears as waiting for acceptance');
ok((await call('POST', `/me/contracts/${A.c.id}/accept`, tA, { password: 'wrong' })).status === 400, 'wrong password does not accept');
ok((await call('POST', `/me/contracts/${A.c.id}/accept`, tB, { password: 'OtherFlat!2026' })).status === 404, 'tenant B cannot accept tenant A\'s contract');
const ac = await call('POST', `/me/contracts/${A.c.id}/accept`, tA, { password: 'MyNewFlat!2026' });
const cc = (await call('GET', `/contracts/${A.c.id}`, admin)).data;
ok(ac.status === 200 && cc.eStatus === 'Tenant accepted' && cc.tenantAcceptedAt, 'tenant accepts with password; time recorded', cc.eStatus);

console.log('Notice to vacate');
const nt = await call('POST', '/me/notices', tA, { contractId: A.c.id, proposedDate: today, reason: 'Moving to Salalah' });
const end = new Date(today + 'T00:00:00Z'); end.setUTCMonth(end.getUTCMonth() + 1); const endIso = end.toISOString().slice(0, 10);
ok(nt.status === 201 && nt.data.noticeEnd === endIso && nt.data.finalRentDate === endIso, 'short notice: rent runs to the end of the 1-month notice period', nt.data);
ok((await call('POST', '/me/notices', tA, { contractId: A.c.id, proposedDate: endIso })).status === 409, 'only one open notice per contract');
await call('PATCH', `/notices/${nt.data.id}`, pm, { status: 'Inspection scheduled', inspectionDate: endIso });
ok((await call('GET', '/me/notices', tA)).data[0].status === 'Inspection scheduled' && (await call('GET', '/me/notifications', tA)).data.some((n) => n.body.includes('Final inspection')), 'tenant sees the inspection date and is notified');
await call('POST', '/me/notifications/read-all', tA, {}); ok((await call('GET', '/me', tA)).data.unreadNotifications === 0, 'notifications marked read');

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
