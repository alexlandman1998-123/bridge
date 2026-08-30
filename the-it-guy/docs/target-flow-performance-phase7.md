# Target flow performance — Phase 7 operations

Platform Diagnostics now shows the Phase 6 gate using only the existing
in-browser session history. It reports coverage and pass/fail counts for the
four target flows and can export a privacy-safe JSON evidence packet.

Validate an exported packet locally:

`node scripts/verify-target-flow-performance-phase7.mjs --input=/absolute/path/to/evidence.json`

The panel and verifier make no Supabase calls and do not start a background
timer. Evidence excludes URLs, record identifiers, database errors and
arbitrary metadata.
