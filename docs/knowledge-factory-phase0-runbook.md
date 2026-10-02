# Knowledge Factory Phase 0 runbook

## 1 October 2026: report-completeness fixes prepared locally, not released

The user chose **prepare without releasing**. No deployment, database migration,
supplier execution, client activation, price change or limit change belongs to
this step. The existing production deployments and consumed Basic test remain
unchanged. Missing owner type/share in the supplier's real UAT response has not
yet been diagnosed conclusively; no Basic re-execution is permitted.

Prepared changes preserve the current ownership registration date in both report
packages, retain missing booleans as unknown, retain numeric owner type codes
without inventing labels, and display missing amounts as "Not supplied", not R0.
Zero ownership shares and parcel portions are retained. Extent is no longer
labelled square metres without a verified supplier unit contract.

Full requests descending `dateRegister` order and pagination flags for the five
transfer and bond records. The migration guide documents v1 transfer ordering
using `TransferSortInput`; acceptance of the updated nested query still requires
supplier UAT validation. Its reviewed fingerprint is
`f9971f118b5793791cc1cd6cb10e60e23eefee3c3581b3cb62e0c0786bfe2e32`.
The field-fee ceiling remains 17,575 credits, but the fresh complexity is **not**
yet known. The earlier 17,718 estimate must not be reused as a fresh quote for
this changed query. Historical/saved Full quotes intentionally fail the exact
query gate after a future release.

A separate private Full diagnostic is prepared for property 383723 and the same
named executive, with immutable new claim/result IDs, an absolute 20,000-credit
approval ceiling and a fresh exact-query preflight before one execution. Actual
billing must also fit that fresh estimate. No retries occur after reservation,
even if validation or execution fails. Only numeric billing and field-presence
metadata are audited; raw owner/report data remains private and transient. This
does not create a customer report or approve product readiness. The original
Basic claim is never reset. The prepared Full approval expires at
2026-10-02T00:00:00Z; if release is deferred beyond that, obtain fresh user approval
and update the approval window before releasing.

Local verification covers JSON save/reload fidelity, missing vs zero values,
ordering, bounded histories, private field-presence diagnostics, separate claims,
and fail-closed budget/preflight checks. A synthetic two-page PDF was generated
and visually inspected; this is **not** a real supplier report or a production
database/download test. All 47 focused checks and the nine baseline tests passed;
both primary app and internal console production builds passed. Targeted ESLint
reported zero errors and one unchanged pre-existing effect-dependency warning in
the completed-reports workspace. No full `check:app` or release suite is claimed.
Remaining: release approval, supplier acceptance and
exactly one Full UAT execution, then real field/billing review before pricing,
limits and a named pilot are approved.

Reference: https://new.propertyintellect.co.za/graphql/portal/migration

## 1 October 2026: maximum-cost quoting and remaining parser rollout

Approved scope: release the upfront cost safeguard and shared billing parser to
the existing Vercel apps and Supabase production backend, retaining v1 supplier
UAT, disabled customer access, draft products, existing limits and permissions.
No migrations or paid supplier executions are part of this release.

The server computes a conservative maximum from fresh supplier field/type
complexity and the Cost Specification revised 22 September 2026 (pages 1–5).
Basic reserves 11,050 field-fee credits (one current transfer, up to 20 buyers).
Full reserves 17,575 (Basic plus five bond indicators, five valuation fields and
five historic transfers). Full's previous 143 complexity would imply a maximum
17,718 credits; this is illustrative, not a new live quote or verified Full bill.
Literal query SHA-256 allowlists reject changed fields/pagination and unknown
recipes. Only the pinned v1 UAT endpoint is permitted.

The internal cost check returns this estimate even when validation-only billing
is absent, without persisting it as supplier-validated cost evidence. Missing
supplier fees remain null. The product-readiness and commercial approval gates
are unchanged: estimates alone cannot approve or enable client reports.

For an otherwise approved package, saved estimates reserve the full undiscounted
maximum and carry immutable audit provenance (property, actor, intent, v1,
query fingerprint and fee schedule). Execution rejects old/versionless estimates,
validates fresh complexity and checks the new maximum against the saved quote
and current caps before requesting data. Missing or over-envelope execution
billing is flagged for review without an automatic retry. These are application
safeguards, not a supplier-enforced debit ceiling or a new concurrency reservation
system. Customer prices are separate and unchanged.

Supabase release scope is only `knowledge-factory-graphql`: its deployed entrypoint
and v1 contract were checked identical to the isolated checkout. Only the shared
cost parser differs from v27 (recognition of `extensions.billingCost`). FICA
functions, unrelated seller migrations and all permissions remain out of scope.
Recovery: prior Vercel deployments are retained; the previous Edge source was
captured read-only before deployment. No database push is needed.

Verified release: code `af3058402`; primary READY
`dpl_6prFLuc8V7qZErcoTGk7CAGX5wT5` aliased to `app.arch9.co.za`; internal console
READY `dpl_FLzXtG5zDh5UAGoV16zTAuRpXVJv` aliased to `admin.arch9.co.za`.
`knowledge-factory-graphql` v28 is ACTIVE with JWT verification enabled and its
three deployed files exactly match the reviewed source. Unauthenticated invocation
returns 401. FICA versions remain unchanged.

Both live internal cost-only checks for property 383723 passed: Basic complexity
109 + maximum fees 11,050 = 11,159 credits; Full complexity 143 + maximum fees
17,575 = 17,718 credits. Neither generated a report or stored validated billing
evidence. Database readback confirmed access still disabled, zero commercial
policies/results/purchase intents, seven unchanged cost-check rows and exactly
the original two diagnostic audit rows. No paid report execution was made.

42 focused tests, targeted ESLint, `check:quick` (nine baseline tests), and
`check:admin` passed. Both Vercel cloud builds completed successfully; no full
local `check:app` or broad release suite is claimed. The internal UI was verified
with fresh Basic/Full estimates and screenshots. The dormant client execution
path was tested locally, not invoked remotely because access remains off.

Remaining before client activation: confirm account plan/customer pricing and
limits, review real field completeness and UAT occurrence behaviour, then approve
a capped named pilot. Full execution and supplier production cutover need separate
approval. The one-use diagnostic remains consumed and must not be replayed.

## 1 October 2026: one Basic UAT report returned; billing parser corrected

The separately approved one-use diagnostic executed exactly one Basic report for
property `383723` on the pinned v1 UAT endpoint. Login, exact-query validation and
report execution each returned HTTP 200. A property and one UAT placeholder buyer
were returned privately. This is UAT sample data, not verified production ownership.
Owner type/share were not shown by the normalized report; the full field contract
still needs review before customer activation.

The apparent missing execution billing was on our side: v1 returns it under
`extensions.billingCost`, which our parser did not recognize. The captured numeric
evidence contained complexity 109, root surcharge 0, field surcharge 11,050,
credits 11,159, amount deducted 11,159, discount multiplier 1, root field count 1
and status `charged`. This is within the approved 12,000-credit envelope.
The illustrative value is R3.72 prepaid / R2.79 subscription, not an account invoice
or customer price. The actual supplier account plan remains unconfirmed.

The parser now recognizes that verified envelope. The diagnostic's read-only GET
reinterprets the captured billing without another supplier call or database write.
Its original immutable result audit remains `failed` (the original parser outcome);
the response identifies that original outcome alongside the corrected interpretation.
Do not edit the original audit, replay the test or manufacture a successful
cost-only validation. Cost-only validation still omitted complete billing.

Release evidence:

- Primary app: READY `dpl_AzTU1eMPS4Egzr63Kwfpc6igyofU`, code `2a17fb7d2`,
  aliased to `app.arch9.co.za`.
- Internal console: READY `dpl_HSbCMXvs2MAejBBeAA5ZHCffTBaF`, code `56633a178`,
  aliased to `admin.arch9.co.za`.
- Durable one-use claim `8af8e88f-8234-4ad9-bce7-4e8cf63c9bb3` and result
  `2bad8b60-9dc0-4a88-b52b-07627007c072`: one row each, immutable, no retries.
  Only operational/billing metadata was retained; no raw owner payload was saved.
- Post-test readback: Home Seekers access remains disabled; no package commercial
  policy, customer report results, purchase intents or validated v1 quotes were created.
  No credentials, limits, customer prices, permissions or migrations were changed.
- 29 focused checks and `check:admin` passed. Primary lint passed with 554 existing
  warnings and its nine baseline tests passed. The local Vite build was stopped after
  stalling during concurrent builds; the full local `check:app` is NOT claimed passed.
  The production Vercel builds completed successfully.

The shared parser source is corrected for Node and Edge consumers, but only the
Vercel release was deployed in this diagnostic task. Supabase Edge Functions were
not redeployed. Roll that correction out to the remaining consumers in the next
explicitly approved release.

Remaining work is v1 pre-execution quoting, field/commercial review and a capped
named pilot, not a supplier-access escalation. The UAT field surcharge matched the
20-buyer query ceiling despite one placeholder buyer being displayed: do not infer
live per-owner prices from sanitized UAT results or use one property's deduction
as every report's maximum. Confirm billing occurrence semantics, the account plan
and customer pricing before enabling client execution. Full report execution needs
its own test approval; none was made here.

## 1 October 2026: v1 UAT released; report billing still unverified

The primary Arch9 workspace, internal Operating Console and shared Supabase backend
now use the pinned `https://propinfoapi.co.za/uat/v1/graphql/` endpoint.
This is the supplier's UAT environment, NOT its paid production endpoint.
The report queries use `propertyReports.nodes`, filtered current-owner transfers and
buyer connections. Pricing evidence is bound to API version and the exact query.
Historical v0_1 evidence cannot approve v1 pricing.

Verified release evidence:

- Primary app: READY `dpl_JD8cUMiMoW26NKTSMQ5nPmK9GmMC`, aliased to `app.arch9.co.za`.
  Released code commit: `39e192002`.
- Internal console: READY `dpl_54EPxoPae2AJkcCoHatLL2qNRKAA`, aliased to `admin.arch9.co.za`.
  Its existing setup remains internal/executive-only; it is not mounted in the client portal.
- Supabase: `knowledge-factory-graphql` v27 and metadata-only
  `knowledge-factory-fica-discovery` v15 are ACTIVE with JWT verification enabled.
  FICA provider execution was not enabled or changed.
- Applied and verified the two Knowledge Factory migrations:
  `20261001091343_knowledge_factory_v1_cost_provenance.sql` and
  `20261001092313_knowledge_factory_versioned_cost_uniqueness.sql`.
  All five historical checks remain v0_1. RLS and the existing cost-table policy remain intact.
- Live internal console verified the pinned v1 endpoint and private credential configuration.
  Both Basic and Full cost-only queries for property `383723` were accepted by the supplier.
  Requests sent `GraphQL-Cost: validate` and `GraphQL-Billing: report`.
- Basic returned field complexity 79 and type complexity 30; Full returned 101 and 42.
  Both responses contained only `extensions.operationCost`, with no billing report,
  surcharge or total credits. These are NOT validated complete report prices.
  The two attempts were recorded as failed cost validations with their v1 query fingerprints.
- Post-release readback: Home Seekers report access remains disabled; no package policy or
  active pilot was created; zero report results and purchase intents exist.
  No customer price, spending limit, named-user permission or paid-report gate was changed.
- `check:app` and `check:admin` passed. The focused Knowledge Factory suite passed 42 checks,
  and FICA discovery passed 3 Deno checks. The broader test glob retains an unchanged FICA
  text assertion failure (`not configured` versus the existing provider-disabled wording).

Release interruption and resolution:

During the second database push, an unrelated migration file appeared after the dry run:
`20261001092402_seller_onboarding_access_scope.sql`. The push recorded its version while
the file was still empty. Independent live checks confirmed zero stored statements,
the old seller policies unchanged, and the proposed seller reader absent.
No seller access change was applied by this release. The user authorized notification and
coordination with “Audit Arch9 seller and buyer flow”; that chat verified the same result
and is preserving the empty entry while preparing its implementation under a fresh version.
Do not revert, edit or replay the recorded version. No seller source changes were deployed.

Next step:

Prepare one separately approved, minimal UAT execution test to inspect actual billing.
Cost-only complexity must not be treated as the total supplier charge or as zero surcharge.
Do not blame supplier access: login and both v1 query shapes were accepted.
Before package activation, confirm the billing envelope and credit plan, field contract,
customer pricing, explicit spending limits and named pilot permissions.
Use exact-file migration application for future releases from this concurrently edited
repository, not a broad push whose pending file list can change after the dry run.

### Prepared single Basic report test (not executed)

The user approved preparation and permits any convenient property, not only `383723`.
Use an already-known supplier property ID; `383723` is the available candidate, but its
existence has NOT been verified by the previous cost-only calls. Do not add a paid
property search, fallback report, pagination request or automatic retry to this test.
If an existing accessible UAT property ID is available, substitute only the `$id`
variable. An empty result is a test finding, not permission to buy another report.

Use the unchanged `packageReportQuery("basic_owner_lookup", "UatBasicReportTest")`
from the primary workspace. Its canonical query SHA-256 is
`5f6b55aea2fb7172cbf93e74c3a6179f8f2f094dbfa5880b9bf8fc65ff3ab736`.
It requests one property, one current-owner transfer and at most 20 buyers.
Keep `pageInfo.hasNextPage`; a truncated owner connection is not a complete report.
No Full package, historical owners, identity numbers or bond balances are requested.

Conservative arithmetic from the supplied cost specification (revised 22 September
2026), before discounts:

| Selected billable field | Maximum occurrences | Credits each | Maximum credits |
| --- | ---: | ---: | ---: |
| Transfer.DateRegister | 1 | 300 | 300 |
| Transfer.IsCurrentOwner | 1 | 50 | 50 |
| Buyer.BuyerName | 20 | 250 | 5,000 |
| Buyer.BuyerNameFix | 20 | 250 | 5,000 |
| Buyer.BuyerType | 20 | 30 | 600 |
| Buyer.Share | 20 | 5 | 100 |
| Total field surcharge | | | 11,050 |

The v1 schedule has no PropertyReports root surcharge. The last cost-only result
was field cost 79 plus type cost 30: complexity 109, NOT complete billing.
Combining that observed complexity with the bounded field schedule gives an estimate
of at most 11,159 undiscounted credits under the documented configuration.
At the published 30 prepaid credits per cent this is R3.72 rounded up;
at 40 subscription credits per cent it is R2.79 rounded up.
These conversions are illustrative credit values, not a verified account invoice,
customer price or additional-complexity allowance purchase.

Proposed test budget: 12,000 credits (illustrative R4.00 prepaid / R3.00 subscription).
This is a pre-execution approval envelope, NOT a supplier-enforced spending cap.
The specification does not document a request-level hard billing cap. Do not claim
that the supplier cannot charge beyond this budget or that UAT is necessarily free.

Execution requires separate explicit user approval acknowledging that limitation.
After approval, keep the execution private and separate from client purchase routes:

1. Confirm the exact pinned `/uat/v1/graphql/` URL, unchanged query fingerprint and
   approved property ID. Keep private credentials server-side; reject redirects.
2. Revalidate that exact query with `GraphQL-Cost: validate` and
   `GraphQL-Billing: report`. Require finite nonnegative field/type complexity and
   `complexity + 11,050 <= 12,000`; stop if these metrics are missing, the query
   differs, any reported undiscounted cost exceeds the budget, or new fees appear.
   Missing total validation billing remains an explicitly acknowledged diagnostic
   limitation; it must NOT approve a client report or create validated pricing evidence.
3. Make at most ONE report execution with `GraphQL-Cost: report` and
   `GraphQL-Billing: report`. No automatic retry on timeout, network failure or missing
   billing: a request may already have been charged. Do not buy additional complexity.
4. Inspect the private property response, current-owner completeness and actual
   billing envelope. Separate base credits, discounts and `amountDeducted`.
   Retain only whitelisted billing metadata and query/version provenance in normal
   logs; no credentials, tokens, raw supplier payload or owner details in logs.
5. Stop and report the outcome. Do not fabricate missing billing, mark this one
   property's actual charge as the maximum for every property, or enable client
   execution. Missing/partial property data or billing is a failed readiness test.

Preparation changed only this runbook: no diagnostic route was released, no supplier
call was executed, and no database, policy, limit, customer price or access was changed.
Offline checks: 12 existing billing-contract, package-recipe and pinned-UAT checks
passed; the exact query bounds, fingerprint and arithmetic above were checked locally.

Phase 0 creates the secure boundary only. It does not return live property, owner, FICA, KYC, or credit data. The sole supplier-facing action is a cost-only validation of the fixed, future map query.

## Deploy order

1. Apply `supabase/migrations/20260909185627_knowledge_factory_phase0_foundation.sql`.
2. Deploy the `knowledge-factory-graphql` Edge Function.
3. In Supabase Edge Function Secrets, set the following values. Do not add them to a repository, client bundle, or localStorage.

   ```text
   # UAT only. Use this for the pilot and development.
   KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT=https://propinfoapi.co.za/uat/v1/graphql/
   KNOWLEDGE_FACTORY_EMAIL=service-account-email
   KNOWLEDGE_FACTORY_PASSWORD=service-account-password
   ```

4. Verify the supplier account is contractually permitted to use the requested operations and that the organisation has an active data-processing basis.
5. Create the organisation entitlement and named-user permission only after that review. The records are disabled by default.

   ```sql
   insert into public.knowledge_factory_organisation_access (
     organisation_id, enabled, allowed_operations, supplier_account_reference, activated_by, activated_at
   ) values (
     '<organisation UUID>', true, array['map_properties'], '<supplier account reference>', '<authoriser UUID>', now()
   );

   insert into public.knowledge_factory_user_permissions (
     organisation_id, user_id, allowed_operations, granted_by
   ) values (
     '<organisation UUID>', '<agent UUID>', array['map_properties'], '<authoriser UUID>'
   );
   ```

## Safe verification

Invoke the function as an authorised user with `action: "status"`. Once entitlement is approved, use `action: "validate_map_query"` with a specific business purpose and a small South African bounding box. It sends `GraphQL-Cost: validate`, so the vendor should calculate cost without returning property data.

Every allowed or denied validation attempt is recorded in `knowledge_factory_audit_log`. The table is immutable; it deliberately stores only operational metadata and cost fields, never the supplier payload.

## Supplier endpoint policy

Use the pinned v1 UAT endpoint for development and the controlled pilot. The legacy `https://propinfoapi.co.za/live/uat/graphql/` UAT URL retires on 30 October 2026. The migrated API rejects v0_1, legacy and `latest` endpoints for package cost validation; configure `/uat/v1/graphql/` in both private environments. The [supplier migration guide](https://new.propertyintellect.co.za/graphql/portal/migration) describes the v1 query changes.

When production is approved, replace only the server secret with the pinned explicit version:

```text
KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT=https://propinfoapi.co.za/live/v1/graphql/
```

The endpoint remains an Edge Function secret. No supplier URL, email, password, bearer token, or GraphQL query is configured in a browser environment variable.

## Phase 1 boundary

Phase 1 is implemented as the fixed `map_properties` execution query and the internal map UI. It preserves the 25-result cap, South Africa and viewport limits, explicit purpose capture, named-user permission check, per-user rate limit, cost audit, and no raw supplier payload retention. Enable the browser UI only with `VITE_KNOWLEDGE_FACTORY_MAP_ENABLED=true` and a browser-restricted `VITE_GOOGLE_MAPS_API_KEY`.

Do not enable `property_summary`, `property_report`, `fica_kyc`, or `credit_check` until their data-minimisation, lawful-basis, consent, retention, and role policies have been approved.
