# Buyer Process Global Diagnostic

This diagnostic is for the global buyer process only. It must not rely on Kingstons buyer OTP behaviour, Kingstons seller-pack routing, or organisation-name autodetection.

The smoke scope covers:

- send buyer onboarding
- public buyer onboarding plus offer submission
- manual uploads for OTP and offer evidence
- no buyer OTP generation action in the global buyer process
- buyer documents and offer evidence reaching the lead pipeline
- accepted offer conversion into a transaction
- roleplayer handoff triggers for transfer attorney, bond originator, and transaction operations
- listing-to-transaction routing propagation

The diagnostic is non-mutating unless an individual child check explicitly opts into live verification through its own environment flags.
