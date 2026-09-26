# Attorney Dashboard Metric Contract — Phase 1

Version: `attorney_dashboard_metrics_v1`

Status: definitions approved for implementation; runtime query changes begin in Phase 2.

## Purpose

This contract gives every attorney dashboard number one business meaning, one count grain, and an authoritative source. It prevents a missing source from appearing as a genuine zero and prevents detail-list limits from changing firm-wide totals.

The machine-readable contract lives in `src/services/attorneyDashboardMetricContract.js`.

## Rules shared by every metric

- Firm totals are scoped to the active attorney firm and the viewer's authorised role view.
- Matter counts use unique transactions unless a metric explicitly names another grain.
- Calendar boundaries use `Africa/Johannesburg`, with an inclusive start and exclusive end.
- A displayed `0` means the authoritative source loaded successfully and no qualifying records exist.
- Unavailable or incomplete sources must render an unavailable state, not `0`.
- A performance metric with too few qualifying records must render an insufficient-sample state.
- The matter-card detail limit may constrain the visible rail, but never an aggregate.
- Every count must reconcile to its drill-down using the same filters.
- Demo fixtures may create records, but runtime code must not invent production metric values.

## Summary and progress definitions

| Metric | Agreed definition | Authoritative source | Exclusions |
| --- | --- | --- | --- |
| `matter_progress` | Completed applicable workflow tasks divided by applicable tasks. In-progress tasks do not advance progress; not-applicable tasks leave the denominator. | Matter workflow plan plus `transaction_subprocesses` and `transaction_subprocess_steps.status`. | Tasks excluded by the confirmed matter plan. |
| `active_matters` | Unique non-terminal transactions with an accepted operational assignment to the firm. Paused operational matters remain active. | `transaction_attorney_assignments` and `transactions`. | Unaccepted incoming instructions and terminal/inactive transactions. |
| `awaiting_client` | Unique active matters with at least one unresolved client-owned action; each matter counts once. | Workflow tasks, open document requests, and signing state. | Completed, cancelled, superseded, or internal-only actions. |
| `lodgements` | Active matters with an applicable lodgement milestone due today or overdue and not completed. | Workflow steps plus task confirmation/due-date state. | Completed, externally completed, not-applicable, cancelled, or reversed milestones. |
| `registrations` | Active, unregistered matters forecast for the current week from an explicit target registration date. | `transactions.target_registration_date` and registration state. | Actual dates used as forecasts and matters without a target date. |
| `revenue_pipeline` | Expected professional fees on active matters. | Explicit professional-fee charges and accepted structured attorney-lead professional fees linked to converted matters. | Property value, VAT, transfer duty, disbursements, trust money, and unstructured quote totals. |

Revenue Pipeline is therefore not the sum of purchase prices, bond amounts, total transfer-cost quotes, or client money. If an explicit professional-fee component does not exist, the metric is unavailable for that matter.

## Attention definitions

| Metric | Agreed definition | Authoritative source |
| --- | --- | --- |
| `signatures_pending` | Matters with a sent signing request and at least one required signature still outstanding. | Envelope and signer state, reconciled to the signing workflow task. |
| `guarantees_outstanding` | Matters requiring guarantees where the canonical guarantee task is unresolved and due for follow-up. | Confirmed matter plan, workflow step, and task confirmation/due date. |
| `clearance_certificates` | Matters whose required clearance record is missing, expired, or not valid through expected registration. | Clearance workflow tasks, document requests, documents, and captured validity dates. |
| `client_documents` | Matters with an open, rejected, or resubmission-required buyer/seller/client document request. | `document_requests` and linked documents. |
| `invoices_overdue` | Matters with a published invoice past its due date and a positive balance after posted payments and credits. | `matter_financial_documents` and `matter_financial_entries`. |
| `matters_stalled` | Matters with no meaningful activity for 14 full days or an overdue blocking task. An external wait becomes stalled only after its follow-up date passes. | Transaction activity watermark and canonical task state. |

Attention metrics may not be derived solely from words in stage labels, `next_action`, or comments.

## Partner Analytics definitions

| Metric | Agreed definition |
| --- | --- |
| `partner_active_matters` | Unique active matters attributed to the stable referring partner organisation identifier. |
| `partner_new_this_month` | Partner-attributed matters accepted/instructed during the current Johannesburg calendar month. |
| `partner_revenue_pipeline` | The same professional-fee Revenue Pipeline definition, grouped by the stable referring partner identifier. |

Partner identity is resolved through `organisations`; names are presentation data and must never be grouping keys. Unattributed matters remain visible in firm totals but do not appear under an invented partner. Every partner metric is calculated over the full firm scope, not the latest matter-card sample.

## Matter Health definition

Metric key: `matter_health`.

Health buckets are mutually exclusive:

1. **Critical** — explicit critical risk, an overdue blocking task, or at least 21 days without meaningful activity.
2. **Attention** — an unresolved blocker requiring follow-up, a task due within three days, or at least 14 days without meaningful activity.
3. **On Track** — every remaining active matter.

Health uses the full firm scope and may consider workflow tasks, document requests, signing state, financial blockers, risk state, and meaningful activity. A missing keyword is not evidence that a matter is on track.

## Conveyancing Performance definitions

| Metric | Agreed definition |
| --- | --- |
| `average_days_to_registration` | Average calendar days from accepted attorney instruction to confirmed registration for registrations in the reporting period. Reversed registrations and records missing a boundary date are excluded and the sample size is shown. |
| `registration_success_rate` | Registered matters divided by attorney-accepted matters reaching a registered or cancelled terminal outcome in the reporting period. Active matters are not failures. |
| `average_document_turnaround` | Average calendar days from a client document request being sent to being approved, for approvals in the reporting period. |
| `registration_forecast` | Active, unregistered matters grouped by explicit target registration date into this week, next week, and this month. |
| `matter_distribution` | Each active matter contributes once according to its primary legal assignment lane. Secondary shared assignments do not inflate the denominator. |

## Drill-down parity

Every metric implementation must return or support the same filters used by its drill-down. The visible total and the number of unique matters in the opened list must match. Pagination affects displayed rows, never the reconciled total.

## Phase handoff

- Phase 2 implements progress refresh and aligns Active Matters with the accepted-operational definition.
- Phase 3 replaces attention keyword searches with the authoritative records above.
- Phase 4 implements partner identity and professional-fee revenue aggregation.
- Phase 5 moves health and performance aggregation to the firm-wide database snapshot.
- Phase 6 proves scale, parity, monitoring, and controlled rollout.

No database schema, production data, or dashboard calculation is changed by Phase 1.

## Phase 6 local release gate

The attorney dashboard now has a database-paged metric drill-down. It uses the
same authoritative snapshot population as each card, includes registered and
cancelled terminal outcomes, and refuses to return a default unfiltered page
when its unique-matter count does not reconcile. The legacy snapshot API names
remain stable, but their implementations are wrapped with an active firm-lead
membership check; unchecked implementations are no longer executable by
authenticated clients. Dashboard telemetry records source failures and count
parity issues without matter IDs or client details.

Before any environment rollout, obtain approval to apply the new migration to
the named environment. Then verify the four guarded snapshots deny a signed-in
user from a different firm, load a representative firm in each role view, and
compare displayed card counts to the first drill-down page's total. Check a
registered/cancelled performance cohort, empty-source states, and large-firm
page latency. Only then release the UI to a pilot firm and watch
`metric_source_assurance_failed`, `metric_drilldown_failed`, and
`metric_drilldown_slow` events before widening access.

The 2,000-matter PGlite fixture is a local scale/parity regression, not a
staging or production performance measurement. No remote migration, pilot
activation, or deployment is implied by this local gate.
The initial attention, revenue, and performance snapshots still construct
firm-wide matter-ID arrays inside Postgres; a live query-plan and payload-size
check on a representative large firm remains a release gate before broad use.
