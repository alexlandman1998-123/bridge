# MVP synthetic core-flow proof

Run the proof without creating any remote data:

```bash
npm run test:mvp-synthetic-core-flow
```

It rehearses four labelled `TEST — DO NOT ACTION` scenarios:

- cash / individual
- bond / company
- hybrid / trust
- development / company

For each scenario it proves seller lead-to-listing linkage, buyer offer linkage, accepted-offer conversion identity, idempotent replay, controlled test roles, participant/document/workflow bootstrap, notification suppression, and consistent gate decisions before and after required documents are verified.

This is a local contract proof. It does not create a lead, listing, offer, transaction, document, or notification in staging or production.
