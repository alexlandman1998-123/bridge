# Phase 6 - Originator Field Alignment

## Purpose

Phase 6 makes the buyer portal to bond-originator data handoff explicit. Buyer-entered bond application answers already persist under `formData.bond_application`; this phase adds a stable originator-facing field-alignment projection so the originator workspace can verify what came through without reading arbitrary nested JSON.

## Contract

The originator bond application view model exposes:

- `fieldAlignment`
- `originatorFieldAlignment`

Both point to the same read-only projection:

- Source: `buyer_portal_bond_application`
- Target: `bond_originator_view_model`
- Fields: grouped buyer answer fields with `key`, `group`, `label`, `sourcePaths`, `value`, `displayValue` and `captured`
- Summary: `capturedCount`, `totalCount`, `missingKeys` and grouped section coverage

## Covered Field Groups

- Application
- Property
- Finance
- Primary Applicant
- Contact & Address
- Employment
- Income & Expenses
- Banking & Liabilities
- Assets & Liabilities
- Credit History
- Declarations

## Boundary

This phase does not change the buyer save location, mutate `transaction_bond_applications`, submit to banks, create bank payloads, or change originator workflow status. It only hardens the read projection used by originator-facing surfaces.
