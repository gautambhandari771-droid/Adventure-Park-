'use strict';

/**
 * Build a static copy of the public website into ./dist for free static
 * hosting (Netlify, Cloudflare Pages, GitHub Pages). In this mode there is no
 * server: booking requests are emailed through FormSubmit, and the admin panel,
 * receipts and saved bookings are not available (they need the full server).
 *
 * Usage: SITE_URL=https://adventurepark.in npm run build:static
 * (On Netlify the site address is picked up automatically.)
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, process.env.STATIC_OUT || 'dist');

const siteUrl = String(process.env.SITE_URL || process.env.URL || '').replace(/\/+$/, '');
if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(siteUrl)) {
  console.error('Set SITE_URL to the site address, for example: SITE_URL=https://adventurepark.in npm run build:static');
  process.exit(1);
}

const TEMPLATED = new Set(['index.html', 'privacy.html', 'terms.html', 'robots.txt', 'sitemap.xml', 'llms.txt']);
const SKIP = new Set(['admin']);

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(entry.name) && from === PUBLIC) continue;
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dest);
    else if (TEMPLATED.has(entry.name) && from === PUBLIC) {
      let text = fs.readFileSync(src, 'utf8').replaceAll('%SITE_URL%', siteUrl);
      if (entry.name === 'index.html') {
        // No server here: send bookings straight to FormSubmit.
        text = text.replace('<form class="book-form" id="booking-form"', '<form class="book-form" id="booking-form" data-static-site="true"');
      }
      if (entry.name === 'robots.txt') text = text.replace(/Disallow: \/api\/\nDisallow: \/r\/\n/g, '');
      fs.writeFileSync(dest, text);
    } else fs.copyFileSync(src, dest);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
copyDir(PUBLIC, OUT);

// The same security headers the full server sends (Netlify / Cloudflare Pages format).
const directives = {
  'default-src': "'self'",
  'script-src': "'self'",
  'style-src': "'self'",
  'img-src': "'self' data:",
  'font-src': "'self'",
  'connect-src': "'self' https://formsubmit.co",
  'form-action': "'self'",
  'frame-ancestors': "'none'",
  'frame-src': "'none'",
  'object-src': "'none'",
  'base-uri': "'self'",
  'manifest-src': "'self'",
  'worker-src': "'none'",
  'upgrade-insecure-requests': '',
};
const csp = Object.entries(directives).map(([k, v]) => (v ? `${k} ${v}` : k)).join('; ');
const headers = `/*
  Content-Security-Policy: ${csp}
  Strict-Transport-Security: max-age=63072000; includeSubDomains
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()

/css/*
  Cache-Control: public, max-age=604800
/js/*
  Cache-Control: public, max-age=604800
/images/*
  Cache-Control: public, max-age=604800
`;
fs.writeFileSync(path.join(OUT, '_headers'), headers);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

console.log(`Static site built in ${path.relative(ROOT, OUT)}/ for ${siteUrl}`);
console.log('Bookings will be emailed through FormSubmit. Upload this folder to Netlify, Cloudflare Pages or GitHub Pages.');
