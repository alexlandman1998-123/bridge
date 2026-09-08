# Shared journey — phase 2 plan adapter

`buildPlannedSharedMatterJourney` adapts the existing matter workflow plan and fully loaded lane snapshots to the phase 1 shared contract.

- Uses the existing routing profile, applicable task definitions, Work phase groupings and scenario requirement logic. It introduces no independent conveyancing checklist or legal rules.
- Finance, entity, marital, tenure and existing-bond facts continue through the existing scenario model. They can affect requirements rather than removing a whole task. Cash alone does not remove all guarantee checks.
- Stored active plans remain authoritative. A changed confirmed profile is flagged for review rather than silently replacing its plan.
- Persisted task outcomes win. Missing rows within a successfully loaded lane start as not_started; an unloaded lane throws instead of displaying invented zero progress.
- Unknown planned task keys, ambiguous phase mapping, invalid states and duplicate saved rows fail validation.
- Excluded tasks remain in `retainedHistory`, outside the active denominator. Excluded worked tasks are separately flagged. Nothing is deleted, reset or marked N/A by this adapter.
- Optional, explicitly supplied coordination links refer to stable task IDs and are advisory. No blanket simultaneous-lodgement dependency or blocking order is invented.
- Client labels currently use static catalog titles, never runtime comments or personal details. Plain-language wording can be refined without changing identity.
- `requirementsByTaskId`, review details and retained history are internal adapter outputs. Only the phase 1 audience projection is intended for shared display after server-side access checks.
- For legacy rows without a per-task revision, the supplied coherent matter revision is used as the task snapshot version. Atomic revision enforcement belongs to phase 3.

This is an additive integration layer. Existing screens, database writes and portal refresh have not yet switched over. No migration is required for this phase.

Run `node scripts/shared-matter-journey-plan.test.mjs` for six scenario checks against the existing Work model.
