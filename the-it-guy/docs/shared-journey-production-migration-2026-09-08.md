# Shared journey production migration receipt — 8 September 2026

User authorised deployment of the missing database functions after the production
Work tab and conversation displayed unavailable errors.

Target: Arch9 SaaS (`isdowlnollckzvltkasn`). Applied successfully:

- `20260908144636_shared_matter_journey_atomic_commands.sql`
- `20260908150256_shared_matter_journey_reader.sql`
- `20260908152512_shared_matter_journey_seller_session_reader.sql`
- `20260908153913_shared_matter_conversation.sql`

The migration API initially generated execution-time versions. After successful
application, exactly those four ledger records were mapped back to their repository
versions, with guards against collisions and unexpected history changes. No other
migration history was changed. Phase 7 reconciliation was not deployed or executed.

Verification:

- Existing prerequisite helpers and refresh table were present.
- Isolated reader and conversation SQL suites passed before deployment.
- Affected matter `0ecfe730-1c2f-49e1-ad5d-5407dcb3e08d` returns one lane and 36 tasks.
- Both public reader RPCs succeed in a rolled-back SQL session using the active firm
  attorney's identity and authenticated database role. This is a database access check,
  not a browser login or complete five-role live acceptance test.
- Anonymous requests without valid portal credentials are denied.
- All four new private tables have RLS enabled and no anon/authenticated SELECT grant.
- Advisor deltas concern intentional private tables with no client policies and
  security-definer public RPCs with explicit access checks. Existing unrelated warnings
  were not modified. See the [Supabase security-definer advisor](https://supabase.com/docs/guides/database/database-linter).

Remaining matter-specific restriction: firm acceptance is `awaiting_firm_acceptance`,
assignment is `pending`, and no individual attorney is assigned. The existing permission
function requires an active assignment to the acting attorney. The conversation reader
therefore returns no posting audiences for this attorney. Acceptance and allocation were
not changed by this deployment.

No task outcomes, existing messages, matter plans or assignment data were changed.
Production task writes and message sends were not tested by creating real activity.
