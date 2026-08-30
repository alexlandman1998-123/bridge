# Rentals reconciliation — 2026-08-30

## Result

No additive repair migration was required. The live Rentals schema contains the objects introduced through Phases 52–55 and the older migration-history differences are functionally covered by later live replacement migrations.

## Migration history

The connected migration service records the apply-time timestamp in `supabase_migrations.schema_migrations`, rather than preserving the timestamp in the local filename. Reconciliation therefore used migration names and live object checks.

The current local files for tenant/landlord portals and media hardening are present live:

- `rental_media_upload_hardening`
- `rental_media_upload_policy_path_fix`
- `rental_tenant_portal_actions`
- `rental_landlord_portal_decisions`
- `rental_landlord_portal_read_models`

Three earlier local migration names have later live successors rather than an exact history-name match:

| Local concern | Live coverage |
| --- | --- |
| `rental_payment_allocations` | `rental_payment_allocations_fix` and `rental_payment_allocation_splits` |
| `rental_financial_corrections` | `rental_financial_corrections_core`, `rental_financial_correction_balances`, `rental_financial_adjustment_reversal`, and `rental_financial_period_controls` |
| `rental_collection_reminders` | `rental_collection_reminders_repair`; live preferences, reminders, and the three reminder commands exist |

## Live verification

- Portal tables exist with RLS enabled and their intended read policies:
  - `rental_tenant_portal_access`
  - `rental_tenant_portal_actions`
  - `rental_landlord_portal_access`
  - `rental_landlord_portal_decisions`
- Tenant/landlord access, portal commands, and landlord read-model RPCs exist with an empty `search_path` and no anonymous grant.
- `rental-vacancy-media` is private, capped at 20 MiB, and permits only JPEG, PNG, WebP, MP4, and MOV. The authenticated branch-scoped upload policy exists.
- Payment allocation, financial correction, and collection-reminder tables/functions all exist live.

## Advisor outcome

Security advisor warnings remain for authenticated `SECURITY DEFINER` Rentals RPCs. These are the intended command/read-model endpoints and require explicit internal branch or active portal-relationship checks. There are no anonymous Rentals function grants.

Performance advisor findings are informational: unindexed foreign keys and unused indexes. The new portal action/decision indexes are currently unused because the portal has not yet received production traffic; they should not be removed before the pilot.
