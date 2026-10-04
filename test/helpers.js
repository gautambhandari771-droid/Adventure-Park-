'use strict';

const { loadConfig } = require('../src/config');
const { createApp } = require('../src/app');
const { openDatabase } = require('../src/db');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const silentLogger = { info() {}, warn() {}, error() {}, log() {} };

function makeApp(env = {}, { mailer } = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    DB_FILE: ':memory:',
    DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'ap-test-')),
    IP_HASH_SECRET: 'test-secret-test-secret-test-secret-123',
    ...env,
  });
  const db = openDatabase(':memory:');
  const sent = [];
  const app = createApp(config, {
    logger: silentLogger,
    db,
    mailer: mailer || { enabled: true, async sendBookingAlert(b) { sent.push(b); } },
  });
  return { app, db, config, sent };
}

/** A valid future date inside the September to June season. */
function validDate(daysAhead = 10) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  while ([7, 8].includes(d.getUTCMonth() + 1)) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function validBooking(overrides = {}) {
  return {
    name: 'Rahul Sharma',
    phone: '98765 43210',
    email: 'rahul@example.com',
    activity: 'rafting-16km',
    date: validDate(),
    people: 4,
    message: 'Two kids aged 15.',
    consent: true,
    website: '',
    ...overrides,
  };
}

module.exports = { makeApp, validBooking, validDate, silentLogger };
