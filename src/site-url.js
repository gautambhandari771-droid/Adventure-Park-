'use strict';

/** The public base URL of the site, e.g. https://adventurepark.in */
function siteUrl(req, config) {
  if (config.publicUrl) return config.publicUrl;
  // Development fallback; the Host header is strictly checked before use.
  const host = req.get('host') || '';
  return /^[a-z0-9.-]+(:\d{1,5})?$/i.test(host) ? `${req.protocol}://${host}` : 'http://localhost';
}

module.exports = { siteUrl };
