'use strict';

/**
 * Turn on two-step login for the admin panel.
 * Usage: npm run setup-2fa
 */
const { generateSecret, otpauthUri, totp } = require('../src/totp');

const secret = generateSecret();
const grouped = secret.match(/.{1,4}/g).join(' ');
console.log(`
Two-step login setup for the Adventure Park admin panel

1. Open Google Authenticator or Microsoft Authenticator on your phone.
2. Tap "+", then "Enter a setup key".
3. Account name: Adventure Park
   Key:          ${grouped}
   Type:         Time based
4. Add this line to your .env file and restart the website:

ADMIN_TOTP_SECRET=${secret}

From now on, log in with your password AND the 6-digit code from the app.
Right now the app should show: ${totp(secret)} (it changes every 30 seconds).

Keep the key above somewhere safe (for example printed and locked away).
If you lose your phone, you need it to set up the app again.

Setup link for apps that accept it:
${otpauthUri(secret)}
`);
