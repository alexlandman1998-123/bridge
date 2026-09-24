# Rental Property24 Phase 5 — Controlled ExDev Acceptance

Phase 5 is an evidence gate, not a production rollout. It evaluates a maximum of three non-customer rental listings submitted to Property24 ExDev. It does not enable production publishing, write data, or make a portal request.

Record evidence for each controlled submission, then evaluate it with the Phase 5 model. The gate requires:

- an ExDev listing number;
- no customer data and no more than three ExDev listings;
- rendered rental amount, frequency, deposit policy, availability, mapped agent, and photos;
- guarded missing-photo, invalid-agent, duplicate-submit, and unsupported-house-share paths; and
- a successful post-submit reconciliation.

Retirement accommodation remains optional. If selected, record that it is retained in Arch9 but has no confirmed Property24 v55 field; it does not block Phase 5.

Run the local contract check with:

```bash
npm run test:rental-property24-phase5-acceptance
```

The next phase, production cutover, remains blocked until an explicitly approved pilot is requested.
