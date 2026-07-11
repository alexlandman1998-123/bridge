# Legal Scenario Matrix V1

Status: draft master specification  
Created: 2026-07-11  
Scope: South African conveyancing business rules for Arch9.  
Principle: supported scenarios may proceed through automation; manual-review scenarios must stop for conveyancer review; unsupported scenarios must not be guessed into a supported branch.

## Scenario Status Legend

| Status | Meaning |
| --- | --- |
| Supported | Platform can ask questions, request documents, route workflow, and enforce core checks without manual override. |
| Manual Review | Platform may collect intake data, but must block automated progression until a conveyancer/compliance owner reviews. |
| Not Supported | Platform must show an unsupported-scenario stop and continue outside automated workflow. |

## Buyer Scenarios

| Scenario | Status | Required Questions | Required Documents | Required Workflow | Required Legal Checks | Required Partner Tasks |
| --- | --- | --- | --- | --- | --- | --- |
| Individual buyer | Supported | Identity, tax, nationality, residency, address, marital status, employment, finance, source of funds | ID/passport, proof of address, tax number where available, finance proof | Buyer onboarding -> OTP -> finance -> transfer | FICA, capacity, marital status, source of funds | Agent monitors onboarding; attorney verifies FICA; bond originator only if bond/hybrid |
| Married in community buyer | Supported | Individual questions plus spouse details, spouse identity, marital regime | Buyer ID, spouse ID, marriage certificate, proof of address, finance proof | Buyer onboarding -> spouse/signing checks -> finance -> transfer | Spouse authority/signing, FICA for relevant spouse, marital regime | Attorney verifies signing authority |
| Married ANC buyer | Supported | Individual questions plus spouse details, ANC/accrual indicator | Buyer ID, proof of address, marriage certificate, ANC if requested/available, finance proof | Buyer onboarding -> marital-doc check -> finance -> transfer | Marital regime and signing implications | Attorney reviews ANC/marital record where needed |
| Married ANC with accrual buyer | Supported | Married ANC questions plus accrual indicator | Buyer ID, proof of address, marriage certificate, ANC/accrual docs, finance proof | Buyer onboarding -> marital-doc check -> finance -> transfer | Accrual regime and signing implications | Attorney reviews if required |
| Co-purchasers, natural persons | Supported | Each purchaser identity, tax, address, marital status, ownership share, consent, finance contribution | Each purchaser ID/proof of address, ownership split confirmation, finance proof | Buyer onboarding -> share validation -> OTP -> finance -> transfer | Share total equals 100%, each purchaser consent, FICA per purchaser | Agent follows missing co-purchasers; attorney verifies all signatories |
| Company buyer | Supported | Company registration, directors, beneficial owners, authorised signatory, finance, VAT/tax where relevant | Registration docs, director IDs, company resolution, signatory ID, proof of address, beneficial owner docs, finance proof | Entity onboarding -> authority check -> finance -> transfer | Company status, authority, FICA, beneficial ownership | Attorney verifies resolution; bond originator verifies entity finance if bond |
| Trust buyer | Supported | Trust registration, trustees, authorised trustee, trust address, finance, beneficial owners | Trust deed, letters of authority, trustee IDs, trust resolution, proof of address, finance proof | Entity onboarding -> trustee authority -> finance -> transfer | Current authority, trustee signing, FICA, beneficial ownership | Attorney verifies trust authority and signing |
| Foreign individual buyer | Manual Review | Identity, passport, nationality, residency, tax, source of funds, source of wealth, SA/offshore payment route | Passport, visa/residency evidence, proof of address, source of funds, source of wealth, exchange-control declaration, finance proof | Buyer onboarding -> compliance review -> finance -> transfer | FICA enhanced due diligence, SARB/exchange-control route, tax/residency | Attorney/compliance owner reviews; authorised dealer evidence if offshore funds |
| Foreign company buyer | Manual Review | Foreign registration, jurisdiction, directors, beneficial owners, authorised signatory, source of funds, payment route | Foreign registration, authenticated authority, director IDs/passports, beneficial owner docs, source-of-funds docs | Entity onboarding -> compliance/legal review -> finance -> transfer | FICA EDD, foreign authority, authentication, exchange control | Attorney and compliance owner review before OTP/finance gate |
| Foreign trust buyer | Manual Review | Foreign trust jurisdiction, trustees, beneficiaries/beneficial owners, authority, source of funds | Foreign trust deed, authenticated trustee authority, trustee IDs/passports, beneficial owner docs, source-of-funds docs | Entity onboarding -> compliance/legal review -> finance -> transfer | FICA EDD, foreign trust authority, exchange control | Attorney and compliance owner review |
| Close corporation buyer | Manual Review | CC registration, members, beneficial owners, authorised member/signatory, finance | CK/company registration docs, member IDs, member resolution, beneficial owner docs, finance proof | Entity onboarding -> authority review -> finance -> transfer | CC/member authority and FICA | Attorney verifies member authority |
| Buyer using power of attorney | Manual Review | Principal details, representative details, POA scope, expiry, signing location, authentication | POA, principal ID, representative ID, proof of authority, authentication/apostille if foreign | Buyer onboarding -> POA review -> OTP/signing -> transfer | POA validity, authority scope, capacity | Attorney reviews POA before signature accepted |
| Minor buyer | Manual Review | Minor identity, guardian details, source of funds, ownership intention | Minor birth certificate/ID, guardian ID, authority/court docs if required, finance proof | Intake -> legal review -> manual continuation | Capacity and guardian/court authority | Conveyancer review required |
| Deceased estate buyer | Manual Review | Estate details, executor details, authority, source of funds | Letters of executorship/authority, executor ID, estate bank/source docs | Intake -> legal review -> manual continuation | Executor authority and estate capacity | Conveyancer review required |
| Insolvent/sequestrated buyer | Manual Review | Insolvency status, trustee/curator details, authority | Trustee/curator appointment, authority docs, finance/source docs | Intake -> legal review -> manual continuation | Capacity and insolvency authority | Conveyancer review required |
| Buyer under curatorship/administration | Manual Review | Curator/administrator details, authority, transaction scope | Court/order documents, curator ID, authority docs | Intake -> legal review -> manual continuation | Capacity and authority | Conveyancer review required |

## Seller Scenarios

| Scenario | Status | Required Questions | Required Documents | Required Workflow | Required Legal Checks | Required Partner Tasks |
| --- | --- | --- | --- | --- | --- | --- |
| Individual seller | Supported | Identity, tax, address, marital status, mandate, property, existing bond, occupancy | ID, proof of address, signed mandate, title deed/rates docs, disclosure, compliance certificates | Seller onboarding -> mandate -> offer -> transfer | FICA, capacity, mandate validity, disclosure | Agent validates mandate; attorney verifies FICA/docs |
| Married seller | Supported | Individual seller questions plus spouse details, marital regime, consent need | Seller ID, spouse ID, marriage certificate, spouse consent, ANC if relevant | Seller onboarding -> spouse/authority check -> mandate -> offer -> transfer | Matrimonial authority and signing | Attorney verifies spouse/signing requirements |
| Multiple natural-person owners | Supported | Each owner identity, share, consent, contact, marital status | Each owner ID, proof of address, ownership split, all-owner consent/authority | Seller onboarding -> owner completeness -> mandate -> offer -> transfer | All owners captured and consenting | Agent chases missing owners; attorney verifies all signatories |
| Company seller | Supported | Company registration, directors, beneficial owners, authorised signatory, mandate authority | Registration docs, director IDs, company resolution, signatory ID, proof of address | Entity onboarding -> authority check -> mandate -> offer -> transfer | Company status, authority, FICA, beneficial ownership | Attorney verifies resolution; agent verifies mandate signer |
| Trust seller | Supported | Trust registration, trustees, authorised trustee, mandate authority | Trust deed, letters of authority, trustee IDs, trust resolution, signatory ID | Entity onboarding -> trustee authority -> mandate -> offer -> transfer | Current letters, trustee signing authority, FICA | Attorney verifies trust authority |
| Deceased estate seller | Supported | Executor details, estate reference, authority, property/mandate details | Letters of executorship/authority, executor ID, death certificate, estate docs, title/rates docs | Estate onboarding -> authority check -> mandate -> offer -> transfer | Executor authority and estate capacity | Attorney verifies estate authority before transfer |
| Seller using power of attorney | Manual Review | Principal details, representative details, POA scope, authority status, authentication | POA, principal ID, representative ID, proof of authority, authentication if foreign | POA onboarding -> attorney review -> mandate/offer -> transfer | POA validity, authority scope, signing capacity | Attorney must approve POA |
| Foreign individual seller | Manual Review | Identity/passport, residency, proceeds route, tax, bank/remittance, signing location | Passport, proof of address, tax docs, remittance/exchange-control docs, POA/authentication if signing abroad | Seller onboarding -> compliance review -> mandate/offer -> transfer | FICA EDD, exchange-control/remittance, tax | Attorney/compliance owner reviews |
| Foreign company seller | Manual Review | Foreign registration, directors, beneficial owners, authority, proceeds route | Foreign registration, authenticated authority, director IDs/passports, beneficial owner docs | Entity onboarding -> compliance/legal review -> mandate/offer | Foreign authority, FICA EDD, remittance | Attorney/compliance review required |
| Close corporation seller | Manual Review | CC registration, members, beneficial owners, authorised member, mandate authority | CC docs, member IDs, member resolution, beneficial owner docs | Entity onboarding -> authority review -> mandate/offer | Member authority and FICA | Attorney verifies member authority |
| Insolvent estate seller | Manual Review | Trustee details, authority, property authority, sale approval | Trustee appointment, authority docs, court/Master docs if required | Intake -> legal review -> manual continuation | Insolvency authority | Conveyancer review required |
| Company in business rescue | Not Supported | Business rescue details only for triage | Business rescue practitioner docs if collected manually | Unsupported stop | Business rescue authority outside current workflow | Manual conveyancer process |
| Company in liquidation | Not Supported | Liquidator details only for triage | Liquidator appointment docs if collected manually | Unsupported stop | Liquidation authority outside current workflow | Manual conveyancer process |
| Minor seller | Manual Review | Minor details, guardian/authority, property share | Minor ID/birth certificate, guardian ID, court/authority docs | Intake -> legal review -> manual continuation | Capacity and guardian/court authority | Conveyancer review required |
| Seller under curatorship/administration | Manual Review | Curator/administrator details, authority | Court/order docs, curator ID, authority docs | Intake -> legal review -> manual continuation | Capacity and authority | Conveyancer review required |

## Finance Scenarios

| Scenario | Status | Required Questions | Required Documents | Required Workflow | Required Legal Checks | Required Partner Tasks |
| --- | --- | --- | --- | --- | --- | --- |
| Cash finance | Supported | Cash amount, source of funds, deposit, payer, third-party payer | Proof of funds, bank statement/source docs, third-party FICA if applicable | Finance cash -> proof review -> transfer | FICA source of funds, third-party payer check | Attorney reviews proof; compliance reviews high-risk funds |
| Bond finance | Supported | Bond amount, bank/originator, preapproval, bond status, affordability consent | Bond application docs, proof of income, bank statements, approval/grant, bond instruction | Finance bond -> originator/bank -> transfer | Affordability consent, bond approval vs preapproval | Bond originator manages bank tasks |
| Hybrid finance | Supported | Cash amount, bond amount, source of cash, bank/originator | Proof of cash component, bond docs, approval/grant | Finance hybrid -> cash proof + bond proof -> transfer | Cash+bond sum, source of funds, bond approval | Bond originator and attorney coordinate |
| Developer finance | Manual Review | Developer terms, repayment/discount terms, conditions | Developer finance docs, sale terms, approval docs | Intake -> manual finance review | Developer-specific finance authority | Developer finance/admin review |
| Third-party payer | Manual Review | Payer identity, relationship, source of funds, amount | Payer ID/FICA, proof of funds, declaration | Finance review -> compliance gate | FICA EDD and source of funds | Compliance owner review |
| Offshore funds | Manual Review | Country, payer, authorised dealer, remittance route, source of funds | Offshore bank proof, authorised-dealer evidence, source-of-funds docs | Finance review -> compliance gate | Exchange-control and FICA EDD | Attorney/compliance review |

## Property and Transaction Scenarios

| Scenario | Status | Required Questions | Required Documents | Required Workflow | Required Legal Checks | Required Partner Tasks |
| --- | --- | --- | --- | --- | --- | --- |
| Freehold residential resale | Supported | Address, title, rates, disclosure, occupancy, certificates | Title deed copy, rates account/clearance, disclosure, required certificates | Listing -> mandate -> offer -> transfer -> registration | Mandate, disclosure, FICA, rates | Agent and transfer attorney |
| Sectional title | Supported | Scheme, unit/section, body corporate, levies, exclusive use | Levy statement/clearance, body corporate details, title/rates docs | Listing -> mandate -> offer -> levy/rates -> transfer | Levy clearance and scheme details | Managing agent/attorney tasks |
| Estate/HOA | Supported | Estate/HOA name, levies, consent/clearance, conduct rules | HOA/estate levy docs, consent/clearance if required | Listing -> mandate -> offer -> HOA clearance -> transfer | HOA consent/clearance | Agent/attorney liaise with HOA |
| Commercial property | Manual Review | VAT status, leases, zoning/use, tenant details, income schedule | Lease docs, VAT docs, zoning/use docs, rates, certificates | Listing -> commercial review -> mandate -> offer -> transfer | VAT/transfer duty, leases, FICA | Attorney reviews VAT and leases |
| Mixed-use property | Manual Review | Split use, VAT allocation, leases, zoning, occupancy | Commercial and residential docs, VAT docs, lease docs | Intake -> legal/tax review -> transfer | VAT/transfer duty split | Attorney/tax review |
| Agricultural property | Manual Review | Land use, water source, servitudes, zoning, occupancy | Zoning/land-use docs, water/borehole docs, title/rates, servitude docs | Intake -> legal review -> transfer | Land-use/servitude/water rights | Attorney review |
| Vacant land | Manual Review | Zoning, services, plans, servitudes, development conditions | Zoning, services, title/rates, planning docs | Intake -> legal review -> transfer | Planning/servitude restrictions | Attorney review |
| Share block | Not Supported | Triage only | Share block docs if manual | Unsupported stop | Not a normal immovable-property transfer workflow | Manual conveyancer process |
| Long-term leasehold | Not Supported | Triage only | Leasehold docs if manual | Unsupported stop | Leasehold-specific transfer outside current workflow | Manual conveyancer process |
| Land claim or restitution risk | Not Supported | Triage only | Claim/notice docs if manual | Unsupported stop | High-risk legal restriction | Manual conveyancer process |

## Suspensive and Special Conditions

| Scenario | Status | Required Questions | Required Documents | Required Workflow | Required Legal Checks | Required Partner Tasks |
| --- | --- | --- | --- | --- | --- | --- |
| Standard bond condition | Supported | Bond deadline, amount, bank/originator | Bond approval/grant and condition fulfilment proof | OTP -> finance bond/hybrid -> transfer | Deadline, fulfilment, waiver/extension if late | Bond originator updates status |
| Subject to sale of buyer property | Manual Review | Buyer property, sale status, deadline, link to existing transaction | Sale proof, linked OTP/transfer status | OTP -> condition review -> finance/transfer | Suspensive condition tracking | Agent/attorney review |
| Subject to inspection/defects | Manual Review | Inspection scope, deadline, remedy/waiver | Inspection report, defect list, waiver/addendum | OTP -> condition review -> transfer | Written fulfilment/waiver | Agent/attorney review |
| Deposit condition | Supported | Deposit amount, due date, paid by, trust account | Proof of payment, trust receipt | OTP -> deposit gate -> finance/transfer | Timely payment and refund authority | Agent/attorney verifies |
| OTP addendum/variation | Manual Review | Changed terms, affected parties, signature requirement | Signed addendum, updated OTP version | OTP versioning -> re-sign -> transfer | All required parties sign latest terms | Attorney reviews |

## Unsupported Scenario Handling Rules

| Trigger | Required Platform Response |
| --- | --- |
| Business rescue | Stop automated workflow and instruct user to contact conveyancer. |
| Liquidation | Stop automated workflow and instruct user to contact conveyancer. |
| Share block | Stop automated workflow and instruct user to contact conveyancer. |
| Land claim/restitution issue | Stop automated workflow and instruct user to contact conveyancer. |
| Unknown capacity restriction | Stop automated workflow and instruct user to contact conveyancer. |
| Unrecognized legal/entity type | Stop automated workflow unless mapped by a versioned registry rule. |

## Matrix Ownership

| Field | Value |
| --- | --- |
| Owner | Legal/compliance product owner |
| Code registry | `src/core/legal/legalRuleRegistry.js` |
| Review cadence | Before each launch gate and whenever FIC/SARB/PPRA/Companies/Trust/POPIA rules change |
| Next required phase | Phase 3 question matrix |
