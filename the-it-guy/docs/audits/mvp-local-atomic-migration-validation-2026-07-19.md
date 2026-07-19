# Local atomic migration validation — 19 July 2026

## Current result

The local validation could not be executed on this host because Docker is not installed or running. Supabase CLI reports it cannot connect to the Docker daemon, and no local PostgreSQL server is available.

This is a local-host prerequisite failure only. No staging or production connection was attempted.

## Disposable harness prepared

Run the following after Docker Desktop is started:

```sh
./scripts/mvp-local-atomic-migration-validation.sh
```

The harness creates a temporary directory, copies only `supabase/`, starts an unlinked local Supabase stack, runs `db reset --local --no-seed`, and probes the atomic schema/RPC contract. It then stops the temporary local stack with `--no-backup` and removes its temporary directory.

It never uses `--linked`, staging credentials, or production credentials.

## Expected current outcome

Until the planned reconciliation migration exists, the harness should fail its contract test because `transactions.mandate_packet_id` is absent. That is an expected validation finding: it proves the historical atomic migration is not independently complete.

After the reconciliation migration is authored, the same harness must pass before any staging deployment is considered.
