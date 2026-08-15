# Phase 4 - Buyer Bond Application Email Contract

## Purpose

Phase 4 makes the buyer-facing bond email explicit. The email is no longer framed primarily as a generic originator introduction; it asks the buyer to complete the online bond application in the buyer portal.

## Contract

The buyer email keeps the existing delivery type:

`bond_originator_buyer_intro`

The payload contract now uses:

- Subject: `Complete your bond application`
- Title: `Complete your bond application`
- CTA: `Complete Bond Application`
- Link field: `metadata.applicationLink`

## Copy Intent

The email tells the buyer:

- The online bond application is ready in the buyer portal.
- The bond team is available to process the application.
- The buyer must complete the online application.
- Supporting documents may be requested.
- The originator will review and prepare the application for bank submission.

## Boundary

Internal originator intake notifications remain separate. This phase only changes the buyer-facing email contract and template copy.

## Next Phase

Phase 5 confirmed in-app client portal notifications, activity feed actions and next actions use the same completion route and label as this email contract.
