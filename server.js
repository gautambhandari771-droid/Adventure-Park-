'use strict';

const { loadConfig, validateConfig } = require('./src/config');
const { createApp } = require('./src/app');

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
