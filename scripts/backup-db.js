'use strict';

/**
 * Make a consistent copy of the bookings database.
 * Usage: npm run backup   (writes to ./backups/ by default)
 */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { loadConfig } = require('../src/config');

const config = loadConfig();
const outDir = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups'));
fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outFile = path.join(outDir, `adventure-park-${stamp}.db`);

const db = new DatabaseSync(config.dbPath, { readOnly: true });
db.prepare('VACUUM INTO ?').run(outFile);
db.close();
fs.chmodSync(outFile, 0o600);
console.log(`Backup written to ${outFile}`);
