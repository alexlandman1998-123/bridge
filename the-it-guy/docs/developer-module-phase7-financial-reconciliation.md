# Developer Module Phase 7 Financial Reconciliation Export

Phase 7 gives the developer overview a finance-ready reconciliation export for
reservation deposits and alteration charges. It is intended for accounts,
conveyancers, and developer operations teams who need one practical CSV instead
of reading each unit workspace manually.

## Scope

- Export reservation deposit summary rows for the development.
- Export reservation deposit detail rows per transaction.
- Export alteration detail rows with the linked unit and transaction where
  available.
- Include amount, status, treatment, and practical action columns.
- Preserve the distinction between deposits credited to purchase price,
  separate invoices, and refundable holds.
- Preserve the distinction between alterations included in purchase price,
  separate invoices, and no-charge items.

## Operator Outcome

The developer overview exposes **Download reconciliation** in the financial
roll-up section. The downloaded CSV should answer:

- which deposits must be deducted from buyer purchase price balances;
- which deposits or alterations must be invoiced separately;
- which alterations must be reflected in OTP addenda or sale documents;
- which rows need proof, allocation, or operational follow-up before handoff.

## Verification

Run the Phase 7 contract directly:

```bash
npm run test:developer-module-phase7
```

Run the full developer module chain:

```bash
npm run verify:developer-module
```
