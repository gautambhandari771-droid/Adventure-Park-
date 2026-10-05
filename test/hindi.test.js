'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const request = require('supertest');
const { ACTIVITIES } = require('../src/business');
const { PRICE_LIST } = require('../src/receipts');
const { makeApp } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const en = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const hi = fs.readFileSync(path.join(ROOT, 'public', 'hi', 'index.html'), 'utf8');

const body = (html) => html.split('<body>')[1];
const all = (html, re) => [...body(html).matchAll(re)].map((m) => m[1]);

test('Hindi page is served at /hi/ with its own address and links to the English page', async () => {
  const { app } = makeApp({ NODE_ENV: 'production', PUBLIC_URL: 'https://adventurepark.example' });
  const res = await request(app).get('/hi/').set('X-Forwarded-Proto', 'https');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.ok(!res.text.includes('%SITE_URL%'));
  assert.match(res.text, /<html lang="hi-IN">/);
  assert.match(res.text, /<link rel="canonical" href="https:\/\/adventurepark\.example\/hi\/">/);
  assert.match(res.text, /hreflang="en-IN" href="https:\/\/adventurepark\.example\/"/);
  assert.match(res.text, /<a class="lang-switch" href="\/"/);
  assert.match(res.headers['content-security-policy'], /connect-src 'self' https:\/\/formsubmit\.co/);

  const bare = await request(app).get('/hi').set('X-Forwarded-Proto', 'https');
  assert.equal(bare.status, 301);
  assert.equal(bare.headers.location, '/hi/');

  const home = await request(app).get('/').set('X-Forwarded-Proto', 'https');
  assert.match(home.text, /hreflang="hi-IN" href="https:\/\/adventurepark\.example\/hi\/"/);
  assert.match(home.text, /<a class="lang-switch" href="\/hi\/"/);
});

test('Hindi page has the same sections, form fields and booking options as the English page', () => {
  assert.deepEqual(all(hi, / id="([^"]+)"/g), all(en, / id="([^"]+)"/g));
  assert.deepEqual(all(hi, / name="([^"]+)"/g), all(en, / name="([^"]+)"/g));
  assert.deepEqual(all(hi, /data-activity="([^"]+)"/g), all(en, /data-activity="([^"]+)"/g));
  const select = hi.match(/<select id="f-activity"[\s\S]*?<\/select>/)[0];
  const values = [...select.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(values.sort(), Object.keys(ACTIVITIES).sort());
  assert.equal(hi.match(/data-formsubmit="([^"]+)"/)[1], en.match(/data-formsubmit="([^"]+)"/)[1]);
});

test('Hindi page shows exactly the same prices as the English page', () => {
  const prices = (html) => all(html, /(₹\d+(?:,\d+)*)/g).sort();
  assert.deepEqual(prices(hi), prices(en));
  for (const [key, item] of Object.entries(PRICE_LIST)) {
    if (item.rate) assert.ok(body(hi).includes(`₹${item.rate.toLocaleString('en-IN')}`), key);
  }
});

test('Hindi page is in the sitemap and in the static build', () => {
  const sitemap = fs.readFileSync(path.join(ROOT, 'public', 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /<loc>%SITE_URL%\/hi\/<\/loc>/);

  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-static-hi-'));
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-static.js')], {
    env: { ...process.env, SITE_URL: 'https://adventurepark.example', STATIC_OUT: path.relative(ROOT, out) },
  });
  const page = fs.readFileSync(path.join(out, 'hi', 'index.html'), 'utf8');
  assert.ok(!page.includes('%SITE_URL%'));
  assert.match(page, /<link rel="canonical" href="https:\/\/adventurepark\.example\/hi\/">/);
  assert.match(page, /data-static-site="true"/);
  fs.rmSync(out, { recursive: true, force: true });
});
