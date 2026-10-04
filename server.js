'use strict';

const { loadConfig, validateConfig } = require('./src/config');
const path = require('node:path');
const { createApp } = require('./src/app');
const { backupDatabase } = require('./src/backup');

const config = loadConfig();
const problems = validateConfig(config);
if (problems.length) {
  for (const p of problems) console.error(`[config] ${p}`);
  console.error('[config] Refusing to start. Fix the settings in your .env file.');
  process.exit(1);
}

const app = createApp(config);
const server = app.listen(config.port, config.host, () => {
  console.log(`[server] Adventure Park website running on http://${config.host}:${config.port}`);
});

// Slow-client protection.
server.headersTimeout = 15000;
server.requestTimeout = 30000;
server.keepAliveTimeout = 5000;

const purge = setInterval(() => app.locals.sessions.purgeExpired(), 10 * 60 * 1000);
purge.unref();

// Automatic daily backup of bookings and receipts, keeping the last 14 days.
const backupDir = process.env.BACKUP_DIR || path.join(config.dataDir, 'backups');
function dailyBackup() {
  try {
    const file = backupDatabase(app.locals.db, backupDir, { keep: Number(process.env.BACKUP_KEEP) || 14 });
    console.log(`[backup] saved ${path.basename(file)}`);
  } catch (err) {
    console.error(`[backup] failed: ${err.message}`);
  }
}
setTimeout(dailyBackup, 60 * 1000).unref();
setInterval(dailyBackup, 24 * 60 * 60 * 1000).unref();

function shutdown(signal) {
  console.log(`[server] ${signal} received, shutting down`);
  server.close(() => {
    app.locals.db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
