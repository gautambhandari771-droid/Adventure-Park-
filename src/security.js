'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

// ---------------------------------------------------------------------------
// Password hashing (scrypt, memory-hard, built into Node.js)
// Format: scrypt$N$r$p$saltBase64$hashBase64
// ---------------------------------------------------------------------------
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64 };
const SCRYPT_MAXMEM = 128 * 1024 * 1024;

async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12) {
    throw new Error('Password must be at least 12 characters long.');
  }
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT_MAXMEM,
  });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt' || typeof password !== 'string') {
    // Burn comparable time so a missing hash is not detectable by timing.
    await scrypt('dummy-password', 'dummy-salt', SCRYPT.keylen, {
      N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT_MAXMEM,
    });
    return false;
  }
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password.slice(0, 1024), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT_MAXMEM,
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

// ---------------------------------------------------------------------------
// Admin sessions, stored server-side. The cookie only holds a random id;
// the database only holds its SHA-256 hash, so a stolen database backup
// cannot be used to hijack a live session.
// ---------------------------------------------------------------------------
function createSessionStore(db, config) {
  const idleMs = config.admin.sessionIdleMinutes * 60 * 1000;
  const maxMs = config.admin.sessionMaxHours * 60 * 60 * 1000;

  const insert = db.prepare(
    'INSERT INTO sessions (id_hash, csrf_token, username, created_at, last_seen, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const select = db.prepare('SELECT * FROM sessions WHERE id_hash = ?');
  const touch = db.prepare('UPDATE sessions SET last_seen = ? WHERE id_hash = ?');
  const remove = db.prepare('DELETE FROM sessions WHERE id_hash = ?');
  const purge = db.prepare('DELETE FROM sessions WHERE expires_at < ? OR last_seen < ?');

  return {
    create(username) {
      const id = randomToken(32);
      const csrfToken = randomToken(32);
      const now = Date.now();
      insert.run(sha256(id), csrfToken, username, now, now, now + maxMs);
      return { id, csrfToken };
    },
    get(id) {
      if (!id || typeof id !== 'string' || id.length > 100) return null;
      const idHash = sha256(id);
      const row = select.get(idHash);
      if (!row) return null;
      const now = Date.now();
      if (row.expires_at < now || row.last_seen + idleMs < now) {
        remove.run(idHash);
        return null;
      }
      touch.run(now, idHash);
      return { username: row.username, csrfToken: row.csrf_token };
    },
    destroy(id) {
      if (id && typeof id === 'string') remove.run(sha256(id));
    },
    purgeExpired() {
      const now = Date.now();
      purge.run(now, now - idleMs);
    },
  };
}

function parseCookies(header) {
  const out = Object.create(null);
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!(key in out)) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Brute-force protection for the admin login: locks login for everyone
// after too many failures, on top of the per-IP rate limit.
// ---------------------------------------------------------------------------
function createLoginGuard({ maxFailures = 10, windowMs = 15 * 60 * 1000, lockMs = 15 * 60 * 1000 } = {}) {
  let failures = [];
  let lockedUntil = 0;
  return {
    isLocked(now = Date.now()) {
      return now < lockedUntil;
    },
    fail(now = Date.now()) {
      failures = failures.filter((t) => now - t < windowMs);
      failures.push(now);
      if (failures.length >= maxFailures) {
        lockedUntil = now + lockMs;
        failures = [];
      }
    },
    succeed() {
      failures = [];
    },
  };
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/** Redirect HTTP to HTTPS when running behind a TLS-terminating proxy. */
function httpsRedirect(config) {
  return (req, res, next) => {
    if (!config.forceHttps || req.secure || req.path === '/healthz') return next();
    const host = config.publicUrl ? new URL(config.publicUrl).host : req.hostname;
    return res.redirect(308, `https://${host}${req.originalUrl}`);
  };
}

/**
 * Block cross-site form submissions (CSRF) for every state-changing
 * request: browsers always send Origin / Sec-Fetch-Site on such requests.
 */
function sameOriginOnly(config) {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

    const site = req.get('sec-fetch-site');
    if (site && site !== 'same-origin' && site !== 'none') {
      return res.status(403).json({ error: 'Cross-site request blocked.' });
    }

    const origin = req.get('origin');
    if (origin) {
      const allowed = new Set(config.allowedOrigins);
      if (config.publicUrl) allowed.add(config.publicUrl);
      allowed.add(`${req.protocol}://${req.get('host')}`);
      if (!allowed.has(origin)) {
        return res.status(403).json({ error: 'Cross-site request blocked.' });
      }
    }
    return next();
  };
}

/** Only accept JSON bodies on API write requests. */
function requireJson(req, res, next) {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ error: 'Content-Type must be application/json.' });
  }
  return next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  safeEqual,
  sha256,
  randomToken,
  createSessionStore,
  parseCookies,
  createLoginGuard,
  httpsRedirect,
  sameOriginOnly,
  requireJson,
};
