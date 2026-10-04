'use strict';

const path = require('node:path');

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function int(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function list(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Build the runtime configuration from environment variables.
 * Every secret comes from the environment, never from source code.
 */
function loadConfig(env = process.env) {
  const isProduction = env.NODE_ENV === 'production';

  const config = {
    isProduction,
    port: int(env.PORT, 3000),
    host: env.HOST || '0.0.0.0',
    // Number of reverse proxies in front of the app (Caddy = 1).
    trustProxy: int(env.TRUST_PROXY, isProduction ? 1 : 0),
    // Redirect plain HTTP to HTTPS (only meaningful behind a TLS proxy).
    forceHttps: bool(env.FORCE_HTTPS, isProduction),
    // Public URL of the site, e.g. https://adventurepark.in
    publicUrl: (env.PUBLIC_URL || '').replace(/\/+$/, ''),
    // Extra origins allowed to submit forms (normally empty).
    allowedOrigins: list(env.ALLOWED_ORIGINS),
    dataDir: path.resolve(env.DATA_DIR || path.join(__dirname, '..', 'data')),
    dbFile: env.DB_FILE || '',
    // Secret used to hash visitor IP addresses before storing them.
    ipHashSecret: env.IP_HASH_SECRET || '',
    admin: {
      username: env.ADMIN_USERNAME || 'admin',
      passwordHash: env.ADMIN_PASSWORD_HASH || '',
      sessionIdleMinutes: int(env.SESSION_IDLE_MINUTES, 120),
      sessionMaxHours: int(env.SESSION_MAX_HOURS, 12),
    },
    mail: {
      host: env.SMTP_HOST || '',
      port: int(env.SMTP_PORT, 465),
      secure: bool(env.SMTP_SECURE, true),
      user: env.SMTP_USER || '',
      pass: env.SMTP_PASS || '',
      from: env.MAIL_FROM || env.SMTP_USER || '',
      notifyTo: env.NOTIFY_EMAIL || 'adventurepark661@gmail.com',
    },
    rateLimits: {
      globalPer15Min: int(env.RATE_LIMIT_GLOBAL, 600),
      bookingsPerHour: int(env.RATE_LIMIT_BOOKINGS, 8),
      loginPer15Min: int(env.RATE_LIMIT_LOGIN, 5),
    },
  };

  config.dbPath = config.dbFile || path.join(config.dataDir, 'adventure-park.db');
  config.cookieSecure = isProduction || bool(env.COOKIE_SECURE, false);
  // The __Host- prefix makes browsers refuse the cookie unless it is Secure,
  // host-only and scoped to "/". Only usable over HTTPS.
  config.sessionCookieName = config.cookieSecure ? '__Host-ap_sid' : 'ap_sid';

  return config;
}

function validateConfig(config, logger = console) {
  const problems = [];
  if (config.isProduction) {
    if (!config.publicUrl.startsWith('https://')) {
      problems.push('PUBLIC_URL must be set to your https:// address in production.');
    }
    if (config.ipHashSecret.length < 32) {
      problems.push('IP_HASH_SECRET must be at least 32 random characters in production.');
    }
  }
  if (!config.admin.passwordHash) {
    logger.warn('[config] ADMIN_PASSWORD_HASH is not set: the admin panel login is disabled.');
    logger.warn('[config] Run "npm run hash-password" to create one.');
  }
  if (!config.mail.host) {
    logger.warn('[config] SMTP is not configured: new bookings are saved but no email alert is sent.');
  }
  return problems;
}

module.exports = { loadConfig, validateConfig };
