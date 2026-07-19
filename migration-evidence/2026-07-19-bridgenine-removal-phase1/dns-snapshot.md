# DNS and endpoint snapshot

Captured 2026-07-19T10:10:50Z using public DNS and HTTPS requests.

## Zone-level records

- Nameservers: `ns.dns1.co.za`, `ns.dns2.co.za`, `ns.otherdns.com`, `ns.otherdns.net`
- SOA primary: `ns.dns1.co.za`
- SOA contact: `support.afrihost.com`
- SOA serial: `2026061901`
- Apex A: `216.198.79.1`
- MX: priority 10, `mx7692181129.spe.ucebox.co.za`
- SPF: `v=spf1 include:spf.aserv.co.za +a +mx -all`
- Mail configuration TXT: `mailconf=https://mail.bridgenine.co.za/mail/config-v1.1.xml`

## Web records

| Host | DNS target | HTTPS result | Replacement |
| --- | --- | --- | --- |
| `bridgenine.co.za` | A `216.198.79.1` | 307 to `www.bridgenine.co.za` | `arch9.co.za` (200) |
| `www.bridgenine.co.za` | CNAME `9f033bb8b8cb40ce.vercel-dns-017.com` | 200, Arch9 website | `www.arch9.co.za` (200) |
| `app.bridgenine.co.za` | CNAME `9f033bb8b8cb40ce.vercel-dns-017.com` | 200, Arch9 Platform | `app.arch9.co.za` (200) |
| `admin.bridgenine.co.za` | CNAME `c8ea4662835e2d7f.vercel-dns-017.com` | 200, Arch9 Command | `admin.arch9.co.za` (200) |

Observed TTLs were approximately 4,500 seconds. Recheck and lower them in the authoritative DNS panel before the DNS-removal window. The active MX/SPF records mean web sunset and domain/email retirement are separate decisions.
