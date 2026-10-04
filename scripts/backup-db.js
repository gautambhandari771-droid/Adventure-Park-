'use strict';

/**
 * Make a backup copy of the bookings database now.
 * Usage: npm run backup   (writes to BACKUP_DIR, or data/backups by default)
 */
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { loadConfig } = require('../src/config');
const { backupDatabase } = require('../src/backup');

const config = loadConfig();
const dir = path.resolve(process.env.BACKUP_DIR || path.join(config.dataDir, 'backups'));
const db = new DatabaseSync(config.dbPath, { readOnly: true });
const file = backupDatabase(db, dir, { keep: Number(process.env.BACKUP_KEEP) || 14 });
db.close();
console.log(`Backup written to ${file}`);
