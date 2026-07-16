-- H1 batch 2: deterministic compatibility backfill.
-- Only facts already represented by seller_has_existing_bond are copied.

update public.transactions
set
  existing_bond = coalesce(seller_has_existing_bond, false),
  cancellation_required = coalesce(seller_has_existing_bond, false)
where existing_bond is distinct from coalesce(seller_has_existing_bond, false)
   or cancellation_required is distinct from coalesce(seller_has_existing_bond, false);

update public.transactions
set routing_profile_json = '{}'::jsonb
where routing_profile_json is null;
