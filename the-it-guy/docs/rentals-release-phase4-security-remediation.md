# Rentals release readiness — Phase 4 security remediation

Phase 4 documents and verifies the six unavoidable `SECURITY DEFINER` functions without granting browser clients direct write access to protected tables.

```sh
node scripts/rentals-release-phase4-security-review.mjs
```

Three exceptions are trigger-only history writers. Their execution is revoked from `public`, `anon`, and `authenticated`; they run only through their owning table trigger. Three exceptions are authorised transactional commands. Each has an `auth.uid()` check, branch-access check, `search_path = ''`, public/anon execute revocation, and an authenticated-only grant.

Every exception still requires an independent approval reference and timestamp in [`config/rentals-security-definer-exceptions.json`](../config/rentals-security-definer-exceptions.json). Do not set approval fields until a reviewer has confirmed the controls. This phase does not change a database or permit release application.
