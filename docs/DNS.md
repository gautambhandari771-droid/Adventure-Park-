# DNS setup for the Adventure Park website

These are the records to add at your domain registrar (GoDaddy, Hostinger, Namecheap, BigRock and others) or at Cloudflare. They point the domain to your server and get the free SSL certificate working. They also stop criminals from sending fake emails that look like they come from your domain.

In the tables, replace:

- `adventurepark.in` with your real domain
- `203.0.113.10` with your server's IPv4 address (shown in your hosting dashboard)
- `2001:db8::10` with your server's IPv6 address, if it has one (otherwise skip the AAAA row)

## 1. Point the domain to the server (required)

| Type | Name / Host | Value / Points to | TTL |
|---|---|---|---|
| A | `@` | `203.0.113.10` | 3600 |
| AAAA | `@` | `2001:db8::10` (only if your server has IPv6) | 3600 |
| CNAME | `www` | `adventurepark.in` | 3600 |

Caddy then gets the SSL certificate by itself, usually within a minute of DNS working, and sends `www.adventurepark.in` to `adventurepark.in`.

## 2. Allow only Let's Encrypt to issue certificates (recommended, security)

A CAA record tells every certificate authority that only Let's Encrypt, the one Caddy uses, may issue SSL certificates for your domain. This blocks anyone from getting a fake certificate elsewhere.

| Type | Name | Flags | Tag | Value |
|---|---|---|---|---|
| CAA | `@` | 0 | `issue` | `letsencrypt.org` |
| CAA | `@` | 0 | `issuewild` | `;` |
| CAA | `@` | 0 | `iodef` | `mailto:adventurepark661@gmail.com` |

## 3. Stop fake emails from your domain (recommended, security)

You use `adventurepark661@gmail.com` for email, so nothing should ever send email from `@adventurepark.in`. These records tell Gmail, Outlook and others to reject any email that claims to come from your domain. This protects your customers from booking scams and phishing.

| Type | Name | Value |
|---|---|---|
| MX | `@` | `.` with priority `0` (this "null MX" means the domain receives no email) |
| TXT | `@` | `v=spf1 -all` |
| TXT | `_dmarc` | `v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s; rua=mailto:adventurepark661@gmail.com` |
| TXT | `*._domainkey` | `v=DKIM1; p=` |

If you later want email at your own domain (for example `bookings@adventurepark.in` with Google Workspace or Zoho Mail), replace these with the MX, SPF and DKIM records your email provider gives you, and keep the DMARC record.

## 4. Google Search Console (for SEO)

1. Go to https://search.google.com/search-console and add a **Domain** property for `adventurepark.in`.
2. Google shows a TXT record like `google-site-verification=abc123...`. Add it:

| Type | Name | Value |
|---|---|---|
| TXT | `@` | `google-site-verification=...` (exactly as Google shows it) |

3. After it is verified, open **Sitemaps** and submit `https://adventurepark.in/sitemap.xml`.
4. Do the same in Bing Webmaster Tools (https://www.bing.com/webmasters), which also feeds ChatGPT search and Copilot. You can import the site straight from Google Search Console.

## 5. Protect the domain itself (strongly recommended)

- **Turn on 2-step verification** on your registrar account. Whoever controls the domain controls the website.
- **Turn on registrar lock** (also called "transfer lock" or "domain lock").
- **Turn on DNSSEC** if your registrar offers it. It stops attackers from faking your DNS answers.
- **Turn on auto-renew**, so the domain never expires and gets taken by someone else.
- Keep the WHOIS privacy option on.

## 6. Optional: Cloudflare

Cloudflare (free plan) adds protection against traffic floods (DDoS attacks). If you use it:

1. Move your domain's nameservers to Cloudflare and add the same records there.
2. Set **SSL/TLS mode** to **Full (strict)**.
3. The A, AAAA and CNAME records can be "Proxied" (orange cloud). Leave the TXT, MX and CAA records as they are.
4. Add `digicert.com` and `pki.goog` to the CAA records too, because Cloudflare uses them for its own edge certificates.

## 7. Check everything

When the records are added (changes can take up to a few hours), run this on your computer or server:

```bash
npm run check-dns -- adventurepark.in
```

It checks the address records, `www`, CAA, the anti-spoofing records, HTTPS, the HTTP to HTTPS redirect and the security headers, and tells you what is missing.
