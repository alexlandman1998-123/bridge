# Knowledge Factory Phase 0 runbook

Phase 0 creates the secure boundary only. It does not return live property, owner, FICA, KYC, or credit data. The sole supplier-facing action is a cost-only validation of the fixed, future map query.

## Deploy order

1. Apply `supabase/migrations/20260909185627_knowledge_factory_phase0_foundation.sql`.
2. Deploy the `knowledge-factory-graphql` Edge Function.
3. In Supabase Edge Function Secrets, set the following values. Do not add them to a repository, client bundle, or localStorage.

   ```text
   # UAT only. Use this for the pilot and development.
   KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT=https://propinfoapi.co.za/live/uat/graphql/
   KNOWLEDGE_FACTORY_EMAIL=service-account-email
   KNOWLEDGE_FACTORY_PASSWORD=service-account-password
   ```

4. Verify the supplier account is contractually permitted to use the requested operations and that the organisation has an active data-processing basis.
5. Create the organisation entitlement and named-user permission only after that review. The records are disabled by default.

   ```sql
   insert into public.knowledge_factory_organisation_access (
     organisation_id, enabled, allowed_operations, supplier_account_reference, activated_by, activated_at
   ) values (
     '<organisation UUID>', true, array['map_properties'], '<supplier account reference>', '<authoriser UUID>', now()
   );

   insert into public.knowledge_factory_user_permissions (
     organisation_id, user_id, allowed_operations, granted_by
   ) values (
     '<organisation UUID>', '<agent UUID>', array['map_properties'], '<authoriser UUID>'
   );
   ```

## Safe verification

Invoke the function as an authorised user with `action: "status"`. Once entitlement is approved, use `action: "validate_map_query"` with a specific business purpose and a small South African bounding box. It sends `GraphQL-Cost: validate`, so the vendor should calculate cost without returning property data.

Every allowed or denied validation attempt is recorded in `knowledge_factory_audit_log`. The table is immutable; it deliberately stores only operational metadata and cost fields, never the supplier payload.

## Supplier endpoint policy

Use the UAT endpoint for development and the controlled pilot. Do not use the supplier's `latest` endpoint for production: it can change when new schema versions are deployed. When production is approved, replace only the server secret with the pinned explicit version:

```text
KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT=https://propinfoapi.co.za/live/v0_1/graphql/
```

The endpoint remains an Edge Function secret. No supplier URL, email, password, bearer token, or GraphQL query is configured in a browser environment variable.

## Phase 1 boundary

Phase 1 is implemented as the fixed `map_properties` execution query and the internal map UI. It preserves the 25-result cap, South Africa and viewport limits, explicit purpose capture, named-user permission check, per-user rate limit, cost audit, and no raw supplier payload retention. Enable the browser UI only with `VITE_KNOWLEDGE_FACTORY_MAP_ENABLED=true` and a browser-restricted `VITE_GOOGLE_MAPS_API_KEY`.

Do not enable `property_summary`, `property_report`, `fica_kyc`, or `credit_check` until their data-minimisation, lawful-basis, consent, retention, and role policies have been approved.
