# Apper build prompt: Adventure Park backend

Copy everything between the two lines below into Apper's app builder as your first message. It describes the same backend that this repository already has, so both stay consistent. Build it step by step if Apper asks, and check each part with the checklist at the end.

---

Build a secure, private back office for **Adventure Park**, a river rafting, luxury camping and guest house business on the Badrinath Highway, near Shiv Mandir, Shivpuri, Rishikesh, Uttarakhand, India.

**Business details** (use exactly these everywhere):
- Name: Adventure Park
- Address: Badrinath Highway, Shivpuri, Near Shiv Mandir
- Phone / WhatsApp: +91 87555 42743
- Email: adventurepark661@gmail.com
- Instagram: adventure_park771
- Tagline on receipts: "Where Rishikesh Gets Wild."
- Office hours 7:00 AM to 10:00 PM. Rafting 7:00 AM to 5:00 PM.
- Rafting season September to June (rafting closed July and August). Camping and guest house open all year.
- Currency: Indian rupees (₹), Indian number format (₹1,500, ₹10,800). Time zone: Asia/Kolkata.

## 1. Data tables

**Bookings**
- Reference (text, unique, format `AP-` plus 6 letters/digits without 0, O, 1 or I, generated automatically)
- Name (required, 2 to 80 letters, spaces, dots, apostrophes or hyphens; Hindi letters allowed)
- Phone (required, Indian mobile stored as +91XXXXXXXXXX, or international +country format)
- Email (optional, valid email)
- Activity (required, one of the activities below)
- Date (required; not in the past; at most 1 year ahead; rafting dates in July or August are rejected)
- People (required, whole number 1 to 60)
- Message (optional, up to 1000 characters)
- Estimated price (text, calculated, see pricing)
- Status: New, Contacted, Confirmed, Completed, Cancelled (default New)
- Private notes (owner only)
- Created at, updated at

**Receipts**
- Receipt number (unique, format `AP-YYYY-NNNN`, for example `AP-2026-0001`, counting up per year and **never reused**, even after a receipt is deleted)
- Linked booking (optional)
- Client name, client mobile, client email
- Booking date and time (default now), arrival date, service
- Lines: 1 to 10 lines of description, Pax (1 to 500), Rate (whole rupees), Amount = Pax × Rate
- Total (sum of amounts), Advance received (0 to total), Balance (total minus advance)
- Secure share link token (long random value, 32 characters) and link expiry (1 year)
- Created at, created by

**Audit log** (read-only): time, user, action (login, failed login, booking changed, receipt created, emailed, deleted, exported), details.

## 2. Price list (fill rates automatically, owner can change them)

| Activity | Weekday (Mon to Fri) per person | Saturday and Sunday per person |
|---|---|---|
| River Rafting 12 km (Marine Drive to Shivpuri) | ₹500 | ₹600 |
| River Rafting 16 km (Shivpuri to NIM Beach) | ₹800 | ₹960 |
| River Rafting 26 km (Marine Drive to NIM Beach) | ₹1,500 | ₹1,800 |
| River Rafting 36 km (Kaudiyala to NIM Beach) | ₹2,500 | ₹3,000 |

- Luxury Camping, per person per night: quad or triple sharing ₹1,500 to ₹1,800, double sharing ₹1,800 to ₹2,200. Children aged 6 to 11 pay 50% of the adult price. Prefill ₹1,500.
- Guest House AC Room (8 rooms), per room per night: July to September ₹1,200; October to January ₹1,500 to ₹1,600 (prefill ₹1,500); February to June ₹2,200 to ₹2,500 (prefill ₹2,200).
- "Something else / custom group trip": no fixed price.

Estimated price for a booking = rate for the date × people, for example "₹3,840 (4 × ₹960 per person, weekend price)". Rafting uses the weekend rate on Saturday and Sunday. When a receipt rate differs from the price list, show a warning such as "line 1 rate ₹1,100 is different from the website price ₹1,500".

## 3. Public booking form endpoint

Provide one public form or API endpoint that the website can send bookings to, with the fields above. It must:
- validate every field on the server exactly as described (never trust the browser)
- ignore any other fields, and silently drop submissions where a hidden field named `website` is filled (spam bots)
- allow at most 8 submissions per visitor per hour
- never reveal stack traces or internal errors
- return the booking reference and estimated price

## 4. Automations

1. **New booking:** email the owner (adventurepark661@gmail.com) with all details, the estimate and a WhatsApp link `https://wa.me/<customer number>`. If the customer gave an email, send them a confirmation with the reference, activity, date, people, estimate, the line "We will call or WhatsApp you from +91 87555 42743 to confirm your slot and the final price", and "We only confirm bookings from our official number and email. We never ask for your card PIN, OTP or passwords." Send at most 3 confirmations per email address per day, and never include the customer's free-text message in emails to customers.
2. **Receipt saved:** email the receipt PDF to the client (if they have an email), with the secure link in the email. If the receipt is linked to a booking that is New or Contacted and the advance is more than ₹0, set the booking to Confirmed.
3. **WhatsApp button** on each receipt opens `https://wa.me/<client number>?text=` with: receipt number, service, arrival date, total, advance received, balance payable at the venue, and the secure receipt link.

## 5. Receipt PDF (A4), matching the Adventure Park sample

- Dark green header band (#213D2E) with "Adventure Park" in large white bold text, the address and "Phone / WhatsApp: +91 87555 42743 | adventurepark661@gmail.com" below it; "BOOKING RECEIPT" and "Where Rishikesh Gets Wild." on the right; a thin orange stripe (#F0A043) under the header.
- Rows with grey labels and bold values, separated by thin lines: Receipt no., Client name (in capitals), Booking date ("3 October 2026, 2:27 PM"), Arrival date ("27 October 2026"), Service.
- Table with a teal header (#126B73): Description, Pax, Rate, Amount.
- Right-aligned totals: Total amount, Advance received, and Balance amount in bold on a light peach background (#FDE7C4).
- Grey note: "Thank you for booking with Adventure Park. Please carry this receipt and a valid photo ID on your arrival date. The balance amount is payable at the venue." (If the balance is ₹0: "Paid in full. No balance is due.")
- Bottom: "Client signature: ____" on the left; on the right the uploaded official stamp image above a line and "Proprietor / Authorised Signatory".
- Dark green footer band: "Adventure Park | Shivpuri, Rishikesh | Instagram: adventure_park771".
- Use a font that prints the ₹ sign.
- The secure share link opens the PDF without login, is not indexed by search engines, stops working when the receipt is deleted, and expires after 1 year.

## 6. Admin screens (owner only)

- **Bookings:** counts by status, search by name, phone or reference, filter by status and upcoming dates, change status, private notes, delete (with confirmation), export CSV, "Create receipt" button that prefills the receipt from the booking, and the receipt numbers linked to each booking.
- **Receipts:** new receipt form with live totals and a live preview, list with View PDF, Download PDF, Send receipt on WhatsApp, Copy receipt link, Email receipt and Delete, search, totals of all receipts, export CSV.
- **Official stamp:** upload a PNG or JPEG (up to 1 MB) that is stored privately and is never publicly downloadable.
- Must work well on a phone (cards instead of wide tables) and in light and dark mode.

## 7. Security (required)

- Only the owner can sign in. Use a strong password (at least 12 characters) and turn on two-factor authentication if Apper offers it.
- All data is private. No public read access to bookings, receipts, the stamp or the audit log. The only public parts are the booking form endpoint and the secure receipt links.
- Lock the account after repeated failed logins. Sign out automatically after 2 hours of inactivity.
- Validate all input on the server. Escape everything shown on screen. CSV exports must neutralise cells starting with =, +, -, @ so they cannot run formulas in Excel.
- HTTPS only. Record every login, change, export, email and deletion in the audit log.
- Daily backups of the data, if Apper offers them.
- Store as little personal data as possible, and let the owner delete a customer's data on request (India DPDP Act 2023).

---

## Checklist after Apper builds it

- [ ] A test booking appears in Bookings with the correct estimate (try a Saturday and a weekday).
- [ ] A rafting booking in July is rejected; a guest house booking in July is accepted.
- [ ] The owner and the customer both receive emails.
- [ ] A receipt gets number AP-YYYY-0001, the PDF matches the sample layout, and the totals are right.
- [ ] Deleting a receipt does not let its number be used again.
- [ ] The receipt link opens the PDF on a phone without logging in, and stops working after the receipt is deleted.
- [ ] Logged out, you cannot open any booking, receipt or stamp address.
- [ ] Five wrong passwords lock the login.

## Connecting the website to Apper

Once Apper gives you a public form or API address for bookings, send it to Claude. The website's booking form can then send bookings there instead of, or as well as, FormSubmit. The page's security settings must also allow that address.
