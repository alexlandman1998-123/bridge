# Arch9 listing syndication field comparison

Status: proposed product contract, based on the implemented Arch9 mappers and
the Private Property Agency Feed Service API Rev 4.7.

This is a comparison of listing data, not a decision to make one portal the
source of truth. Arch9 owns the listing. Private Property and Property24 each
receive a channel-specific representation of the same listing.

## Reading this document

| Status | Meaning |
| --- | --- |
| Ready | Arch9 has a mapped field and the channel contract is verified. |
| Capture | The fact belongs in Arch9, but is not consistently captured in the listing workflow yet. |
| Transform | Arch9 owns the fact, but the channel needs a controlled mapping or code lookup. |
| Blocked | We must not publish this category or feature to that channel until its exact contract is verified. |
| Channel-only | A portal-specific setting that belongs in the publishing review, not the everyday listing form. |

## Product decision

The standard listing form must capture real-world facts only. It must not ask
an agent to choose a portal's XML enum or external identifier.

The publishing review is where Arch9 resolves those facts for each channel,
shows the result, and asks only for genuine portal-specific choices. A channel
must be blocked when Arch9 cannot represent the listing truthfully.

For example, a rental amount is stored as an amount plus a cadence. Arch9 must
not silently turn a weekly rental into a monthly rental for a portal.

## Shared core: one Arch9 fact, two channel outputs

| Listing fact | Arch9 canonical field or model | Private Property | Property24 | Decision |
| --- | --- | --- | --- | --- |
| Listing reference | Stable Arch9 listing ID/reference | Required `PropertyId` | Required source reference/listing number linkage | Ready. Keep the Arch9 reference immutable after first publication. |
| Listing purpose | Sale or rental | Required `ListingType` | Required `listingType` | Ready. |
| Lifecycle | Draft, active, pending, sold/let, withdrawn | `ForSale`, `ToLet`, `PendingOffer`, `Sold`, `Inactive` | Sale: `Active`, `Pending`, `Sold`, `Withdrawn`; rental: `Active`, `Pending`, `Rented`, `Withdrawn` | Transform. Keep one richer Arch9 lifecycle and map deliberately. |
| Listing category | Residential, land, farm/agricultural, commercial, industrial | Residential, Land, Farms, Commercial | Residential verified; commercial, industrial, agricultural and land/development currently blocked | Capture category once. Property24 non-residential publication remains blocked until its exact contract is verified. |
| Property subtype | House, apartment, townhouse, office, warehouse, etc. | Home Type, Business Type, Farm Type, Land Type attributes as applicable | Verified Property24 property-type ID for residential | Transform through maintained channel catalogues, never free-text at publish time. |
| Headline | Marketing title | Optional headline, maximum 200 characters | Recommended `descriptionHeader` | Ready. Require it as an Arch9 quality rule. |
| Description | Marketing description | Required, maximum 4,000 characters | Required | Ready. Validate length and unsafe characters before both submissions. |
| Address | Street number/name, unit, complex, suburb, town, province, coordinates and visibility preferences | Street name/number required; address is locked after activation; suburb ID preferred | Suburb ID required; street details supported | Capture completely before first publication. Treat post-activation address changes as a manual Private Property support case. |
| Location privacy | Hide street, number, unit and complex settings | Explicit hide flags | `showLocation` control | One Arch9 privacy policy with portal-specific mapping. Warn that Private Property says hidden address detail can reduce ranking. |
| Bedrooms and bathrooms | Numeric facts | Required for residential | Required for verified residential dwellings | Ready. |
| Floor area | Square metres | Attribute where applicable | Required for verified residential dwellings; mapped as `floorArea` | Ready for residential. Capture universally where known. |
| Erf/land area | Square metres/hectares and unit | Required `LandArea` for land | Available in Property24 property info; land category publication blocked | Capture now. Publish to Private Property; hold Property24 land until verified. |
| Rates and taxes | Monthly amount and known/not-applicable state | Rates or combined levy/rates attribute | Mapped `municipalRatesAndTaxes` | Ready to capture; use a money amount plus frequency, not a display string. |
| Levies | Monthly amount and known/not-applicable state | Levies or combined levy/rates attribute | Mapped `monthlyLevy` | Ready to capture. |
| Parking | Garages, covered bays, open bays, carports | Parking/carport attributes | Garages and open parking are mapped | Capture structured counts rather than a single text field. |
| Garden, pool and flatlet | Explicit yes/no/unknown facts | Attribute/feature mapping where supported | Present in Property24 feature payload | Ready in the data model. The UI must collect an explicit answer, including `No`, rather than infer it from omissions. |
| Pets and furnished status | Explicit rental facts | PetsAllowed and related attributes | Required Property24 feature values for rental readiness | Ready as core rental data. |
| Fibre and other features | Canonical feature catalogue with yes/no/unknown or applicable/not-applicable | Private Property attribute mapping | Property24 feature mapping only where its contract has a matching feature | Capture once. A feature may be shown on one portal only; never invent an equivalent where none exists. |
| Images | Ordered image records, captions, cover choice and update timestamp | Minimum 3; up to 256 URLs; unchanged images must be sent as an explicit nil update | Required on a new listing; bytes are loaded for submit | Ready, with channel-specific delivery. Track image changes separately from listing changes. |
| Floor plans | Media type `floor_plan` | Channel capability must be confirmed per feed payload | Supported as an identified floor-plan photo | Keep as a distinct media type. Do not flatten it into a generic image. |
| Video and virtual tour | Canonical URLs with type validation | Separate Private Property video/Matterport actions exist | Not confirmed in the current verified Property24 listing contract | Capture once; Private Property ready after validation, Property24 is a confirmed gap. |
| Assigned agent | Primary Arch9 agent and optional additional agents | Agent must exist first; comma-separated multi-agent IDs accepted | One mapped contact agent is currently verified | Store ordered Arch9 agent assignments. Private Property may receive multiple; Property24 must show that it currently sends only the verified primary contact. |
| Agency and branch | Organisation plus operating branch | Required branch GUID and active branch agent IDs | Required connected agency ID | Channel configuration, not listing data. Resolve server-side. |

## Pricing and commercial terms

| Listing fact | Private Property | Property24 | Arch9 decision |
| --- | --- | --- | --- |
| Standard sale price | Required positive `Price` | Verified `price` | Core amount and currency. |
| POA | `SalesPricePresentation = Poa`; price is hidden | Verified `isPOA` | Core price presentation. |
| Negotiable | Supported `SalesPricePresentation = Negotiable` | Not verified in the current Property24 contract | Core presentation plus a Property24 review warning until confirmed. |
| Offers From | `SalesPricePresentation = OffersFrom` and a required positive `OffersFromPrice` no greater than price | Not verified in the current Property24 contract | Capture both asking price and minimum offer. Block or clearly omit the presentation on Property24 until confirmed. |
| Auction | `AuctionOnly` mandate plus a separate auction/venue workflow | Not verified in the current Property24 contract | Core sales method, then Private Property-specific auction details in review. Do not publish an auction to Property24 without its approved schema. |
| Rental amount | Required positive `Price` | Property24 rental implementation currently expects a monthly-rent model | Store amount separately from cadence. No automatic conversion. |
| Rental cadence | Per month, week, day; per m2 additionally for Private Property commercial and commercial land | Current verified Property24 rental model is monthly only; weekly/daily/per-m2 mapping is not verified | Core enum. Private Property publishes directly; Property24 blocks non-monthly values until we obtain and test its supported representation. |
| Rental deposit | Required for Private Property rentals | Captured by Property24 rental readiness, currently optional in its listing payload | Core rental term. Require in Arch9 for policy reasons if it is needed by the agency. |
| Availability/occupation date | Optional `AvailableFrom` | Required by Arch9 Property24 rental readiness | Core rental fact. |
| Lease term, utility inclusions and rental fees | Private Property attributes may represent some values | No direct verified Property24 Listing Service v53 mapping for utilities; some rental fields are readiness/marketing metadata | Core rental facts. Display as channel result, rather than pretending every fact is sent. |
| Commercial price per m2 | Supported for commercial and commercial land rentals | Not verified | Core commercial pricing model, but Property24 publication is blocked pending the commercial contract. |

## Specialist categories

| Category | Private Property requirements and capabilities | Property24 status | Arch9 facts to capture before any UI work |
| --- | --- | --- | --- |
| Residential | Bedrooms, bathrooms and Home Type are mandatory | Verified for house, apartment/flat and townhouse | Property subtype, beds, baths, floor size, parking, pets, furnished, garden, pool, flatlet. |
| Land | Land Area mandatory; Land Type defaults to residential land if omitted | Blocked pending land/development contract | Erf/land size and unit, zoning, development rights, rates, levies, price presentation. |
| Farm/agricultural | Farm Type mandatory; Farm Name supported; auction flow supported | Blocked pending agricultural contract | Farm name, farm type, size/unit, water supply/rights, agricultural use, access, infrastructure, auction details where relevant. |
| Commercial | Business Type mandatory; commercial rentals support per m2 | Blocked pending commercial contract | Gross lettable area, zoning, business type, parking, sale/lease terms, price cadence. |
| Industrial | Maps under Private Property Commercial category with appropriate business type | Blocked pending industrial contract | Warehouse/factory area, yard size, power supply, loading access, zoning, parking. |

## Channel-only settings for the publishing review

These settings do not belong in the ordinary listing form. They should be
shown only when a selected channel and listing category make them relevant.

| Channel | Setting | Rule |
| --- | --- | --- |
| Private Property | Branch connection and approval | Resolved from the organisation. Publishing is blocked without enabled, approved configuration and server-held credentials. |
| Private Property | Agent mapping and order | The selected agents must exist on the branch. Preserve Arch9 order in the request and show any Private Property normalization as a warning. |
| Private Property | Mandate type | Required: rental, house share, full/sole, open, auction-only. Restricted financial-institution mandate types need Private Property authorisation. |
| Private Property | Sales price presentation | Standard, POA, Negotiable, Offers From; validate the Offer From amount before submit. |
| Private Property | Exclusive days | Sale plus full mandate only, 1-92 days, subject to the Exclusive Listings agreement. |
| Private Property | Auction details | Venue and auction details must be configured through the Private Property auction workflow. |
| Private Property | Image update choice | The adapter decides whether images changed. It must send the explicit nil image collection when they did not. This is not an agent-facing toggle. |
| Property24 | Organisation connection and mapped primary agent | Resolved from server-side settings and the Arch9 assignment. |
| Property24 | Property type and suburb mapping | Required external catalogue mappings. Surface any unmapped value as a blocker. |
| Property24 | Expiry date | Required and must be in the future. |
| Property24 | Category availability | Residential is currently eligible; commercial, industrial, agricultural and land/development remain explicitly blocked pending verified contracts. |
| Property24 | Rental cadence | Monthly is the only currently verified model. Weekly, daily and per-m2 must be blocked until verified. |

## Lifecycle and operational actions

| Action | Private Property | Property24 | Product rule |
| --- | --- | --- | --- |
| Create | `UpdateListing` with a new external listing ID | Create/publish through the listing service | One user command, two independent channel submissions and results. |
| General update | `UpdateListing`; do not resend images unless changed | Update through the verified listing service | Diff listing facts and media separately. |
| Price or feature update | `UpdateListing` | Update through the verified listing service | Preflight again before submission because rules may have changed. |
| Image update | Update listing with the current ordered image set | Update with image bytes | Maintain one media library and per-channel delivery audit. |
| Change address | Ignored after activation; Private Property support must correct it | Channel behaviour must be confirmed | Warn before first submit and block silent edits after Private Property activation. |
| Change agent | Multi-agent update supported | One verified contact-agent reassignment | Keep an ordered agent roster in Arch9; the review must say exactly what each portal will receive. |
| Deactivate/withdraw | `Inactive` via the prescribed status update flow | `Withdrawn` | Present as a channel-specific result, not a single assumed status. |
| Sold/let | `Sold` or applicable status | `Sold` / `Rented` | Map from the same Arch9 outcome. |
| Reactivate | Status update/republication where permitted | Lifecycle update where permitted | Require a fresh readiness check and preserve external reference. |

## Gaps to settle before building the publishing review UI

1. Obtain the exact Property24 schemas and supported enumerations for commercial,
   industrial, agricultural/farm and land/development listings. These categories
   are intentionally blocked in the current Arch9 implementation.
2. Confirm Property24's official handling of weekly, daily and per-m2 rental
   pricing, Offers From, Negotiable pricing, auctions, farm name, virtual tours
   and multiple listing agents. Do not infer support from the public website.
3. Define the Arch9 canonical feature catalogue: each feature needs a stable key,
   a type (boolean, count, enum or text), applicability rules and mappings for
   both channels. Fibre is one entry in this catalogue, not a special case.
4. Replace scattered free-text listing facts with typed facts where necessary:
   rental cadence, price presentation, mandate type, property category/subtype,
   areas and area units, availability, agent roster/order, and address privacy.
5. Decide the organisation policy for optional-but-commercially-important facts
   such as deposit, rates, levies, utilities and lease term. A portal may allow
   omission, while Arch9 may choose to require it for quality.

## Recommended build sequence

1. Approve the canonical Arch9 field list and feature catalogue from this matrix.
2. Add the missing core capture fields to the listing and rental workflows.
3. Complete the official Property24 contract audit and add tested mappers for
   each currently blocked category.
4. Build one server-side channel preflight response that returns the status,
   mapped outcome, warnings and blockers for both portals.
5. Build the publishing-review modal from that response. It should offer
   `Private Property settings` and `Property24 settings` sections, but it must
   not allow a browser request to bypass the server-side checks.
6. Pilot each category/channel combination using controlled test listings,
   then enable it per organisation only after the outcome is verified.
