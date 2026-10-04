'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const { schemaBlock, faqFromHtml, RAFTING } = require('../src/seo');
const { PRICE_LIST } = require('../src/receipts');
const { checkDomain } = require('../scripts/check-dns');
const { makeApp } = require('./helpers');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

function jsonLdBlocks(page) {
  return [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}

test('structured data in index.html is up to date (run "npm run schema" if this fails)', () => {
  const current = html.match(/<!-- schema:start[\s\S]*?<!-- schema:end -->/)[0];
  assert.equal(current, schemaBlock(html));
});

test('structured data is valid JSON-LD with the expected types', async () => {
  const { app } = makeApp({ NODE_ENV: 'production', PUBLIC_URL: 'https://adventurepark.example' });
  const res = await request(app).get('/').set('X-Forwarded-Proto', 'https');
  const [data] = jsonLdBlocks(res.text);
  assert.equal(data['@context'], 'https://schema.org');
  const graph = data['@graph'];
  const types = graph.flatMap((n) => [].concat(n['@type']));
  for (const t of ['WebSite', 'WebPage', 'LocalBusiness', 'TouristAttraction', 'LodgingBusiness', 'TouristTrip', 'Service', 'HotelRoom', 'FAQPage']) {
    assert.ok(types.includes(t), `missing ${t}`);
  }
  assert.ok(!JSON.stringify(data).includes('%SITE_URL%'), 'site URL is filled in');
  assert.ok(JSON.stringify(data).includes('https://adventurepark.example/#business'));

  // Every reference points at a node that exists.
  const ids = new Set(graph.map((n) => n['@id']).filter(Boolean));
  const refs = [];
  JSON.stringify(data, (k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && v['@id']) refs.push(v['@id']);
    return v;
  });
  for (const r of refs) assert.ok(ids.has(r), `unresolved reference ${r}`);

  const biz = graph.find((n) => [].concat(n['@type']).includes('LocalBusiness'));
  assert.equal(biz.telephone, '+91-8755542743');
  assert.equal(biz.address.addressLocality, 'Shivpuri');
  assert.equal(biz.numberOfRooms, 8);
});

test('rafting prices in the markup match the price list', () => {
  const graph = jsonLdBlocks(html)[0]['@graph'];
  const trips = graph.filter((n) => n['@type'] === 'TouristTrip');
  assert.equal(trips.length, RAFTING.length);
  for (const t of trips) {
    const key = t['@id'].split('#')[1];
    const [weekday, weekend] = t.offers.priceSpecification;
    assert.equal(weekday.price, PRICE_LIST[key].rate);
    assert.equal(weekend.price, PRICE_LIST[key].weekendRate);
    assert.equal(weekend.price, Math.round(weekday.price * 1.2), '20% weekend price');
    assert.ok(html.includes(`₹${weekday.price.toLocaleString('en-IN')}</strong> / person`), `visible price for ${key}`);
  }
});

test('FAQ markup matches the visible FAQ exactly', () => {
  const visible = faqFromHtml(html);
  assert.ok(visible.length >= 9);
  const faqNode = jsonLdBlocks(html)[0]['@graph'].find((n) => n['@type'] === 'FAQPage');
  assert.deepEqual(faqNode.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]), visible.map((f) => [f.question, f.answer]));
});

test('privacy and terms pages have breadcrumbs', () => {
  for (const page of ['privacy', 'terms']) {
    const data = jsonLdBlocks(fs.readFileSync(path.join(__dirname, '..', 'public', `${page}.html`), 'utf8'))[0];
    assert.ok(data['@graph'].some((n) => n['@type'] === 'BreadcrumbList'), page);
  }
});

test('llms.txt, robots.txt and sitemap are served for search and AI engines', async () => {
  const { app } = makeApp({ NODE_ENV: 'production', PUBLIC_URL: 'https://adventurepark.example' });
  const llms = await request(app).get('/llms.txt').set('X-Forwarded-Proto', 'https');
  assert.equal(llms.status, 200);
  assert.match(llms.headers['content-type'], /text\/plain/);
  assert.match(llms.text, /# Adventure Park, Shivpuri/);
  assert.match(llms.text, /https:\/\/adventurepark\.example\/#book/);
  for (const k of Object.keys(PRICE_LIST).filter((x) => x.startsWith('rafting-'))) {
    assert.ok(llms.text.includes(`₹${PRICE_LIST[k].rate.toLocaleString('en-IN')}`), k);
  }
  const robots = await request(app).get('/robots.txt').set('X-Forwarded-Proto', 'https');
  assert.match(robots.text, /User-agent: GPTBot/);
  assert.match(robots.text, /User-agent: ClaudeBot/);
  assert.match(robots.text, /User-agent: PerplexityBot/);
  assert.equal((robots.text.match(/Disallow: \/admin/g) || []).length, 2, 'admin blocked for every group');
  const sitemap = await request(app).get('/sitemap.xml').set('X-Forwarded-Proto', 'https');
  assert.match(sitemap.text, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
});

test('DNS checker reports a correct setup as OK', async () => {
  const resolver = {
    resolve4: async (d) => ['203.0.113.10'],
    resolve6: async () => { throw new Error('none'); },
    resolveCaa: async () => [{ critical: 0, issue: 'letsencrypt.org' }],
    resolveTxt: async (d) => (d.startsWith('_dmarc.') ? [['v=DMARC1; p=reject']] : [['v=spf1 -all']]),
  };
  const headers = (h) => ({ get: (k) => h[k.toLowerCase()] || null });
  const fetchImpl = async (url) => {
    if (url.startsWith('http://')) return { status: 308, headers: headers({ location: 'https://adventurepark.example/' }) };
    return { status: 200, headers: headers({ 'strict-transport-security': 'max-age=63072000', 'content-security-policy': "default-src 'self'" }) };
  };
  const results = await checkDomain('adventurepark.example', { resolver, fetchImpl });
  const failedRequired = results.filter((r) => r.required && !r.ok);
  assert.deepEqual(failedRequired, []);
  assert.ok(results.find((r) => r.name.startsWith('DMARC')).ok);
});

test('DNS checker reports missing records', async () => {
  const fail = async () => { throw new Error('ENOTFOUND'); };
  const results = await checkDomain('missing.example', {
    resolver: { resolve4: fail, resolve6: fail, resolveCaa: fail, resolveTxt: fail },
    fetchImpl: fail,
  });
  assert.ok(results.find((r) => r.name.startsWith('A record')).ok === false);
  assert.ok(results.filter((r) => r.required && !r.ok).length >= 3);
});
