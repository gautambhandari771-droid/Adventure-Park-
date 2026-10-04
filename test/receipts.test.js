'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const zlib = require('node:zlib');
const { hashPassword } = require('../src/security');
const { validateReceipt } = require('../src/receipts');
const { makeApp, validBooking } = require('./helpers');

const ORIGIN = 'http://127.0.0.1';
const PASSWORD = 'correct horse battery staple';
let passwordHash;
test.before(async () => { passwordHash = await hashPassword(PASSWORD); });

// Build a small, valid PNG (blue square) for upload tests.
function makePng(size = 8) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, 0x40)]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PNG = makePng();

function sampleReceipt(extra = {}) {
  return {
    clientName: 'Dwitikrushna Mahanty',
    clientPhone: '98765 43210',
    clientEmail: 'client@example.com',
    arrivalDate: '2026-10-27',
    service: '26 km Rafting (Marine Drive to NIM Beach)',
    items: [{ description: '26 km Rafting, Marine Drive to NIM Beach', pax: 6, rate: 1100 }],
    advance: 1000,
    ...extra,
  };
}

async function login(app) {
  const res = await request(app).post('/api/admin/login').set('Origin', ORIGIN).set('Host', '127.0.0.1')
    .send({ username: 'admin', password: PASSWORD });
  assert.equal(res.status, 200);
  return { cookie: res.headers['set-cookie'][0], csrf: res.body.csrfToken };
}

function authed(app, method, url, { cookie, csrf }) {
  return request(app)[method](url).set('Cookie', cookie).set('X-CSRF-Token', csrf)
    .set('Origin', ORIGIN).set('Host', '127.0.0.1');
}

/** PDF text streams are compressed; inflate them to search for words. */
function pdfText(buf) {
  const out = [];
  const s = buf.toString('latin1');
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length;
    const end = s.indexOf('endstream', start);
    try { out.push(zlib.inflateSync(buf.subarray(start, end)).toString('latin1')); } catch { /* not compressed */ }
  }
  return out.join('\n');
}

test('receipt totals are calculated on the server', () => {
  const r = validateReceipt({ ...sampleReceipt(), total: 1, balance: 999999,
    items: [{ description: 'Rafting', pax: 6, rate: 1100 }, { description: 'Camping', pax: 2, rate: 1500 }] });
  assert.equal(r.ok, true);
  assert.equal(r.value.total, 9600);
  assert.equal(r.value.balance, 8600);
  assert.equal(r.value.clientPhone, '+919876543210');
});

test('receipt validation rejects bad input', () => {
  assert.ok(validateReceipt(sampleReceipt({ advance: 7000 })).errors.advance, 'advance above total');
  assert.ok(validateReceipt(sampleReceipt({ items: [] })).errors.items);
  assert.ok(validateReceipt(sampleReceipt({ items: [{ description: 'x', pax: 0, rate: -5 }] })).errors['items.0.pax']);
  assert.ok(validateReceipt(sampleReceipt({ items: [{ description: 'Rafting', pax: 2, rate: 10.5 }] })).errors['items.0.rate']);
  assert.ok(validateReceipt(sampleReceipt({ clientName: '<script>' })).errors.clientName);
  assert.ok(validateReceipt(sampleReceipt({ arrivalDate: '2026-02-30' })).errors.arrivalDate);
  assert.ok(validateReceipt(sampleReceipt({ bookingAt: '2099-01-01T00:00:00Z' })).errors.bookingAt);
});

test('receipt API needs login and the security token', async () => {
  const { app } = makeApp({ ADMIN_PASSWORD_HASH: passwordHash });
  assert.equal((await request(app).get('/api/admin/receipts')).status, 401);
  assert.equal((await request(app).get('/api/admin/receipts/1/pdf')).status, 401);
  assert.equal((await request(app).get('/api/admin/receipts/stamp/image')).status, 401);
  const s = await login(app);
  const noToken = await request(app).post('/api/admin/receipts').set('Cookie', s.cookie)
    .set('Origin', ORIGIN).set('Host', '127.0.0.1').send(sampleReceipt());
  assert.equal(noToken.status, 403);
});

test('create receipt, number it, download PDF, list, export and delete', async () => {
  const { app, db } = makeApp({ ADMIN_PASSWORD_HASH: passwordHash });
  const s = await login(app);

  const first = await authed(app, 'post', '/api/admin/receipts', s).send(sampleReceipt());
  assert.equal(first.status, 201);
  const year = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(new Date());
  assert.equal(first.body.receipt.receipt_no, `AP-${year}-0001`);
  assert.equal(first.body.receipt.total, 6600);
  assert.equal(first.body.receipt.balance, 5600);

  const pdf = await authed(app, 'get', `/api/admin/receipts/${first.body.receipt.id}/pdf?download=1`, s)
    .buffer(true).parse((res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers['content-type'], 'application/pdf');
  assert.match(pdf.headers['content-disposition'], /^attachment; filename="Adventure-Park-Receipt-Dwitikrushna-Mahanty-AP-\d{4}-0001\.pdf"$/);
  assert.equal(pdf.body.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.body.length > 5000);
  assert.ok(pdfText(pdf.body).length > 0);

  // Deleting a receipt never frees its number.
  await authed(app, 'delete', `/api/admin/receipts/${first.body.receipt.id}`, s);
  const second = await authed(app, 'post', '/api/admin/receipts', s).send(sampleReceipt({ clientName: 'Asha Negi' }));
  assert.equal(second.body.receipt.receipt_no, `AP-${year}-0002`);

  const list = await authed(app, 'get', '/api/admin/receipts', s);
  assert.equal(list.body.total, 1);
  assert.equal(list.body.sums.balance, 5600);

  const csv = await authed(app, 'get', '/api/admin/receipts/export.csv', s);
  assert.match(csv.text, /Asha Negi/);

  const actions = db.prepare('SELECT action FROM audit_log').all().map((r) => r.action);
  assert.ok(actions.includes('create_receipt') && actions.includes('delete_receipt') && actions.includes('export_receipts_csv'));
});

test('receipt for a booking confirms the booking when an advance is paid', async () => {
  const { app, db } = makeApp({ ADMIN_PASSWORD_HASH: passwordHash });
  await request(app).post('/api/bookings').set('Origin', ORIGIN).set('Host', '127.0.0.1').send(validBooking());
  const booking = db.prepare('SELECT id, status FROM bookings').get();
  assert.equal(booking.status, 'new');
  const s = await login(app);
  const res = await authed(app, 'post', '/api/admin/receipts', s).send(sampleReceipt({ bookingId: booking.id }));
  assert.equal(res.status, 201);
  assert.equal(res.body.bookingConfirmed, true);
  assert.equal(db.prepare('SELECT status FROM bookings WHERE id = ?').get(booking.id).status, 'confirmed');
  const list = await authed(app, 'get', '/api/admin/bookings', s);
  assert.equal(list.body.bookings[0].receipts, res.body.receipt.receipt_no, 'booking shows its receipt number');
  const missing = await authed(app, 'post', '/api/admin/receipts', s).send(sampleReceipt({ bookingId: 9999 }));
  assert.equal(missing.status, 422);
});

test('stamp upload accepts only real images and stays private', async () => {
  const { app, config } = makeApp({ ADMIN_PASSWORD_HASH: passwordHash });
  const s = await login(app);
  const fake = await authed(app, 'put', '/api/admin/receipts/stamp/image', s).set('Content-Type', 'image/png').send(Buffer.from('not an image at all'));
  assert.equal(fake.status, 415);
  const wrongType = await authed(app, 'put', '/api/admin/receipts/stamp/image', s).set('Content-Type', 'image/svg+xml').send('<svg/>');
  assert.equal(wrongType.status, 415);
  const tooBig = await authed(app, 'put', '/api/admin/receipts/stamp/image', s).set('Content-Type', 'image/png')
    .send(Buffer.concat([PNG, Buffer.alloc(1.1 * 1024 * 1024)]));
  assert.equal(tooBig.status, 413);

  const ok = await authed(app, 'put', '/api/admin/receipts/stamp/image', s).set('Content-Type', 'image/png').send(PNG);
  assert.equal(ok.status, 200);
  assert.ok(fs.existsSync(path.join(config.dataDir, 'receipt-stamp.png')));
  const settings = await authed(app, 'get', '/api/admin/receipts/settings', s);
  assert.equal(settings.body.hasStamp, true);
  assert.equal(settings.body.business.tagline, 'Where Rishikesh Gets Wild.');
  assert.equal(settings.body.business.phone, '+91 87555 42743', 'receipts use the website number');

  // Not reachable without logging in, and not in the public folder.
  assert.equal((await request(app).get('/api/admin/receipts/stamp/image')).status, 401);
  assert.equal((await request(app).get('/receipt-stamp.png')).status, 404);

  const created = await authed(app, 'post', '/api/admin/receipts', s).send(sampleReceipt());
  const pdf = await authed(app, 'get', `/api/admin/receipts/${created.body.receipt.id}/pdf`, s);
  assert.equal(pdf.status, 200);

  assert.equal((await authed(app, 'delete', '/api/admin/receipts/stamp/image', s)).status, 200);
  assert.equal((await authed(app, 'get', '/api/admin/receipts/settings', s)).body.hasStamp, false);
});

test('email receipt explains when email is not set up', async () => {
  const { app } = makeApp({ ADMIN_PASSWORD_HASH: passwordHash }, { mailer: { enabled: false, async sendBookingAlert() {} } });
  const s = await login(app);
  const created = await authed(app, 'post', '/api/admin/receipts', s).send(sampleReceipt());
  const res = await authed(app, 'post', `/api/admin/receipts/${created.body.receipt.id}/email`, s).send({});
  assert.equal(res.status, 409);
  assert.match(res.body.error, /not set up/);
});

test('email receipt sends the PDF when email is set up', async () => {
  const sent = [];
  const mailer = { enabled: true, async sendBookingAlert() {}, async sendReceipt(m) { sent.push(m); } };
  const { app } = makeApp({ ADMIN_PASSWORD_HASH: passwordHash }, { mailer });
  const s = await login(app);
  const created = await authed(app, 'post', '/api/admin/receipts', s).send(sampleReceipt());
  const res = await authed(app, 'post', `/api/admin/receipts/${created.body.receipt.id}/email`, s).send({});
  assert.equal(res.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'client@example.com');
  assert.equal(sent[0].pdf.subarray(0, 5).toString(), '%PDF-');
});
