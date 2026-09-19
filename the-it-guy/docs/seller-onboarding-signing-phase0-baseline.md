# Seller onboarding → signing Phase 0 baseline

This phase makes no runtime change. Seller onboarding remains the fact-capture route; formal document signing remains a later, separate action.

## Current safe boundary

Onboarding captures ownership/authority, FICA and compliance facts, property facts, disclosure answers, and onboarding permissions. Drafts autosave and submission progresses the seller lead/listing and seller portal context. A submitted onboarding is not a signed mandate.

Generated FICA and disclosure documents are `ready_for_signature` at onboarding completion. The mandate remains a separate signed-document route. Later phases may build a frozen signing pack from submitted onboarding data, but must not duplicate its input fields.

## Regression boundary

Do not change onboarding field requirements, autosave, the completion RPC, or lead/listing status transitions while implementing the new journey shell. Verify them with `npm run test:seller-onboarding-signing-phase0`.
