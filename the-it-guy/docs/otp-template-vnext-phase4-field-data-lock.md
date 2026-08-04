# OTP Template vNext Phase 4 Field and Data Lock

Status: `OTP_FIELD_DATA_LOCK_READY_FOR_TEMPLATE_PERSISTENCE`

Phase 4 locks the actual OTP vNext placeholder surface from the Phase 1 shell and Phase 3 legal wording draft. It is the contract that prevents the OTP from drifting into free-text fields, route-mixed placeholders or unowned merge data.

## Locked Rules

Every rendered OTP token must have:

- a canonical OTP merge-field registry entry
- an allowed route variant
- a source owner from `OTP_DATA_SOURCE_OWNERS`
- at least one source path
- a known field policy
- no owner mismatch between the shell/wording section and the registry

The route split is also locked:

- `resale_existing_property` includes seller, resale property, disclosure and seller-signature tokens
- `resale_existing_property` excludes developer-only, development-unit and developer-signature tokens
- `new_development` includes developer, development, unit, VAT and developer-signature tokens
- `new_development` excludes resale seller-only disclosure and seller-signature tokens

## Source Owners

The lock confirms that buyer onboarding does not own seller, developer, conveyancer, agent or legal template data. Those fields remain separated across:

- `buyer_onboarding`
- `seller_onboarding`
- `listing_property_record`
- `development_setup`
- `development_unit_setup`
- `transaction_offer_terms`
- `conveyancer_transfer_assignment`
- `organisation_agent_settings`
- `legal_template_registry`
- `signing_runtime`

## Evidence

The implementation lives in `src/core/documents/otpFieldDataLock.js`.

Run:

```sh
npm run test:otp-field-data-lock-phase4
npm run verify:otp-template-vnext
```

## Boundary

Phase 4 does not mutate Supabase, persist templates, approve legal wording, render PDFs, or enforce runtime generation. It only proves the field/data contract is ready before template persistence and later runtime enforcement.
