# OTP Phase 2: composition model

Phase 2 makes the OTP assembly model explicit without changing or approving live legal wording.

The product now treats an OTP as four separate responsibilities:

1. **Core wording** — the standard legal clauses included in every OTP.
2. **Transaction data** — schedules and sections populated from buyer, seller, property and sale information.
3. **Conditional clauses** — attorney-reviewed wording included only when a named onboarding fact matches its activation rule.
4. **Signing** — signature, witness, date and initial fields. Signing is no longer counted as standard legal wording.

## Managed onboarding facts

Only six primary routing facts control the ordinary top-level composition:

- `buyer_entity_type`
- `buyer_marital_regime`
- `seller_entity_type`
- `seller_marital_regime`
- `property_title_type`
- `finance_type`

The composition model accepts the existing aliases used across onboarding and normalises them into this small contract. It returns every section decision with a plain-language reason and reports unanswered facts instead of silently selecting a clause.

Unusual conditions are kept in a visibly separate exception layer: estate/HOA rules, exclusive-use areas, deposits, linked property sales, occupation before transfer, existing leases and VAT treatment. These activate the existing South African legal clause-pack engine when canonical deal facts are available; they are not hidden inside the buyer's entity classification.

## Legacy-template upgrade

When the standard-template editor detects an OTP with no identifiable core wording, it offers **Create standard OTP draft**. This creates a separate inactive native-structured draft with:

- the existing 26-section starter structure;
- core, data, conditional and signing classifications stored on each section;
- legal review marked `pending`;
- a link to the source template;
- no change to the live/default template.

The draft cannot be published until the existing legal clause coverage, scenario-matrix and governance gates pass. A qualified attorney must still approve the legal wording and activation facts.

## Verification

```sh
npm run test:otp-composition-phase2
npm run test:otp-legal-baseline
npm run build
```
