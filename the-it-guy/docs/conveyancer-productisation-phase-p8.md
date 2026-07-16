# Conveyancer productisation — P8 operational assurance

P8 makes the P6/P7 provider plane measurable, stoppable and safe to release. Provider automation remains optional: an active kill switch prevents inbound and outbound provider traffic while the existing manual evidence and reconciliation path stays available.

## Delivered

- Versioned global and firm telemetry policies covering queue depth and age, delivery success, dead letters, reconciliation, inbound review backlog and snapshot freshness.
- Durable operational signals and periodic firm/global health snapshots with explicit pass, warning and fail outcomes.
- Current alert state plus append-only, revisioned incident records. Firm administrators can manage their firm; platform administrators can coordinate organisation-wide and global incidents.
- Independent global, organisation, firm and integration-profile kill switches, separately scoped to inbound, outbound or both. Firm administrators can stop their own traffic immediately; platform administrators control every scope.
- Runtime, dispatcher and webhook enforcement. New outbound claims skip stopped scopes, direct provider calls fail closed, and inbound webhooks stop before payload storage.
- A protected operations monitor that evaluates every enabled firm and opens or resolves transport-health alerts.
- Immutable release candidates bound to commit, artifact, rollback, test, security and recovery hashes.
- Separate operations, security and legal decisions by three different platform administrators.
- A fresh passing global snapshot, no global stop, and a non-empty monitored population for production authorisation.
- Fifteen-minute, single-use deployment authorisations. Service tooling must consume the authorisation with the exact approved artifact hash while health remains green.
- Rollback evidence and an automatic global kill switch so recovery is deliberate and provider traffic cannot continue into an uncertain state.
- Cockpit visibility for stopped traffic, health failures and open operational alerts.

## Authority and safety model

Firm controls cannot affect another firm. Organisation and global controls require platform administration. Operational approval, security approval and legal approval cannot be supplied by the same person or by one person occupying multiple approval slots. Deployment tooling cannot approve a release; it can only consume a short-lived authorisation already issued by the human control plane.

No P8 signal, snapshot, alert, incident or release event creates matter facts, legal truth, financial approval or document evidence.

## Operations

Deploy `conveyancer-operations-monitor` and provision a distinct high-entropy `CONVEYANCER_OPERATIONS_MONITOR_SECRET`. Invoke it from a trusted scheduler with `x-p8-monitor-secret`; retain JWT verification and do not expose the secret in a browser or repository.

Run the monitor at least once per five minutes, matching the release freshness gate. Configure a firm policy before enabling its P7 transport control. Exercise firm, profile and global stops in both directions; verify queued commands remain queued, inbound payloads are not stored, and manual evidence remains usable.

Release tooling must call `bridge_record_conveyancer_release_activation` with the authorisation event, deployment reference and artifact hash. An expired, reused, rolled-back or hash-mismatched authorisation must halt deployment. Apply `bridge_rollback_conveyancer_release` if post-release assurance fails, investigate under an incident record, then create a new release candidate rather than reusing old authority.

## Pilot acceptance

- Telemetry agrees with direct P7 queue/inbox queries for the same window.
- Warning and failure thresholds open the expected alert; recovery resolves it.
- Firm stops affect only that firm; profile stops affect only that profile; the global stop affects all provider traffic.
- Three distinct users approve operations, security and legal evidence.
- Stale, failing, empty-production and globally stopped release gates remain closed.
- Exact artifact activation succeeds once; replay, expiry and hash mismatch fail.
- Rollback records evidence and activates the global stop.
- Cockpit users see a plain-language stopped or unhealthy state without losing manual continuity.

