'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { openDatabase } = require('./db');
const { createMailer } = require('./mailer');
const { createSessionStore, httpsRedirect, sameOriginOnly } = require('./security');
const { publicRoutes } = require('./routes/public');
const { adminRoutes } = require('./routes/admin');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Pages that contain the %SITE_URL% placeholder (canonical links, sitemap...).
const TEMPLATED = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/privacy': 'privacy.html',
  '/privacy.html': 'privacy.html',
  '/terms': 'terms.html',
  '/terms.html': 'terms.html',
  '/robots.txt': 'robots.txt',
  '/sitemap.xml': 'sitemap.xml',
};

function templatedPages(config) {
  const cache = new Map();
  const read = (file) => {
    if (!config.isProduction || !cache.has(file)) {
      cache.set(file, fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8'));
    }
    return cache.get(file);
  };
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const file = TEMPLATED[req.path];
    if (!file) return next();
    let siteUrl = config.publicUrl;
    if (!siteUrl) {
      // Development fallback; the Host header is strictly checked before use.
      const host = req.get('host') || '';
      siteUrl = /^[a-z0-9.-]+(:\d{1,5})?$/i.test(host) ? `${req.protocol}://${host}` : 'http://localhost';
    }
    res.type(path.extname(file));
    res.set('Cache-Control', 'no-cache');
    return res.send(read(file).replaceAll('%SITE_URL%', siteUrl));
  };
}

function createApp(config, { logger = console, db: providedDb, mailer: providedMailer } = {}) {
  const db = providedDb || openDatabase(config.dbPath);
  const mailer = providedMailer || createMailer(config, logger);
  const sessions = createSessionStore(db, config);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.set('etag', 'strong');

  app.get('/healthz', (req, res) => res.type('text').send('ok'));

  app.use(httpsRedirect(config));

  // Security headers: strict Content-Security-Policy (no inline or third-party
  // scripts), HSTS, clickjacking protection, no MIME sniffing, and more.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          manifestSrc: ["'self'"],
          workerSrc: ["'none'"],
          upgradeInsecureRequests: config.isProduction ? [] : null,
        },
      },
      strictTransportSecurity: config.isProduction
        ? { maxAge: 63072000, includeSubDomains: true, preload: false }
        : false,
      crossOriginResourcePolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xFrameOptions: { action: 'deny' },
    }),
  );
  app.use((req, res, next) => {
    res.set(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
    );
    next();
  });

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: config.rateLimits.globalPer15Min,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skip: (req) => req.path === '/healthz',
    }),
  );

  // API
  const api = express.Router();
  api.use(express.json({ limit: '10kb', strict: true }));
  api.use(sameOriginOnly(config));
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  api.use(publicRoutes({ db, config, mailer, logger }));
  api.use('/admin', adminRoutes({ db, config, sessions, logger }));
  api.use((req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use('/api', api);

  // security.txt lives in a dot-folder, which the static server ignores on purpose.
  app.get('/.well-known/security.txt', (req, res) => {
    res.type('text/plain').sendFile(path.join(PUBLIC_DIR, '.well-known', 'security.txt'), { dotfiles: 'allow' });
  });

  app.use('/admin', (req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.use(templatedPages(config));

  app.use(
    express.static(PUBLIC_DIR, {
      dotfiles: 'ignore',
      extensions: ['html'],
      index: 'index.html',
      redirect: true,
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) {
          res.set('Cache-Control', 'no-cache');
        } else {
          res.set('Cache-Control', 'public, max-age=604800');
        }
      },
    }),
  );

  app.use((req, res) => {
    res.status(404);
    if (req.accepts('html')) return res.sendFile(path.join(PUBLIC_DIR, '404.html'));
    return res.type('text').send('Not found');
  });

  // Never leak stack traces or internals to visitors.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) logger.error('[error]', err);
    const message = status === 413 ? 'Request too large.'
      : status === 400 ? 'Bad request.'
        : status < 500 ? 'Request rejected.' : 'Something went wrong. Please call us instead.';
    if (req.path.startsWith('/api/') || !req.accepts('html')) {
      return res.status(status).json({ error: message });
    }
    return res.status(status).type('text').send(message);
  });

  app.locals.db = db;
  app.locals.sessions = sessions;
  return app;
}

module.exports = { createApp };
