'use strict';

/**
 * Create the ADMIN_PASSWORD_HASH value for your .env file.
 * Usage: npm run hash-password
 * The password is typed hidden and never stored anywhere in plain text.
 */
const readline = require('node:readline');
const { hashPassword } = require('../src/security');

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.includes(question)) rl.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

(async () => {
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    password = await ask('New admin password (min 12 characters): ');
    const again = await ask('Repeat password: ');
    if (password !== again) {
      console.error('Passwords do not match.');
      process.exit(1);
    }
  }
  try {
    const hash = await hashPassword(password);
    console.log('\nAdd this line to your .env file (keep the single quotes):\n');
    console.log(`ADMIN_PASSWORD_HASH='${hash}'\n`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
})();
