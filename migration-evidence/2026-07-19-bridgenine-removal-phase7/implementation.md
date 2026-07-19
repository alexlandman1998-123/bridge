# Bridgenine domain removal — Phase 7 closeout gate

Executed: 2026-07-19 (Africa/Johannesburg)

## Outcome

Phase 7 implemented a repeatable, fail-closed retirement audit and removed the five remaining Bridgenine URLs from the live Supabase Auth redirect allowlist. The closeout gate currently passes 13 of 19 checks and correctly reports `blocked`; it does not certify domain retirement while Phase 6 DNS cleanup, the mail-retention decision, and the nine unreadable Auth positions remain unresolved.

## Implementation

The closeout command is:

```bash
node scripts/verify-bridgenine-phase7.mjs
```

The audit verifies:

- Vercel root-domain ownership and alias removal;
- authoritative apex and subdomain web-record removal;
- an explicit `retain` or `retire` mail policy and the matching MX/SPF/mail configuration state;
- Arch9 website, app, admin, and public-listings health;
- shutdown of all four Bridgenine web hosts;
- active application/configuration repository references;
- explicit verification of the live Supabase Auth redirect allowlist;
- explicit resolution or acceptance of the nine previously unreadable Auth positions.

The command exits `0` only when every check passes and exits `2` when closeout is blocked. Optional attestations are deliberately explicit:

```bash
BRIDGENINE_MAIL_DECISION=retain \
BRIDGENINE_SUPABASE_ALLOWLIST_VERIFIED=true \
BRIDGENINE_AUTH_EXCEPTION_RESOLVED=true \
node scripts/verify-bridgenine-phase7.mjs --write
```

Do not set an attestation to `true` until the underlying action or risk decision is documented.

## Supabase Auth URL cleanup

The live production project `isdowlnollckzvltkasn` had 18 redirect URLs. The following five obsolete entries were removed:

- `https://app.bridgenine.co.za/auth/callback`
- `https://app.bridgenine.co.za/auth`
- `https://app.bridgenine.co.za/onboarding/profile`
- `https://admin.bridgenine.co.za`
- `https://admin.bridgenine.co.za/`

Post-change verification found 13 remaining URLs, zero Bridgenine entries, the site URL `https://app.arch9.co.za`, all Arch9 redirects intact, and all localhost development redirects intact.

If rollback is required, add the five URLs above back through Supabase Authentication → URL Configuration.

## Live data re-verification

The Phase 3 production verifier was rerun after the allowlist change:

- status: `verified_clean`;
- mutable Auth operations remaining: zero;
- mutable database operations remaining: zero;
- Auth users reported: 161;
- Auth users scanned: 152;
- unreadable positions: 153–161, each still returning HTTP 500;
- preserved-history relations remain intentionally unchanged.

## Current gate result

The certified rerun used `BRIDGENINE_SUPABASE_ALLOWLIST_VERIFIED=true` and produced:

- total checks: 19;
- passed: 13;
- failed: 6;
- status: `blocked`.

Passing checks include Vercel removal, all canonical Arch9 endpoints, all four retired-host HTTP checks, active repository cleanup, live operational-data cleanup, and the Supabase redirect allowlist.

## Blocking checks

1. The authoritative apex A record still exists.
2. The `www` CNAME still exists.
3. The `app` CNAME still exists.
4. The `admin` CNAME still exists.
5. Mailbox ownership has not been confirmed, so neither `retain` nor `retire` is attested.
6. The nine Supabase Auth positions that return HTTP 500 have not been resolved or formally accepted as a residual risk.

The four old web hosts currently return HTTP 404 because Vercel no longer owns or aliases the domain. DNS removal is still required to eliminate stale delegation to Vercel.

## Exit decision

Phase 7 closeout control: implemented.  
Live Supabase redirect allowlist cleanup: complete.  
Operational data and active repository state: clean.  
Final domain-retirement certification: blocked by the six checks above.  
Registration expiry or mail-record removal: not authorized.
