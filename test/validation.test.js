'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateBooking, normalisePhone, todayInIndia } = require('../src/validation');
const { validBooking } = require('./helpers');

test('accepts a valid booking and normalises the phone', () => {
  const r = validateBooking(validBooking());
  assert.equal(r.ok, true);
  assert.equal(r.value.phone, '+919876543210');
  assert.equal(r.value.people, 4);
});

test('phone normalisation', () => {
  assert.equal(normalisePhone('+91 98765-43210'), '+919876543210');
  assert.equal(normalisePhone('09876543210'), '+919876543210');
  assert.equal(normalisePhone('+44 7700 900123'), '+447700900123');
  assert.equal(normalisePhone('12345'), null);
  assert.equal(normalisePhone('5876543210'), null);
});

test('rejects bad names, including script injection attempts', () => {
  for (const name of ['', 'A', '<script>alert(1)</script>', 'Robert"); DROP TABLE bookings;--', 'x'.repeat(81)]) {
    const r = validateBooking(validBooking({ name }));
    assert.equal(r.ok, false, `should reject ${name}`);
    assert.ok(r.errors.name);
  }
  assert.equal(validateBooking(validBooking({ name: 'राहुल शर्मा' })).ok, true, 'Hindi names are allowed');
  assert.equal(validateBooking(validBooking({ name: "Anne-Marie O'Neil" })).ok, true);
});

test('rejects past dates, July/August, invalid and far-future dates', () => {
  const now = new Date('2026-10-04T06:00:00Z');
  const base = validBooking();
  assert.equal(validateBooking({ ...base, date: '2026-10-03' }, now).errors.date, 'The date cannot be in the past.');
  assert.match(validateBooking({ ...base, date: '2027-07-15' }, now).errors.date, /July and August/);
  assert.match(validateBooking({ ...base, date: '2027-08-01' }, now).errors.date, /July and August/);
  assert.match(validateBooking({ ...base, activity: 'luxury-camping', date: '2027-07-15' }, now).errors.date, /July and August/);
  assert.equal(validateBooking({ ...base, activity: 'guest-house', date: '2027-07-15' }, now).ok, true, 'guest house is open all year');
  assert.equal(validateBooking({ ...base, activity: 'guest-house', date: '2027-08-20' }, now).ok, true);
  assert.ok(validateBooking({ ...base, date: '2027-02-30' }, now).errors.date);
  assert.ok(validateBooking({ ...base, date: '2028-01-10' }, now).errors.date);
  assert.equal(validateBooking({ ...base, date: '2026-10-04' }, now).ok, true, 'today is fine');
  assert.equal(validateBooking({ ...base, date: '2027-06-30' }, now).ok, true);
  assert.equal(validateBooking({ ...base, date: '2027-09-01' }, now).ok, true);
});

test('uses India time for "today"', () => {
  // 20:00 UTC on 3 Oct is already 4 Oct in India.
  assert.equal(todayInIndia(new Date('2026-10-03T20:00:00Z')), '2026-10-04');
});

test('rejects unknown activities, bad group sizes, missing consent, long messages', () => {
  assert.ok(validateBooking(validBooking({ activity: 'bungee' })).errors.activity);
  assert.ok(validateBooking(validBooking({ activity: 'rafting-9km' })).errors.activity, '9 km trip is no longer offered');
  assert.ok(validateBooking(validBooking({ activity: 'camping' })).errors.activity, 'riverside camping is no longer offered');
  assert.ok(validateBooking(validBooking({ activity: 'rafting-camping' })).errors.activity, 'package is no longer offered');
  for (const a of ['rafting-12km', 'rafting-16km', 'rafting-26km', 'rafting-36km']) assert.equal(validateBooking(validBooking({ activity: a })).ok, true, a);
  assert.ok(validateBooking(validBooking({ activity: '__proto__' })).errors.activity);
  assert.ok(validateBooking(validBooking({ people: 0 })).errors.people);
  assert.ok(validateBooking(validBooking({ people: 2.5 })).errors.people);
  assert.ok(validateBooking(validBooking({ people: 61 })).errors.people);
  assert.ok(validateBooking(validBooking({ consent: false })).errors.consent);
  assert.ok(validateBooking(validBooking({ message: 'a'.repeat(1001) })).errors.message);
  assert.ok(validateBooking(validBooking({ email: 'not-an-email' })).errors.email);
});

test('rejects non-string values instead of crashing', () => {
  const r = validateBooking({ name: { $gt: '' }, phone: ['1'], activity: 5, date: null, people: '4', consent: 'yes' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.name && r.errors.phone && r.errors.activity && r.errors.date && r.errors.consent);
});
