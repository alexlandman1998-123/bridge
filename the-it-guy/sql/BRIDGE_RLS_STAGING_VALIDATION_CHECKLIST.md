# Bridge RLS Staging Validation Checklist

Use this after:
- `/Users/alexanderlandman/the-it-guy/the-it-guy/sql/bridge_rls_emergency_open_staging.sql`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/sql/bridge_rls_pack_1_safe.sql`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/sql/bridge_rls_phase_1_internal_only.sql`

This is for staging only.

## 1. Before You Run Anything

- confirm you are on staging, not production
- confirm `/auth` still works for internal users
- confirm you have at least one test user for:
  - `developer`
  - `agent`
  - `attorney`
  - `bond_originator`
  - `client`
  - `admin`
- keep `/Users/alexanderlandman/the-it-guy/the-it-guy/sql/bridge_rls_emergency_open_staging.sql` ready

## 2. Immediate SQL Sanity Checks

Run these first after applying an RLS pack:

```sql
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'developments',
    'units',
    'transactions',
    'transaction_participants',
    'documents',
    'transaction_required_documents',
    'transaction_comments',
    'transaction_events',
    'transaction_handover',
    'client_issues',
    'client_portal_links'
  )
order by tablename, policyname;
```

```sql
select proname, prosecdef
from pg_proc
where proname like 'bridge_%'
order by proname;
```

Expected:
- `bridge_*` access helpers exist
- access helpers used for scoped RLS show `prosecdef = true`
- policies exist on the expected tables

## 3. Internal User Smoke Tests

### Developer

- can load dashboard
- can open assigned developments
- can open units and transactions in those developments
- can edit development settings
- can edit main transaction stage
- can manage handover
- can manage snags
- can upload documents

Must fail:
- should not see unrelated developments

### Agent

- can load dashboard
- can open assigned transactions
- can edit main transaction stage on assigned transactions
- can upload documents
- can request documents

Must fail:
- should not see full development-wide data unless assigned through a transaction
- should not edit finance lane directly
- should not edit attorney lane directly

### Attorney

- can load assigned matters
- can edit attorney subprocesses
- can upload legal documents
- can comment internally/shared

Must fail:
- should not edit main transaction stage directly
- should not manage handover
- should not manage snags

### Bond Originator

- can load assigned matters
- can edit finance subprocesses
- can upload finance documents
- can confirm signed OTP received

Must fail:
- should not edit main transaction stage directly
- should not manage handover
- should not manage snags

### Admin

- can access everything
- can still read/write all scoped tables

## 4. Client Portal Compatibility Tests

If you are using token-based client portal access:

- open an existing client portal link
- confirm overview still loads
- confirm documents still load
- confirm onboarding still loads
- confirm handover still loads
- confirm snags still load
- confirm client can still:
  - upload a document
  - add a comment
  - submit/update onboarding
  - log a snag

If any of those break:
- revert immediately using `/Users/alexanderlandman/the-it-guy/the-it-guy/sql/bridge_rls_emergency_open_staging.sql`
- do not continue to production-style client RLS yet

## 5. Table-Level Checks

Run these with a staging user from each role if possible:

```sql
select count(*) from developments;
select count(*) from units;
select count(*) from transactions;
select count(*) from transaction_participants;
select count(*) from documents;
select count(*) from transaction_required_documents;
```

You are looking for:
- internal users seeing only scoped rows
- admin seeing all rows
- no empty app states caused by accidental denial

## 6. Known Risk Checks

Check specifically for:
- recursion / stack errors on `transactions`, `transaction_participants`, `development_participants`
- silent empty results on dashboard cards
- document rail/cards showing zero items unexpectedly
- transaction comments/events disappearing
- client portal showing blank sections

## 7. Stop Conditions

Stop and rollback immediately if:
- internal dashboards return empty everywhere
- clicking into transactions starts returning blank states
- token-based client portal stops loading
- uploads/comments/snags stop saving
- SQL starts returning permission denied on basic reads

Rollback file:
- `/Users/alexanderlandman/the-it-guy/the-it-guy/sql/bridge_rls_emergency_open_staging.sql`

## 8. After Validation Passes

Only after staging is stable:

1. tighten client-facing tables
2. replace anon-open client portal access with token-aware or authenticated client access
3. remove remaining staging-only open policies
4. re-run this checklist
