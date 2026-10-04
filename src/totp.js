'use strict';

/**
 * Two-step login codes (TOTP, RFC 6238): the 6-digit codes shown by Google
 * Authenticator, Microsoft Authenticator and similar apps.
 */
const crypto = require('node:crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[\s=-]/g, '');
  if (!/^[A-Z2-7]+$/.test(clean)) throw new Error('Invalid base32 secret');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(key, counter, digits = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = mac[mac.length - 1] & 15;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, '0');
}

function totp(secret, timeMs = Date.now(), { step = 30, digits = 6 } = {}) {
  return hotp(base32Decode(secret), Math.floor(timeMs / 1000 / step), digits);
}

/**
 * Check a code, allowing one 30-second step of clock difference either way.
 * Returns the matched time step (to block reuse of the same code), or null.
 */
function verifyTotp(secret, code, { timeMs = Date.now(), window = 1, step = 30 } = {}) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) return null;
  const key = base32Decode(secret);
  const now = Math.floor(timeMs / 1000 / step);
  for (let w = -window; w <= window; w += 1) {
    const expected = Buffer.from(hotp(key, now + w));
    const given = Buffer.from(code.trim());
    if (crypto.timingSafeEqual(expected, given)) return now + w;
  }
  return null;
}

function otpauthUri(secret, account = 'admin', issuer = 'Adventure Park') {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

module.exports = { base32Encode, base32Decode, generateSecret, hotp, totp, verifyTotp, otpauthUri };
