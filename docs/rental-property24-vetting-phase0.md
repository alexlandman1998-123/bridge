# Property24 Rental Vetting — Phase 0

**Status:** READY_FOR_CONTROLLED_VETTING  
**Scope statement:** Arch9 validates and prepares Property24 rental listing payloads for controlled backend handoff. Live rental publication is not part of this vetting scope.

## Fixture

- Green Point two-bedroom apartment (rental-property24-vetting-fixture-1)
- Readiness: 100% (20/20)
- Live submit: disabled

## Demonstration

1. **Open the complete rental fixture in Rentals > Listings.** _(No external call)_
2. **Show rent, deposit, availability, mandate, and landlord marketing approval.** _(No external call)_
3. **Run Property24 rental readiness and inspect the Listing Service v53 payload preview.** _(Preview only)_
4. **Show an incomplete listing being blocked before a handoff can be prepared.** _(Preview only)_
5. **Prepare the internal backend publish handoff for the complete fixture.** _(Creates internal audit activity only)_

## Explicitly out of scope

- Live Property24 rental submission
- Rental portal status update or withdrawal
- Rental lead import or reconciliation
- Production credentials or customer data
