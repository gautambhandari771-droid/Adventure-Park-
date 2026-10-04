'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Make a consistent copy of the open database (safe while the site runs),
 * then keep only the newest `keep` copies.
 */
function backupDatabase(db, dir, { keep = 14, now = new Date() } = {}) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `adventure-park-${stamp}.db`);
  db.prepare('VACUUM INTO ?').run(file);
  fs.chmodSync(file, 0o600);
  const old = fs.readdirSync(dir)
    .filter((f) => /^adventure-park-.*\.db$/.test(f))
    .sort()
    .reverse()
    .slice(keep);
  for (const f of old) fs.rmSync(path.join(dir, f), { force: true });
  return file;
}

module.exports = { backupDatabase };
