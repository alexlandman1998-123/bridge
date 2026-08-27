# Buyer portal Phase 5: canonical finance

Phase 5 gives the production buyer portal and buyer demo one finance presentation model and status workspace. It improves the information hierarchy without replacing the systems that save applications, publish accounts, upload proofs, or record lender decisions.

## Data boundary

- Production bond status comes from the live bond application, OTP gate, completion calculation, originator offers, and transaction finance fields.
- Production cash/account status comes from `matterAccountsState`, which remains the source for balances, requests, statements, and updates.
- The demo maps `FINANCE_APPLICATION` into the same canonical model. Its payslip action changes only demo state.
- The model and shared UI contain no service, Supabase, storage, or fixture imports.

## Canonical finance vocabulary

- Modes: `cash`, `bond`, and `hybrid`.
- Bond stages: Application, Submitted to banks, Bank responses, Approval, and Guarantees.
- Status tones: action, info, complete, danger, and neutral.
- Lender applications and offers are normalized once, including accepted/recommended decisions, amount, rate, and repayment labels.

## Shared surfaces

- Production buyer Bond Application route, above the authoritative application and offer workflow.
- Production buyer Finance & Payments route, above the authoritative matter-account controls.
- Demo desktop Finance route.
- Demo mobile Finance route reads the same reactive model as desktop.

Seller account pages remain unchanged. Production handlers for bond submission, offer accept/decline, matter proof uploads, requested-document uploads, and document access remain authoritative and are not imported into the shared presentation layer.

## Verification

```bash
node --test src/core/clientPortal/__tests__/buyerFinancePresentationModel.test.js
node scripts/buyer-portal-phase5-canonical-finance.test.mjs
node scripts/buyer-portal-phase0-stability.test.mjs
node scripts/buyer-portal-phase1-shared-shell.test.mjs
node scripts/buyer-portal-phase2-shared-overview.test.mjs
node scripts/buyer-portal-phase3-canonical-journey.test.mjs
node scripts/buyer-portal-phase4-canonical-documents.test.mjs
npm run build
```
