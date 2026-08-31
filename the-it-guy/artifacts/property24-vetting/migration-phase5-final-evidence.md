# Property24 migration final verification

Status: **VERIFIED**

Generated: 2026-08-31T10:42:26.607Z

Agency: 31382 (exdev)

## Summary

- Checks passed: 62/62
- Duplicate agent mappings: 0
- Duplicate listing identities: 0
- Duplicate sync rows: 0
- Duplicate image rows: 0
- Unexpected images: 0
- Verified images: 14/14

## Listings

| Property24 # | Type | Property24 status | On portal | Arch9 status | Images |
|---:|---|---|---|---|---:|
| 100314793 | Sale | Active | true | active | 4 |
| 100314816 | Sale | Active | true | active | 6 |
| 100314819 | Rental | Rented | false | withdrawn | 2 |
| 100314820 | Sale | Sold | false | sold | 2 |

## Agents

| Property24 agent | Source reference | Property24 status | Arch9 mapping | Arch9 login |
|---:|---|---|---|---|
| 77959 | ARCH9-AGENT-001 | Active | active | external mapping only |
| 77968 | ARCH9-P24-TEST-001 | Active | active | external mapping only |
| 77969 | ARCH9-VET-JON-SNOW | Inactive | inactive | external mapping only |
| 77970 | ARCH9-VET-PAULY-SHORE | Inactive | inactive | external mapping only |

## Duplicate-protection rerun

- Status: COMPLETE
- Listings created: 0
- Stale media rows: 0
- Images uploaded again: 0
- Images reused: 14

## Failed checks

None.

This verification was read-only against Property24, Arch9 database records, and Supabase Storage.
