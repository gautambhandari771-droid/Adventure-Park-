# Adventure Park, Shivpuri: website and booking system

The official website for **Adventure Park**, a river rafting and camping business on the Badrinath Highway, near Shiv Mandir, Shivpuri, Rishikesh, Uttarakhand.

- **Phone / WhatsApp:** +91 87555 42743
- **Email:** adventurepark661@gmail.com
- **Instagram:** [@adventure_park771](https://www.instagram.com/adventure_park771/)
- **Season:** September to June. Office 7 AM to 10 PM, rafting 7 AM to 5 PM.

## What is included

| Part | What it does |
|---|---|
| Public website | Home page with activities, season and timings, safety, FAQ, contact and map link. Works on phones and computers. |
| Booking form | Customers send a booking request. It is checked, saved, and emailed to you. Customers also get a one-tap WhatsApp button. |
| Admin panel | Private page at `/admin` where you log in to see bookings, mark them contacted, confirmed, completed or cancelled, add notes, search, export to Excel (CSV) and delete. |
| HTTPS (SSL) | Free certificates from Let's Encrypt, set up and renewed automatically by Caddy. |
| SEO | Google business info (address, phone, hours), share image for WhatsApp, Facebook and Instagram links, sitemap. |
| Privacy and terms | Simple privacy policy (India DPDP Act 2023) and booking terms. |

Built with Node.js, Express and SQLite. There are no third-party scripts, trackers or ads on the site.

## Security

No website can honestly be called "impossible to hack". This one follows current best practice so it is a hard target, and it keeps very little that is worth stealing.

**Protection built in**

- **HTTPS everywhere.** Plain HTTP redirects to HTTPS. HSTS tells browsers never to use plain HTTP again.
- **Strict Content Security Policy.** Only the site's own scripts can run, which blocks most cross-site scripting (XSS) attacks.
- **No clickjacking.** The site cannot be shown inside another website's frame.
- **SQL injection protection.** Every database query uses bound parameters.
- **Input validation.** Every form field is checked on the server for type, length, format and allowed values.
- **CSRF protection.** Other websites cannot submit forms or admin actions on your behalf (origin checks, SameSite cookies and a CSRF token).
- **Spam and abuse limits.** Booking requests, admin logins and general traffic are rate limited per visitor. A hidden trap field catches spam bots.
- **Strong admin login.** The password is stored only as a scrypt hash. The login locks after repeated failures. Sessions expire after 2 hours idle or 12 hours total.
- **Secure session cookie.** It uses `HttpOnly`, `Secure`, `SameSite=Strict` and the `__Host-` prefix, and the database stores only a hash of the session id.
- **Admin audit log.** Every admin login, change, export and delete is recorded.
- **Safe exports.** CSV exports are protected against spreadsheet formula injection.
- **Hidden errors.** Visitors never see error details or stack traces.
- **Less personal data.** Visitor IP addresses are stored only as a keyed hash.
- **No spam relay.** The site never sends email to addresses typed by visitors.
- **Hardened container.** It runs as a non-root user on a read-only filesystem, with all Linux capabilities dropped.
- **Image hotlinking blocked.** Other websites cannot embed your images (Cross-Origin-Resource-Policy).
- **Anti-fraud notice.** Customers are told to trust only your official number and email.

**About copying ("piracy")**

Anything a visitor can see in a browser can be copied. Text, images and page code are no exception. The site shows a copyright notice and blocks other websites from embedding your images. If someone copies your content you can file a copyright (DMCA) complaint with their host or with Google. Your important data, meaning the bookings and admin access, stays private on the server.

**What you must do to stay safe**

1. Use a long, unique admin password (16+ characters) that you use nowhere else.
2. Turn on 2-Step Verification for adventurepark661@gmail.com and for your domain and hosting accounts.
3. Never share the `.env` file. It holds your secrets.
4. Take backups (see below) and install server updates monthly.

## Before going live: check the content

All text is in `public/index.html`. Please check these points, since only you know them:

- [ ] **Activities.** The site lists four rafting trips: 12 km for ₹520, 16 km for ₹820, 26 km for ₹1,500 and 36 km for ₹2,500 per person. Saturday and Sunday prices are 20% higher: ₹624, ₹984, ₹1,800 and ₹3,000. It also lists riverside camping and a rafting + camping package. If you change the list, also update `src/business.js`, because a test checks that both match.
- [ ] **Start points, durations and rapid grades.** The 12 km trip is shown as Marine Drive to Shivpuri, the 26 km trip as Marine Drive to NIM Beach and the 36 km trip as Kaudiyala to NIM Beach. Durations and grades are typical values. Correct them to match your trips.
- [ ] **Camping prices.** Camping and the rafting + camping package say "Price on request". Add prices there if you want to show them.
- [ ] **Tagline.** I suggested "Ride the Ganga. Feel the wild." Change it in the hero section if you like.
- [ ] **Photos.** Real photos of your rafts, camp and team build trust. Put them in `public/images/` (JPG or WebP, under 300 KB each) and replace the illustration.
- [ ] **Logo.** `public/images/logo-mark.svg` is a starter logo (sun, mountains, forest and river). Replace it if you have your own.
- [ ] **Privacy policy and terms** in `public/privacy.html` and `public/terms.html`. Have them reviewed if you can.
- [ ] **GST.** You do not have a GST number, so none is shown. Add it to the footer if you register later.

## Going live (step by step)

You need three things:

| Item | Where | Approximate cost |
|---|---|---|
| A domain name, e.g. `adventurepark.in` | GoDaddy, Hostinger, Namecheap or BigRock | ₹500 – ₹1,000 per year |
| A small Linux server (VPS) with 1 GB RAM, Ubuntu 24.04, Mumbai or Bangalore region | DigitalOcean, AWS Lightsail, Hostinger VPS or Linode | ₹400 – ₹600 per month |
| A Gmail App Password for booking alerts | Your Google account | Free |

### 1. Point the domain to the server

In your domain's DNS settings add two **A records** pointing to your server's IP address. One is for `@`, the bare domain. The other is for `www`.

### 2. Secure the server and install Docker

Log in with SSH (use an SSH key, not a password) and run:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ufw unattended-upgrades git
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw allow 443/udp
sudo ufw --force enable
sudo dpkg-reconfigure -plow unattended-upgrades   # automatic security updates
curl -fsSL https://get.docker.com | sudo sh
```

### 3. Download the website and fill in the settings

```bash
git clone https://github.com/gautambhandari771-droid/Adventure-Park-.git adventure-park
cd adventure-park
cp .env.example .env
nano .env
```

In `.env` set these values:

- `DOMAIN` and `PUBLIC_URL` to your domain.
- `IP_HASH_SECRET` to a random value. Create one with the command written in the file.
- `ADMIN_PASSWORD_HASH`. Create it with the command below and paste the line it prints.
- `SMTP_PASS` to your Gmail App Password. Create one at https://myaccount.google.com/apppasswords after turning on 2-Step Verification.

```bash
sudo docker run --rm -it -v "$PWD":/app -w /app node:22-alpine node scripts/hash-password.js
```

### 4. Start it

```bash
sudo docker compose up -d --build
```

Wait a minute, then open `https://yourdomain`. The padlock means SSL is working. Caddy renews the certificate automatically.

### 5. Check it

- Send a test booking from your phone. It should appear at `https://yourdomain/admin`, and an email alert should arrive.
- Test your security headers at https://securityheaders.com and your SSL at https://www.ssllabs.com/ssltest/.
- Add the site to Google Search Console and submit `https://yourdomain/sitemap.xml`.
- Add the website link to your Google Business Profile and Instagram bio.

## Daily use

- **See bookings:** go to `https://yourdomain/admin` and log in.
- **Work a booking:** call or WhatsApp the customer with the links in the table. Change the status as you go (New, Contacted, Confirmed, Completed). Write private notes, such as the advance paid, in the notes box.
- **Export:** "Export CSV" downloads the list for Excel or Google Sheets.
- **Delete:** remove a booking when a customer asks you to delete their data.

## Backups

Bookings live in a SQLite database inside the Docker volume. Back it up weekly:

```bash
sudo docker compose exec -e BACKUP_DIR=/app/data/backups app \
  node --disable-warning=ExperimentalWarning scripts/backup-db.js
sudo docker compose cp app:/app/data/backups ./backups
```

Keep a copy somewhere else, such as Google Drive or a USB drive.

## Updating the website

After changing files, for example on GitHub, run this on the server:

```bash
git pull
sudo docker compose up -d --build
```

## For developers

```bash
npm install
cp .env.example .env                 # leave NODE_ENV unset for local development
npm run hash-password                # create an admin password hash
npm run dev                          # http://localhost:3000
npm test                             # unit and integration tests
```

Requires Node.js 22.13 or newer. It uses the built-in `node:sqlite`, so there are no native modules to compile.

```
server.js              Starts the server
src/app.js             Express app, security headers, static pages
src/config.js          Settings from environment variables
src/db.js              SQLite schema
src/security.js        Password hashing, sessions, CSRF and origin checks
src/validation.js      Booking form validation
src/business.js        Business facts and the list of bookable activities
src/mailer.js          Email alert for new bookings
src/routes/public.js   Booking API
src/routes/admin.js    Admin API (login, bookings, CSV export)
public/                Website pages, CSS, JS and images
deploy/Caddyfile       HTTPS reverse proxy
scripts/               Password hash and backup tools
test/                  Automated tests
```
