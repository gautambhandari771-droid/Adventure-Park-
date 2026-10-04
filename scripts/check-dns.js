'use strict';

/**
 * Check a domain's DNS and HTTPS setup for the Adventure Park website.
 * Usage: npm run check-dns -- adventurepark.in
 */
const dns = require('node:dns').promises;

async function tryResolve(fn) {
  try {
    return await fn();
  } catch {
    return null;
  }
}

async function checkDomain(domain, { resolver = dns, fetchImpl = globalThis.fetch } = {}) {
  const results = [];
  const add = (name, ok, detail, required = true) => results.push({ name, ok: Boolean(ok), detail, required });

  const a = await tryResolve(() => resolver.resolve4(domain));
  add('A record (IPv4 address)', a && a.length, a ? a.join(', ') : 'missing');
  const aaaa = await tryResolve(() => resolver.resolve6(domain));
  add('AAAA record (IPv6 address)', aaaa && aaaa.length, aaaa ? aaaa.join(', ') : 'none (fine if your server has no IPv6)', false);

  const www4 = await tryResolve(() => resolver.resolve4(`www.${domain}`));
  add('www points to the server', www4 && a && www4.some((ip) => a.includes(ip)), www4 ? www4.join(', ') : 'missing');

  const caa = await tryResolve(() => resolver.resolveCaa(domain));
  const issuers = (caa || []).filter((r) => r.issue !== undefined).map((r) => r.issue);
  add('CAA allows Let\'s Encrypt', issuers.some((i) => i.startsWith('letsencrypt.org')), issuers.length ? issuers.join(', ') : 'no CAA record', false);

  const txt = ((await tryResolve(() => resolver.resolveTxt(domain))) || []).map((parts) => parts.join(''));
  const spf = txt.find((t) => t.startsWith('v=spf1'));
  add('SPF record (stops fake emails)', spf, spf || 'missing', false);
  const dmarc = ((await tryResolve(() => resolver.resolveTxt(`_dmarc.${domain}`))) || []).map((p) => p.join('')).find((t) => t.startsWith('v=DMARC1'));
  add('DMARC record (stops fake emails)', dmarc && /p=(reject|quarantine)/.test(dmarc), dmarc || 'missing', false);
  const google = txt.find((t) => t.startsWith('google-site-verification='));
  add('Google Search Console verification', google, google ? 'found' : 'not added yet', false);

  if (fetchImpl) {
    const https = await tryResolve(() => fetchImpl(`https://${domain}/`, { redirect: 'manual' }));
    add('HTTPS works (SSL certificate)', https && https.status === 200, https ? `status ${https.status}` : 'could not connect over HTTPS');
    const hsts = https && https.headers.get('strict-transport-security');
    add('HSTS security header', hsts, hsts || 'missing');
    const csp = https && https.headers.get('content-security-policy');
    add('Content-Security-Policy header', csp, csp ? 'present' : 'missing');
    const http = await tryResolve(() => fetchImpl(`http://${domain}/`, { redirect: 'manual' }));
    const loc = http && http.headers.get('location');
    add('HTTP redirects to HTTPS', http && [301, 302, 307, 308].includes(http.status) && loc && loc.startsWith('https://'), loc || 'no redirect');
    const llms = await tryResolve(() => fetchImpl(`https://${domain}/llms.txt`));
    add('llms.txt for AI assistants', llms && llms.status === 200, llms ? `status ${llms.status}` : 'missing', false);
  }
  return results;
}

async function main() {
  const domain = (process.argv[2] || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    console.error('Usage: npm run check-dns -- yourdomain.in');
    process.exit(2);
  }
  console.log(`Checking ${domain} ...\n`);
  const results = await checkDomain(domain);
  for (const r of results) {
    const mark = r.ok ? 'OK     ' : r.required ? 'MISSING' : 'ADVICE ';
    console.log(`${mark}  ${r.name}: ${r.detail}`);
  }
  const failed = results.filter((r) => r.required && !r.ok);
  console.log(failed.length ? `\n${failed.length} required item(s) need attention. See docs/DNS.md.` : '\nAll required items are in place.');
  process.exit(failed.length ? 1 : 0);
}

if (require.main === module) main();

module.exports = { checkDomain };
