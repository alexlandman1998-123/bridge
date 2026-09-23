# Property24 production access — Phase 1

Production credentials are intentionally separate from ExDev credentials. Set
these values only in the production secret store:

```text
PROPERTY24_PRODUCTION_BASE_URL=https://api.property24.com
PROPERTY24_PRODUCTION_BASIC_AUTH_USERNAME=...
PROPERTY24_PRODUCTION_BASIC_AUTH_PASSWORD=...
PROPERTY24_PRODUCTION_AGENCY_ID=...
PROPERTY24_PRODUCTION_USER_GROUP_ID=...
PROPERTY24_PRODUCTION_SEND_USER_GROUP_HEADER=true
```

The group header is optional only when Property24 confirms the Basic Auth user
is already scoped to the intended agency. Do not enable it until the account
manager has confirmed its value.

Run the read-only gate after changing credentials or agency scope:

```bash
npm run property24:production-access
```

It performs no listing, agent, status or database writes. It verifies Basic
Auth, the configured group (when enabled), the intended agency, agency agents,
listing reconciliation, and the Property24 catalogues. Publishing must remain
blocked unless this command reports `READY`.
