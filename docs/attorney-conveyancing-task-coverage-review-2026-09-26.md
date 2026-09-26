# Attorney conveyancing task coverage review — 26 September 2026

## Decision and scope

The requester has set the instruction trigger: **an uploaded OTP makes the instruction actionable**. The current signed-OTP completion path sets the transfer instruction to `ready_for_acceptance`; firm acceptance and primary-attorney allocation remain later steps. Confirm in the next workflow pass whether "uploaded OTP" means any uploaded OTP or a verified signed OTP, and whether "actionable" means visible for firm acceptance or editable legal work. This review does not change that behavior.

This is a read-only task-level comparison for South African property sale transfers and their linked bond registration and seller-bond cancellation. It examines the canonical task catalogue, generated matter plan, party-specific document requirements, and task mutation rules. It covers standard variations by dimensions and representative combinations rather than claiming that a finite list covers every possible conveyancing instruction. Deceased estates, court and insolvency transfers, subdivisions, and share transactions are treated as exception routes requiring their own professional review.

## Current implementation

- Canonical catalogue: `the-it-guy/src/constants/attorneyWorkflowStages.js` defines **27 transfer**, **17 bond**, and **19 cancellation** tasks: 63 total. The earlier 73-task note is historical.
- Active task selection: `the-it-guy/src/services/attorneyWorkflow/matterWorkflowPlanService.js` always includes transfer; bond requires bond or hybrid finance; cancellation follows the captured seller-bond/cancellation decision. It changes transfer tasks for tax route, SARS query/payment indicators, non-resident seller review, cleared-trust-funds security, and freehold/no-HOA clearance.
- Party and property evidence: `the-it-guy/src/services/attorneyWorkflow/attorneyDocumentRequirementsResolver.js` adds buyer/seller individual, company, trust, bond, cancellation, development, commercial, sectional-title, HOA, and VAT document requests. `scenarioRequirementsEngine.js` scopes these to each party. These requests are separate from the 63 task identities.
- Task outcomes: the attorney can mark a task complete, completed externally, not applicable with a reason, or reopen it. The work packet describes evidence and dependencies, but the current `bridge_update_attorney_workflow_step_v3` mutation validates actor/lane, active plan, status, visibility, and reasons for external/not-applicable outcomes; it does **not** validate the declared input, document, evidence, or prior-task completion policies. The transfer tax gate is a specific application-side exception before `lodgement_ready` and `lodged_at_deeds_office` are marked `completed`.

## Representative generated task plans

The table is from a local call to `buildMatterWorkflowPlan` with an otherwise confirmed resale/freehold/transfer-duty profile. Counts are planned tasks, not completed work or legal readiness.

| Matter facts | Planned attorney tasks | Task-level observation |
| --- | --- | --- |
| Cash; company sells to company; no seller bond | Transfer 23 | Company authority/FICA changes document requests, not task identities. |
| Cash; individual seller has a bond; company buyer | Transfer 23 + cancellation 19 | Seller-bond cancellation is independent of buyer finance. |
| Bond; bonded individual seller; company buyer | Transfer 23 + bond 17 + cancellation 19 | All three lanes appear. |
| Hybrid; trust seller and buyer; seller bond | Transfer 23 + bond 17 + cancellation 19 | Trust authority/FICA changes document requests, not task identities. |
| Cash; foreign individual buyer | Transfer 23 | Foreign-buyer flag does not add a task. |
| Cash; non-resident company seller, review explicitly enabled | Transfer 24 | One generic withholding-review task is added. |
| Cash; sectional title | Transfer 24 | Levy/HOA review remains; body-corporate documents are separate. |
| Cash; HOA estate | Transfer 24 | HOA documents are separate. |
| Commercial; zero-rated going concern | Transfer 22 | VAT/exemption evidence replaces duty submission/payment tasks. |
| Cash; deceased-estate seller | Transfer 23 | No estate-specific task or evidence route is generated. |
| Cash; cleared trust funds | Transfer 22 | Payment-security-review task is omitted. |

For a freehold/no-HOA case, the levy/HOA task is omitted. If HOA applicability is unknown, the task remains for attorney review. Task counts are affected by tax sub-questions such as a SARS evidence request or duty payment requirement.

## Practical comparison and findings

### 1. The ordinary sale sequence is represented

The transfer lane covers instruction and source agreement review, party FICA, title and seller-bond review, tax, municipal and levy clearances, property compliance, document preparation, signatures, payment security, lodgement, registration, and closeout. The bond lane covers bank instruction, conditions, documents/signing, guarantees, lodgement/registration, and bank closeout. The cancellation lane covers bank/account/notice details, figures, guarantees, consent/signing, simultaneous lodgement, settlement, and closeout. This is a usable baseline for the two example matters in the request. South African deeds law requires tax proof for transfer and generally requires an existing mortgage bond to be cancelled or released before transfer; the code models these as transfer and cancellation work streams. Sources: [Deeds Registries Act, sections 56 and 92](https://www.gov.za/sites/default/files/gcis_document/201505/act47of1937.pdf), [SARS transfer-duty guide](https://www.sars.gov.za/guide-for-transfer-duty-via-efiling/).

### 2. Entity and capacity variants are mostly document-level, not task-level

Company and trust buyers/sellers receive registration/authority/representative and beneficial-ownership document requests. The core task list remains a generic `Review & Approve Buyer/Seller FICA` and generic signing tasks. A company sale may require additional corporate approval depending on whether the property is all or the greater part of the company's assets; a trust trustee cannot act without the Master's written authority. The current task plan has no distinct decision to check those conditions before accepting signatures. A document request can support the review, but its existence does not itself prove approval. Sources: [Companies Act](https://www.gov.za/documents/companies-act), [Master of the High Court trust guidance](https://www.justice.gov.za/master/trust.html), [FIC beneficial-ownership guidance](https://www.fic.gov.za/wp-content/uploads/2024/08/PCC-59-Beneficial-ownership.pdf).

The scenario profile also permits `close_corporation`, `estate`, and `other`, plus multiple buyer/seller parties. `scenarioRequirementsEngine.js` explicitly warns for types outside individual/company/trust and does not substitute an entity checklist. That is a safe warning, but it leaves the attorney without a structured exception route. A close corporation can be normalized to company in a legacy fact resolver while the per-party scenario engine treats it as unsupported; this deserves a consistent decision.

**Priority: high** for estate and other unsupported seller/buyer types; **medium** for adding explicit authority decisions to supported company/trust cases.

### 3. Foreign and marital variants need explicit applicability decisions

`foreignBuyer` is captured by the routing profile, but neither the generated task plan nor the attorney document resolver adds a foreign-buyer task. The scenario profile stores individual marital regime, including community of property, customary and foreign regimes, but the active tasks remain generic FICA/signing reviews. SARS's current TDC01 guide has distinct purchaser identity/passport and tax-number fields for foreign individuals; South African deeds rules can require different marital-status treatment. These should be explicit review questions with evidence appropriate to the facts, not an automatic assumption that every foreign buyer needs the same documents. Sources: [SARS TDC01 guide, effective February 2026](https://www.sars.gov.za/td-ae-02-g02-guide-for-transfer-duty-via-efiling-external-guide/), [Deeds Registries amendment on marital status](https://www.gov.za/documents/deeds-registries-amendment-act-1).

Non-resident **seller** withholding is represented only when `transferTaxDecision.sellerNonResidentReview` is manually set to `yes`. The task is a single review, not a structured decision about applicability, directive, withholding amount, payment, and proof. SARS distinguishes individual/company/trust sellers and provides NR02/NR03 steps. Source: [SARS non-resident seller guide](https://www.sars.gov.za/guide-to-amounts-to-be-withheld-when-a-non-resident-sells-immovable-property-in-south-africa-sa/).

**Priority: high** for non-resident seller applicability and evidence; **medium** for foreign-buyer and marital-capacity prompts.

### 4. Tax routes exist, but exceptional routes need finer tasks and validation

The attorney confirms a transfer-duty, VAT, zero-rated-going-concern, exempt, or needs-advice route. The plan branches accordingly. This is directionally correct: SARS says a sale is generally subject to VAT **or** transfer duty, based on the seller and whether the property is supplied in the course of an enterprise, and zero-rating a going concern has additional conditions. Sources: [SARS VAT versus transfer-duty FAQ](https://www.sars.gov.za/faq/faq-can-the-sale-of-a-property-be-subject-to-both-vat-and-transfer-duty/), [SARS VAT 409 guide](https://www.sars.gov.za/wp-content/uploads/Ops/Guides/Legal-Pub-Guide-VAT03-VAT-409-Guide-for-Fixed-Property-and-Construction.pdf).

At task level, VAT, going concern and other exemption routes share one `Verify VAT / Exemption Evidence` task. A going concern needs its own factual test and agreement/evidence; an inheritance or divorce exemption is a different basis. SARS also documents different transaction sequences for divorce and inheritance. The current route does not capture those distinctions as tasks. Sources: [SARS going-concern interpretation](https://www.sars.gov.za/wp-content/uploads/Legal/Notes/LAPD-IntR-IN-2012-57-Sale-Enterprise-Part-Going-Concern.pdf), [SARS transfer-duty sequence scenarios](https://www.sars.gov.za/types-of-tax/transfer-duty/scenarios-of-sequence-of-events/).

**Priority: high** for separating tax-exemption reasons and going-concern proof; the existing SARS receipt check is a useful common milestone.

### 5. Clearance and property variants are present but have narrow triggers

Municipal rates clearance and sectional-title/body-corporate or HOA levy clearance are represented. The evidence resolver also includes electrical, gas, electric-fence and other certificates as applicable. Municipal clearance and sectional-title levy certification can be registration prerequisites; applicable property certificates have their own regulatory or contractual basis. Sources: [Municipal Systems Act section 118](https://lawlibrary.org.za/akn/za/act/2000/32/eng@2021-11-01/provision/chp_11__sec_118), [Sectional Titles Act section 15B](https://www1.saflii.org/za/legis/consol_act/sta1986189.pdf), [Department of Employment and Labour electrical CoC statement](https://www.gov.za/news/media-statements/employment-and-labour-electrical-installation-laws-and-certificate-compliance).

The profile recognises `share_block` and normalises many agricultural/commercial descriptions to freehold, but the task plan does not create specific review routes for a share-block interest, title restrictions/servitudes, or agricultural subdivision/undivided-share consent. These should be explicit exceptions, because they may change the legal instrument rather than simply add another document. Source: [Subdivision of Agricultural Land Act](https://www.gov.za/sites/default/files/gcis_document/201505/act-70-1970.pdf).

**Priority: high** for identifying non-ordinary title/instrument routes before applying an ordinary sale checklist.

### 6. Completion and lodgement claims can outrun supporting proof

The operational contract says tasks may need inputs, documents, evidence confirmation, and completed dependencies. The actual task mutation does not check those policies. It can record `completed` on a planned task with no linked evidence or completed predecessor. External completion and not-applicable require a reason, which is enforced. The specific transfer-tax gate blocks ordinary `completed` actions on `lodgement_ready` and `lodged_at_deeds_office` until its tax tasks are complete. That gate is **not called for `completed_externally` or `not_applicable` on those same lodgement tasks**, even though external completion counts as progress. The path also does not validate municipal/levy proof, signed packs, current cancellation figures, or the readiness of linked bond/cancellation lanes. The cancellation catalogue describes checking figures expiry and simultaneous lodgement; the mutation path does not enforce those conditions.

This may be a deliberate professional-discretion policy. It still means task completion and percentage progress must not be presented as certified legal readiness. A practical implementation choice is to require explicit attorney attestation with recorded reasons at key milestones, with hard checks only for objective prerequisites and configurable exceptions.

**Priority: critical** before using any completion/readiness indicator as a lodgement or registration assurance.

## Task-level coverage verdict

| Variation | Task coverage | Remaining decision |
| --- | --- | --- |
| Cash versus bond/hybrid | Core lane selection works | Clarify cash security evidence and any bank-specific conditions. |
| Seller bond present/absent | Separate cancellation lane works | Validate unknown status and current figures before lodgement. |
| Individual/company/trust buyer or seller | Core tasks plus scoped documents | Add explicit capacity/authority decisions where consequential. |
| Multiple or mixed parties | Party-scoped document metadata | Verify every party and representative was reviewed before signing. |
| Foreign buyer / foreign marriage | Generic individual tasks | Add conditional identity, tax-entry and capacity review prompts. |
| Non-resident seller | One optional tax task | Model applicability, directive/withholding/payment proof by seller type. |
| Sectional title / HOA | Clearance task plus documents | Check the right issuing body and validity. |
| VAT / going concern / exemption | Conditional tax tasks | Separate legal bases and required proof. |
| Deceased estate / insolvency / court order | Generic transfer plan | Create a reviewed exception route or hold ordinary workflow. |
| Share block / agricultural subdivision / unusual title rights | Generic transfer plan | Determine whether the transaction is an ordinary deeds transfer at all. |

## Verification and limits

- Local direct plan generation produced the representative plans above. A further **1,296 synthetic combinations** crossed cash/bond/hybrid finance, individual/company/trust buyer and seller, seller bond yes/no, freehold/sectional/HOA tenure, four tax routes, and non-resident seller review yes/no. They produced **32 distinct task plans**. Basic invariants for required lanes, duplicate tasks, duty-submission selection, and the non-resident-review flag had **zero failures**. This was a pure model call, not an end-to-end routing or legal correctness test, and did not create or change a matter.
- `attorney-mvp-phase3-acceptance.test.mjs` passed: 6 scenarios, 221 task checks, 884 outcome checks. `attorney-task-operational-contract.test.mjs` passed for 63 tasks. `scenarioRequirementsEngine.test.js` and `transferTaxDecisionService.test.js` passed: 14 tests.
- Three older checks currently fail because they assert retired task keys such as `guarantees_requested`, `rates_clearance_received`, and `levy_clearance_requested`: `matter-workflow-plan.test.mjs`, `attorney-mvp-discretion.test.mjs`, and `attorney-workflow-scenario-alignment.test.mjs`. They need updating to the current catalogue before they can serve as a reliable regression gate. This review did not alter them.
- No live matter, database, attorney session, bank workflow, SARS submission, or Deeds Office process was tested. No legal practitioner has signed off the completeness of the task catalogue. The referenced law and agency guidance support the identified branches but do not amount to a case-specific legal opinion.

## Recommended next review order

1. Agree the meaning of OTP upload/actionable and trace every upload route into the incoming queue.
2. Decide whether the active checklist should show conditional capacity/tax/property exception tasks, or show an explicit reviewed exception panel linked to the generic task.
3. Set the minimum facts that must be known before an attorney can confirm the matter profile; keep provisional work available while facts are unknown.
4. Define which milestones are professional attestations and which have enforceable evidence or cross-lane prerequisites.
5. Review a scenario matrix with a practising South African conveyancer, bond attorney, and cancellation attorney, then update the catalogue/tests together.
