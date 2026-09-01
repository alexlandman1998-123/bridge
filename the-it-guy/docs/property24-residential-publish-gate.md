# Property24 residential publish gate

Version: `arch9_property24_residential_publish_gate_v1`

Phase 1 moves residential and rental listing readiness from UI guidance into the server-side submit plan. A direct browser/API request cannot bypass these checks.

## Residential dwelling requirements

For verified residential dwelling types (House, Apartment/Flat, Townhouse), a Property24 submit plan requires:

- marketing title and description;
- mapped Property24 property type and suburb;
- price/rent and expiry date;
- at least one image for a new listing, with image bytes loaded for submission;
- bedrooms, bathrooms and floor size;
- active Property24 agent mapping, sourced from the assigned Arch9 agent;
- the existing feature values required by the Property24 payload.

Land/development and non-residential categories are not evaluated by this residential gate. Phase 0 blocks those categories until a separately verified mapper exists.

## Rental-only requirements

In addition to the residential requirements, a rental submit plan requires:

- monthly rent, rental cadence and occupation date;
- a signed rental mandate; and
- approved landlord-facing marketing.

The final two checks are derived from canonical Arch9 rental information and are added to the backend `dataBlockers`. They are not merely client-side warnings.

## Agent contact ownership

The listing only carries the mapped Property24 agent identifier. Telephone number, email, title and profile photo remain canonical on the Arch9 agent profile and are synchronised through the Property24 agent-profile flow. Only active mappings are eligible when resolving a listing publisher.
