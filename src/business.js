'use strict';

/**
 * Business facts used by the server (validation, emails).
 * The public pages in /public show the same facts; keep both in sync.
 */
const BUSINESS = {
  name: 'Adventure Park',
  phoneDisplay: '+91 87555 42743',
  phoneE164: '+918755542743',
  whatsapp: '918755542743',
  email: 'adventurepark661@gmail.com',
  address: 'Badrinath Highway, near Shiv Mandir, Shivpuri, Rishikesh, Uttarakhand, India',
  timeZone: 'Asia/Kolkata',
  // Months the river is open, 1 = January. July and August are closed for monsoon.
  openMonths: [1, 2, 3, 4, 5, 6, 9, 10, 11, 12],
};

/**
 * Activities that can be booked. The ids must match the <option> values
 * of the booking form in public/index.html (a test checks this).
 */
const ACTIVITIES = {
  'rafting-9km': 'River Rafting 9 km (Brahmpuri to NIM Beach)',
  'rafting-16km': 'River Rafting 16 km (Shivpuri to NIM Beach)',
  'rafting-24km': 'River Rafting 24 km (Marine Drive to NIM Beach)',
  'rafting-36km': 'River Rafting 36 km (Kaudiyala to NIM Beach)',
  camping: 'Riverside Camping & Bonfire',
  'rafting-camping': 'Rafting + Camping Package',
  other: 'Something else / custom group trip',
};

module.exports = { BUSINESS, ACTIVITIES };
