# Phase 4 - Buyer Bond Application Email Contract

## Purpose

The active buyer-facing bond email opens the bond progress tracker and documents requested by the originator. The earlier Phase 4 online application completion wording was superseded by the tracker flow; this contract reflects the current behavior as of 9 November 2026.

## Contract

The buyer email keeps the existing delivery type:

`bond_originator_buyer_intro`

The payload contract now uses:

- Subject: `View your bond progress`
- Title: `View your bond progress`
- CTA: `View bond progress`
- Link field: `metadata.applicationLink`

## Copy Intent

The email tells the buyer:

- Bond progress is available in the buyer portal.
- The bond team is available to process the application.
- The buyer can view progress and provide requested supporting documents.
- Supporting documents may be requested.
- The originator manages the bank process and records updates in the tracker.

## Boundary

Internal originator intake notifications remain separate. This phase only changes the buyer-facing email contract and template copy.

## Next Phase

Historical Phase 5 completion labels describe the earlier application flow. The active email and communication catalogue must use the tracker wording above.
