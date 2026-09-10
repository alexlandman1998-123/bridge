# Knowledge Factory Phase 1.5 - UAT activation and controlled pilot

This phase is the hand-off between the implemented code and the first live supplier lookup. It must use the UAT account first. Do not enter passwords into source code, `.env` files that are committed, Vercel `VITE_` variables, browser storage, or chat.

## What is manual

These tasks require an Arch9 administrator with access to the relevant supplier account:

1. In Google Cloud, enable **Maps JavaScript API** and **Places API (New)** for the Maps project. Create a browser key restricted by HTTP referrer to `https://app.arch9.co.za/*`; add only approved preview or local origins when needed.
2. In Supabase Edge Function Secrets, add the UAT supplier values:

   ```text
   KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT=https://propinfoapi.co.za/live/uat/graphql/
   KNOWLEDGE_FACTORY_EMAIL=<supplier UAT account email>
   KNOWLEDGE_FACTORY_PASSWORD=<supplier UAT password>
   ```

3. In Vercel for the platform application, add the non-sensitive browser configuration to the **Preview** environment for the pilot:

   ```text
   VITE_KNOWLEDGE_FACTORY_MAP_ENABLED=true
   VITE_GOOGLE_MAPS_API_KEY=<Google browser key>
   ```

   A `VITE_` value is included in the browser bundle. The Google key is acceptable there only because it is referrer- and API-restricted. Never use this prefix for Knowledge Factory credentials.

## What the deployment does

1. Apply the Knowledge Factory Phase 0 migration.
2. Deploy the `knowledge-factory-graphql` Supabase Edge Function.
3. Create one approved organisation entitlement and one named pilot-agent permission for `map_properties`.
4. Deploy the Vercel Preview build with the two browser variables.

The app will remain blocked unless all of those controls agree: signed-in agent, active organisation membership, organisation entitlement, named-agent permission, Edge Function secrets, and UI feature flag.

## UAT pilot script

1. Sign in as the named pilot agent and open **Canvassing → Property Search**.
2. Search a small Johannesburg-area viewport.
3. Enter a concrete business purpose such as `Canvassing potential seller opportunities in [area]`.
4. Click **Search this area** once and confirm that only parcel polygons appear.
5. Review the corresponding `knowledge_factory_audit_log` record: actor, organisation, purpose, bounded viewport, result count, and supplier cost fields.
6. Repeat only after changing the viewport. The gateway limits each agent to 12 searches per minute and 25 returned parcels per query.

## Cost guardrails

The Phase 1 map query asks only for parcel geometry, property ID, erf/portion, and suburb ID. It does not call the supplier's surcharged report endpoints.

| Supplier endpoint | Surcharge credits | Phase status |
| --- | ---: | --- |
| Summary | 1,000 | Not enabled |
| Owners / Sellers | 2,500 | Not enabled |
| AVM / Point of Interest | 800 | Not enabled |
| Bonds | 8,000 | Not enabled |
| Transfers | 20,000 | Not enabled |
| PropertyById | 35,000 | Not enabled |

Before enabling any of these in a later phase, use `GraphQL-Cost: validate`, obtain product and compliance approval, set an explicit per-agent/per-organisation spend limit, and make each report an intentional click action.

## Production promotion

Only after a successful UAT pilot, change the **Supabase server secret** to the pinned explicit production URL:

```text
KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT=https://propinfoapi.co.za/live/v0_1/graphql/
```

Do not use the supplier's `latest` production URL. Preserve the same credentials handling, named-user permission, audit, query cap, and rate limit. Detailed reports, FICA/KYC, and credit-bureau workflows remain disabled until their dedicated phases.
