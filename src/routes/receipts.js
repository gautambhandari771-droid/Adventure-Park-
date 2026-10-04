'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const PDFDocument = require('pdfkit');
const { audit } = require('../db');
const { ACTIVITIES } = require('../business');
const {
  PRICE_LIST, receiptBusiness, validateReceipt, renderReceiptPdf, safeFileName, inr, formatDate,
} = require('../receipts');
const { requireJson } = require('../security');

const PAGE_SIZE = 50;
const STAMP_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg' };

function isPng(buf) {
  return buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}
function isJpeg(buf) {
  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

/**
 * Billing: create receipts from the admin panel, download them as PDF,
 * email them, and keep the official stamp private on the server.
 */
function receiptRoutes({ db, config, mailer, logger, requireAdmin, csvCell }) {
  const router = express.Router();
  const business = receiptBusiness();

  // The stamp lives in the private data folder, never in /public, so it
  // cannot be downloaded by visitors and misused on fake receipts.
  const stampBase = path.join(config.dataDir, 'receipt-stamp');
  function stampFile() {
    for (const ext of ['png', 'jpg']) {
      const f = `${stampBase}.${ext}`;
      if (fs.existsSync(f)) return { file: f, type: ext === 'png' ? 'image/png' : 'image/jpeg' };
    }
    return null;
  }
  function readStamp() {
    const s = stampFile();
    return s ? fs.readFileSync(s.file) : null;
  }

  const COLUMNS = 'id, receipt_no, booking_id, client_name, client_phone, client_email, booking_at, arrival_date, service, items, total, advance, balance, created_at, created_by';
  const getReceipt = db.prepare(`SELECT ${COLUMNS} FROM receipts WHERE id = ?`);

  function toJson(r) {
    return { ...r, items: JSON.parse(r.items) };
  }

  function parseId(raw) {
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  router.get('/settings', requireAdmin, (req, res) => {
    res.json({
      hasStamp: Boolean(stampFile()),
      mailEnabled: Boolean(mailer.enabled),
      business,
      priceList: PRICE_LIST,
      activities: ACTIVITIES,
    });
  });

  function buildFilter(query) {
    const q = typeof query.q === 'string' ? query.q.trim().slice(0, 80) : '';
    if (!q) return { sql: '', params: [] };
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return {
      sql: "WHERE client_name LIKE ? ESCAPE '\\' OR receipt_no LIKE ? ESCAPE '\\' OR client_phone LIKE ? ESCAPE '\\'",
      params: [like, like, like],
    };
  }

  router.get('/', requireAdmin, (req, res) => {
    const { sql, params } = buildFilter(req.query);
    const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
    const total = db.prepare(`SELECT COUNT(*) AS n FROM receipts ${sql}`).get(...params).n;
    const rows = db.prepare(`SELECT ${COLUMNS} FROM receipts ${sql} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE);
    const sums = db.prepare(`SELECT COALESCE(SUM(total),0) AS total, COALESCE(SUM(advance),0) AS advance, COALESCE(SUM(balance),0) AS balance FROM receipts ${sql}`).get(...params);
    res.json({ receipts: rows.map(toJson), total, page, pageSize: PAGE_SIZE, sums });
  });

  router.get('/export.csv', requireAdmin, (req, res) => {
    const { sql, params } = buildFilter(req.query);
    const rows = db.prepare(`SELECT ${COLUMNS} FROM receipts ${sql} ORDER BY id DESC`).all(...params);
    const header = ['Receipt no.', 'Client', 'Phone', 'Email', 'Booking date', 'Arrival date', 'Service', 'Total', 'Advance', 'Balance', 'Created by'];
    const lines = [header.map(csvCell).join(',')];
    for (const r of rows) {
      lines.push([r.receipt_no, r.client_name, r.client_phone, r.client_email, r.booking_at, r.arrival_date,
        r.service, r.total, r.advance, r.balance, r.created_by].map(csvCell).join(','));
    }
    audit(db, req.admin.username, 'export_receipts_csv', `${rows.length} rows`);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="receipts-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`﻿${lines.join('\r\n')}\r\n`);
  });

  const nextNumber = db.prepare(`
    INSERT INTO receipt_counters (year, last) VALUES (?, 1)
    ON CONFLICT(year) DO UPDATE SET last = last + 1
    RETURNING last
  `);
  const insertReceipt = db.prepare(`
    INSERT INTO receipts (receipt_no, booking_id, client_name, client_phone, client_email, booking_at, arrival_date,
                          service, items, total, advance, balance, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  router.post('/', requireAdmin, requireJson, (req, res) => {
    const result = validateReceipt(req.body);
    if (!result.ok) return res.status(422).json({ error: 'Please check the highlighted fields.', fields: result.errors });
    const r = result.value;

    let booking = null;
    if (r.bookingId) {
      booking = db.prepare('SELECT id, reference, status FROM bookings WHERE id = ?').get(r.bookingId);
      if (!booking) return res.status(422).json({ error: 'That booking no longer exists.', fields: { bookingId: 'Booking not found.' } });
    }

    const year = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(new Date());
    let id;
    let receiptNo;
    db.exec('BEGIN IMMEDIATE');
    try {
      const n = nextNumber.get(year).last;
      receiptNo = `AP-${year}-${String(n).padStart(4, '0')}`;
      const info = insertReceipt.run(receiptNo, r.bookingId, r.clientName, r.clientPhone, r.clientEmail, r.bookingAt,
        r.arrivalDate, r.service, JSON.stringify(r.items), r.total, r.advance, r.balance, new Date().toISOString(), req.admin.username);
      id = Number(info.lastInsertRowid);
      // Automation: an advance on a new or contacted booking confirms it.
      if (booking && r.advance > 0 && ['new', 'contacted'].includes(booking.status)) {
        db.prepare("UPDATE bookings SET status = 'confirmed', updated_at = ? WHERE id = ?").run(new Date().toISOString(), booking.id);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    audit(db, req.admin.username, 'create_receipt', `${receiptNo} ${inr(r.total)}${booking ? ` for ${booking.reference}` : ''}`);
    logger.info(`[receipts] created ${receiptNo}`);
    return res.status(201).json({ ok: true, receipt: toJson(getReceipt.get(id)), bookingConfirmed: Boolean(booking && r.advance > 0 && ['new', 'contacted'].includes(booking.status)) });
  });

  router.get('/:id/pdf', requireAdmin, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const r = id && getReceipt.get(id);
      if (!r) return res.status(404).json({ error: 'Receipt not found.' });
      const pdf = await renderReceiptPdf(r, { business, stamp: readStamp() });
      const disposition = req.query.download === '1' ? 'attachment' : 'inline';
      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', `${disposition}; filename="${safeFileName(r)}"`);
      return res.send(pdf);
    } catch (err) {
      return next(err);
    }
  });

  router.post('/:id/email', requireAdmin, async (req, res) => {
    try {
      const id = parseId(req.params.id);
      const r = id && getReceipt.get(id);
      if (!r) return res.status(404).json({ error: 'Receipt not found.' });
      if (!mailer.enabled) return res.status(409).json({ error: 'Email is not set up yet. Add the Gmail app password in the settings first.' });
      if (!r.client_email) return res.status(409).json({ error: 'This receipt has no client email address.' });
      const pdf = await renderReceiptPdf(r, { business, stamp: readStamp() });
      await mailer.sendReceipt({ to: r.client_email, receiptNo: r.receipt_no, clientName: r.client_name, pdf, fileName: safeFileName(r) });
      audit(db, req.admin.username, 'email_receipt', `${r.receipt_no} to ${r.client_email}`);
      return res.json({ ok: true });
    } catch (err) {
      logger.error(`[receipts] email failed: ${err.message}`);
      return res.status(502).json({ error: 'Could not send the email. Check the email settings and try again.' });
    }
  });

  router.delete('/:id', requireAdmin, (req, res) => {
    const id = parseId(req.params.id);
    const r = id && getReceipt.get(id);
    if (!r) return res.status(404).json({ error: 'Receipt not found.' });
    db.prepare('DELETE FROM receipts WHERE id = ?').run(id);
    audit(db, req.admin.username, 'delete_receipt', `${r.receipt_no} ${inr(r.total)} ${r.client_name} arriving ${formatDate(r.arrival_date)}`);
    return res.json({ ok: true });
  });

  // ---- Official stamp (private) ------------------------------------------
  router.get('/stamp/image', requireAdmin, (req, res) => {
    const s = stampFile();
    if (!s) return res.status(404).json({ error: 'No stamp uploaded.' });
    res.set('Content-Type', s.type);
    return res.send(fs.readFileSync(s.file));
  });

  router.put('/stamp/image', requireAdmin, express.raw({ type: Object.keys(STAMP_TYPES), limit: '1mb' }), (req, res) => {
    const type = req.get('content-type');
    const buf = req.body;
    if (!STAMP_TYPES[type] || !Buffer.isBuffer(buf) || !buf.length) {
      return res.status(415).json({ error: 'Upload a PNG or JPEG image.' });
    }
    if ((type === 'image/png' && !isPng(buf)) || (type === 'image/jpeg' && !isJpeg(buf))) {
      return res.status(415).json({ error: 'That file is not a real PNG or JPEG image.' });
    }
    try {
      const img = new PDFDocument({ autoFirstPage: false }).openImage(buf);
      if (!img.width || !img.height || img.width > 4000 || img.height > 4000) throw new Error('size');
    } catch {
      return res.status(415).json({ error: 'The image could not be read, or it is larger than 4000 pixels.' });
    }
    fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
    const target = `${stampBase}.${STAMP_TYPES[type]}`;
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, buf, { mode: 0o600 });
    fs.renameSync(tmp, target);
    for (const ext of Object.values(STAMP_TYPES)) {
      if (ext !== STAMP_TYPES[type]) fs.rmSync(`${stampBase}.${ext}`, { force: true });
    }
    audit(db, req.admin.username, 'upload_stamp', `${type} ${buf.length} bytes`);
    return res.json({ ok: true });
  });

  router.delete('/stamp/image', requireAdmin, (req, res) => {
    for (const ext of Object.values(STAMP_TYPES)) fs.rmSync(`${stampBase}.${ext}`, { force: true });
    audit(db, req.admin.username, 'remove_stamp');
    return res.json({ ok: true });
  });

  return router;
}

module.exports = { receiptRoutes };
