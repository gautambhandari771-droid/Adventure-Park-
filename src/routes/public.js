'use strict';

const express = require('express');
const crypto = require('node:crypto');
const { rateLimit } = require('express-rate-limit');
const { validateBooking } = require('../validation');
const { ACTIVITIES, BUSINESS } = require('../business');
const { requireJson } = require('../security');
const { estimate } = require('../pricing');

function makeReference() {
  // Unambiguous characters only (no 0/O, 1/I).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  let out = 'AP-';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

function publicRoutes({ db, config, mailer, logger }) {
  const router = express.Router();

  const bookingLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: config.rateLimits.bookingsPerHour,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many booking requests. Please call or WhatsApp us instead.' },
  });

  const insert = db.prepare(`
    INSERT INTO bookings (reference, name, phone, email, activity, activity_date, people, message,
                          status, ip_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)
  `);

  router.get('/activities', (req, res) => {
    res.json({ activities: ACTIVITIES });
  });

  router.post('/bookings', bookingLimiter, requireJson, (req, res) => {
    const body = req.body || {};

    // Honeypot: real people never see or fill the "website" field.
    // Pretend success so bots learn nothing.
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      logger.warn('[bookings] honeypot triggered, request dropped');
      return res.status(201).json({ ok: true, reference: makeReference() });
    }

    const result = validateBooking(body);
    if (!result.ok) {
      return res.status(422).json({ error: 'Please check the highlighted fields.', fields: result.errors });
    }

    const b = result.value;
    const now = new Date().toISOString();
    const ipHash = config.ipHashSecret
      ? crypto.createHmac('sha256', config.ipHashSecret).update(req.ip || '').digest('hex').slice(0, 32)
      : null;

    let reference;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      reference = makeReference();
      try {
        insert.run(reference, b.name, b.phone, b.email, b.activity, b.date, b.people, b.message, ipHash, now, now);
        break;
      } catch (err) {
        if (!String(err.message).includes('UNIQUE') || attempt === 4) throw err;
      }
    }

    logger.info(`[bookings] new booking ${reference} for ${b.date}`);
    const est = estimate(b.activity, b.date, b.people);
    const estimateText = est ? est.text : null;
    mailer.sendBookingAlert({ ...b, reference, estimate: estimateText }).catch(() => {});

    // Confirmation email to the customer, at most 3 per address per day.
    let confirmationEmail = false;
    if (b.email && mailer.enabled) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const recent = db.prepare('SELECT COUNT(*) AS n FROM bookings WHERE email = ? AND created_at > ?').get(b.email, since).n;
      if (recent <= 3) {
        confirmationEmail = true;
        mailer.sendBookingConfirmation({ ...b, reference, estimate: estimateText }).catch(() => {});
      }
    }

    const waText = [
      `Hello ${BUSINESS.name}, I sent booking request ${reference}.`,
      `Activity: ${ACTIVITIES[b.activity]}`,
      `Date: ${b.date}, People: ${b.people}`,
      estimateText ? `Estimate: ${estimateText}` : null,
      `Name: ${b.name}`,
    ].filter(Boolean).join('\n');

    return res.status(201).json({
      ok: true,
      reference,
      estimate: estimateText,
      confirmationEmail,
      whatsappUrl: `https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent(waText)}`,
    });
  });

  return router;
}

module.exports = { publicRoutes };
