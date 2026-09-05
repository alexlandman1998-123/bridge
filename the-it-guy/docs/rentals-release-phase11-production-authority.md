# Rentals release readiness — Phase 11 controlled production authority

Phase 11 does not run a production command. It binds a passing Phase 10 preflight receipt to a named production-release approval:

```sh
node scripts/rentals-release-phase11-production-authority.mjs
```

The authority must name the exact release commit, source-chain digest, canonical production project, rollback reference, and the complete controlled operation set: database migrations, application deployment, and post-release smoke checks.

The resulting record is handed to a separately approved production operator. This repository gate never executes a live database mutation or deployment.
