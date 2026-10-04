'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS bookings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  reference     TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  phone         TEXT    NOT NULL,
  email         TEXT,
  activity      TEXT    NOT NULL,
  activity_date TEXT    NOT NULL,
  people        INTEGER NOT NULL,
  message       TEXT,
  status        TEXT    NOT NULL DEFAULT 'new'
                CHECK (status IN ('new','contacted','confirmed','completed','cancelled')),
  admin_notes   TEXT,
  ip_hash       TEXT,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings(created_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status  ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_date    ON bookings(activity_date);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash     TEXT PRIMARY KEY,
  csrf_token  TEXT NOT NULL,
  username    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS receipts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_no    TEXT    NOT NULL UNIQUE,
  booking_id    INTEGER,
  client_name   TEXT    NOT NULL,
  client_phone  TEXT,
  client_email  TEXT,
  booking_at    TEXT    NOT NULL,
  arrival_date  TEXT    NOT NULL,
  service       TEXT    NOT NULL,
  items         TEXT    NOT NULL,
  total         INTEGER NOT NULL CHECK (total >= 0),
  advance       INTEGER NOT NULL CHECK (advance >= 0),
  balance       INTEGER NOT NULL CHECK (balance >= 0),
  created_at    TEXT    NOT NULL,
  created_by    TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_receipts_created ON receipts(created_at);

-- Receipt numbers are never reused, even if a receipt is deleted.
CREATE TABLE IF NOT EXISTS receipt_counters (
  year  TEXT PRIMARY KEY,
  last  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         TEXT NOT NULL,
  actor      TEXT NOT NULL,
  action     TEXT NOT NULL,
  detail     TEXT
);
`;

/**
 * Open (and create if needed) the SQLite database.
 * All queries in this project use prepared statements with bound
 * parameters, which prevents SQL injection.
 */
function openDatabase(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA secure_delete = ON;');
  db.exec(SCHEMA);
  if (dbPath !== ':memory:') {
    try {
      fs.chmodSync(dbPath, 0o600);
    } catch {
      /* not fatal on filesystems without chmod */
    }
  }
  return db;
}

function audit(db, actor, action, detail) {
  db.prepare('INSERT INTO audit_log (at, actor, action, detail) VALUES (?, ?, ?, ?)').run(
    new Date().toISOString(),
    actor,
    action,
    detail ? String(detail).slice(0, 500) : null,
  );
}

module.exports = { openDatabase, audit };
