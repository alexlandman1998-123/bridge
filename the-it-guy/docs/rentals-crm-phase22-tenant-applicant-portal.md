# Rentals CRM phase 22 — tenant applicant portal

Phase 22 completes the tokenised tenant applicant journey at `/rental-application/:token`.

It follows the same secure-link pattern as Buyer/Seller onboarding, but is deliberately Rentals-specific. A tenant can save a draft, upload supporting documents, explicitly accept privacy, credit-check, and identity-verification consents, and submit the application. Submission remains server-validated and requires all application sections, identity and proof-of-income documents, and all three consents. After submission the token holder sees only their outcome/status; editing is closed.

The portal is vacancy/application-bound. Its tenancy conversion and CRM-stage reconciliation remain controlled staff workflow actions rather than public-token actions.
