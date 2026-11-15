// Phase 6 end-to-end checks: one-step tenancy, tenant documents, app invitation by link / QR / WhatsApp, accept, security.
const API = process.env.API_URL || 'http://localhost:4000/api';
const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@example.om', password: process.env.ADMIN_PASSWORD || 'ChangeMe!2026' };
let pass = 0, fail = 0;
const ok = (cond, msg, extra) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra)?.slice(0, 500) : ''); } };
async function call(method, path, token, body, form, headers = {}) {
  const r = await fetch(API + path, { method, headers: { ...headers, ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body && !form ? { 'Content-Type': 'application/json' } : {}) }, body: form ?? (body ? JSON.stringify(body) : undefined) });
  let data = null; const txt = await r.text(); try { data = JSON.parse(txt); } catch { data = txt; }
  return { status: r.status, data, cookie: r.headers.get('set-cookie') || '' };
}
const login = async (e, p) => (await call('POST', '/auth/login', null, { email: e, password: p }));
const s = Date.now().toString().slice(-6);
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a1b00000000049454e44ae426082', 'hex');
const PDF = Buffer.from('%PDF-1.4\n%test\n');
const form = (buf, name, type) => { const f = new FormData(); f.append('files', new Blob([buf], { type }), name); return f; };

const admin = (await login(ADMIN.email, ADMIN.password)).data.token;
let uN = 0; const mk = async (role, buildingIds = []) => { const email = `p6${role.toLowerCase()}${s}-${++uN}@example.om`; await call('POST', '/users', admin, { email, name: `${role} ${uN}`, role, password: 'Str0ngPass!word', buildingIds }); return (await login(email, 'Str0ngPass!word')).data.token; };
const pm = await mk('PROPERTY_MANAGER'), fin = await mk('FINANCE'), tech = await mk('TECHNICIAN');
const b = (await call('POST', '/buildings', admin, { code: 'O' + s, name: 'Onboard Tower ' + s, type: 'Residential' })).data;
const unit = (await call('POST', '/units', admin, { buildingId: b.id, unitNo: '101', listedRent: '300' })).data;
const unit2 = (await call('POST', '/units', admin, { buildingId: b.id, unitNo: '102', listedRent: '250' })).data;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date());

console.log('New tenancy in one step');
const opts = await call('GET', '/tenancies/options', pm);
ok(opts.status === 200 && opts.data.paymentModes.includes('Cheque (PDC)'), 'options list payment modes', opts.data);
const bad = await call('POST', '/tenancies', pm, { tenant: { name: 'X' }, contract: { unitId: unit.id, startDate: today, monthlyRent: '300', paymentMode: 'Gold bars' } });
ok(bad.status === 400, 'unknown payment mode refused', bad.data);
const email = `newtenant${s}@mail.om`;
const r = await call('POST', '/tenancies', pm, {
  tenant: { name: 'Huda Al Balushi', mobile: '9123 4567', email, nationality: 'Omani', idType: 'Civil ID', idNumber: '12345678', idExpiry: '2029-05-31', passportNo: 'P1234567', passportExpiry: '2030-01-15' },
  contract: { unitId: unit.id, startDate: today, monthlyRent: '300', securityDeposit: '300', paymentFrequency: 'Monthly', paymentMode: 'Cheque (PDC)', rentDueDay: 5, noticeMonths: 1 } });
ok(r.status === 201 && r.data.tenant.tenantNo && r.data.contract.contractNo, 'tenant and contract created together', r.data);
const tid = r.data.tenant.id;
const t = (await call('GET', '/tenants/' + tid, pm)).data;
ok(t.passportNo === 'P1234567' && t.passportExpiry === '2030-01-15' && t.idExpiry === '2029-05-31', 'passport and ID details stored', t);
ok(r.data.contract.paymentMode === 'Cheque (PDC)', 'payment mode stored on the contract', r.data.contract);
const dup = await call('POST', '/tenancies', pm, { tenant: { name: 'Dup', email }, contract: { unitId: unit2.id, startDate: today, monthlyRent: '250' } });
ok(dup.status === 409, 'second tenant with the same email refused', dup.data);
const busy = await call('POST', '/tenancies', pm, { tenant: { name: 'Busy unit' }, contract: { unitId: unit.id, startDate: today, monthlyRent: '300' } });
ok(busy.status >= 400 && busy.status < 500, 'unit already let for those dates is refused', busy.data);
const noTenant = (await call('GET', '/tenants?search=Busy%20unit', pm)).data;
ok(!(Array.isArray(noTenant) ? noTenant : noTenant.rows || []).some((x) => x.name === 'Busy unit'), 'a refused tenancy leaves no half-made tenant behind');
const inv0 = (await call('GET', `/ledger/${tid}`, fin)).data;
ok(inv0 && (inv0.lines || []).length > 0, 'first rent invoice billed straight away', inv0);
ok((await call('POST', '/tenancies', fin, { tenant: { name: 'F' }, contract: { unitId: unit2.id, startDate: today, monthlyRent: '250' } })).status === 403, 'finance cannot create tenancies');

console.log('Photo and documents');
const up = await call('POST', `/tenants/${tid}/files?kind=photo`, pm, null, form(PNG, 'face.png', 'image/png'));
ok(up.status === 201 && up.data.length === 1 && up.data[0].kind === 'photo', 'tenant photo uploaded', up.data);
const pdfAsPhoto = await call('POST', `/tenants/${tid}/files?kind=photo`, pm, null, form(PDF, 'doc.pdf', 'application/pdf'));
ok(pdfAsPhoto.status === 400, 'a PDF is refused as the photo');
const up2 = await call('POST', `/tenants/${tid}/files?kind=passport`, pm, null, form(PDF, 'passport.pdf', 'application/pdf'));
await call('POST', `/tenants/${tid}/files?kind=photo`, pm, null, form(PNG, 'face2.png', 'image/png'));
const files = (await call('GET', `/tenants/${tid}/files`, pm)).data;
ok(files.length === 2 && files.filter((f) => f.kind === 'photo').length === 1, 'new photo replaces the old one; passport kept', files.map((f) => f.kind));
const fake = await call('POST', `/tenants/${tid}/files?kind=passport`, pm, null, form(Buffer.from('not a pdf'), 'x.pdf', 'application/pdf'));
ok(fake.status === 400, 'file content is checked (fake PDF refused)');
ok((await call('POST', `/tenants/${tid}/files?kind=selfie`, pm, null, form(PNG, 'a.png', 'image/png'))).status === 400, 'unknown document kind refused');
const passport = files.find((f) => f.kind === 'passport'), photo = files.find((f) => f.kind === 'photo');
ok((await call('GET', `/files/${passport.id}`, fin)).status === 200, 'finance can open the passport copy');
ok((await call('GET', `/files/${passport.id}`, tech)).status === 403, 'technicians cannot open tenant documents');

console.log('App invitation');
const inv = await call('POST', `/tenants/${tid}/invite`, pm, {}, null, { Origin: 'https://properties.example.om' });
ok(inv.status === 200 && /\/invite\?token=[\w-]{40,}$/.test(inv.data.link), 'one-time link created', inv.data.link);
ok(inv.data.link.startsWith('https://properties.example.om/'), 'link uses the app address');
ok(inv.data.whatsapp?.startsWith('https://wa.me/96891234567?text=') && inv.data.sms?.startsWith('sms:+96891234567'), 'WhatsApp and SMS links use +968 for an 8-digit Oman mobile', [inv.data.whatsapp?.slice(0, 40), inv.data.sms?.slice(0, 30)]);
ok(inv.data.qr?.startsWith('data:image/png;base64,'), 'QR code returned');
ok(inv.data.emailSent === false && inv.data.emailConfigured === false, 'no email sent when SMTP is not set (link shown instead)');
ok(decodeURIComponent(inv.data.whatsapp).includes('Onboard Tower ' + s + ', unit 101'), 'message names the building and unit');
const token = inv.data.link.split('token=')[1];
const st = (await call('GET', `/tenants/${tid}/invitation`, pm)).data;
ok(st.state === 'Invited' && st.sentAt, 'status shows Invited', st);
const audit = (await call('GET', '/audit?limit=50', admin)).data;
ok(!JSON.stringify(audit).includes(token), 'the token never appears in the audit log');

console.log('Tenant opens the link');
const chk = await call('GET', '/invite?token=' + token);
ok(chk.status === 200 && chk.data.name === 'Huda Al Balushi' && chk.data.unit === '101' && chk.data.email === email && !chk.data.needsEmail, 'public page shows name, unit and email', chk.data);
ok((await call('GET', '/invite?token=wrongwrongwrongwrongwrongwrong')).status === 404, 'a made-up link is refused');
const weak = await call('POST', '/invite/accept', null, { token, password: 'short' });
ok(weak.status === 400, 'short password refused');
const acc = await call('POST', '/invite/accept', null, { token, password: 'MyNewPass!2026' });
ok(acc.status === 200 && acc.data.user.role === 'TENANT' && acc.data.user.tenantId === tid, 'tenant sets a password and is signed in', acc.data);
ok(/repms_token=/.test(acc.cookie) && /HttpOnly/i.test(acc.cookie), 'session cookie set');
ok((await call('POST', '/invite/accept', null, { token, password: 'AnotherPass!2026' })).status === 410, 'the link works only once');
const lg = await login(email, 'MyNewPass!2026');
ok(lg.status === 200 && !lg.data.user.mustChangePassword, 'tenant can sign in with email and the new password');
const tt = lg.data.token;
const home = (await call('GET', '/me', tt)).data;
ok(home.tenant?.name === 'Huda Al Balushi' && home.contracts?.[0]?.unit?.no === '101', 'tenant app shows their own tenancy (same data as the dashboard)', home.tenant);
ok((await call('GET', `/files/${photo.id}`, tt)).status === 200, 'tenant can see their own photo');
ok((await call('GET', `/files/${passport.id}`, tt)).status === 403, 'tenant cannot download documents through the app');
ok((await call('GET', `/tenants/${tid}/invitation`, pm)).data.state === 'Active', 'status shows Active once accepted');

console.log('Re-sending, expiry and tenants without email');
const r2 = await call('POST', '/tenancies', pm, { tenant: { name: 'Salim Al Hinai', mobile: '+968 9988 7766' }, contract: { unitId: unit2.id, startDate: today, monthlyRent: '250', paymentMode: 'Cash' } });
const t2 = r2.data.tenant.id;
const i1 = (await call('POST', `/tenants/${t2}/invite`, pm, {})).data; const i2 = (await call('POST', `/tenants/${t2}/invite`, pm, {})).data;
const tok1 = i1.link.split('token=')[1], tok2 = i2.link.split('token=')[1];
ok((await call('GET', '/invite?token=' + tok1)).status === 404, 'sending a new link cancels the old one');
const c2 = (await call('GET', '/invite?token=' + tok2)).data;
ok(c2.needsEmail === true, 'tenant with no email is asked for one on the invitation page', c2);
ok(i2.whatsapp?.startsWith('https://wa.me/96899887766'), '+968 number formatted for WhatsApp', i2.whatsapp?.slice(0, 30));
ok((await call('POST', '/invite/accept', null, { token: tok2, password: 'GoodPass!2026x' })).status === 400, 'accept without an email is refused when the office had none');
ok((await call('POST', '/invite/accept', null, { token: tok2, email, password: 'GoodPass!2026x' })).status === 409, 'an email already used by another account is refused');
const a2 = await call('POST', '/invite/accept', null, { token: tok2, email: `salim${s}@mail.om`, password: 'GoodPass!2026x' });
ok(a2.status === 200, 'tenant gives their email and sets a password');
ok((await call('GET', '/tenants/' + t2, pm)).data.email === `salim${s}@mail.om`, 'the email is saved on the tenant record');
const r3 = await call('POST', '/tenancies', pm, { tenant: { name: 'No contract yet' }, contract: { unitId: unit2.id, startDate: '2031-01-01', monthlyRent: '250' } });
const t3 = r3.data.tenant.id; const i3 = (await call('POST', `/tenants/${t3}/invite`, pm, {})).data; const tok3 = i3.link.split('token=')[1];
const pg = await import('pg'); const db = new pg.default.Client({ host: process.env.DB_HOST || 'localhost', user: process.env.DB_USER || 'repms', password: process.env.DB_PASSWORD || 'repms', database: process.env.DB_NAME || 'repms' }); await db.connect();
await db.query(`UPDATE invitations SET expires_at = now() - interval '1 minute' WHERE tenant_id=$1`, [t3]); await db.end();
ok((await call('GET', '/invite?token=' + tok3)).status === 410, 'an expired link is refused');
ok((await call('GET', `/tenants/${t3}/invitation`, pm)).data.state === 'Expired', 'status shows Expired');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
