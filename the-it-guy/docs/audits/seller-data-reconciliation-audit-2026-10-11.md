# Seller data reconciliation audit

11 October 2026. Phase 4 belongs to the primary Arch9 workspace and its shared Supabase data. The read-only audit and correction packet are implemented. Existing production records remain unchanged: no case qualified for an automatic correction, and the Phase 2 transaction guard and Phase 3 profile reader are not yet released. Onboarding and document workflow changes remain later work.

## Production scope and results

The verified target is **Arch9 SaaS production**, project `isdowlnollckzvltkasn`. The final snapshot was collected at **10:38:14 SAST**, using one repeatable-read, read-only transaction. Demonstration flags, withdrawn/archived/sold listings and explicit rental markers exclude records from the active sale comparison. Metadata outside that scope remains available to resolve references; its private profile values are excluded.

| Check | Result |
| --- | ---: |
| Open non-demo sale listings | 169 |
| Current seller captures | 99 |
| Completed captures | 58 |
| Unfinished captures: sent / not started / in progress | 21 / 10 / 10 |
| Listings without a current capture | 70 |
| Active selling portal contexts linked to this scope | 15 |
| Non-demo seller leads / leads without a listing | 114 / 13 |
| Captures whose current fields disagree with their stored canonical projection | 53 |
| Listing seller displays differing from the current capture | 46 |
| Additional declared seller, finance or property-capture projection differences | 23 |
| Broken references in the scoped graph | 54 |
| CRM contact pairs requiring same-person confirmation before synchronisation | 3 |
| Non-demo, non-deleted transactions without a listing link | 154 |
| Explicitly linked non-demo transactions in the active sale scope | 0 |
| Automatic correction candidates | 0 |

Finding counts overlap. Unfinished or absent capture is a workflow state, not proof of a failed save. Thirteen leads without listings can be pre-listing journeys. Unlinked transactions can be independent deals; their seller facts cannot be compared with a listing journey until the correct relationship is confirmed. Names, emails, phone numbers and government IDs do not supply that relationship.

The broken references comprise **26 `seller_lead_id` references**, **26 `originating_crm_lead_id` references** and **2 lead-to-contact references**. The two listing columns can point at the same missing lead. The graph also reports **6 canonical roster paths without persisted person IDs** and **1 conflicting roster alias**, giving **61 scoped relationship/person findings**. There is no instruction to invent a replacement person ID or attach these records by matching contact details.

Per-listing status is **69 requiring capture** and **100 requiring review**. One of the 70 listings without capture also has a relationship review, so its overall status is review. Review includes unfinished capture, unconfirmed legal identity, representation differences and conflicting protected aliases in **21 captures**; it does not mean all 100 records should be overwritten. Supported type synonyms and equivalent yes/true consent values are normalised before identifying an alias conflict. Four journeys are flagged conservatively for document-copy preservation.

## Schema prerequisites

The hosted migration ledger contains `20261010215549` and `20261010225607`, and both guarded listing/capture save functions exist. This audit did not deploy them.

The ledger does **not** contain:

- `20261011065947_transaction_seller_atomic_saves.sql` — transaction seller saving guard and explicit participant source columns.
- `20261011073408_seller_current_profile_alignment.sql` — shared current transaction seller profile reader.

The corresponding transaction edit-context/save/profile functions and participant source columns are absent. `agency_client_profiles` and `agency_client_links` are also absent; their identity-index coverage is explicitly unchecked. Their absence does not justify creating another seller master or guessing links. Administrative SELECT access does not certify actor permissions, portal access or simultaneous browser saving.

## What is implemented

The existing `scripts/report-seller-data-ownership.mjs` entry point now exports a labelled read-only snapshot query and prepares an offline reconciliation packet. It reuses the ownership contract, relationship checker, current seller reader and transaction handoff adapters. The established `test:seller-existing-record-audit` command includes its executable checks.

The planner compares the displayed profile, stored aliases, declared seller facts, saved rosters, finance and property capture. It excludes operational listing address/type/price from restoration. It distinguishes absent capture, incomplete export and conflicting sources. A contact proposal requires a single completed capture, confirmed legal identity, preserved person IDs, agreement between explicit raw contact aliases and their canonical values, matching protected seller facts, correct relationships and revision/evidence fingerprints. A later timestamp alone cannot resolve a disagreement.

The public report contains references, paths and reasons. The private packet contains the captured source, proposed values, prior values, revisions and evidence fingerprints for review. Packet creation is exclusive, outside the repository, in an owner-only directory with mode `0600` files. The CLI supports no apply command, makes no network requests and does not rewrite its input. Signed copies, transaction decisions and pending changes are never repair targets.

Private evidence is stored at:

`/Users/alexanderlandman/.codex/private-audits/seller-alignment-2026-10-11-nlq8srm_/`

The final files are `snapshot-current.json`, `report-final.json` and `correction-packet-final.json`. The packet ID is `df8f38601057e2055e77a7f00225666958c0501ca88f51e0ea7232467a06cbe7`. These values are a point-in-time review packet, not approval to write them back. Older preliminary snapshots/packets in that private directory are retained separately.

## Verification and remaining work

- Reconciliation planner/CLI and actual PostgreSQL snapshot SQL: **20 passing tests**. They exercise stale hidden aliases, deliberate clearing, source disagreement, missing identity, scheme/finance boundaries, safe candidate recovery, partial exports, cross-agency links, missing guards, unlinked transactions, handoff review, redaction, complete review queues and private output safeguards. SQL fixtures verify unchanged records and signing evidence.
- Existing historical audit/document-review PostgreSQL checks: **11 passing tests**.
- Existing relationship graph: **22 passing scenarios**.
- Shared seller display and transaction party/handoff models: **21 passing tests**.
- Scoped lint: clean. This phase changes operational scripts, checks and documentation, so the frontend build was not repeated. The final-source production build/login probe recorded after Phase 3 remains a release prerequisite.

**Live reconciliation is pending.** First resolve the record-specific source/identity reviews. A separately requested release must verify the missing guards and compatible frontend, then exercise actor permissions and simultaneous hosted saves. Refresh the read-only snapshot afterwards. Any later approved correction must name exact candidates, check source/target revisions and evidence under the guarded transaction, preserve history, and verify before/after values. With zero safe candidates in this snapshot, no live backfill is proposed.
