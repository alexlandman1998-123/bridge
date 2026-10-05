# Attorney conveyancing task audit appendix — 3 October 2026

This is the detailed working appendix to the [process audit](attorney-conveyancing-process-audit-2026-10-03.md). It covers every current catalogue definition: **49 transfer, 18 bond and 22 cancellation tasks in 14 workspace stages**. Task names and current requirement/confirmation wording below were read from the current local source; recommendations are audit proposals for professional review.

## How to read the records

Each record shows catalogue data/documents, declared evidence, default confirmation rows and the proposed minimum review. The extracted confirmation rows were built with the actual workbench model using each task's catalogue requirements. They are **not a screenshot or an exhaustive live matter's rendered checklist**. Real matters add party-scoped documents, facts, capacity decisions and financial/security/lodgement panels. Empty catalogue document lists therefore do not imply that the runtime requires no documents. No real client's data was used.

All three lanes retain the task lifecycle: not started, in progress, waiting, blocked and completed; permitted tasks can also record external completion or non-applicability with reasons. Critical milestones/evidence decisions have stricter operational/SQL rules. A confirmation answer of N/A is not necessarily a permitted task outcome or permission to pass readiness. Catalogue completion policies are guidance metadata; source database guards enforce their own objective milestone conditions. Ordinary completion may require an explanatory note while evidence remains outstanding.

The catalogue's default dependency is earlier required work, while concurrent work is permitted. Its default due dates are internal business-day targets, not legal time limits. Route, contract, issuer and statutory deadlines must take precedence where applicable. Every task retains its owning lane and authorised actor; same-firm handling does not erase the separate legal roles.

“Retain” means the task covers the right topic. “Detail” or “tighten” indicates a proposed change to the evidence/decision inside it. “Conditional” means resolve applicability from the actual matter and instruction. “Historical/dormant” means preserve history but do not add it to a new ordinary plan. These are audit assessments, not pass/fail legal certifications. The proposed minimum items include controls already represented in source; they are not all missing features or a request to add every item to every transaction.

## Legal and practice anchors

The recommendations below use these anchors for the legal questions specified; lender and instrument details still need review of actual instructions. Linked sources are not claimed to contain a universal task list.

| Question | Primary anchor and bounded implication |
| --- | --- |
| Agreement | [Alienation of Land Act](https://www.gov.za/documents/alienation-land-act-24-mar-2015-1035): review the applicable written agreement and execution/authority basis. The condition register proposed here is an audit design recommendation. |
| Spousal capacity | [Matrimonial Property Act, section 15](https://www.justice.gov.za/legislation/acts/1984-088.pdf): determine the actual applicable consent, execution and exceptions. A marital label alone is insufficient. |
| Company disposal | [Companies Act, sections 112/115](https://www.justice.gov.za/legislation/acts/2008-071.pdf): consider additional approval for an applicable all/greater-part disposal and its exceptions. Do not require a shareholder resolution for every company transaction. |
| Trustee authority | [Master's trust guidance](https://www.justice.gov.za/master/trust.html): written authority is required before acting as trustee. Deed, current trustees and authority must be reconciled. |
| Estate route | [Administration of Estates Act, section 42](https://www.justice.gov.za/legislation/acts/1965-066%20admin%20estates.pdf): sale and transfer to entitled beneficiaries have different certification routes. |
| FICA | [FIC Guidance Note 7B](https://www.fic.gov.za/document/guidance-note-7b-implementation-of-various-aspects-of-the-fic-act/): current risk-based due diligence, RMCP, client/controller identification, screening and conditional enhanced measures inform the firm's review. The task wording below is a proposed evidence interface. |
| SARS acquisition evidence | [Transfer Duty via eFiling guide](https://www.sars.gov.za/guide-for-transfer-duty-via-efiling/): declaration, supporting evidence, query/payment and receipt handling must match the actual acquisition. |
| VAT facts | [SARS VAT 409](https://www.sars.gov.za/wp-content/uploads/Ops/Guides/Legal-Pub-Guide-VAT03-VAT-409-Guide-for-Fixed-Property-and-Construction.pdf) and [SARS VAT Connect issue 6](https://www.sars.gov.za/businesses-and-employers/my-business-and-tax/newsletters/vat-connect-issue-6-september-2017/): enterprise facts and qualifying going-concern requirements matter; a leased residential property or going-concern clause alone does not establish zero rating. |
| Non-resident payment timing | [SARS section 35A guide](https://www.sars.gov.za/guide-to-amounts-to-be-withheld-when-a-non-resident-sells-immovable-property-in-south-africa-sa/): review applicability/directive and the withholding event, then the relevant remittance deadline. The main report explains the current pre-lodgement timing concern. |
| Rates | [Municipal Systems Act, section 118, hosted by DPSA](https://www.dpsa.gov.za/ethicsofficerguide/resources/lg/Municipal%20Systems%20Act_up%20to%20July2024.pdf): municipal certification, its statutory period and applicable exceptions need a reviewed route. |
| Sectional title | [Sectional Titles Act, section 15B, hosted by CSG](https://csg.dlrrd.gov.za/ACT95OF1986.pdf): consider body-corporate certification, paid/provided-for sums and applicable scheme/right questions. It is not the same as municipal certification. |
| Electrical/local water | [Electrical regulations](https://www.labour.gov.za/DocumentCenter/Regulations%20and%20Notices/Regulations/Occupational%20Health%20and%20Safety/eir2009.pdf) and [City of Cape Town water process](https://www.capetown.gov.za/city-connect/apply/municipal-services/water-and-sanitation/submit-a-certificate-of-compliance-of-water-installation-on-transfer-of-ownership/): installation, location and scope determine applicable evidence. |
| Security and lender practice | [Firstrand v Registrar of Deeds](https://www.saflii.org/za/cases/ZAGPPHC/2021/631.html) illustrates cancellation/release authority issues; [FNB buying](https://www.fnb.co.za/home-loans/learnBuying.html) and [FNB cancellation](https://www.fnb.co.za/home-loans/learnCancel.html) illustrate lender coordination and terms. The proposed repeated-security register and review items are audit recommendations. |
| Trust payments | [LPC bookkeeping guidance](https://lpc.org.za/wp-content/uploads/2026/03/i-LPC-Guide-for-Attorneys-Bookkeeping-ito-Regulation-610i.pdf): conveyancing trust payments need appropriate controls against diversion/fraud. This appendix proposes a review record, not a complete accounting implementation. |

Official older or partly consolidated statutory PDFs need applicable amendments and registry practice checked before a new rule is encoded. The date of this audit does not establish that every statute, circular and private lender manual has been exhaustively reconciled.

## Per-party review items composed inside existing tasks

These questions should be answered for the actual people/entities and the actual act: entering the agreement, acquiring, disposing, mortgaging or executing. Reuse evidence with stable party identity and a current fact/version reference. No combination should silently inherit another party's completed decision.

| Party situation | Minimum proposed conditional review items | Existing home |
| --- | --- | --- |
| Every party and relevant representative/controller | Identity, current facts, role/share, applicable verification, source references and responsible reviewer; firm RMCP decision/screening by reference | Buyer/seller FICA and capacity tasks |
| Individual | Legal capacity, actual matrimonial regime, applicable consent or exception; distinguish acquisition from disposal/security | Per-party capacity |
| In-community / customary / foreign-law marriage | Identify the relevant spouses, actual governing regime and required consent/execution; unfamiliar facts route to specialist review | Capacity, existing specialist route, signing |
| Minor / guardian / curator / impaired capacity | Identify the act proposed and competent representative; determine required permission/order and execution route rather than automatically demand one universal certificate | Capacity and conditional specialist review |
| Company | Current company status, natural-person ownership/control, authorised actor, relevant decision and any additional disposal/distress approval | Capacity and conditional specialist review |
| Close corporation | Current members/control and authority for the particular act, applicable decisions and representative/signatories | Capacity |
| Trust | Current deed/amendments, authorised trustees and appointment timing, permitted transaction, valid decision and authorised execution | Capacity and signing |
| Estate / liquidation / insolvency / business rescue | Precise appointment/status, authority, applicable sale/instrument approval and certification; classify rescue separately rather than infer ordinary director authority | Existing specialist classification and appropriate route |
| Foreign party or foreign execution | Separate identity, tax residence and governing capacity; determine acceptable execution/authentication and funding evidence for the instrument | Capacity, tax, source/security and signing |
| Several parties / mixed entity types | Separate each applicable decision and evidence; reconcile ownership/acquisition shares and signatories; do not merge two trusts or two sellers into one generic review | Existing repeated party model |

## Transfer stage 1: Instruction & File Opening

### 1. Instruction Received

`instruction_received` · Owner: Transfer Attorney · Assessment: **Simplify**.

**Current catalogue inputs:** Finance Type (`finance_type`); Transaction Type (`transaction_type`)

**Current catalogue documents:** `sales_agreement_or_otp`

**Declared evidence:** Transfer instruction received from the instructing party. Signed OTP or source agreement is available or requested.

**Current default confirmation items:**

- Transfer instruction received from the instructing party. Answers: yes, no.
- Received and reviewed OTP. Answers: yes, no.
- Finance Type Answers: yes, no.
- Transaction Type Answers: yes, no.

**Minimum proposed review items:**

- Record who instructed the firm, when, and the source reference.
- Confirm the correct matter/instrument and availability of the source agreement.
- Receive the OTP here; keep substantive legal review in the source-document task.

**Audit judgement:** The current instruction and OTP tasks both ask for review. Receipt should not imply acceptance, appointment or legal validity.

### 2. File Opened and Matter Number Assigned

`matter_opened` · Owner: Transfer Attorney · Assessment: **Retain**.

**Current catalogue inputs:** Matter Number (`matter_number`)

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Matter number captured. Responsible conveyancer or secretary is allocated.

**Current default confirmation items:**

- Matter number captured. Answer options are supplied by the workbench UI.
- Responsible conveyancer or secretary is allocated. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Record the file number, firm acceptance and responsible conveyancer/secretary.
- Link the transaction, property and parties to the same file.
- Identify the current instructed attorney in each applicable lane.

**Audit judgement:** Internal file-opening work is useful; it is not a separate statutory registration event.

### 3. OTP and Source Documents Checked

`otp_source_docs_checked` · Owner: Transfer Attorney · Assessment: **Tighten — finding 6**.

**Current catalogue inputs:** Purchase Price (`purchase_price`); Property Description (`property_description`)

**Current catalogue documents:** `sales_agreement_or_otp`; `seller_property_documents`

**Declared evidence:** OTP or sale agreement reviewed. Parties, property, price, and suspensive conditions checked.

**Current default confirmation items:**

- OTP or sale agreement reviewed. Answers: yes, no.
- Parties, property, price, and suspensive conditions checked. Answers: yes, no.
- Purchase Price Answers: yes, no.
- seller_property_documents Answers: yes, no.

**Minimum proposed review items:**

- Check the executed agreement and amendments, contract-date authority, parties/shares, exact property/right and price.
- List only applicable conditions and material payment dates, their owners, deadlines and evidence of fulfilment, valid waiver or extension.
- Record occupation/risk, costs, special consents and any unresolved validity question; re-review after material changes.

**Audit judgement:** The source task mentions conditions, but a generic checked answer does not show that the agreement is currently capable of implementation.

### 4. Title Deed or Ownership Checked

`title_deed_checked` · Owner: Transfer Attorney · Assessment: **Retain and detail**.

**Current catalogue inputs:** Property Tenure (`property_tenure`); Title Deed / Property Identifier (`title_deed_or_property_identifier`)

**Current catalogue documents:** `seller_property_documents`

**Declared evidence:** Title deed or property ownership source checked. Restrictions or title conditions are recorded.

**Current default confirmation items:**

- Title deed or ownership source checked. Answers: yes, no.
- Restrictions or title conditions recorded. Answers: yes, no.
- Property Tenure Answers: yes, no.
- seller_property_documents Answers: yes, no.

**Minimum proposed review items:**

- Check current registered ownership and the complete property/right description against the agreement.
- Identify bonds, interdicts, restrictions, servitudes and scheme/extension/exclusive-use rights that affect this transaction.
- Record the source/search date and refer unresolved instrument or title questions to the existing specialist route.

**Audit judgement:** A street address or erf identifier alone does not establish every relevant registered right.

### 5. Existing Bond or Cancellation Requirement Confirmed

`existing_bond_confirmed` · Owner: Transfer Attorney · Assessment: **Tighten — finding 4**.

**Current catalogue inputs:** Seller Existing Bond Status (`seller_existing_bond_status`)

**Current catalogue documents:** `seller_bond_cancellation_information`

**Declared evidence:** Seller existing bond position captured. Cancellation lane is required or explicitly not required.

**Current default confirmation items:**

- Seller existing bond position captured. Answers: yes, no, not_applicable.
- Cancellation lane is required or explicitly not required. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Record the reviewed registered-security position, including a confirmed no-bond position where appropriate.
- Identify every bond/security item and linked lender/account, including paid-up bonds still registered.
- Determine cancellation, release, substitution or specialist disposition and the required role players.

**Audit judgement:** Keep this early transfer decision; cancellation figures and settlement remain the cancellation attorney’s detailed work.

## Transfer stage 2: FICA & Authority

### 6. Review & Approve Buyer FICA

`buyer_fica_review` · Owner: Transfer Attorney · Assessment: **Tighten — finding 7**.

**Current catalogue inputs:** Buyer Entity Type (`buyer_entity_type`)

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Buyer identity and FICA documents checked.

**Current default confirmation items:**

- Buyer identity and FICA documents checked. Answers: yes, no.

**Minimum proposed review items:**

- Review the applicable identity, verification and representative evidence for each buyer; link it to stable party identities.
- Record the firm RMCP risk decision, screening and any required enhanced review or approval by reference.
- Check the nature/purpose of the transaction and funding profile; keep sensitive compliance decisions internal.

**Audit judgement:** Document receipt and legal capacity are separate reviews. Avoid universally demanding every possible enhanced document.

### 7. Review & Approve Seller FICA

`seller_fica_review` · Owner: Transfer Attorney · Assessment: **Tighten — finding 7**.

**Current catalogue inputs:** Seller Entity Type (`seller_entity_type`)

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Seller identity and FICA documents checked.

**Current default confirmation items:**

- Seller identity and FICA documents checked. Answers: yes, no.

**Minimum proposed review items:**

- Review applicable identity, verification and representative evidence for each seller and relevant controller.
- Record the firm RMCP risk decision, screening and conditional follow-up/approval by reference.
- Check material changed facts and the intended disposal/payment profile; preserve restricted visibility.

**Audit judgement:** Reuse approved party evidence where current. A seller tax-residence decision is a distinct fact, not a passport inference.

### 8. Resolve Each Buyer Capacity

`buyer_party_capacity_review` · Owner: Transfer Attorney · Assessment: **Retain and detail — finding 7**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Every buyer and applicable signatory has an attorney-reviewed capacity decision tied to the current party facts.

**Current default confirmation items:**

- Every buyer and applicable signatory has an attorney-reviewed capacity decision tied to the current party facts. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Resolve each buyer and signatory separately using the current facts and proposed acquisition/security.
- Apply the entity/matrimonial/representative questions in the per-party matrix below.
- Record authority, execution route, evidence and unresolved exceptions; changes must reopen affected decisions.

**Audit judgement:** Existing per-party reviews and stale-fact protection are strong. Add conditional discovery rather than a second complete lane.

### 9. Resolve Each Seller Capacity

`seller_party_capacity_review` · Owner: Transfer Attorney · Assessment: **Retain and detail — finding 7**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Every seller and applicable signatory has an attorney-reviewed capacity decision tied to the current party facts.

**Current default confirmation items:**

- Every seller and applicable signatory has an attorney-reviewed capacity decision tied to the current party facts. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Match each seller/share to registered ownership and establish authority to dispose and execute.
- Apply the entity/matrimonial/representative matrix, including any additional disposal approvals.
- Record current authority and execution evidence; refer estates, distress, minority or impaired capacity to a reviewed route.

**Audit judgement:** A standard entity type or resolution cannot alone settle every disposal-capacity question.

### 10. Specialist Party Capacity Hold

`party_capacity_specialist_review` · Owner: Transfer Attorney · Assessment: **Historical / dormant**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Specialist owner, reason and next decision recorded; ordinary signing stays on hold.

**Current default confirmation items:**

- Specialist owner, reason and next decision recorded; ordinary signing stays on hold. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Preserve prior hold decisions and their owner/reason/evidence.
- For new plans use the current specialist classification and route-specific tasks.
- Do not count this entry as a further ordinary-matter requirement.

**Audit judgement:** The current plan generator excludes this old generic hold task.

### 11. Classify Specialist Routes

`specialist_classification_review` · Owner: Transfer Attorney · Assessment: **Retain conditional hold**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Attorney-reviewed specialist evidence and route-specific completion note recorded.

**Current default confirmation items:**

- Attorney-reviewed specialist evidence and route-specific completion note recorded. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Identify every exceptional fact and legal instrument, with a specialist owner and next decision.
- Distinguish an ordinary transfer with extra authority from an alternative instrument/process.
- Release the hold only after an explicit reviewed route and evidence are recorded.

**Audit judgement:** Detection and a safe hold are supported; they do not establish that the entire specialist execution recipe is implemented.

### 12. Review Estate Authority and Transfer

`estate_authority_transfer_review` · Owner: Transfer Attorney · Assessment: **Detail conditional route**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Attorney-reviewed specialist evidence and route-specific completion note recorded.

**Current default confirmation items:**

- Attorney-reviewed specialist evidence and route-specific completion note recorded. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Check the deceased estate, appointment and current authority of the person acting.
- Distinguish sale, implementation of a pre-death sale, and beneficiary transfer/endorsement.
- Record the applicable Master/conveyancer certificate or approval and instrument, rather than demanding the same estate evidence for every route.

**Audit judgement:** The current task is generic. The route-specific certificate distinction needs practising-conveyancer review.

### 13. Review Insolvency Authority and Transfer

`insolvency_authority_transfer_review` · Owner: Transfer Attorney · Assessment: **Detail conditional route**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Attorney-reviewed specialist evidence and route-specific completion note recorded.

**Current default confirmation items:**

- Attorney-reviewed specialist evidence and route-specific completion note recorded. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Identify sequestration/liquidation and the current trustee/liquidator and authority.
- Review sale approval, secured creditors, relevant orders and applicable transfer/security exceptions.
- Record the reviewed instrument and evidence; do not presume ordinary seller signatures or ordinary cancellation treatment.

**Audit judgement:** A specialist decision exists; the generic row is not a complete insolvency manual.

### 14. Review Court Order or Divorce Transfer

`court_order_transfer_review` · Owner: Transfer Attorney · Assessment: **Detail conditional route**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Attorney-reviewed specialist evidence and route-specific completion note recorded.

**Current default confirmation items:**

- Attorney-reviewed specialist evidence and route-specific completion note recorded. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Check the operative order, affected parties/property and its implementation terms.
- Determine whether a transfer, endorsement or other instrument is required and who may execute.
- Record any unresolved consent, authority or tax question and the specialist decision.

**Audit judgement:** Court/divorce matters can require a different instrument even when the workspace stages remain useful.

### 15. Resolve Unusual Title Conditions

`unusual_title_resolution_review` · Owner: Transfer Attorney · Assessment: **Detail conditional route**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Attorney-reviewed specialist evidence and route-specific completion note recorded.

**Current default confirmation items:**

- Attorney-reviewed specialist evidence and route-specific completion note recorded. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Identify the exact restriction, servitude, missing-deed issue or affected real right.
- Determine the required consent, release, amendment, replacement evidence or order.
- Record the registrable instrument and resolution evidence before ordinary readiness.

**Audit judgement:** Keep a conditional resolution task rather than making all unusual-title checks universal.

### 16. Review Agricultural Land Consent

`agricultural_consent_review` · Owner: Transfer Attorney · Assessment: **Detail conditional route**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Attorney-reviewed specialist evidence and route-specific completion note recorded.

**Current default confirmation items:**

- Attorney-reviewed specialist evidence and route-specific completion note recorded. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Classify the land, proposed subdivision/share or other affected transaction.
- Have the specialist verify the current applicable legislation, commencement and consent/exception.
- Record the actual decision and evidence; unresolved instrument questions remain on hold.

**Audit judgement:** This audit did not establish a complete current agricultural consent recipe or every commencement notice.

### 17. Review Share Block Instrument

`share_block_instrument_review` · Owner: Transfer Attorney · Assessment: **Retain instrument hold**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Attorney-reviewed specialist evidence and route-specific completion note recorded.

**Current default confirmation items:**

- Attorney-reviewed specialist evidence and route-specific completion note recorded. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Determine whether the transaction concerns shares/use rights, conversion or an actual registrable property transfer.
- Review the applicable entity, agreement, authority and tax treatment.
- Record the appropriate execution route; do not fabricate ordinary deeds lodgement/registration for a share transaction.

**Audit judgement:** The existing instrument check is important. Full share-block execution is not established by task presence.

### 18. Review Other Specialist Route

`other_specialist_execution_review` · Owner: Transfer Attorney · Assessment: **Retain controlled exception**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Attorney-reviewed specialist evidence and route-specific completion note recorded.

**Current default confirmation items:**

- Attorney-reviewed specialist evidence and route-specific completion note recorded. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Record the unusual fact, responsible specialist and precise legal question.
- Define the minimum necessary evidence, instrument and next actions for this matter.
- Record the reviewed outcome and any continuing hold with a follow-up owner.

**Audit judgement:** A controlled exception is preferable to a catch-all completed checkbox.

## Transfer stage 3: Financial Preparation

### 19. Confirm Transfer Tax Route

`transfer_tax_route_confirmed` · Owner: Transfer Attorney · Assessment: **Retain conditional decision**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Attorney tax route and basis recorded.

**Current default confirmation items:**

- Confirm Transfer Tax Route evidence checked and applicable to this matter. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Confirm the acquisition/disposal facts, agreement and one supported tax basis.
- Record the attorney basis and route-specific applicable payment, query and proof requirements.
- Keep an unresolved advice route blocked at readiness and re-review changed facts.

**Audit judgement:** Do not infer the route only from a commercial label, entity type or VAT number.

### 20. Prepare & Submit TDC01

`transfer_duty_tdc01_submission` · Owner: Transfer Attorney · Assessment: **Retain conditional**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** TDC01 submission status recorded.

**Current default confirmation items:**

- Prepare & Submit TDC01 evidence checked and applicable to this matter. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Check the submitted declaration against the agreement, parties/shares and acquisition facts.
- Record the submission/reference and the applicable SARS position.
- Ensure amendments and attachments match the current reviewed transaction.

**Audit judgement:** This task is selected for transfer duty; it should not manufacture that declaration route for every VAT transaction.

### 21. Respond to SARS Evidence Request

`sars_evidence_request_response` · Owner: Transfer Attorney · Assessment: **Retain conditional**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** SARS request response recorded.

**Current default confirmation items:**

- Respond to SARS Evidence Request evidence checked and applicable to this matter. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Record the actual query, required evidence, response owner and follow-up date.
- Check the uploaded response and reference against the query.
- Record the SARS outcome and unresolved questions.

**Audit judgement:** The task activates for an actual evidence request/query; avoid requiring an invented query.

### 22. Confirm Duty Assessment & Payment

`transfer_duty_assessment_payment` · Owner: Transfer Attorney · Assessment: **Retain conditional**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Duty assessment and payment status recorded.

**Current default confirmation items:**

- Confirm Duty Assessment & Payment evidence checked and applicable to this matter. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Verify the applicable assessment, parties and transaction.
- Reconcile the amount and payment/reference where duty is payable.
- Check the resulting SARS status and escalate discrepancies.

**Audit judgement:** The current plan already avoids forcing duty payment where the reviewed decision says no payment is required.

### 23. Verify VAT / Exemption Evidence

`vat_exemption_evidence_verified` · Owner: Transfer Attorney · Assessment: **Historical / dormant**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Applicable tax evidence verified.

**Current default confirmation items:**

- Verify VAT / Exemption Evidence evidence checked and applicable to this matter. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Preserve historical decisions and documents.
- Use the separate ordinary VAT, going-concern or exemption task for a new plan.
- Do not apply a combined generic confirmation in addition to those routes.

**Audit judgement:** The current tax task selector does not select this legacy combined entry.

### 24. Review Non-Resident Seller Withholding

`non_resident_seller_withholding_review` · Owner: Transfer Attorney · Assessment: **Historical / dormant**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Non-resident withholding review recorded.

**Current default confirmation items:**

- Review Non-Resident Seller Withholding evidence checked and applicable to this matter. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Preserve prior review records.
- Use the current applicability, directive and withholding tasks for each potentially non-resident seller.
- Do not add the old generic review to the current plan.

**Audit judgement:** This legacy entry is not selected by the current tax task selector.

### 25. Verify Ordinary VAT Basis

`ordinary_vat_basis_verified` · Owner: Transfer Attorney · Assessment: **Retain and detail**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Seller VAT evidence, enterprise supply and agreement treatment reviewed.

**Current default confirmation items:**

- Verify Ordinary VAT Basis evidence checked and applicable to this matter. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Review vendor evidence and whether this supply occurs in the relevant enterprise.
- Check agreement treatment, the actual property/business use and price/tax obligations.
- Record the route decision and supporting evidence; resolve contradictions before readiness.

**Audit judgement:** Current fields distinguish vendor status from enterprise supply. Keep that distinction visible.

### 26. Verify Going-Concern Zero Rate

`going_concern_zero_rate_verified` · Owner: Transfer Attorney · Assessment: **Tighten substantive review**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Written agreement and going-concern conditions reviewed.

**Current default confirmation items:**

- Verify Going-Concern Zero Rate evidence checked and applicable to this matter. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Review the actual enterprise/income activity and assets transferred, including relevant leases and use.
- Check the parties’ qualifying status and written terms against the applicable going-concern requirements.
- Record factual evidence and tax-advice resolution where needed, rather than relying on a clause alone.

**Audit judgement:** The current model captures vendor and agreement references but does not fully express the continuing enterprise facts.

### 27. Verify Claimed Exemption

`transfer_duty_exemption_basis_verified` · Owner: Transfer Attorney · Assessment: **Retain conditional**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Specific exemption provision and supporting evidence reviewed.

**Current default confirmation items:**

- Verify Claimed Exemption evidence checked and applicable to this matter. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Identify the particular statutory basis for each claimed exemption.
- Identify the person/share or transaction covered and supporting evidence.
- Resolve partially exempt interests and obtain the appropriate SARS outcome.

**Audit judgement:** The model already represents exemption claims individually; retain it rather than a single blanket exemption flag.

### 28. Review Each Non-Resident Seller

`non_resident_seller_applicability_review` · Owner: Transfer Attorney · Assessment: **Retain and detail**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Each potentially non-resident seller has an applicability decision.

**Current default confirmation items:**

- Review Each Non-Resident Seller evidence checked and applicable to this matter. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Determine tax residence separately for each seller; resolve unknowns explicitly.
- Review the applicable aggregate transaction threshold, seller type/share and directive/withholding basis.
- Record the person-specific decision and evidence, including a reasoned non-applicable outcome.

**Audit judgement:** Existing per-seller decisions are useful. Residence is not the same as nationality or passport type.

### 29. Verify SARS Directive

`non_resident_seller_directive_review` · Owner: Transfer Attorney · Assessment: **Retain conditional**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Applicable directive evidence reviewed by seller.

**Current default confirmation items:**

- Verify SARS Directive evidence checked and applicable to this matter. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Verify the actual SARS directive and the seller/transaction it covers.
- Check the amount, conditions and any dates against the proposed payment.
- Record its effect on reservation/remittance and unresolved conditions.

**Audit judgement:** A directive is selected when issued; do not require a fictitious directive where the reviewed route does not use one.

### 30. Verify Non-Resident Withholding

`non_resident_seller_withholding_payment_review` · Owner: Transfer Attorney · Assessment: **Timing review — finding 2**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Withholding and payment proof reviewed by seller.

**Current default confirmation items:**

- Verify Non-Resident Withholding evidence checked and applicable to this matter. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Before the relevant milestone, record the reviewed calculation/directive, reserved amount and responsible payer.
- Record the actual withholding event and consequent remittance deadline.
- When paid or due, verify the return/payment reference and retain any outstanding obligation in close-out.

**Audit judgement:** Current readiness requires payment proof before lodgement. Validate that timing against the actual payment event with a conveyancer.

### 31. Verify SARS Transfer-Tax Receipt

`sars_transfer_tax_receipt_verified` · Owner: Transfer Attorney · Assessment: **Retain evidence gate**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Applicable SARS transfer-tax proof verified.

**Current default confirmation items:**

- Verify SARS Transfer-Tax Receipt evidence checked and applicable to this matter. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Verify the appropriate SARS proof/outcome for the reviewed route and acquisition.
- Match parties, property, transaction and any supporting exemption/directive evidence.
- Record reference/status and resolve queries or material amendments.

**Audit judgement:** Keep the transfer-tax proof gate distinct from the timing of section 35A remittance.

### 32. Review Municipal Rates Clearance

`municipal_rates_clearance_review` · Owner: Transfer Attorney · Assessment: **Retain; validity review — finding 10**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** `rates_clearance`; `rates_clearance_certificate`

**Declared evidence:** Municipal rates clearance is reviewed and current; where the issue date is recorded, validity does not exceed 60 days.

**Current default confirmation items:**

- Review Municipal Rates Clearance evidence checked and applicable to this matter. Answers: yes, no, not_applicable.
- rates_clearance_certificate Answers: yes, no.

**Minimum proposed review items:**

- Match the issuer, property and certificate to the actual municipality/municipalities.
- Record issue date, certificate reference and validity; check current applicability/exceptions.
- Recheck against anticipated registration and renew when necessary.

**Audit judgement:** The current source guards expiry and optionally checks the municipal interval. Make the end-date interpretation and issue-date requirement explicit.

### 33. Review Levy / HOA Clearance

`levy_hoa_clearance_review` · Owner: Transfer Attorney · Assessment: **Historical / dormant**.

**Current catalogue inputs:** Levy / HOA Account Reference (`levy_account_reference`)

**Current catalogue documents:** `body_corporate_levy_clearance`; `hoa_levy_clearance`

**Declared evidence:** Applicable levy or HOA clearance reviewed and valid.

**Current default confirmation items:**

- Review Levy / HOA Clearance evidence checked and applicable to this matter. Answers: yes, no, not_applicable.
- hoa_levy_clearance Answers: yes, no.
- Levy / HOA Account Reference Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Preserve the old combined review.
- For new plans use separate body-corporate and HOA applicability/reviews.
- Do not count both old and new entries as additional required work.

**Audit judgement:** The current property task selector omits this legacy combined task.

### 34. Review Body-Corporate Clearance

`body_corporate_levy_clearance_review` · Owner: Transfer Attorney · Assessment: **Retain; route detail**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** `body_corporate_levy_clearance`

**Declared evidence:** Body-corporate clearance and validity reviewed.

**Current default confirmation items:**

- Review Body-Corporate Clearance evidence checked and applicable to this matter. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Identify scheme/unit and the body-corporate certification route.
- Verify sums paid or acceptable provision and any applicable no-body-corporate route.
- Review issuer terms/current validity and related rights without inventing a universal municipal-style expiry.

**Audit judgement:** This task activates for sectional title. Keep statutory certification distinct from a generic invoice upload.

### 35. Review HOA Clearance

`hoa_clearance_review` · Owner: Transfer Attorney · Assessment: **Retain conditional**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** `hoa_levy_clearance`

**Declared evidence:** HOA clearance and validity reviewed.

**Current default confirmation items:**

- Review HOA Clearance evidence checked and applicable to this matter. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Identify the title/association/agreement basis requiring consent or clearance.
- Check the actual issuer, outstanding obligations and consent/clearance conditions.
- Verify applicability and validity against the intended transaction/registration.

**Audit judgement:** Sectional title and HOA can both apply. Do not replace one with the other.

### 36. Classify Property Conditions

`property_conditions_applicability_review` · Owner: Transfer Attorney · Assessment: **Tighten — finding 3**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Title and certificate applicability decisions recorded.

**Current default confirmation items:**

- Classify Property Conditions evidence checked and applicable to this matter. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Record applicable title restrictions and each actual installation/certificate basis.
- Use location, title and agreement to resolve local or contractual requirements.
- Ensure canonical document rules agree with the reviewed applicability; keep unknown distinct from no.

**Audit judgement:** This existing classification task is the natural place to correct universal electrical assumptions and expose existing water rules.

### 37. Review Title Conditions

`title_conditions_review` · Owner: Transfer Attorney · Assessment: **Retain and detail**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** `seller_property_documents`

**Declared evidence:** Applicable title conditions reviewed and resolved.

**Current default confirmation items:**

- Review Title Conditions evidence checked and applicable to this matter. Answers: yes, no, not_applicable.
- seller_property_documents Answers: yes, no.

**Minimum proposed review items:**

- Review the particular restriction, consent or real right and its effect on transfer/security.
- Record required consents, satisfaction or specialist resolution.
- Check the proposed instrument retains, transfers or releases the correct rights.

**Audit judgement:** The title source check discovers conditions; this task records their operational resolution rather than repeating discovery.

### 38. Review Property Compliance Certificates

`property_compliance_review` · Owner: Transfer Attorney · Assessment: **Tighten applicability/evidence**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** `compliance_certificates`

**Declared evidence:** Applicable property compliance certificates reviewed.

**Current default confirmation items:**

- Review Property Compliance Certificates evidence checked and applicable to this matter. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Verify only the applicable electrical, gas, fence, water and other legal/contractual certificates.
- Match property/installation, issuer, certificate and report scope, dates and relevant changes.
- Resolve missing or disputed proof before the appropriate milestone without treating every certificate as a universal Deeds Office filing.

**Audit judgement:** Shared canonical rules and the financial task must present the same applicability and evidence position.

## Transfer stage 4: Documents & Guarantees

### 39. Prepare & Review Transfer Document Pack

`transfer_document_pack_review` · Owner: Transfer Attorney · Assessment: **Retain and detail**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** `sales_agreement_or_otp`; `seller_property_documents`

**Declared evidence:** Transfer document pack prepared and reviewed.

**Current default confirmation items:**

- Prepare & Review Transfer Document Pack is complete and the supporting documents are reviewed. Answers: yes, no, not_applicable.
- sales_agreement_or_otp Answers: yes, no.
- seller_property_documents Answers: yes, no.

**Minimum proposed review items:**

- Check the correct instrument, title source, transfer authority and route-specific declarations/certificates.
- Match each party/share/property/price and document version.
- Record conveyancer review, relevant preparation/execution requirements and unresolved pack defects.

**Audit judgement:** The current pack review is a useful single task; detailed items should follow the actual instrument.

### 40. Complete Buyer Signing

`buyer_signing_review` · Owner: Transfer Attorney · Assessment: **Retain and detail**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** `buyer_signed_transfer_documents`

**Declared evidence:** Buyer signing route completed and signed documents reviewed.

**Current default confirmation items:**

- Complete Buyer Signing is complete and the supporting documents are reviewed. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Identify every required buyer/signatory and the exact current document pack.
- Review authority, execution place/date, witnessing and any foreign authentication route.
- Record signed evidence and resolve corrections without inferring validity from upload alone.

**Audit judgement:** Current party-capacity guards are present. Expose their result at signing rather than requesting duplicate FICA.

### 41. Complete Seller Signing

`seller_signing_review` · Owner: Transfer Attorney · Assessment: **Retain and detail**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** `seller_signed_transfer_documents`

**Declared evidence:** Seller signing route completed and signed documents reviewed.

**Current default confirmation items:**

- Complete Seller Signing is complete and the supporting documents are reviewed. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Identify every required seller/representative and current authority to execute.
- Review the transfer authority and applicable consents, execution and witnessing/authentication.
- Record signed evidence and unresolved defects against each relevant signatory.

**Audit judgement:** Seller authority may be executor/trustee or another representative; an ordinary individual signature must not be assumed.

### 42. Review Cash Funding Source

`cash_funding_source_review` · Owner: Transfer Attorney · Assessment: **Retain conditional**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** `proof_of_funds`

**Declared evidence:** Buyer cash component and source identified. Source-of-funds evidence reviewed and any outstanding compliance questions resolved.

**Current default confirmation items:**

- Buyer cash component and source identified. Answer options are supplied by the workbench UI.
- Source-of-funds evidence reviewed and any outstanding compliance questions resolved. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Identify the cash component, actual payer/source and applicable source evidence.
- Resolve third-party funding or linked-sale/bridging questions under the firm’s compliance process.
- Record the reviewed decision and outstanding follow-up without treating source proof as cleared funds.

**Audit judgement:** Selected for cash and combination routes. The bank-financed portion does not remove a mixed transaction’s cash review.

### 43. Review Payment Security

`payment_security_review` · Owner: Transfer Attorney · Assessment: **Retain and detail**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** The agreed cash, guarantee, undertaking, or mixed payment route is identified. Cleared funds or acceptable security evidence is reviewed and any cancellation allocation is agreed where applicable.

**Current default confirmation items:**

- Applicable payment security is reviewed and accepted. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Reconcile the full price, deposit, cash, guarantees and any undertaking, including custodian and payees.
- Verify cleared money or acceptable enforceable security, wording/conditions/validity and receiver acceptance.
- Resolve every cancellation allocation, shortfall and linked-payment dependency with the responsible attorney.

**Audit judgement:** The existing security review is the correct shared decision point; one uploaded bank statement is not a full allocation reconciliation.

## Transfer stage 5: Lodgement & Registration

### 44. Lodgement Ready

`lodgement_ready` · Owner: Transfer Attorney · Assessment: **Retain hard gate**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Lodgement pack reviewed and ready. Transfer, bond, and cancellation coordination confirmed where applicable.

**Current default confirmation items:**

- Lodgement pack and applicable cross-attorney coordination are ready. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Confirm current plan/facts, applicable approved evidence, valid pack and resolved agreement conditions.
- Obtain the responsible bond/cancellation handoffs where those lanes apply.
- Record authorised attestation and unresolved exception decisions; do not equate percentage complete with ready.

**Audit judgement:** Source SQL already enforces substantial objective safeguards. Additional applicability fixes must preserve them.

### 45. Lodged at Deeds Office

`lodged_at_deeds_office` · Owner: Transfer Attorney · Assessment: **Retain; answer alignment — finding 8**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Deeds Office lodgement confirmed. Lodgement date and batch/reference captured.

**Current default confirmation items:**

- Deeds Office lodgement has been accepted and the lodgement reference is recorded. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Verify accepted lodgement, registry, date and batch/reference.
- Link the applicable transfer/bond/cancellation instruments in the agreed batch.
- Record rejection/withdrawal/re-lodgement and revalidate affected evidence through existing lifecycle actions.

**Audit judgement:** The confirmation offers N/A although the lodgement event is an attested milestone; align the affordance.

### 46. On Prep

`in_prep` · Owner: Transfer Attorney · Assessment: **Retain; answer alignment — finding 8**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Prep status confirmed by Deeds Office. Expected registration timing captured where available.

**Current default confirmation items:**

- Deeds Office prep status has been confirmed. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Verify the actual Deeds Office prep status and source/date.
- Review unresolved examiner queries and current linked-lane readiness.
- Record intended registration timing as an estimate, with necessary validity follow-ups.

**Audit judgement:** Prep is a registry status, not a guaranteed registration date. Reopen/block existing tasks for defects rather than adding a universal correction stage.

### 47. Registered

`registered` · Owner: Transfer Attorney · Assessment: **Retain hard milestone**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** `registration_confirmation`

**Declared evidence:** Registration confirmed at Deeds Office. Registration date captured.

**Current default confirmation items:**

- Transfer registration has been confirmed and registration evidence reviewed. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Verify the actual registration event, date and deed/reference.
- Check corresponding linked instruments and registration evidence.
- Trigger the appropriate payment/communication/close-out work without treating registration as settlement proof.

**Audit judgement:** The registration guard rechecks current evidence. The displayed confirmation N/A should not imply registration can be skipped.

## Transfer stage 6: Post-Registration & Closure

### 48. Review Final Accounts

`post_registration_closeout_review` · Owner: Transfer Attorney · Assessment: **Tighten financial detail**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Final account, proceeds, refunds, and fees position reviewed.

**Current default confirmation items:**

- Final accounts, proceeds, refunds, and fees position reviewed. Answers: yes, no, not_applicable.

**Minimum proposed review items:**

- Reconcile received price/security, cancellation settlement, costs, tax obligations and authorised distributions.
- Verify payees/payment instructions and actual payments, refunds and balances.
- Record outstanding remittance, delivery or reconciliation obligations with an owner and due date.

**Audit judgement:** The existing financial task can carry these items; no additional stage is needed.

### 49. Matter Closed

`matter_closed` · Owner: Transfer Attorney · Assessment: **Channel review — finding 9**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Final account completed. Registration update published to applicable clients. File closure checklist completed and matter archived.

**Current default confirmation items:**

- Matter closure is confirmed and the file is ready to be archived. Answers: yes, no.

**Minimum proposed review items:**

- Confirm financial and linked-lane close-outs and any recorded residual obligation.
- Record registration communication to the appropriate actual recipients using the agreed channel.
- Record document delivery/custody, unresolved refunds and retention/archive arrangements.

**Audit judgement:** Current closure requires a particular portal publication. External communication evidence should not require a duplicate product action.

## Bond registration stage 1: Instruction & Bank

### 50. Bond Instruction Received

`bond_instruction_received` · Owner: Bond Attorney · Assessment: **Retain and clarify**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** `bond_instruction`

**Declared evidence:** Bond instruction received from bank or bond originator. Instruction date and source captured.

**Current default confirmation items:**

- Bond instruction received from bank or bond originator. Answer options are supplied by the workbench UI.
- Instruction date and source captured. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Verify the actual lender appointment/instruction, source/date and current version.
- Match borrower/mortgagor, property, amount and facility.
- Record transfer-attorney coordination and outstanding instruction questions.

**Audit judgement:** An originator handoff or grant letter may support the file but is not automatically the lender’s legal instruction to register.

### 51. Bank and Reference Captured

`bank_reference_captured` · Owner: Bond Attorney · Assessment: **Retain**.

**Current catalogue inputs:** Bond Bank (`bond_bank`); Bond Reference / Account (`bond_reference`)

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Bank name captured. Bank reference, loan account, or attorney instruction reference captured.

**Current default confirmation items:**

- Bank name captured. Answer options are supplied by the workbench UI.
- Bank reference, loan account, or attorney instruction reference captured. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Match lender and instruction/facility/account reference to the matter.
- Record the authorised bank contact/channel and responsible bond attorney.
- Distinguish additional facilities or security items where present.

**Audit judgement:** Keep references linked to their facility rather than only free text on the matter.

### 52. Grant / Approval Letter Received

`bond_approval_letter_received` · Owner: Bond Attorney · Assessment: **Retain and detail**.

**Current catalogue inputs:** Bond Approval Amount (`bond_approval_amount`)

**Current catalogue documents:** `bond_instruction`; `bond_approval_letter`

**Declared evidence:** Bank grant or approval letter received. Approval amount and conditions reviewed.

**Current default confirmation items:**

- Bank grant or approval letter received. Answer options are supplied by the workbench UI.
- Approval amount and conditions reviewed. Answer options are supplied by the workbench UI.
- bond_instruction Answers: yes, no.

**Minimum proposed review items:**

- Verify the applicable approval/grant version and amount.
- Review borrower, security/property and approval conditions/validity.
- Resolve differences from the agreement or legal instruction.

**Audit judgement:** Receipt and substantive bank authority are separate; do not mistake an expired or conditional grant for release to lodge.

## Bond registration stage 2: Bank Conditions

### 53. Bank Conditions Reviewed

`bank_requirements_confirmed` · Owner: Bond Attorney · Assessment: **Retain lender checklist**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** `bank_requirements`

**Declared evidence:** Bank conditions checklist reviewed. Outstanding conditions are listed with owners.

**Current default confirmation items:**

- Bank conditions checklist reviewed. Answer options are supplied by the workbench UI.
- Outstanding conditions are listed with owners. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Review the current lender/facility instructions and actual required evidence.
- Identify owners, deadlines and any additional securities, sureties or insurance requirements.
- Reuse relevant application evidence after review rather than repeat underwriting by default.

**Audit judgement:** A lender checklist belongs within this task; it should not become a universal list from one bank.

### 54. Bank Conditions Outstanding

`bank_conditions_outstanding` · Owner: Bond Attorney · Assessment: **Retain conditional outcome**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Outstanding bank conditions captured. Owner and follow-up action recorded for each condition.

**Current default confirmation items:**

- Outstanding bank conditions captured. Answer options are supplied by the workbench UI.
- Owner and follow-up action recorded for each condition. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- List only real outstanding conditions and their acceptance criteria.
- Record owner, follow-up and deadline/expiry impact.
- Where there are none, record that decision rather than manufacture a blocker.

**Audit judgement:** The current plan still includes this task, but the suggestion explicitly permits a reasoned non-applicable outcome.

### 55. Bank Conditions Resolved

`bank_conditions_resolved` · Owner: Bond Attorney · Assessment: **Retain and detail**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** `bank_requirements`

**Declared evidence:** Outstanding bank conditions cleared. Bank or internal confirmation saved.

**Current default confirmation items:**

- Outstanding bank conditions cleared. Answer options are supplied by the workbench UI.
- Bank or internal confirmation saved. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Resolve each actual condition against lender acceptance requirements.
- Record accepted proof and any amended instruction.
- Confirm no unresolved condition prevents the relevant guarantee/lodgement/release.

**Audit judgement:** Resolution needs the bank’s actual acceptance where required; an internal tick alone may be insufficient.

## Bond registration stage 3: Documents & Guarantees

### 56. Bond Documents Prepared

`bond_documents_prepared` · Owner: Bond Attorney · Assessment: **Retain and detail**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Bond document pack prepared. Bond amount, parties, and property details checked.

**Current default confirmation items:**

- Bond document pack prepared. Answer options are supplied by the workbench UI.
- Bond amount, parties, and property details checked. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Prepare the lender/facility and instrument-specific security pack.
- Check borrower/mortgagor/surety authority, property, amount and terms.
- Record current versions and preparation review before execution.

**Audit judgement:** Additional bank security items should be conditional pack items, not new universal stages.

### 57. Buyer Bond Signing Scheduled

`buyer_bond_signing_scheduled` · Owner: Bond Attorney · Assessment: **Retain; allow history**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Buyer bond signing appointment or remote instruction captured. Buyer signing requirements sent.

**Current default confirmation items:**

- Buyer bond signing appointment or remote instruction captured. Answer options are supplied by the workbench UI.
- Buyer signing requirements sent. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Identify required signatories and the current execution route.
- Record appointment/remote arrangement and sent requirements.
- If signing is already validly complete, record the historical arrangement without forcing a new appointment.

**Audit judgement:** Scheduling is an operational aid, not an independent legal prerequisite that must happen again.

### 58. Buyer Signed Bond Documents

`buyer_signed_bond_documents` · Owner: Bond Attorney · Assessment: **Retain evidence gate**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** `buyer_signed_bond_documents`

**Declared evidence:** Buyer signed bond documents received. Signing, witnessing, and FICA checks completed.

**Current default confirmation items:**

- Buyer signed bond documents received. Answer options are supplied by the workbench UI.
- Signing, witnessing, and FICA checks completed. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Verify required signatures and capacities on the correct documents.
- Check execution, witnessing/authentication and applicable FICA evidence.
- Resolve missing signatures, corrections or changed authority.

**Audit judgement:** Reuse current per-party evidence, but retain the bond attorney’s responsibility for the signed security pack.

### 59. Documents Sent to Bank for Approval

`bond_documents_sent_to_bank` · Owner: Bond Attorney · Assessment: **Refine lender applicability**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Signed docs sent to bank or uploaded to bank portal. Submission date/reference captured.

**Current default confirmation items:**

- Signed docs sent to bank or uploaded to bank portal. Answer options are supplied by the workbench UI.
- Submission date/reference captured. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Determine whether and how this lender requires submission or portal upload.
- Record the submitted version, date and reference where required.
- Record a reviewed non-applicable/substitute route where instructed; avoid invented submissions.

**Audit judgement:** The task description says where applicable, while every bond task is selected in the plan.

### 60. Bank Approval to Lodge Received

`bank_approval_to_lodge_received` · Owner: Bond Attorney · Assessment: **Refine authority evidence**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Bank approval to lodge received. Approval date/reference captured.

**Current default confirmation items:**

- Bank approval to lodge received. Answer options are supplied by the workbench UI.
- Approval date/reference captured. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Identify the current lender authority/release necessary to lodge this facility.
- Verify conditions, reference and current instruction or approval evidence.
- Distinguish a separately issued approval from authority already contained in instructions, subject to reviewer approval.

**Audit judgement:** The critical gate requires completed. Keep actual bank authority mandatory, but review whether a separate approval event is universal.

### 61. Guarantees Issued

`guarantees_issued` · Owner: Bond Attorney · Assessment: **Retain and detail**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** `guarantee_letter`

**Declared evidence:** Guarantees issued to transfer attorney. Guarantee values, wording, and expiry checked.

**Current default confirmation items:**

- Guarantees issued to transfer attorney. Answer options are supplied by the workbench UI.
- Guarantee values, wording, and expiry checked. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Verify the security required for this transaction and its authorised issuance.
- Check amount, beneficiary, instrument/registration conditions and dates.
- Record delivery to the receiving attorney and any superseded version.

**Audit judgement:** Guarantee/security requirements should follow the facility and payment route; additional or replacement bonds may require a different pattern.

### 62. Guarantee Wording Accepted

`guarantee_wording_accepted` · Owner: Bond Attorney · Assessment: **Retain handoff gate**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Transfer attorney accepted guarantee wording. Any wording amendments are resolved.

**Current default confirmation items:**

- Transfer attorney accepted guarantee wording. Answer options are supplied by the workbench UI.
- Any wording amendments are resolved. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Record the receiving attorney’s actual acceptance of the applicable wording/allocation.
- Resolve amendments and identify the accepted version.
- Check affected cancellation recipients and outstanding conditions.

**Audit judgement:** Issuing a guarantee does not establish that the receiving attorney accepted it.

## Bond registration stage 4: Lodgement & Registration

### 63. Bank Lodgement Instructions Confirmed

`bond_lodgement_instructions_confirmed` · Owner: Bond Attorney · Assessment: **Retain evidence gate**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** `bond_instruction`

**Declared evidence:** Current bank lodgement instruction and conditions checked. Bond attorney confirms the transfer coordination and lodgement reference.

**Current default confirmation items:**

- Current bank lodgement instruction and conditions checked. Answer options are supplied by the workbench UI.
- Bond attorney confirms the transfer coordination and lodgement reference. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Verify current bank instructions and relevant release conditions.
- Confirm transfer/cancellation coordination and instruments in the intended batch.
- Record the authorised bond attorney’s current instruction/reference and any changed requirements.

**Audit judgement:** This task appropriately separates bank authority and coordination from merely finishing a document list.

### 64. Bond Lodgement Pack Ready

`bond_lodgement_ready` · Owner: Bond Attorney · Assessment: **Retain hard milestone**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Bond lodgement pack complete. Simultaneous lodgement coordination confirmed.

**Current default confirmation items:**

- Bond lodgement pack complete. Answer options are supplied by the workbench UI.
- Simultaneous lodgement coordination confirmed. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Review the applicable signed pack, bank authority and accepted security.
- Confirm the linked batch and current evidence/conditions.
- Record authorised readiness; any alternative instrument requires an explicit reviewed route.

**Audit judgement:** Keep the guard for a sale-linked bond; do not use it to invent a transfer for standalone finance.

### 65. Bond Lodged Simultaneously

`bond_lodged` · Owner: Bond Attorney · Assessment: **Retain event**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Bond lodgement confirmed. Simultaneous lodgement reference captured.

**Current default confirmation items:**

- Bond lodgement confirmed. Answer options are supplied by the workbench UI.
- Simultaneous lodgement reference captured. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Verify actual registry lodgement, date and reference.
- Confirm the applicable linked instruments and batch.
- Record rejection/withdrawal/re-lodgement and changed requirements.

**Audit judgement:** For the ordinary route coordination is appropriate. Standalone bond handling remains a scope question.

### 66. Bond Registered

`bond_registered` · Owner: Bond Attorney · Assessment: **Retain event**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Bond registration confirmed. Registration date captured.

**Current default confirmation items:**

- Bond registration confirmed. Answer options are supplied by the workbench UI.
- Registration date captured. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Verify actual registration, date and bond reference/amount.
- Match borrower, property and linked registered instruments.
- Record lender reporting/release actions separately from the registration attestation.

**Audit judgement:** A registration tick alone does not prove lender payout or subsequent reporting.

### 67. Bank Confirmation and Close-Out Complete

`bond_close_out_complete` · Owner: Bond Attorney · Assessment: **Retain and detail**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Bank final confirmation completed. Bond attorney close-out checklist completed.

**Current default confirmation items:**

- Bank final confirmation completed. Answer options are supplied by the workbench UI.
- Bond attorney close-out checklist completed. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Confirm lender registration reporting, payout/guarantee position and unresolved conditions.
- Record document delivery/custody, bank acknowledgement and relevant client communication.
- Resolve fees/refunds and any outstanding facility/security reporting obligation.

**Audit judgement:** The catalogue has one broad close-out task; use conditional items rather than another post-registration stage.

## Bond cancellation stage 1: Instruction & Bank

### 68. Existing Bond Confirmed

`cancellation_existing_bond_confirmed` · Owner: Cancellation Attorney · Assessment: **Tighten repeated security**.

**Current catalogue inputs:** Seller Existing Bond Status (`seller_existing_bond_status`)

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Seller existing bond confirmed. Cancellation requirement recorded on the matter.

**Current default confirmation items:**

- Seller existing bond confirmed. Answer options are supplied by the workbench UI.
- Cancellation requirement recorded on the matter. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Verify each affected registered bond/security and its property/share.
- Record the instructed cancellation/release/substitution route and owner.
- Distinguish registered-security removal from a paid-up loan account.

**Audit judgement:** Keep transfer discovery and cancellation verification connected; do not require duplicate unsupported facts.

### 69. Cancellation Bank Captured

`cancellation_bank_captured` · Owner: Cancellation Attorney · Assessment: **Tighten — finding 4**.

**Current catalogue inputs:** Cancellation Bank (`cancellation_bank`)

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Cancellation bank captured. Bank details checked with seller or cancellation instruction.

**Current default confirmation items:**

- Cancellation bank captured. Answer options are supplied by the workbench UI.
- Bank details checked with seller or cancellation instruction. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Match the current bondholder/lender to each security item.
- Verify instruction source/contact and authorised cancellation attorney.
- Identify multiple holders, cessions or lender changes requiring review.

**Audit judgement:** The current bank field is scalar; a note about a second lender is not a verified second readiness row.

### 70. Bond Account Number Captured

`cancellation_bond_account_captured` · Owner: Cancellation Attorney · Assessment: **Tighten — finding 4**.

**Current catalogue inputs:** Bond Account Number (`cancellation_bond_account_number`)

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Bond account number or reference captured. Account details checked before figures request.

**Current default confirmation items:**

- Bond account number or reference captured. Answer options are supplied by the workbench UI.
- Account details checked before figures request. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Record each relevant facility/account and its relationship to registered bond(s).
- Verify references against lender instructions and security records.
- Resolve mismatched or additional accounts before requesting/accepting settlement figures.

**Audit judgement:** Avoid assuming one loan account equals one registered mortgage bond.

### 71. Cancellation Instruction Received

`cancellation_instruction_received` · Owner: Cancellation Attorney · Assessment: **Retain and detail**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** `seller_bond_cancellation_information`

**Declared evidence:** Cancellation instruction received. Instruction source, bank, and reference captured.

**Current default confirmation items:**

- Cancellation instruction received. Answer options are supplied by the workbench UI.
- Instruction source, bank, and reference captured. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Verify lender/holder instruction and the appointed attorney.
- Match affected bond(s), property and disposition.
- Record conditions and source/date/reference, including amended instructions.

**Audit judgement:** A seller request initiates the process; it is not automatically the bondholder’s registrable consent.

## Bond cancellation stage 2: Notice & Figures

### 72. Bond Cancellation Notice Status Captured

`notice_period_captured` · Owner: Cancellation Attorney · Assessment: **Retain lender-specific decision**.

**Current catalogue inputs:** Cancellation Notice Status (`notice_period_status`)

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Notice status captured. Notice date or no-notice risk recorded.

**Current default confirmation items:**

- Notice status captured. Answer options are supplied by the workbench UI.
- Notice date or no-notice risk recorded. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Record actual notice terms, whether notice is required, and evidence/date.
- Check the particular lender/facility’s waiver or charging position.
- Link anticipated settlement and follow-up rather than enforce a universal waiting period.

**Audit judgement:** Notice and charges vary. The current task label is suitably about status rather than a mandatory 90-day delay.

### 73. Cancellation Figures Requested

`cancellation_figures_requested` · Owner: Cancellation Attorney · Assessment: **Retain**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Cancellation figures request sent to bank. Request date/reference captured.

**Current default confirmation items:**

- Cancellation figures request sent to bank. Answer options are supplied by the workbench UI.
- Request date/reference captured. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Request figures for every affected account/security disposition.
- Record date, bank reference and requested settlement horizon.
- Assign follow-up and re-request when changed instructions require it.

**Audit judgement:** One request task can contain repeated account rows instead of duplicate matters.

### 74. Cancellation Figures Received

`cancellation_figures_received` · Owner: Cancellation Attorney · Assessment: **Retain; repeat per account**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** `cancellation_figures`

**Declared evidence:** Cancellation figures received. Settlement amount and account details checked.

**Current default confirmation items:**

- Cancellation figures received. Answer options are supplied by the workbench UI.
- Settlement amount and account details checked. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Verify lender/account, settlement amount and included components/assumptions.
- Check figures date, payment/interest basis and relevant fees/conditions.
- Reconcile the intended settlement and identify shortfalls or revised figures.

**Audit judgement:** Figures must be current for the contemplated payment; upload alone is insufficient.

### 75. Figures Expiry Date Captured

`figures_expiry_captured` · Owner: Cancellation Attorney · Assessment: **Retain; repeat per account**.

**Current catalogue inputs:** Figures Expiry Date (`cancellation_figures_expiry_date`)

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Figures expiry date captured. Expiry checked against expected lodgement timeline.

**Current default confirmation items:**

- Figures expiry date captured. Answer options are supplied by the workbench UI.
- Expiry checked against expected lodgement timeline. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Record each issuer’s valid-until date and relevant settlement assumptions.
- Check expected lodgement, registration and actual settlement timing.
- Assign renewal and re-review where the horizon changes.

**Audit judgement:** Expiry must match the issuer’s actual terms, rather than a uniform period across banks.

### 76. Penalty and Notice Risk Captured

`notice_penalty_risk_captured` · Owner: Cancellation Attorney · Assessment: **Retain conditional decision**.

**Current catalogue inputs:** Penalty / Notice Risk (`penalty_notice_risk`)

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Penalty risk reviewed. Any penalty or notice concern escalated to the responsible attorney/client team.

**Current default confirmation items:**

- Penalty risk reviewed. Answer options are supplied by the workbench UI.
- Any penalty or notice concern escalated to the responsible attorney/client team. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Review the actual early-settlement/notice charge or waiver for the facility.
- Record any amount/risk and client or instruction response.
- Reconcile changed settlement figures and follow-up.

**Audit judgement:** This task should confirm a no-charge position just as truthfully as a charge risk.

## Bond cancellation stage 3: Guarantees & Documents

### 77. Guarantees Requested

`cancellation_guarantees_requested` · Owner: Cancellation Attorney · Assessment: **Retain and detail**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Guarantee request sent. Required settlement amount and wording supplied.

**Current default confirmation items:**

- Guarantee request sent. Answer options are supplied by the workbench UI.
- Required settlement amount and wording supplied. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Identify required security/settlement route for each lender/account.
- Supply the correct amount, beneficiary and conditions to the issuing attorney/bank.
- Record request/reference and ownership of shortfall or alternative-security questions.

**Audit judgement:** For an alternative instrument or paid-up bond, classify the actual requirement rather than invent a guarantee request.

### 78. Guarantees Received

`cancellation_guarantees_received` · Owner: Cancellation Attorney · Assessment: **Retain evidence review**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** `guarantee_letter`

**Declared evidence:** Cancellation guarantees received. Guarantee amount and bank details checked against figures.

**Current default confirmation items:**

- Cancellation guarantees received. Answer options are supplied by the workbench UI.
- Guarantee amount and bank details checked against figures. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Verify the actual security instrument, issuer, amount and beneficiary.
- Match current figures/account and relevant registration/payment conditions.
- Record dates, versions and missing or defective allocations.

**Audit judgement:** Receipt and acceptance remain separate decisions.

### 79. Guarantees Accepted

`cancellation_guarantees_accepted` · Owner: Cancellation Attorney · Assessment: **Retain handoff gate**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** `guarantee_letter`

**Declared evidence:** Guarantees accepted. Any guarantee wording changes resolved.

**Current default confirmation items:**

- Guarantees accepted. Answer options are supplied by the workbench UI.
- Any guarantee wording changes resolved. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Review the applicable wording and the holder’s settlement conditions.
- Record authorised acceptance of the current security/allocation.
- Resolve amendments, shortfalls and superseded versions with the transfer attorney.

**Audit judgement:** Preserve the acceptance safeguard while defining reviewed alternatives for non-standard dispositions.

### 80. Review Settlement Guarantee Allocation

`cancellation_guarantee_allocation_review` · Owner: Cancellation Attorney · Assessment: **Retain; mapping repair — findings 4/5**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** `cancellation_figures`; `guarantee_letter`

**Declared evidence:** Guarantee amount and beneficiary match current figures. Any shortfall, surplus, or revised allocation is resolved with the transfer attorney.

**Current default confirmation items:**

- Guarantee amount and beneficiary match current figures. Answer options are supplied by the workbench UI.
- Any shortfall, surplus, or revised allocation is resolved with the transfer attorney. Answer options are supplied by the workbench UI.
- guarantee_letter Answers: yes, no.

**Minimum proposed review items:**

- Reconcile accepted security to every affected account/security and current figures.
- Check beneficiary, amount, shortfall/surplus and allocation instructions.
- Record the agreed version and transfer-attorney handoff.

**Audit judgement:** Source database safeguards require this review, but the older cancellation action catalogue omits it.

### 81. Cancellation Documents Prepared

`cancellation_documents_prepared` · Owner: Cancellation Attorney · Assessment: **Retain and detail**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Cancellation consent or bond documents prepared. Documents checked against bank instruction.

**Current default confirmation items:**

- Cancellation consent or bond documents prepared. Answer options are supplied by the workbench UI.
- Documents checked against bank instruction. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Prepare the correct consent/instrument and required bond/title evidence.
- Check holder authority, bond references, property and current bank instructions.
- Resolve lost deeds/bonds or alternative disposition through a reviewed route.

**Audit judgement:** Do not treat all dispositions as identical full cancellations.

### 82. Seller Cancellation Documents Signed

`seller_cancellation_documents_signed` · Owner: Cancellation Attorney · Assessment: **Correct conditional gate — finding 1**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** `seller_signed_cancellation_documents`

**Declared evidence:** Seller cancellation documents signed where required. Signing authority and witnessing checked.

**Current default confirmation items:**

- Seller cancellation documents signed where required. Answer options are supplied by the workbench UI.
- Signing authority and witnessing checked. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Determine whether the actual instructed instrument requires seller execution.
- If required, verify the correct signatures, authority and execution evidence.
- If not required, record the reviewed basis and retain the actual holder consent/instruction; align readiness with this decision.

**Audit judgement:** The catalogue says where required but the critical readiness list demands completed for every active cancellation lane.

### 83. Bondholder Consent Confirmed

`cancellation_consent_confirmed` · Owner: Cancellation Attorney · Assessment: **Retain; mapping repair — finding 5**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** `cancellation_consent`

**Declared evidence:** Bondholder consent or authorised cancellation instruction verified. Any consent conditions resolved before lodgement.

**Current default confirmation items:**

- Bondholder consent or authorised cancellation instruction verified. Answer options are supplied by the workbench UI.
- Any consent conditions resolved before lodgement. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Verify the actual registered holder’s consent or other authorised legal basis.
- Check affected bonds/property and operative conditions.
- Record resolution evidence and any specialist order/exception.

**Audit judgement:** The older action catalogue omits this newer task. Consent should remain an explicit independent decision.

## Bond cancellation stage 4: Registration & Close-Out

### 84. Simultaneous Lodgement Confirmed

`cancellation_simultaneous_lodgement_confirmed` · Owner: Cancellation Attorney · Assessment: **Retain; mapping repair — finding 5**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Transfer and cancellation attorneys confirm the same lodgement plan. New bond attorney included where the buyer is registering a bond.

**Current default confirmation items:**

- Transfer and cancellation attorneys confirm the same lodgement plan. Answer options are supplied by the workbench UI.
- New bond attorney included where the buyer is registering a bond. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Confirm the actual transfer/cancellation batch and responsible attorneys.
- Include new bond instruments where applicable and all security dispositions.
- Record agreed plan/reference and changes; standalone cases require a declared alternative route.

**Audit judgement:** The older action catalogue omits this newer handoff task; its database safeguard already exists.

### 85. Cancellation Lodgement Ready

`cancellation_lodgement_ready` · Owner: Cancellation Attorney · Assessment: **Retain hard milestone**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Cancellation lodgement pack complete. Figures, guarantees, and simultaneous lodgement coordination confirmed.

**Current default confirmation items:**

- Cancellation lodgement pack complete. Answer options are supplied by the workbench UI.
- Figures, guarantees, and simultaneous lodgement coordination confirmed. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Confirm current figures/security, applicable documents and holder authority for each security item.
- Verify the agreed linked instruments and batch.
- Record authorised readiness without invented seller signatures or optional events.

**Audit judgement:** Correct applicability while keeping current-evidence and coordination safeguards.

### 86. Cancellation Lodged Simultaneously

`cancellation_lodged` · Owner: Cancellation Attorney · Assessment: **Retain event**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Cancellation lodgement confirmed. Simultaneous lodgement date/reference captured.

**Current default confirmation items:**

- Cancellation lodgement confirmed. Answer options are supplied by the workbench UI.
- Simultaneous lodgement date/reference captured. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Verify accepted lodgement, date, registry and reference.
- Match every affected security instrument to the agreed batch.
- Record rejected/withdrawn/re-lodged work and renew evidence as required.

**Audit judgement:** Do not count a batch confirmation as proof of completed cancellation.

### 87. Cancellation Registered

`cancellation_registered` · Owner: Cancellation Attorney · Assessment: **Retain event**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Cancellation registration confirmed. Registration date captured.

**Current default confirmation items:**

- Cancellation registration confirmed. Answer options are supplied by the workbench UI.
- Registration date captured. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Verify actual registered cancellation or the reviewed alternative disposition.
- Record date/reference and affected security items.
- Keep payment/account settlement evidence separate and follow up remaining obligations.

**Audit judgement:** The ordinary task represents cancellation. A different instrument needs explicit classification before reusing that outcome.

### 88. Settlement / Proof of Payment Captured

`settlement_proof_captured` · Owner: Cancellation Attorney · Assessment: **Retain; reconcile per account**.

**Current catalogue inputs:** Settlement Payment Reference (`settlement_payment_reference`)

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Settlement proof or payment confirmation captured. Settlement amount reconciled to cancellation figures.

**Current default confirmation items:**

- Settlement proof or payment confirmation captured. Answer options are supplied by the workbench UI.
- Settlement amount reconciled to cancellation figures. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Verify actual payment/settlement proof and beneficiary/account.
- Reconcile paid amounts against figures and final bank position.
- Record interest differences, refunds, retained debit orders and any unresolved balance.

**Audit judgement:** Registration and settlement are different facts. A guarantee acceptance is not proof of payment.

### 89. Cancellation Close-Out Complete

`cancellation_close_out_complete` · Owner: Cancellation Attorney · Assessment: **Retain and detail**.

**Current catalogue inputs:** None declared on this catalogue task.

**Current catalogue documents:** None declared on this catalogue task; conditional requirements can still be added by the matter/document model.

**Declared evidence:** Cancellation close-out checklist completed. Bank and stakeholder closure confirmations saved where applicable.

**Current default confirmation items:**

- Cancellation close-out checklist completed. Answer options are supplied by the workbench UI.
- Bank and stakeholder closure confirmations saved where applicable. Answer options are supplied by the workbench UI.

**Minimum proposed review items:**

- Resolve each account/security settlement and any remaining refund/retention.
- Record bank acknowledgement, required reporting and document custody/delivery.
- Communicate the relevant outcome and close with any residual obligations visibly assigned.

**Audit judgement:** A blanket close-out tick should not hide one unresolved account behind another completed one.

## Completeness and verification boundary

Every one of the 89 distinct source keys has a record and an assessment above; all map to a workspace stage. Four historical/dormant entries remain documented: the generic party specialist hold, combined VAT/exemption review, generic non-resident withholding review and combined levy/HOA review. Their retention is for history, not additional work for new ordinary matters.

The actual task catalogue, conditional plan, workbench, party/document resolver and source database guards were compared. The main report records the 1,152 synthetic plan checks, focused test results and two failing consistency checks. The extracted rows here do not prove a live browser flow, external acceptance, deployed database state or professional signoff. Only evidence about a particular matter can establish whether its legal requirements have been met.

The proposed items must be reconciled with current lender instructions, firm RMCP and registry requirements by the responsible practising reviewers. Keep applicability explicit and reuse shared evidence. The correct result is a shorter applicable checklist with complete decisions, not 89 mandatory tasks or the automatic addition of every proposed item.
