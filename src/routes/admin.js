'use strict';

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { audit } = require('../db');
const { ACTIVITIES } = require('../business');
const { validateBookingUpdate, STATUSES } = require('../validation');
const { verifyPassword, safeEqual, parseCookies, createLoginGuard, requireJson } = require('../security');
const { receiptRoutes } = require('./receipts');
const { verifyTotp } = require('../totp');

const PAGE_SIZE = 50;

/** Neutralise spreadsheet formula injection in CSV exports. */
function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function adminRoutes({ db, config, sessions, logger, mailer }) {
  const router = express.Router();
  const guard = createLoginGuard();
  const twoFactor = Boolean(config.admin.totpSecret);
  let lastTotpStep = -1; // each code can be used only once

  // Admin responses must never be cached or indexed.
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    next();
  });

  const cookieOptions = {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    path: '/',
  };

  function readSession(req) {
    const id = parseCookies(req.headers.cookie)[config.sessionCookieName];
    return { id, session: sessions.get(id) };
  }

  function requireAdmin(req, res, next) {
    const { id, session } = readSession(req);
    if (!session) return res.status(401).json({ error: 'Please log in.' });
    if (!['GET', 'HEAD'].includes(req.method)) {
      const token = req.get('x-csrf-token');
      if (!token || !safeEqual(token, session.csrfToken)) {
        return res.status(403).json({ error: 'Invalid security token. Please reload the page.' });
      }
    }
    req.admin = { ...session, sessionId: id };
    return next();
  }

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.rateLimits.loginPer15Min,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  });

  router.post('/login', loginLimiter, requireJson, async (req, res) => {
    if (guard.isLocked()) {
      return res.status(429).json({ error: 'Login is temporarily locked. Try again in 15 minutes.' });
    }
    const { username, password, code } = req.body || {};
    const wrong = twoFactor ? 'Wrong username, password or code.' : 'Wrong username or password.';
    if (typeof username !== 'string' || typeof password !== 'string' || !config.admin.passwordHash) {
      await verifyPassword('x', '');
      return res.status(401).json({ error: wrong });
    }
    const userOk = safeEqual(username, config.admin.username);
    const passOk = await verifyPassword(password, config.admin.passwordHash);
    let codeOk = true;
    let step = null;
    if (twoFactor) {
      step = verifyTotp(config.admin.totpSecret, typeof code === 'string' ? code : '');
      codeOk = step !== null && step > lastTotpStep;
    }
    if (!userOk || !passOk || !codeOk) {
      guard.fail();
      audit(db, 'anonymous', 'login_failed', `ip=${req.ip}`);
      logger.warn(`[admin] failed login from ${req.ip}`);
      return res.status(401).json({ error: wrong });
    }
    if (twoFactor) lastTotpStep = step;
    guard.succeed();
    // Drop any session the browser already had (prevents session fixation).
    sessions.destroy(parseCookies(req.headers.cookie)[config.sessionCookieName]);
    const { id, csrfToken } = sessions.create(config.admin.username);
    audit(db, config.admin.username, 'login', `ip=${req.ip}`);
    res.cookie(config.sessionCookieName, id, {
      ...cookieOptions,
      maxAge: config.admin.sessionMaxHours * 60 * 60 * 1000,
    });
    return res.json({ ok: true, csrfToken, username: config.admin.username });
  });

  router.get('/session', (req, res) => {
    const { session } = readSession(req);
    if (!session) return res.json({ authenticated: false, twoFactor });
    return res.json({ authenticated: true, username: session.username, csrfToken: session.csrfToken });
  });

  router.post('/logout', requireAdmin, (req, res) => {
    sessions.destroy(req.admin.sessionId);
    audit(db, req.admin.username, 'logout');
    res.clearCookie(config.sessionCookieName, cookieOptions);
    res.json({ ok: true });
  });

  function buildFilter(query) {
    const where = [];
    const params = [];
    const status = typeof query.status === 'string' ? query.status : '';
    if (STATUSES.includes(status)) {
      where.push('status = ?');
      params.push(status);
    }
    const q = typeof query.q === 'string' ? query.q.trim().slice(0, 80) : '';
    if (q) {
      // Escape LIKE wildcards so the search text is matched literally.
      const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      where.push("(name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR reference LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')");
      params.push(like, like, like, like);
    }
    const upcoming = query.upcoming === '1';
    if (upcoming) {
      where.push("activity_date >= date('now', '+5 hours', '+30 minutes')");
    }
    return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params, upcoming };
  }

  const COLUMNS = "id, reference, name, phone, email, activity, activity_date AS date, people, message, status, admin_notes AS notes, created_at, updated_at, (SELECT group_concat(receipt_no, ', ') FROM receipts WHERE receipts.booking_id = bookings.id) AS receipts";

  router.get('/bookings', requireAdmin, (req, res) => {
    const { sql, params, upcoming } = buildFilter(req.query);
    const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
    const order = upcoming ? 'activity_date ASC, id ASC' : 'id DESC';
    const total = db.prepare(`SELECT COUNT(*) AS n FROM bookings ${sql}`).get(...params).n;
    const rows = db
      .prepare(`SELECT ${COLUMNS} FROM bookings ${sql} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE);
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    for (const row of db.prepare('SELECT status, COUNT(*) AS n FROM bookings GROUP BY status').all()) {
      counts[row.status] = row.n;
    }
    res.json({ bookings: rows, total, page, pageSize: PAGE_SIZE, counts, activities: ACTIVITIES });
  });

  router.get('/bookings.csv', requireAdmin, (req, res) => {
    const { sql, params } = buildFilter(req.query);
    const rows = db.prepare(`SELECT ${COLUMNS} FROM bookings ${sql} ORDER BY id DESC`).all(...params);
    const header = ['Reference', 'Name', 'Phone', 'Email', 'Activity', 'Date', 'People', 'Message', 'Status', 'Notes', 'Receipts', 'Received'];
    const lines = [header.map(csvCell).join(',')];
    for (const r of rows) {
      lines.push([
        r.reference, r.name, r.phone, r.email, ACTIVITIES[r.activity] || r.activity, r.date,
        r.people, r.message, r.status, r.notes, r.receipts, r.created_at,
      ].map(csvCell).join(','));
    }
    audit(db, req.admin.username, 'export_csv', `${rows.length} rows`);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="bookings-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`﻿${lines.join('\r\n')}\r\n`);
  });

  function parseId(raw) {
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  router.patch('/bookings/:id', requireAdmin, requireJson, (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid booking id.' });
    const result = validateBookingUpdate(req.body);
    if (!result.ok) return res.status(422).json({ error: result.error });
    const existing = db.prepare('SELECT id, reference FROM bookings WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Booking not found.' });

    const { status, notes } = result.value;
    const now = new Date().toISOString();
    if (status !== undefined) db.prepare('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
    if (notes !== undefined) db.prepare('UPDATE bookings SET admin_notes = ?, updated_at = ? WHERE id = ?').run(notes, now, id);
    audit(db, req.admin.username, 'update_booking', `${existing.reference} ${status ? `status=${status}` : ''}${notes !== undefined ? ' notes' : ''}`);

    return res.json({ ok: true, booking: db.prepare(`SELECT ${COLUMNS} FROM bookings WHERE id = ?`).get(id) });
  });

  router.delete('/bookings/:id', requireAdmin, (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid booking id.' });
    const existing = db.prepare('SELECT reference FROM bookings WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Booking not found.' });
    db.prepare('DELETE FROM bookings WHERE id = ?').run(id);
    audit(db, req.admin.username, 'delete_booking', existing.reference);
    return res.json({ ok: true });
  });

  router.use('/receipts', receiptRoutes({ db, config, mailer, logger, requireAdmin, csvCell }));

  return router;
}

module.exports = { adminRoutes, csvCell };
