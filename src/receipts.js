'use strict';

const path = require('node:path');
const PDFDocument = require('pdfkit');
const { ACTIVITIES, BUSINESS } = require('./business');

const FONT_REGULAR = path.join(__dirname, '..', 'assets', 'fonts', 'DejaVuSans.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'assets', 'fonts', 'DejaVuSans-Bold.ttf');

/** What is printed on every receipt. Uses the website phone number unless RECEIPT_PHONE is set. */
function receiptBusiness(env = process.env) {
  return {
    name: BUSINESS.name,
    address: 'Badrinath Highway, Shivpuri, Near Shiv Mandir',
    phone: env.RECEIPT_PHONE || BUSINESS.phoneDisplay,
    email: BUSINESS.email,
    tagline: 'Where Rishikesh Gets Wild.',
    footer: 'Adventure Park  |  Shivpuri, Rishikesh  |  Instagram: adventure_park771',
    thanks: 'Thank you for booking with Adventure Park. Please carry this receipt and a valid photo ID on your arrival date.',
    balanceNote: 'The balance amount is payable at the venue.',
  };
}

/** Price list used to fill in rates automatically (the owner can still edit them). */
const PRICE_LIST = {
  'rafting-12km': { description: '12 km Rafting, Marine Drive to Shivpuri', service: '12 km Rafting (Marine Drive to Shivpuri)', rate: 500, weekendRate: 600 },
  'rafting-16km': { description: '16 km Rafting, Shivpuri to NIM Beach', service: '16 km Rafting (Shivpuri to NIM Beach)', rate: 800, weekendRate: 960 },
  'rafting-26km': { description: '26 km Rafting, Marine Drive to NIM Beach', service: '26 km Rafting (Marine Drive to NIM Beach)', rate: 1500, weekendRate: 1800 },
  'rafting-36km': { description: '36 km Rafting, Kaudiyala to NIM Beach', service: '36 km Rafting (Kaudiyala to NIM Beach)', rate: 2500, weekendRate: 3000 },
  'luxury-camping': { description: 'Luxury Camping (per person per night)', service: 'Luxury Camping', rate: 1500 },
  'guest-house': {
    description: 'Guest House AC Room (per room per night)',
    service: 'Guest House AC Room',
    // Lowest price of each season, by month (1 = January).
    seasonalRate: { 1: 1500, 2: 2200, 3: 2200, 4: 2200, 5: 2200, 6: 2200, 7: 1200, 8: 1200, 9: 1200, 10: 1500, 11: 1500, 12: 1500 },
  },
};

function clean(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').normalize('NFC').trim().slice(0, max + 1);
}

function isIsoDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
}

/**
 * Validate a receipt. Totals are always calculated here on the server;
 * any totals sent by the browser are ignored.
 */
function validateReceipt(body, now = new Date()) {
  const input = body && typeof body === 'object' ? body : {};
  const errors = {};

  const clientName = clean(input.clientName, 80);
  if (clientName.length < 2 || clientName.length > 80 || !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(clientName)) {
    errors.clientName = 'Enter the client name (letters only, 2 to 80 characters).';
  }

  let clientPhone = clean(input.clientPhone, 20).replace(/[\s\-().]/g, '');
  if (clientPhone) {
    if (/^(\+91|0091|91|0)?[6-9]\d{9}$/.test(clientPhone)) clientPhone = `+91${clientPhone.slice(-10)}`;
    else if (!/^\+[1-9]\d{6,14}$/.test(clientPhone)) errors.clientPhone = 'Enter a valid mobile number or leave it empty.';
  } else {
    clientPhone = null;
  }

  let clientEmail = clean(input.clientEmail, 120).toLowerCase();
  if (clientEmail) {
    if (clientEmail.length > 120 || !/^[^\s@<>()[\]\\,;:"]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(clientEmail)) {
      errors.clientEmail = 'Enter a valid email address or leave it empty.';
    }
  } else {
    clientEmail = null;
  }

  const arrivalDate = clean(input.arrivalDate, 10);
  if (!isIsoDate(arrivalDate)) errors.arrivalDate = 'Choose the arrival date.';

  let bookingAt = now.toISOString();
  if (input.bookingAt) {
    const parsed = new Date(String(input.bookingAt));
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() > now.getTime() + 60000
        || parsed.getTime() < now.getTime() - 2 * 365 * 86400000) {
      errors.bookingAt = 'Booking date must be a real date, not in the future.';
    } else {
      bookingAt = parsed.toISOString();
    }
  }

  const service = clean(input.service, 120);
  if (service.length < 2 || service.length > 120) errors.service = 'Enter the service (2 to 120 characters).';

  const rawItems = Array.isArray(input.items) ? input.items : [];
  const items = [];
  if (rawItems.length < 1 || rawItems.length > 10) {
    errors.items = 'Add between 1 and 10 lines.';
  } else {
    rawItems.forEach((raw, i) => {
      const item = raw && typeof raw === 'object' ? raw : {};
      const description = clean(item.description, 120);
      const pax = Number(item.pax);
      const rate = Number(item.rate);
      if (description.length < 2 || description.length > 120) errors[`items.${i}.description`] = 'Enter a description.';
      if (!Number.isInteger(pax) || pax < 1 || pax > 500) errors[`items.${i}.pax`] = 'Pax must be 1 to 500.';
      if (!Number.isInteger(rate) || rate < 0 || rate > 1000000) errors[`items.${i}.rate`] = 'Rate must be a whole number of rupees.';
      items.push({ description, pax, rate, amount: pax * rate });
    });
  }

  const advance = Number(input.advance === '' || input.advance === undefined ? 0 : input.advance);
  const total = items.reduce((sum, it) => sum + (Number.isFinite(it.amount) ? it.amount : 0), 0);
  if (!Number.isInteger(advance) || advance < 0) errors.advance = 'Advance must be a whole number of rupees.';
  else if (advance > total) errors.advance = 'Advance cannot be more than the total.';

  const bookingId = input.bookingId === undefined || input.bookingId === null || input.bookingId === '' ? null : Number(input.bookingId);
  if (bookingId !== null && (!Number.isInteger(bookingId) || bookingId < 1)) errors.bookingId = 'Invalid booking.';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      clientName, clientPhone, clientEmail, arrivalDate, bookingAt, service, items,
      total, advance, balance: total - advance, bookingId,
    },
  };
}

// ---------------------------------------------------------------------------
// Formatting (always in India time and Indian number style)
// ---------------------------------------------------------------------------
const inrFormat = new Intl.NumberFormat('en-IN');
const inr = (n) => `₹${inrFormat.format(n)}`;

function formatDateTime(iso) {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  const time = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
  return `${date}, ${time}`;
}

function formatDate(isoDate) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(`${isoDate}T00:00:00Z`));
}

function safeFileName(receipt) {
  const name = receipt.client_name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'Client';
  return `Adventure-Park-Receipt-${name}-${receipt.receipt_no}.pdf`;
}

// ---------------------------------------------------------------------------
// PDF, laid out like the Adventure Park sample receipt (A4)
// ---------------------------------------------------------------------------
const COLORS = {
  header: '#213D2E', stripe: '#F0A043', teal: '#126B73', label: '#5B6B70', text: '#111111',
  rule: '#D3DDE0', balanceBg: '#FDE7C4', muted: '#5F6B6E',
};

function renderReceiptPdf(receipt, { business = receiptBusiness(), stamp = null } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4', margin: 0,
      info: { Title: `Booking Receipt ${receipt.receipt_no}`, Author: business.name, Subject: 'Booking receipt' },
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('R', FONT_REGULAR);
    doc.registerFont('B', FONT_BOLD);

    const W = doc.page.width; // 595.28
    const H = doc.page.height; // 841.89
    const L = 40;
    const R = W - 40;

    // Header band
    doc.rect(0, 0, W, 110).fill(COLORS.header);
    doc.rect(0, 110, W, 4).fill(COLORS.stripe);
    doc.fillColor('#FFFFFF').font('B').fontSize(26).text(business.name, L, 28, { lineBreak: false });
    doc.font('R').fontSize(9.5).text(business.address, L, 62, { lineBreak: false });
    doc.text(`Phone / WhatsApp: ${business.phone}   |   ${business.email}`, L, 77, { lineBreak: false });
    doc.font('B').fontSize(15).text('BOOKING RECEIPT', L, 38, { width: R - L, align: 'right', lineBreak: false });
    doc.font('R').fontSize(8.5).text(business.tagline, L, 62, { width: R - L, align: 'right', lineBreak: false });

    // Client details
    let y = 140;
    const rows = [
      ['Receipt no.', receipt.receipt_no],
      ['Client name', receipt.client_name.toUpperCase()],
      ['Booking date', formatDateTime(receipt.booking_at)],
      ['Arrival date', formatDate(receipt.arrival_date)],
      ['Service', receipt.service],
    ];
    for (const [label, value] of rows) {
      doc.fillColor(COLORS.label).font('R').fontSize(9.5).text(label, L, y, { lineBreak: false });
      doc.fillColor(COLORS.text).font('B').fontSize(10.5).text(value, 190, y - 1, { width: R - 190 });
      y = Math.max(y + 18, doc.y + 4);
      doc.moveTo(L, y).lineTo(R, y).lineWidth(0.8).strokeColor(COLORS.rule).stroke();
      y += 10;
    }

    // Items table
    y += 6;
    const col = { desc: L + 8, pax: 330, rate: 400, amount: R - 8 };
    doc.rect(L, y, R - L, 24).fill(COLORS.teal);
    doc.fillColor('#FFFFFF').font('B').fontSize(9.5);
    doc.text('Description', col.desc, y + 7, { lineBreak: false });
    doc.text('Pax', col.pax - 30, y + 7, { width: 60, align: 'center', lineBreak: false });
    doc.text('Rate', col.rate, y + 7, { width: 70, align: 'right', lineBreak: false });
    doc.text('Amount', col.amount - 90, y + 7, { width: 90, align: 'right', lineBreak: false });
    y += 24;

    const items = JSON.parse(receipt.items);
    doc.font('R').fontSize(9.5).fillColor(COLORS.text);
    for (const it of items) {
      const top = y + 10;
      doc.text(it.description, col.desc, top, { width: col.pax - 40 - col.desc });
      const rowBottom = Math.max(doc.y, top + 12);
      doc.text(String(it.pax), col.pax - 30, top, { width: 60, align: 'center', lineBreak: false });
      doc.text(inr(it.rate), col.rate, top, { width: 70, align: 'right', lineBreak: false });
      doc.text(inr(it.amount), col.amount - 90, top, { width: 90, align: 'right', lineBreak: false });
      y = rowBottom + 9;
      doc.moveTo(L, y).lineTo(R, y).lineWidth(0.8).strokeColor(COLORS.rule).stroke();
    }

    // Totals
    const tx = 310;
    y += 14;
    doc.font('R').fontSize(10.5).fillColor(COLORS.text);
    doc.text('Total amount', tx + 12, y, { lineBreak: false });
    doc.text(inr(receipt.total), tx, y, { width: R - tx - 8, align: 'right', lineBreak: false });
    y += 26;
    doc.text('Advance received', tx + 12, y, { lineBreak: false });
    doc.text(inr(receipt.advance), tx, y, { width: R - tx - 8, align: 'right', lineBreak: false });
    y += 20;
    doc.rect(tx, y, R - tx, 28).fill(COLORS.balanceBg);
    doc.fillColor(COLORS.text).font('B').fontSize(11.5);
    doc.text('Balance amount', tx + 12, y + 8, { lineBreak: false });
    doc.text(inr(receipt.balance), tx, y + 8, { width: R - tx - 8, align: 'right', lineBreak: false });
    y += 70;

    // Thank-you note
    doc.font('R').fontSize(8.5).fillColor(COLORS.muted);
    doc.text(business.thanks, L, y, { width: R - L });
    doc.text(receipt.balance > 0 ? business.balanceNote : 'Paid in full. No balance is due.', L, doc.y + 3, { width: R - L });

    // Stamp and signatures near the bottom
    const sigY = H - 120;
    if (stamp) {
      try {
        doc.image(stamp, R - 195, sigY - 82, { fit: [170, 70], align: 'center', valign: 'center' });
      } catch {
        /* an unreadable stamp image is skipped rather than breaking the receipt */
      }
    }
    doc.moveTo(R - 205, sigY).lineTo(R, sigY).lineWidth(1).strokeColor(COLORS.text).stroke();
    doc.fillColor(COLORS.text).font('B').fontSize(9.5).text('Proprietor / Authorised Signatory', R - 205, sigY + 6, { width: 205, align: 'right', lineBreak: false });
    doc.font('R').fontSize(9.5).text('Client signature: ____________________', L, sigY + 6, { lineBreak: false });

    // Footer band
    doc.rect(0, H - 30, W, 30).fill(COLORS.header);
    doc.fillColor('#FFFFFF').font('R').fontSize(8.5).text(business.footer, 0, H - 19, { width: W, align: 'center', lineBreak: false });

    doc.end();
  });
}

module.exports = {
  PRICE_LIST, receiptBusiness, validateReceipt, renderReceiptPdf, formatDate, formatDateTime, inr, safeFileName,
  ACTIVITIES,
};
