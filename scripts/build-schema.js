'use strict';

/** Rebuild the JSON-LD structured data in public/index.html.  Usage: npm run schema */
const fs = require('node:fs');
const path = require('node:path');
const { schemaBlock } = require('../src/seo');

const file = path.join(__dirname, '..', 'public', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const re = /<!-- schema:start[\s\S]*?<!-- schema:end -->/;
if (!re.test(html)) {
  console.error('Could not find the schema markers in public/index.html');
  process.exit(1);
}
const updated = html.replace(re, () => schemaBlock(html));
fs.writeFileSync(file, updated);
console.log(updated === html ? 'Structured data already up to date.' : 'Structured data updated in public/index.html');
