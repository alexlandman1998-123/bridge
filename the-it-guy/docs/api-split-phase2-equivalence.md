# Phase 2 — Schema Equivalence

Run the read-only gate after Phase 1 has committed:

```bash
node the-it-guy/scripts/verify-schema-baseline-equivalence.mjs --strict
```

It compares production and rehearsal inventory counts for public relations, functions, policies, triggers, indexes, and required extensions. A mismatch fails the gate; do not start platform configuration or application traffic until every difference is explained and resolved.
