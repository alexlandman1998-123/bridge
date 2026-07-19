# Arch9 MVP — Phase 4 staging UI journeys

Run this only after Phase 3D deployment evidence validates and the deployed RPC check passes. Use fresh, non-production staging records and complete every action through the UI.

## Required journeys

| ID | Finance / buyer / transaction |
| --- | --- |
| `cash_individual_resale` | Cash / individual / resale |
| `bond_company_private_sale` | Bond / company / private sale |
| `hybrid_trust_resale` | Hybrid / trust / resale |
| `development_company_development_sale` | Cash / company / development sale |

For each journey, record the transaction id and accepted-offer id, then prove:

1. Lead created and offer accepted.
2. One transaction created through the normal path.
3. Participants, document requirements, and workflow lanes appear.
4. Each gate first blocks progression, then clears only after the correct information is supplied:
   onboarding, OTP, finance, and transfer.
5. The transaction reaches registration-ready state.
6. Run `mvp-postdeploy-transaction-check.mjs` and record a passing result.

## Evidence file

Create a local, non-secret JSON file using this structure. Do not commit real contact data or credentials.

```json
{
  "environment": "staging",
  "projectRef": "staging-project-ref",
  "executedBy": "operations.tester@arch9.example",
  "completedAt": "2026-07-19T00:00:00.000Z",
  "executionMethod": "ui",
  "scenarios": [
    {
      "id": "cash_individual_resale",
      "transactionId": "uuid",
      "acceptedOfferId": "uuid",
      "createdThrough": "accepted_offer_ui",
      "checks": {
        "leadCreated": true,
        "offerAccepted": true,
        "transactionCreated": true,
        "participantsVisible": true,
        "documentsSeeded": true,
        "workflowLanesSeeded": true,
        "onboardingGateBlockedThenCleared": true,
        "otpGateBlockedThenCleared": true,
        "financeGateBlockedThenCleared": true,
        "transferGateBlockedThenCleared": true,
        "registrationReady": true,
        "postDeploySmokePassed": true
      }
    }
  ]
}
```

Validate the completed evidence:

```bash
npm run mvp:phase4:verify -- \
  --evidence=docs/staging-mvp-journeys.json \
  --deployment-evidence=/secure-local-path/staging-deployment-evidence.json
```

Any failed gate, duplicate transaction, missing seeded record, or failed smoke check is a stop condition for staging and production.
