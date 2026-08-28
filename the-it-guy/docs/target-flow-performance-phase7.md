# Target flow performance — Phase 7 operations

Phase 7 exposes the Phase 6 release gate in Platform Diagnostics. It listens to the existing `arch9:route-performance` browser event, reads the bounded session history, and shows coverage plus pass/fail counts for transactions, listings, listing detail, and lead detail.

The diagnostics panel can export a privacy-safe JSON evidence packet. The export contains normalized routes, aggregate timing and request counts, and recomputed budget verdicts. It excludes request URLs, filters, record identifiers, database errors, and arbitrary metadata.

Verify an exported packet locally:

```bash
npm run verify:target-flow-evidence-phase7 -- --input=/absolute/path/to/evidence.json
```

The verifier recomputes every verdict from raw measurements and exits non-zero for invalid, incomplete, or failing evidence. Neither the diagnostics panel nor the verifier contacts Supabase or creates a background query source.
