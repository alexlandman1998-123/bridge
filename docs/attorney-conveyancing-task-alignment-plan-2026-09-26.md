# Attorney conveyancing task alignment plan — 26 September 2026

## Outcome

For each matter, the attorney workspace should show the work required by its actual parties, property, tax treatment, buyer funding, and seller debt. The three attorney lanes should agree on handoffs and on whether the matter is ready for lodgement. An uploaded OTP makes the instruction actionable; later acceptance and allocation remain separate events. This plan covers workflow logic and tasks, not the visual design of the attorney module.

The [task coverage review](attorney-conveyancing-task-coverage-review-2026-09-26.md) is the baseline. Its current catalogue has 27 transfer, 17 bond, and 19 cancellation tasks. The review found good ordinary-sale coverage, several missing conditional decisions, and a critical gap between declared task prerequisites and enforced completion rules.

## Design rule for every variation

Do not build one checklist for every combination. Resolve a matter from independent facts, then compose its tasks from the same canonical catalogue. Each conditional task needs:

1. The exact fact or attorney decision that activates it, including what happens while that fact is unknown.
2. Its owner: transferring, bond, or cancellation attorney; party-specific responsibility where relevant.
3. Its prerequisite tasks, required input or evidence, and the decision that completes it.
4. Whether external completion or not-applicable is allowed, and what explanation or proof is required.
5. Any downstream milestone it blocks, including a handoff to another attorney.

The plan must distinguish **work completed**, **evidence reviewed**, and **attorney readiness attested**. A task count or percentage alone must never imply legal readiness.

## Phased delivery

| Phase | Result in the attorney workspace | Work to do | Exit check |
| --- | --- | --- | --- |
| **0. Agree the scenario contract** | Every incoming matter has a consistent set of facts and a visible "unknown / needs attorney decision" state. | Confirm the OTP upload event that opens actionable work; define party roles, entity type, residency, marital/capacity facts, ownership, property/title type, tax basis, cash/bond/hybrid funding, seller bond, and linked attorney instructions. Name who may confirm or revise each fact. Map the 63 current tasks to those facts and have a practising conveyancer, bond attorney, and cancellation attorney review the map. | Both example matters and the exception examples below can be expressed without guessing a missing fact. Unknown facts never silently become "no" or "not applicable". |
| **1. Make task state and gates trustworthy** | Attorneys can work from the uploaded OTP, while critical milestones reflect real prerequisites. | Trace each OTP upload path into the actionable queue; keep firm acceptance/allocation explicit. Apply the existing task contract in the authoritative update path for required inputs, evidence decisions, and dependencies. Close the `completed_externally` and `not_applicable` route around lodgement gates; permit a documented attorney override only where policy expressly allows it. Keep historical completed work when a corrected profile regenerates the task plan, and surface newly required or retired tasks for review. Refresh the three stale tests that refer to retired task keys. | A missing tax clearance, municipal/levy proof where applicable, signed pack, or linked cancellation/bond prerequisite cannot be represented as unqualified lodgement readiness. Reopening or changing a prerequisite withdraws readiness. Current focused task and mutation checks pass. |
| **2. Align party and signing tasks** | The task list tells the attorney whose authority and capacity must be checked before documents are signed. | Add conditional decisions for each individual, company, close corporation, trust, and multiple-party combination. Cover identity/FICA and beneficial ownership, company or CC representative and resolution, trust deed and trustee authority, individual marital/spousal or foreign-law capacity questions, and foreign buyer identity/tax-entry questions. Keep one per-party decision rather than duplicating the entire transfer lane. Route estate, insolvency, and other unsupported capacities to an explicit hold/review task until a reviewed specialist route exists. | A company or trust cannot pass signing readiness on generic FICA alone; every seller, buyer, and signatory has a resolved capacity decision. An unsupported party type is visible as an exception. |
| **3. Align funding and the three attorney lanes** | Cash, buyer bond, and seller bond produce the right independent tasks and coordinated handoffs. | For cash, resolve source and cleared-funds/payment-security evidence. For bond or hybrid funding, track bank instruction, conditions, signed bond pack, guarantees, and lodgement instructions. For an existing seller bond, track cancellation notice, account and bank, current settlement figures, guarantee allocation, consent, and simultaneous lodgement. Treat buyer finance and seller-bond cancellation as separate facts. Define each cross-lane handoff and what happens if figures expire or finance changes. | Cash/no seller bond has only the transfer lane. A bonded buyer and bonded seller has transfer, bond, and cancellation lanes. Transfer lodgement readiness requires the applicable bond and cancellation handoffs, not merely a completed transfer checklist. |
| **4. Align tax, clearances, and property conditions** | Tax and clearance tasks follow the actual legal basis and property, with evidence reviewed before lodgement. | Split transfer duty, ordinary VAT, zero-rated going concern, and each claimed exemption into distinct applicability decisions and proof. Model SARS queries, assessment/payment, and receipt or exemption evidence according to the route. For a potentially non-resident seller, resolve applicability, any directive, withholding/payment, and proof by seller type. Separate municipal, body-corporate, and HOA clearance decisions; capture issuer and validity. Add conditional certificate and title-condition reviews where the property facts require them. | Changing the tax basis removes the old route's open tasks and introduces the new route without erasing history. SARS, rates, levy, and title prerequisites cannot be skipped through a generic completion action. Each route has attorney-reviewed evidence appropriate to its basis. |
| **5. Add controlled specialist routes** | Unusual transactions are identified early and do not masquerade as an ordinary sale transfer. | Create reviewed routes for deceased estate, insolvency, court-ordered/divorce transfers, unusual title restrictions or servitudes, agricultural subdivision/undivided-share issues, and share-block or other transactions that may use a different instrument. Each route begins with an attorney classification decision; only add operational tasks after the relevant specialist confirms them. Keep a manual hold/exception path for rare facts not covered by a route. | Every known exception either has a signed-off specialist task path or a visible hold with an owner and reason. Ordinary lodgement readiness is unavailable while classification is unresolved. |
| **6. Prove the combinations and release safely** | Attorneys can use the aligned task plans on representative real-world combinations. | Turn the scenario matrix below into focused plan, update-path, and role/hand-off checks. Test profile corrections, missing evidence, external completion, not-applicable, and reopening. Run authenticated staging walkthroughs with all three attorney roles and professional review of the generated task packets. Release in controlled cohorts with a way to inspect old/new plan versions and reconcile live matters. | The agreed scenario matrix passes; professional reviewers sign off the task logic; no live matter silently loses completed work or acquires a false readiness state. Production data/migration/deployment steps occur only after separate approval. |

**First build slice:** phases 0 and 1, then two ordinary cases in phases 2–4: (a) company seller, company buyer, cash, no seller bond; (b) individual seller with an existing bond, company buyer using a new bond. This delivers a usable and testable core before opening specialist routes. Live SARS/bank integration, automated legal conclusions, and attorney UI redesign are outside this task-logic slice.

## Scenario matrix for acceptance

These rows are starting cases, not an exhaustive list. Each must also be tested when a relevant fact starts unknown and later changes.

| Scenario | Required lanes and conditional decisions |
| --- | --- |
| Company sells unbonded freehold to company; cash | Transfer only; both companies' authority, representatives and beneficial ownership; cleared funds/security; applicable tax and municipal clearance; signing and lodgement gates. |
| Individual sells bonded freehold to company; buyer takes bond | Transfer + bond + cancellation; seller capacity and FICA; buyer company authority; new-bond conditions/guarantees; existing-bond figures and consent; coordinated lodgement. |
| Trust sells sectional title to individual; cash | Transfer and cancellation only if seller has a bond; trustee authority, all relevant signatories, body-corporate levy evidence, cash security, and tax route. |
| Multiple sellers, one non-resident; foreign individual buyer | Per-party identity/capacity; seller withholding applicability and evidence; foreign buyer tax/identity questions; no assumption that the other seller shares the same tax treatment. |
| VAT vendor sells a claimed going concern | Specific going-concern basis and agreement/evidence review; SARS route appropriate to the confirmed basis; no transfer-duty payment task unless the route changes. |
| Claimed exemption, deceased estate, divorce/court order | Separate exemption reason and supporting proof; specialist authority/instrument route where applicable; hold until classification is resolved. |
| Share block, agricultural subdivision, or unusual title condition | Early instrument/title review and a specialist hold or reviewed path; no automatic ordinary deeds-transfer readiness. |

For each row, run cash/bond/hybrid and seller-bond present/absent only where those facts are legally and commercially coherent. Also test freehold, sectional title, and HOA clearance decisions; a party or tax fact changed after work begins; and the transfer, bond, and cancellation attorneys acting in different orders. This covers combinations without maintaining thousands of copied checklists.

## Phase 6 acceptance and controlled release

Run `npm --prefix the-it-guy run check:attorney-conveyancing` from the repository root. This checks the seven matrix rows, plan corrections, historical task retention, readiness withdrawal, party decisions, tax/clearance rules, funding handoffs, and specialist holds. The check uses local fixtures and does not change a remote database.

Generate the synthetic task packet for the practising reviewers with `cd the-it-guy && node scripts/attorney-conveyancing-acceptance.test.mjs --review-packet=<protected-output-path>`. It lists each scenario's branch facts and each generated task's lane, owner, description, and evidence requirements. The test verifies that every generated task has a reviewable catalogue definition. Keep the output with the review evidence; its generation does not itself constitute professional approval.

After an approved staging migration and deployment, use labelled staging demo matters for an authenticated walkthrough. The transferring, bond, and cancellation attorneys must each sign in with their own assigned account and record a reviewer, date, and evidence reference for their lane. Check OTP-upload actionability before firm acceptance, the party and specialist decisions, tax and clearance proof, cash and bond/cancellation branches, both handoff orders, expired cancellation figures, reopening, and a corrected profile after readiness. A practising reviewer for each lane must approve the generated task packet and record any exception. A test login or service-role query is not a substitute for the three role walkthroughs.

The read-only inspector reports stored and candidate plan versions, tasks added or retired, missing active task rows, retained historical completions, and any readiness recorded against a stale or unresolved plan:

```bash
cd the-it-guy
node scripts/inspect-attorney-conveyancing-matters.mjs --staging-matter=<labelled-demo-uuid> --require-clean
node scripts/inspect-attorney-conveyancing-matters.mjs --snapshot=<approved-read-only-export.json> --require-clean
```

An offline export has the form `{ "matters": [{ "id": "<uuid>", "routingProfile": { ... }, "lanes": [{ "laneKey": "transfer", "steps": [{ "step_key": "...", "status": "..." }] }] }] }`. Export only the cohort matters and protect the file as matter data. The inspector prints task keys and diagnostics, not party names or document content. `--staging-matter` is limited to the canonical staging project and a matter marked as demo data; neither mode updates task rows or routing profiles.

For a release decision, pass `--release-evidence=<reviewed-evidence.json>` with the snapshot. The evidence must record the current `planVersion`, exact 40-character source commit as `sourceRef`, `stagingMigrationReference`, approved `cohortMatterIds`, `maxCohortSize`, `scenarioMatrixApproved: true`, and `scenarioMatrixEvidenceReference`. Under both `professionalReviews` and `stagingWalkthroughs`, provide `transfer`, `bond`, and `cancellation` records. Each record needs a `reviewer`, valid `completedAt` date, current `planVersion`, and `evidenceReference`. The gate fails if an inspected matter differs from the approved cohort, was already lodged, has plan drift, lacks an active task row, shows unsafe readiness, or lacks a required review. A passing gate is a review artifact; production migration, data changes, deployment, and cohort activation require separate explicit approval.

## Sequencing and controls

- **One source of task truth:** change the existing task catalogue, plan builder, evidence resolver, operational contract, and authoritative mutation together. Version each plan. Avoid another parallel checklist that can drift.
- **Preserve matter history:** a new plan may add or retire tasks, but it must retain prior decisions, evidence, who acted, and when. Newly required tasks reopen downstream readiness where necessary.
- **Professional discretion stays explicit:** some legal judgments need an attorney's recorded decision; objective missing prerequisites should block a milestone. The policy for each task determines which is which.
- **Role and handoff clarity:** the transferring attorney owns overall transfer readiness; the bond and cancellation attorneys attest their own lane readiness. A cross-lane gate consumes those attestations and current evidence, including unexpired figures where relevant.
- **Release boundary:** the plan is a product/workflow proposal. Database migrations are append-only; applying them, changing live data, and deployment each require explicit approval in the implementation task.

## Legal sources for the branches

The branch definitions require practising South African conveyancers to review them against current law and matter facts. Primary references: [SARS transfer duty eFiling guide](https://www.sars.gov.za/guide-for-transfer-duty-via-efiling/), [SARS non-resident seller withholding guide](https://www.sars.gov.za/guide-to-amounts-to-be-withheld-when-a-non-resident-sells-immovable-property-in-south-africa-sa/), [SARS VAT fixed-property guide](https://www.sars.gov.za/wp-content/uploads/Ops/Guides/Legal-Pub-Guide-VAT03-VAT-409-Guide-for-Fixed-Property-and-Construction.pdf), [Master of the High Court trust guidance](https://www.justice.gov.za/master/trust.html), and [Deeds Registries Act](https://www.gov.za/sites/default/files/gcis_document/201505/act47of1937.pdf).
