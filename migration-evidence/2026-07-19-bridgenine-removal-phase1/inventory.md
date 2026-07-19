# Bridgenine removal — Phase 1 inventory

Snapshot time: 2026-07-19T10:10:50Z  
Scope: read-only inventory and protected backups. No Vercel, DNS, Supabase, or application records were changed.

## Outcome

Phase 1 is implemented, with one explicit coverage exception: Supabase Auth reports 161 users but returns HTTP 500 for positions 153–161. The exporter backed up 152 readable auth users, including 24 records containing `bridgenine`, and recorded the nine unreadable positions in the evidence. The exposed database schema was scanned without errors.

The domain is not ready for detachment yet. It remains a live Vercel/DNS entry point, it still has active mail DNS, and production data contains many old-domain references.

## Live service inventory

| Dependency | Current state | Intended replacement | Owner / decision |
| --- | --- | --- | --- |
| `bridgenine.co.za` | Vercel domain; HTTP 307 to `www.bridgenine.co.za` | `arch9.co.za` | Vercel team `team_ezJ5RCE7qwTf14fw215IhPs5`; removal after Phase 4 verification |
| `www.bridgenine.co.za` | Vercel CNAME; HTTP 200 | `www.arch9.co.za` | Same Vercel team; appears on both `bridge-website` and `bridge-listings` API snapshots |
| `app.bridgenine.co.za` | Attached to Vercel project `bridge`; HTTP 200 | `app.arch9.co.za` | Same Vercel team |
| `admin.bridgenine.co.za` | Vercel CNAME; HTTP 200 | `admin.arch9.co.za` | Local `bridge-admin` project link is stale (Vercel 404); live owning project must be resolved before detachment |
| Supabase project | Linked project `isdowlnollckzvltkasn` (`Bridge9 SaaS`) | Existing Arch9 URLs | Local config still contains five old-domain redirect entries; live Management API allowlist was not independently readable |
| Email for `@bridgenine.co.za` | MX, SPF, and mail autoconfiguration TXT records are active | Decision required | Do not expire the domain or remove mail DNS until mailbox/forwarding ownership is confirmed |
| DNS zone | Afrihost-associated nameservers and SOA; Vercel web records | Arch9 DNS remains unchanged | Confirm who controls the Afrihost/DNS panel and lower TTLs before Phase 6 |

## Production data inventory

- Supabase Auth: 161 users reported; 152 readable; 24 readable users contain Bridgenine data; nine unreadable positions recorded.
- Structured database columns: 999 matching rows across 21 relations.
- JSON/JSONB payloads: 838 matching rows across 14 relations. These can overlap the 999 structured matches and must not be added together as a unique-row total.
- High-volume relations include `transaction_participants` (385), `transaction_role_players` (240), and `transactions` (240).
- Other affected areas include profiles, organisation users/branches, buyers, contacts, documents/signers, communication delivery history, leads, and signup intents.

The sanitized relation-level report is in `database-summary.json`. Full matching records are stored under the ignored `backups/` directory with mode `0600`; checksums are recorded in `backup-manifest.json`.

## Repository inventory

The post-implementation scan reports 39 matches across 28 files. Two matches belong to the new inventory script and one to the backup ignore rule. Active dependencies that Phase 2 must remove include:

- five Supabase redirect entries in `supabase/config.toml`;
- Vercel old-host redirects in `the-it-guy/vercel.json` and `apps/admin/vercel.json`;
- the runtime invite-origin compatibility branch in `transactionPartnerInvitationService.js`;
- the attorney showcase check in `attorneyDashboard.js`;
- old-domain defaults in staging/demo/seed scripts and `.env.example`.

Regression fixtures and historical documentation are listed separately in `repository-references.md` so Phase 2 can decide which references should be replaced by an inert test domain and which are intentionally retained.

## Protected backup procedure

Re-run from the repository root:

```bash
node --env-file=the-it-guy/.env.production.local scripts/inventory-bridgenine-phase1.mjs
```

The command is read-only against Supabase. It overwrites only the local evidence backup files and refreshes the sanitized summary/checksum manifest. The raw backup directory is gitignored because it contains production data and auth-user PII.

## Phase 1 exit decision

Inventory and backups: complete with documented auth API exception.  
Ready for Phase 2 code/config cleanup: yes.  
Ready to detach Vercel/DNS: no.

Before domain detachment, assign owners for:

1. resolving the live Vercel project behind `admin.bridgenine.co.za`;
2. confirming whether `@bridgenine.co.za` email must remain operational;
3. reviewing the nine Supabase Auth records that the admin list endpoint cannot serialize;
4. classifying the 999 structured and 838 JSON matches as migrate, expire, or retain as immutable history.
