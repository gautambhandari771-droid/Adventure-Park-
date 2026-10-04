'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const { hashPassword } = require('../src/security');
const { ACTIVITIES } = require('../src/business');
const { csvCell } = require('../src/routes/admin');
const { makeApp, validBooking } = require('./helpers');

const ORIGIN = 'http://127.0.0.1';
const PASSWORD = 'correct horse battery staple';
let passwordHash;

test.before(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

function post(app, url, body) {
  return request(app).post(url).set('Origin', ORIGIN).set('Host', '127.0.0.1').send(body);
}

test('home page is served with strict security headers', async () => {
  const { app } = makeApp();
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.match(res.text, /Adventure Park/);
  assert.match(res.headers['content-security-policy'], /script-src 'self'/);
  assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.doesNotMatch(res.headers['content-security-policy'], /unsafe-inline|unsafe-eval/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-frame-options'], 'DENY');
  assert.equal(res.headers['x-powered-by'], undefined);
  assert.ok(res.headers['permissions-policy']);
  assert.ok(!res.text.includes('%SITE_URL%'), 'placeholder is replaced');
});

test('production adds HSTS, redirects HTTP to HTTPS and uses the public URL', async () => {
  const { app } = makeApp({ NODE_ENV: 'production', PUBLIC_URL: 'https://adventurepark.example' });
  const redirect = await request(app).get('/terms').set('Host', 'evil.example');
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.location, 'https://adventurepark.example/terms');

  const res = await request(app).get('/').set('X-Forwarded-Proto', 'https');
  assert.equal(res.status, 200);
  assert.match(res.headers['strict-transport-security'], /max-age=63072000/);
  assert.match(res.text, /<link rel="canonical" href="https:\/\/adventurepark\.example\/">/);

  const robots = await request(app).get('/robots.txt').set('X-Forwarded-Proto', 'https');
  assert.match(robots.text, /Sitemap: https:\/\/adventurepark\.example\/sitemap\.xml/);
});

test('health check works without HTTPS', async () => {
  const { app } = makeApp({ NODE_ENV: 'production', PUBLIC_URL: 'https://adventurepark.example' });
  const res = await request(app).get('/healthz');
  assert.equal(res.status, 200);
});

test('booking form options match the server activity list', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const select = html.match(/<select id="f-activity"[\s\S]*?<\/select>/)[0];
  const values = [...select.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(values.sort(), Object.keys(ACTIVITIES).sort());
});

test('valid booking is stored and triggers an email alert', async () => {
  const { app, db, sent } = makeApp();
  const res = await post(app, '/api/bookings', validBooking());
  assert.equal(res.status, 201);
  assert.match(res.body.reference, /^AP-[A-Z2-9]{6}$/);
  assert.match(res.body.whatsappUrl, /^https:\/\/wa\.me\/918755542743\?text=/);
  const row = db.prepare('SELECT * FROM bookings WHERE reference = ?').get(res.body.reference);
  assert.equal(row.name, 'Rahul Sharma');
  assert.equal(row.phone, '+919876543210');
  assert.equal(row.status, 'new');
  assert.ok(row.ip_hash && !row.ip_hash.includes('127.0.0.1'), 'IP is stored hashed');
  assert.equal(sent.length, 1);
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('invalid booking returns field errors and stores nothing', async () => {
  const { app, db } = makeApp();
  const res = await post(app, '/api/bookings', validBooking({ phone: 'abc', date: '2020-01-01' }));
  assert.equal(res.status, 422);
  assert.ok(res.body.fields.phone);
  assert.ok(res.body.fields.date);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bookings').get().n, 0);
});

test('honeypot submissions look successful but are dropped', async () => {
  const { app, db, sent } = makeApp();
  const res = await post(app, '/api/bookings', validBooking({ website: 'http://spam.example' }));
  assert.equal(res.status, 201);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bookings').get().n, 0);
  assert.equal(sent.length, 0);
});

test('cross-site form posts are blocked (CSRF)', async () => {
  const { app } = makeApp();
  const r1 = await request(app).post('/api/bookings').set('Host', '127.0.0.1').set('Origin', 'https://evil.example').send(validBooking());
  assert.equal(r1.status, 403);
  const r2 = await request(app).post('/api/bookings').set('Sec-Fetch-Site', 'cross-site').send(validBooking());
  assert.equal(r2.status, 403);
});

test('non-JSON and oversized bodies are rejected', async () => {
  const { app } = makeApp();
  const r1 = await request(app).post('/api/bookings').set('Origin', ORIGIN).set('Host', '127.0.0.1')
    .type('form').send('name=x');
  assert.equal(r1.status, 415);
  const r2 = await post(app, '/api/bookings', { ...validBooking(), message: 'x'.repeat(20000) });
  assert.equal(r2.status, 413);
  assert.doesNotMatch(JSON.stringify(r2.body), /stack|node_modules/);
  const r3 = await request(app).post('/api/bookings').set('Origin', ORIGIN).set('Host', '127.0.0.1')
    .set('Content-Type', 'application/json').send('{"broken"');
  assert.equal(r3.status, 400);
});

test('booking endpoint is rate limited', async () => {
  const { app } = makeApp({ RATE_LIMIT_BOOKINGS: '3' });
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await post(app, '/api/bookings', validBooking())).status, 201);
  }
  assert.equal((await post(app, '/api/bookings', validBooking())).status, 429);
});

test('admin API requires login', async () => {
  const { app } = makeApp({ ADMIN_PASSWORD_HASH: passwordHash });
  assert.equal((await request(app).get('/api/admin/bookings')).status, 401);
  assert.equal((await request(app).get('/api/admin/bookings.csv')).status, 401);
  assert.equal((await post(app, '/api/admin/logout', {})).status, 401);
  const s = await request(app).get('/api/admin/session');
  assert.deepEqual(s.body, { authenticated: false });
});

test('admin login rejects wrong credentials and is disabled without a hash', async () => {
  const { app } = makeApp({ ADMIN_PASSWORD_HASH: passwordHash });
  assert.equal((await post(app, '/api/admin/login', { username: 'admin', password: 'wrong password!!' })).status, 401);
  assert.equal((await post(app, '/api/admin/login', { username: 'root', password: PASSWORD })).status, 401);
  assert.equal((await post(app, '/api/admin/login', { username: ['admin'], password: PASSWORD })).status, 401);

  const noHash = makeApp().app;
  assert.equal((await post(noHash, '/api/admin/login', { username: 'admin', password: PASSWORD })).status, 401);
});

test('admin login is rate limited', async () => {
  const { app } = makeApp({ ADMIN_PASSWORD_HASH: passwordHash, RATE_LIMIT_LOGIN: '2' });
  await post(app, '/api/admin/login', { username: 'admin', password: 'bad-1-bad-1-bad' });
  await post(app, '/api/admin/login', { username: 'admin', password: 'bad-2-bad-2-bad' });
  const res = await post(app, '/api/admin/login', { username: 'admin', password: PASSWORD });
  assert.equal(res.status, 429);
});

test('full admin flow: login, list, CSRF, update, export, delete, logout', async () => {
  const { app, db } = makeApp({ ADMIN_PASSWORD_HASH: passwordHash });
  await post(app, '/api/bookings', validBooking({ name: 'Priya Verma', message: '=HYPERLINK("http://evil")' }));

  const login = await post(app, '/api/admin/login', { username: 'admin', password: PASSWORD });
  assert.equal(login.status, 200);
  const cookie = login.headers['set-cookie'][0];
  assert.match(cookie, /^ap_sid=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  const csrf = login.body.csrfToken;
  assert.ok(csrf);

  const sessionId = decodeURIComponent(cookie.split(';')[0].split('=')[1]);
  const stored = db.prepare('SELECT id_hash FROM sessions').get();
  assert.notEqual(stored.id_hash, sessionId, 'session id is stored hashed');

  const list = await request(app).get('/api/admin/bookings').set('Cookie', cookie);
  assert.equal(list.status, 200);
  assert.equal(list.body.total, 1);
  assert.equal(list.headers['cache-control'], 'no-store');
  const booking = list.body.bookings[0];

  const search = await request(app).get('/api/admin/bookings?q=%25').set('Cookie', cookie);
  assert.equal(search.body.total, 0, 'LIKE wildcards are matched literally');

  const noCsrf = await request(app).patch(`/api/admin/bookings/${booking.id}`).set('Cookie', cookie)
    .set('Origin', ORIGIN).set('Host', '127.0.0.1').send({ status: 'confirmed' });
  assert.equal(noCsrf.status, 403);

  const badCsrf = await request(app).patch(`/api/admin/bookings/${booking.id}`).set('Cookie', cookie)
    .set('X-CSRF-Token', 'nope').set('Origin', ORIGIN).set('Host', '127.0.0.1').send({ status: 'confirmed' });
  assert.equal(badCsrf.status, 403);

  const upd = await request(app).patch(`/api/admin/bookings/${booking.id}`).set('Cookie', cookie)
    .set('X-CSRF-Token', csrf).set('Origin', ORIGIN).set('Host', '127.0.0.1')
    .send({ status: 'confirmed', notes: 'Paid advance' });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.booking.status, 'confirmed');
  assert.equal(upd.body.booking.notes, 'Paid advance');

  const badStatus = await request(app).patch(`/api/admin/bookings/${booking.id}`).set('Cookie', cookie)
    .set('X-CSRF-Token', csrf).set('Origin', ORIGIN).set('Host', '127.0.0.1').send({ status: 'hacked' });
  assert.equal(badStatus.status, 422);

  const csv = await request(app).get('/api/admin/bookings.csv').set('Cookie', cookie);
  assert.equal(csv.status, 200);
  assert.match(csv.headers['content-type'], /text\/csv/);
  assert.match(csv.text, /Priya Verma/);
  assert.match(csv.text, /"'=HYPERLINK/, 'formula injection is neutralised');

  const del = await request(app).delete(`/api/admin/bookings/${booking.id}`).set('Cookie', cookie)
    .set('X-CSRF-Token', csrf).set('Origin', ORIGIN).set('Host', '127.0.0.1');
  assert.equal(del.status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bookings').get().n, 0);

  const audit = db.prepare('SELECT action FROM audit_log ORDER BY id').all().map((r) => r.action);
  assert.deepEqual(audit, ['login', 'update_booking', 'export_csv', 'delete_booking']);

  const out = await request(app).post('/api/admin/logout').set('Cookie', cookie)
    .set('X-CSRF-Token', csrf).set('Origin', ORIGIN).set('Host', '127.0.0.1').send({});
  assert.equal(out.status, 200);
  assert.equal((await request(app).get('/api/admin/bookings').set('Cookie', cookie)).status, 401);
});

test('production session cookie uses the __Host- prefix and Secure flag', async () => {
  const { app } = makeApp({ NODE_ENV: 'production', PUBLIC_URL: 'https://adventurepark.example', ADMIN_PASSWORD_HASH: passwordHash });
  const res = await request(app).post('/api/admin/login')
    .set('X-Forwarded-Proto', 'https').set('Host', 'adventurepark.example').set('Origin', 'https://adventurepark.example')
    .send({ username: 'admin', password: PASSWORD });
  assert.equal(res.status, 200);
  const cookie = res.headers['set-cookie'][0];
  assert.match(cookie, /^__Host-ap_sid=/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Path=\//);
});

test('admin page is not indexed or cached; dotfiles and source are not served', async () => {
  const { app } = makeApp();
  const admin = await request(app).get('/admin/');
  assert.equal(admin.status, 200);
  assert.equal(admin.headers['x-robots-tag'], 'noindex, nofollow');
  assert.equal((await request(app).get('/.env')).status, 404);
  assert.equal((await request(app).get('/../package.json')).status, 404);
  assert.equal((await request(app).get('/src/app.js')).status, 404);
  assert.equal((await request(app).get('/.well-known/security.txt')).status, 200);
});

test('csvCell escapes quotes and formulas', () => {
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
  assert.equal(csvCell('+91 98765'), '"\'+91 98765"');
  assert.equal(csvCell(null), '""');
});

test('every page loads the theme switch without inline scripts', async () => {
  const { app } = makeApp();
  for (const url of ['/', '/privacy', '/terms', '/admin/']) {
    const res = await request(app).get(url);
    assert.equal(res.status, 200, url);
    assert.match(res.text, /<script src="\/js\/theme\.js"><\/script>/, url);
    assert.match(res.text, /class="theme-toggle"/, url);
  }
  const js = await request(app).get('/js/theme.js');
  assert.equal(js.status, 200);
  assert.match(js.headers['content-type'], /javascript/);
  const css = await request(app).get('/css/styles.css');
  assert.match(css.text, /:root\[data-theme="dark"\]/);
  assert.match(css.text, /prefers-color-scheme: dark/);
});
