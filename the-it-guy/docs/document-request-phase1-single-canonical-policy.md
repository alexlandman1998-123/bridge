# Document Request Phase 1: Single Canonical Policy

## Status

Implemented as a canonical policy gate.

Phase 1 makes `config/document-request-phase1-legal-checklist.json` the single policy source for document requirements. The runtime matrix and planner consume that checklist; buyer, seller, bond, attorney, and portal work in later phases must map to this policy rather than creating their own requirement lists.

## Command

```bash
npm run verify:document-request-phase1-single-canonical-policy
```

This runs the Phase 0 map, validates the canonical policy, and writes:

```bash
output/document-request-phase1-single-canonical-policy.json
```

The report is read-only:

```json
{
  "commit": false,
  "mutatedData": false
}
```

## Policy Decisions

- The canonical checklist is the source of truth.
- Pending-policy rows are not requestable by default and do not block workflow stages.
- Pending-policy rows can appear in internal/legal review reports until approved.
- Legacy buyer/seller keys must map through the canonical adapter or migration/backfill layer.
- `information_sheet` is a retired legacy request. Historical uploads remain readable, but it is not generated or aliased to `buyer_fica_pack`.
- Document responsibility and upload actor are separate. A buyer- or seller-supplied document remains that client's responsibility when an authorised agent uploads an emailed copy on the client's behalf.
- Canonical request plans expose `responsiblePartyRole`, `uploadableByRoles`, and `uploadOnBehalfRoles`; an agent upload never transfers the underlying client responsibility to the agent.
- New client-visible document requirements must first be added to the canonical policy.
- `property_acquisition_record` and `capital_improvement_records` remain outside canonical policy until legal approval confirms they are needed.

## Current Policy Shape

The current policy contains:

- 67 canonical requirements
- buyer, seller, agent, transfer-attorney, and cancellation-attorney owner roles
- buyer/seller client-visible requirements
- professional-shared transaction requirements
- finance and bond-originator visible requirements
- pending-policy beneficial-ownership and ANC rows

Current pending signoff keys:

- `company_beneficial_ownership`
- `trust_beneficial_ownership`
- `buyer_anc_document`
- `electrical_coc`
- `conditional_compliance_certificates`

That means Phase 1 is valid as a single-source policy gate, but production activation still needs legal/product signoff before pending decisions become default client requests.

## Gate Behaviour

Default mode allows Phase 2 to proceed when the policy is structurally valid:

```bash
node scripts/document-request-phase1-single-canonical-policy.mjs
```

Strict signoff mode fails while signoff decisions remain pending:

```bash
node scripts/document-request-phase1-single-canonical-policy.mjs --strict-signoff
```

## Exit Criteria

Phase 1 is complete when:

- the canonical checklist is validated as the single source
- requirement keys are unique
- owner roles, visibility, levels, and blockers are within the approved vocabulary
- pending-policy rows are visible but not requestable by default
- deferred acquisition/improvement records are absent from canonical policy
- sample buyer, seller, bond, attorney, and bond-originator plans resolve from the same canonical matrix

The next implementation phase is Phase 2: make request containers propagate consistently across workspaces and portals.
