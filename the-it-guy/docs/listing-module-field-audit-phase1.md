# Listing Module Field Audit - Phase 1

Date: 2026-08-25

## Goal

Phase 1 is a field audit only. It confirms what Arch9 already captures for sales and rentals, compares that against the PropCtrl-style listing flow, and identifies the obvious missing fields before any UI rebuild starts.

The implementation direction is:

- Keep sales and rentals as separate modules.
- Reuse the existing Arch9 data model and portal mapper code.
- Add missing fields only where they are useful for listing quality, Property24, Private Property, or the seller/landlord workflow.
- Keep Property24 and Private Property as output channels, not as the shape of the user-facing form.

## Current Source Files Checked

- `src/lib/agentListingStorage.js`
- `src/lib/listingDataMapper.js`
- `src/lib/listingSellerProfileBuilderModel.js`
- `src/lib/listingDataIntegrity.js`
- `src/services/rentals/rentalListingDraftModel.js`
- `src/services/rentals/rentalListingIndexModel.js`
- `src/services/rentals/rentalListingProperty24FieldComparisonModel.js`
- `server/services/property24ListingMapper.js`
- `server/services/property24RentalListingAdapter.js`
- `server/services/privatePropertyListingMapper.js`
- `server/services/privatePropertyRentalListingAdapter.js`
- `sql/20260509_private_listing_foundation.sql`
- `sql/20260820_property24_agent_catalog_mappings.sql`
- `sql/20260820_property24_listing_syncs.sql`
- `sql/20260824_private_property_listing_syncs.sql`

## Shared Listing Fields

These should remain shared between sales and rentals. They should not be duplicated into two unrelated structures.

| Field area | Current Arch9 coverage | Notes |
| --- | --- | --- |
| Address | Covered | `address_line_1`, suburb, city, province, postal code, rental street/unit/complex fields, and portal address mapping already exist. |
| Property type | Covered | Existing listing and publication fields map to Property24 and Private Property property types. |
| Bedrooms and bathrooms | Covered | Used by public listing, Property24, Private Property, and rental index/readiness. |
| Parking, garages, carports | Mostly covered | Rentals are richer than sales. Sales should reuse the same UI pattern. |
| Erf size and floor size | Covered | Used by Property24 and Private Property mappers. |
| Description and heading | Covered | `description`, `listingPreviewDescription`, `title`, and publication title/description are already supported. |
| Photos and floor plans | Covered at portal layer | Existing mappers support image and floor plan media. UI polish is still needed later. |
| Assigned/listing agent | Covered | Arch9 assignment exists; Property24 and Private Property agent mapping exists separately. |
| Portal sync tracking | Covered | Property24 and Private Property sync tables/services exist. |
| Portal readiness | Covered for Property24 rentals, covered by mapper blockers for sales | Sales needs a friendlier readiness UI, but the backend blockers already exist. |

## Sales Module Audit

Sales should start with seller capture, then listing/property capture. The existing system already supports seller-first workflows.

| Field area | Status | Evidence / decision |
| --- | --- | --- |
| Seller name, email, phone | Covered | Seller lead and seller profile capture models already exist. |
| Seller legal type | Covered | Individual, married individual, multiple owners, company, trust, and foreign variants are supported. |
| Seller portal/onboarding | Covered | Seller onboarding status, token/link, form data, and integrity checks exist. |
| Property address | Covered | Private listing and seller onboarding mapping already use address fields. |
| Property type/category | Covered | Private listing and seller profile builder support property type/category. |
| Asking price | Covered | `asking_price`, `askingPrice`, seller profile draft, Property24 mapper, and Private Property mapper use it. |
| Mandate type/status | Covered | `mandate_type`, `mandate_status`, seller onboarding, and mandate statuses exist. |
| Mandate start/expiry | Partially covered | Seller profile builder and Property24 expiry mapping support this, but sales UI should make signed date and expiry date clearer. |
| Rates and levies | Covered | Seller profile builder and portal mappers use rates/levies. |
| Transfer duty / no transfer duty | Needs UI/data confirmation | Transaction code has transfer-duty concepts, but listing-level sales capture should expose a clear no-transfer-duty toggle or transfer-duty treatment field. |
| Ownership type | Partially covered | Seller profile property structure exists. Listing UI should expose this plainly. |
| Marketing heading/description | Covered | Existing listing/publication fields support this. |
| Show location / address visibility | Partially covered | Portal mappers support show/hide address patterns. Sales UI needs simplified controls. |
| Video / virtual tour links | Needs field exposure | PropCtrl exposes YouTube, Matterport, and Eye Spy 360. Portal mappers do not currently use these cleanly. |
| Show days | Needs field exposure | Private Property mapper supports showday events via options, but listing UI/data capture is not yet clean. |
| Photos/floor plans | Covered at portal layer | UI polish and image quality warnings should come later. |
| Reduced banner / price on application | Needs decision | PropCtrl supports these. Arch9 should only add them if they map cleanly to portals or a business need. |
| Agency web reference | Covered via listing reference | `listing_reference` and source references exist. UI can label this better. |
| Development link | Defer | PropCtrl links a listing to a Property24 development. This should be treated as a later development-module integration, not core sales listing capture. |

## Rental Module Audit

Rentals should start with landlord capture, then rental/property capture. The rental module is already richer than the sales listing capture in many places.

| Field area | Status | Evidence / decision |
| --- | --- | --- |
| Landlord name, email, phone | Covered | Rental draft and index models capture landlord details. |
| Landlord type | Covered | Individual, company, trust supported in rental draft. |
| Property address | Covered | Full address, unit, complex, street number/name, suburb, city, province, postal code, and visibility are covered. |
| Property type | Covered | Rental draft and portal adapters support property type. |
| Monthly rent | Covered | Required by rental draft and Property24 rental adapter. |
| Deposit | Covered | Deposit amount, deposit requirement, deposit multiplier, utility/key deposits, and fees exist. |
| Available/occupation date | Covered | Required by rental draft and Property24 rental readiness. |
| Lease period | Covered | Months and period type are captured and mapped to Property24 rental info. |
| Furnished | Covered | Rental draft, index, and Property24 adapter support it. |
| Pets allowed | Covered | Rental draft, index, and Property24 adapter support it. |
| Utilities/prepaid/included costs | Covered | Rental includes/excludes, utilities policy, prepaid electricity, prepaid water exist. |
| Rental mandate status/dates | Covered | Mandate status, start date, and end date exist. |
| Marketing approval | Covered | Rental marketing approval gate exists. |
| Inspection status/notes | Covered | Rental inspection status and notes exist. |
| Features | Mostly covered | Garden, pool, flatlet, access gate, alarm, electric fencing, security post, built-in cupboards, fibre, borehole, backup water, solar backup, balcony, patio, braai, clubhouse, gym, laundry, scenic view, satellite exist. |
| Solar geyser / solar panels / gas geyser / water tanks | Needs field refinement | Rental has `solarBackup`, `backupWater`, `borehole`, and prepaid fields, but not the exact PropCtrl-style feature split. |
| Video / virtual tour links | Needs field exposure | Same gap as sales. |
| Show days/viewing slots | Needs field exposure | Rental inspections exist; portal show day publishing needs a clean capture model. |
| Photos/floor plans | Covered at portal layer | UI polish and image quality warnings should come later. |

## Portal-Specific Audit

### Property24

Already covered:

- Agency ID and account settings.
- Agent mappings.
- Catalog mappings for suburb and property type.
- Listing create/update/status planning.
- Sales and rental payload planning.
- Rental field comparison/readiness model.
- Lead import/sync groundwork.
- Listing sync tracking and attempt logging.

Known blocker/risk:

- ExDev may not return usable test Property24 agent IDs. Arch9 can prepare and preview payloads, but real live publishing depends on Property24 confirming the agent ID flow.

### Private Property

Already covered:

- Branch/agent/property IDs in mapper options.
- Sales and rental listing XML preview.
- Photo URLs.
- Address visibility.
- Residential, commercial, land, and farm categories.
- Rental status as `ToLet`.
- Private Property listing sync tracking.

Known blocker/risk:

- Private Property branch/agent IDs must be configured per agency before real publishing.

## Obvious Missing Fields To Add Later

These are the obvious PropCtrl-inspired fields that should be considered in later phases because they are either missing, not cleanly exposed, or not consistently represented across sales/rentals.

### Add To Sales First

- Transfer duty treatment / no transfer duty.
- Mandate signed date as a first-class sales listing field.
- Ownership type shown clearly in listing UI.
- Address visibility / show location as a simple control.
- Video and virtual tour links: YouTube, Matterport, Eye Spy 360.
- Show day/viewing schedule capture.
- Better media ordering, cover image, floor plan UX, and image quality warnings.

### Add To Rentals First

- Video and virtual tour links: YouTube, Matterport, Eye Spy 360.
- Show day/viewing schedule capture, connected to rental inspections.
- More exact energy/water features: solar geyser, solar panels, gas geyser, water tanks, inverter/battery.
- Cleaner feature toggles for portal-ready fields.

### Add Only If Business Decides

- Reduced banner.
- Price on application.
- Property24 development link.
- Feature impression star ratings.
- Source dropdown.

These fields exist in PropCtrl, but they should not automatically be added unless they improve Arch9 workflows or are required by a portal.

## Recommended Data Shape

Do not duplicate the same physical property fields across independent sales and rental systems. Use this conceptual split:

```text
Shared property/listing facts
  - Address
  - Property type
  - Sizes
  - Rooms
  - Features
  - Media
  - Location visibility

Sales-specific facts
  - Seller
  - Selling price
  - Mandate
  - Ownership/transfer duty
  - Offers/transaction

Rental-specific facts
  - Landlord
  - Monthly rent
  - Deposit
  - Lease period
  - Availability
  - Tenant applications/lease

Portal-specific facts
  - Property24 agency/agent/catalog mappings
  - Private Property branch/agent/property IDs
  - Published status and sync metadata
```

## Phase 1 Outcome

Phase 1 confirms that most required data already exists. The next implementation phases should focus on:

1. Redesigning the sales listing UI around seller-first capture.
2. Redesigning the rental listing UI around landlord-first capture.
3. Reusing the same shared field components where the field is genuinely shared.
4. Adding only the missing fields listed above.
5. Keeping portal complexity hidden behind readiness checks.

