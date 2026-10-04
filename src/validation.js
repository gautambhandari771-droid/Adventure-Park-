'use strict';

const { ACTIVITIES, BUSINESS } = require('./business');

const MAX_PEOPLE = 60;
const MAX_DAYS_AHEAD = 365;

// Remove control characters (except newline/tab in long text) and trim.
function clean(value, { multiline = false } = {}) {
  if (typeof value !== 'string') return '';
  const pattern = multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g;
  return value.replace(pattern, '').normalize('NFC').trim();
}

/** Today's date (YYYY-MM-DD) in India Standard Time. */
function todayInIndia(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400000);
}

function normalisePhone(raw) {
  const digits = raw.replace(/[\s\-().]/g, '');
  if (/^(\+91|0091|91|0)?[6-9]\d{9}$/.test(digits)) {
    return `+91${digits.slice(-10)}`;
  }
  if (/^\+[1-9]\d{6,14}$/.test(digits)) return digits;
  return null;
}

/**
 * Validate a booking request. Returns { ok, value } or { ok: false, errors }.
 * Only known fields are read, everything else is ignored.
 */
function validateBooking(body, now = new Date()) {
  const errors = {};
  const input = body && typeof body === 'object' ? body : {};

  const name = clean(input.name).replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80 || !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(name)) {
    errors.name = 'Please enter your name (letters only, 2 to 80 characters).';
  }

  const phone = normalisePhone(clean(input.phone));
  if (!phone) errors.phone = 'Please enter a valid mobile number, e.g. 98765 43210.';

  let email = clean(input.email).toLowerCase();
  if (email) {
    if (email.length > 120 || !/^[^\s@<>()[\]\\,;:"]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(email)) {
      errors.email = 'Please enter a valid email address or leave it empty.';
    }
  } else {
    email = null;
  }

  const activity = clean(input.activity);
  if (!Object.prototype.hasOwnProperty.call(ACTIVITIES, activity)) {
    errors.activity = 'Please choose an activity.';
  }

  const date = clean(input.date);
  const today = todayInIndia(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))
      || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    errors.date = 'Please choose a date.';
  } else if (date < today) {
    errors.date = 'The date cannot be in the past.';
  } else if (daysBetween(today, date) > MAX_DAYS_AHEAD) {
    errors.date = 'Bookings can be made up to one year in advance.';
  } else if (!BUSINESS.yearRoundActivities.includes(activity)
             && !BUSINESS.openMonths.includes(Number(date.slice(5, 7)))) {
    errors.date = 'Rafting and camping are closed in July and August (monsoon). Our guest house is open all year.';
  }

  const people = Number(input.people);
  if (!Number.isInteger(people) || people < 1 || people > MAX_PEOPLE) {
    errors.people = `Group size must be between 1 and ${MAX_PEOPLE}.`;
  }

  const message = clean(input.message, { multiline: true });
  if (message.length > 1000) errors.message = 'Message is too long (max 1000 characters).';

  if (input.consent !== true && input.consent !== 'on' && input.consent !== 'true') {
    errors.consent = 'Please agree so we can contact you about this booking.';
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    value: { name, phone, email, activity, date, people, message: message || null },
  };
}

const STATUSES = ['new', 'contacted', 'confirmed', 'completed', 'cancelled'];

function validateBookingUpdate(body) {
  const input = body && typeof body === 'object' ? body : {};
  const update = {};
  if (input.status !== undefined) {
    if (!STATUSES.includes(input.status)) return { ok: false, error: 'Invalid status.' };
    update.status = input.status;
  }
  if (input.notes !== undefined) {
    const notes = clean(String(input.notes), { multiline: true });
    if (notes.length > 2000) return { ok: false, error: 'Notes are too long.' };
    update.notes = notes || null;
  }
  if (!Object.keys(update).length) return { ok: false, error: 'Nothing to update.' };
  return { ok: true, value: update };
}

module.exports = {
  validateBooking,
  validateBookingUpdate,
  todayInIndia,
  normalisePhone,
  STATUSES,
  MAX_PEOPLE,
};
