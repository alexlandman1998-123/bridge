# Developer Leads Phase 19 Agent Developer Alignment

Phase 19 defines the shared product contract between the agency development
surface and the developer leads module.

It does not add a new UI flow yet. Its job is to make the next phases build
against one lifecycle, one set of shared fields, and one privacy model.

## Selling Models

Developer sale leads support three aligned modes:

- Developer Direct: the developer owns the buyer relationship and sells
  directly. The lead uses `leadOwner = developer`,
  `ownershipModel = developer_direct`, and `sellingModel = developer_led`.
- Developer Assigned Agent: the developer owns the lead but assigns it to an
  agent working on the development. The lead uses `leadOwner = developer`,
  `ownershipModel = developer_assigned`, and `sellingModel = agent_led`.
- Agency Introduced: an agency introduces the buyer and controls private buyer
  details until handover. The lead uses `leadOwner = agency`,
  `ownershipModel = agency_introduced`, and `sellingModel = agent_led`.

## Canonical Lifecycle

The shared developer-sale lead lifecycle is:

1. `developer_captured`
2. `agency_captured`
3. `protected_lead_shared`
4. `handover_requested`
5. `buyer_details_released`
6. `qualified`
7. `reserved`
8. `converted_to_transaction`
9. `buyer_onboarding_sent`

Agency-introduced leads begin in the agent portal, become protected developer
lead cards, then require handover before private buyer details can be used for
transaction creation.

Developer-direct and developer-assigned leads begin inside the developer leads
workspace and are visible to authorised developer users from capture.

## Shared Fields

Both modules must preserve these fields when creating, displaying, handing over,
or converting a developer-sale lead:

- `developerOrgId`
- `sourceAgencyOrgId`
- `sourceAgentUserId`
- `assignedAgentId`
- `primaryDevelopmentId`
- `preferredUnitId`
- `visibilityState`
- `leadOwner`
- `ownershipModel`
- `sellingModel`
- `reservationState`
- `leadStatus`
- `convertedTransactionId`

## Privacy Boundary

Agency Introduced leads must stay protected until handover.

Before handover, the developer module may display commercial context such as
the development, preferred unit, budget band, source agency, assigned agent,
reservation state, lead status, and protected summary.

Before handover, the developer module must not reveal:

- buyer full name
- buyer email
- buyer phone
- buyer ID or passport values
- private agency notes
- raw agency payloads

After `visibilityState = handed_over`, authorised developer users may use the
buyer details for conversion and buyer onboarding.

## Module Alignment

Developer module ownership:

- `/developer/leads` owns protected handover requests.
- `/developer/leads` owns lead conversion to developer-sale transactions.
- `/units` owns converted development transactions.

Agent module ownership:

- `/listings/developments` is the current agency development surface.
- The agent portal should own protected agency-fed lead capture.
- The agent portal should own buyer-detail release when handover is requested.

Shared transaction ownership:

- Both modules must use `createTransactionFromWizard` for developer-sale
  transaction creation.
- Both modules must use `transactionType = developer_sale`.
- Reservation deposit state must follow the same transaction lifecycle used by
  the developer module.

## Phase 19 Guardrails

No Phase 19 code creates live records, sends buyer onboarding emails, changes
RLS, deploys Edge Functions, or bypasses Supabase policies. It only defines and
tests the alignment contract that later implementation phases must follow.
