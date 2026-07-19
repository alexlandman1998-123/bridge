# Bridgenine domain removal — Phase 5 detachment evidence

Executed: 2026-07-19 (Africa/Johannesburg)

## Outcome

Phase 5 removed all `bridgenine.co.za` web aliases from Vercel and then removed the root domain from the Vercel team so a future production deployment cannot silently recreate those aliases. Arch9 production services remained available throughout the change.

External authoritative DNS and mail records were intentionally not changed. Web detachment and mail/domain retirement remain separate operations.

## Pre-detachment routing

| Old host | Vercel source before removal | Project |
| --- | --- | --- |
| `bridgenine.co.za` | `bridge-website-mjzgh29ja-alexs-projects-f5496a21.vercel.app` | `bridge-website` |
| `www.bridgenine.co.za` | `bridge-website-mjzgh29ja-alexs-projects-f5496a21.vercel.app` | `bridge-website` |
| `app.bridgenine.co.za` | `bridge-qlk3e371d-alexs-projects-f5496a21.vercel.app` | `bridge` |
| `admin.bridgenine.co.za` | `bridge-admin-4stbkn7qj-alexs-projects-f5496a21.vercel.app` | `bridge-admin` |

Vercel also reported root/`www` project-domain metadata on the dormant `bridge-listings` project. Removing root-domain ownership cleared the durable domain association across all four projects.

## Changes applied

The four active aliases were removed first:

```bash
vercel alias rm app.bridgenine.co.za --yes
vercel alias rm admin.bridgenine.co.za --yes
vercel alias rm www.bridgenine.co.za --yes
vercel alias rm bridgenine.co.za --yes
```

The root domain was then removed from the Vercel team:

```bash
vercel domains rm bridgenine.co.za --yes
```

Vercel confirmed that the domain had been used by four projects and completed the removal successfully.

## Post-detachment verification

- Vercel domain inventory contains `arch9.co.za` and the separate typo-domain `brigenine.co.za`; it no longer contains `bridgenine.co.za`.
- `vercel domains inspect bridgenine.co.za` returns `Domain not found`.
- The Vercel alias inventory contains zero `bridgenine.co.za` aliases.
- `https://arch9.co.za/`: HTTP 200.
- `https://www.arch9.co.za/`: HTTP 200.
- `https://app.arch9.co.za/auth`: HTTP 200.
- `https://admin.arch9.co.za/login`: HTTP 200.
- `https://app.arch9.co.za/api/public/listings`: HTTP 200.
- The apex, `www`, `app`, and `admin` Bridgenine hosts each return HTTP 404 with Vercel `DEPLOYMENT_NOT_FOUND`.
- Vercel reported no main-application runtime errors in the post-detachment window.

## Rollback mapping

If the web aliases must be restored, re-register the root domain to `bridge-website`, then restore each alias to its recorded deployment:

```bash
vercel domains add bridgenine.co.za bridge-website
vercel alias set bridge-website-mjzgh29ja-alexs-projects-f5496a21.vercel.app bridgenine.co.za
vercel alias set bridge-website-mjzgh29ja-alexs-projects-f5496a21.vercel.app www.bridgenine.co.za
vercel alias set bridge-qlk3e371d-alexs-projects-f5496a21.vercel.app app.bridgenine.co.za
vercel alias set bridge-admin-4stbkn7qj-alexs-projects-f5496a21.vercel.app admin.bridgenine.co.za
```

## DNS and mail boundary

The authoritative Afrihost-associated zone remains unchanged:

- Apex A: `216.198.79.1`.
- `www` and `app` CNAME: `9f033bb8b8cb40ce.vercel-dns-017.com`.
- `admin` CNAME: `c8ea4662835e2d7f.vercel-dns-017.com`.
- MX: priority 10, `mx7692181129.spe.ucebox.co.za`.
- SPF: `v=spf1 include:spf.aserv.co.za +a +mx -all`.
- Mail configuration TXT remains present.

Observed web-record TTLs were approximately 28,650 seconds and mail-record TTLs approximately 14,250 seconds. They were not lowered before Phase 5 because DNS records were not changed. Phase 6 must confirm mail ownership and lower TTLs before removing web DNS or considering registration expiry.

The live Supabase Management API redirect allowlist is still not independently readable with the available credentials. The repository allowlist is clean and the canonical Arch9 callback passed in Phase 4, but live removal of any residual old redirect entries remains a Phase 6 verification item.

## Exit decision

Vercel web-domain detachment: complete.  
Arch9 production health after detachment: passed.  
Ready for controlled DNS cleanup and mail-retention decision: yes.  
Ready to expire the registration or remove mail DNS: no.
