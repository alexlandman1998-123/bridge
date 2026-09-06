# Phase 1 — Clean Schema Rehearsal

The rehearsal target is `rlavzicedrilmpaamviu`; it is not production and it is not the legacy staging project.

The capture is schema-only, checksum-verified, and stored outside Git. Required extensions must exist before replay: `btree_gist`, `pg_net`, and `pg_cron`.

Run the replay from a normal macOS terminal so its single transaction can finish without an agent-session timeout:

```bash
cd /Users/alexanderlandman/the-it-guy
node the-it-guy/scripts/rehearse-schema-baseline.mjs
```

Expected result: exit code `0`. Any non-zero result rolls back the entire schema transaction. After a successful run, Phase 2 compares object inventories and definitions with production. Never run this script against production or legacy staging.
