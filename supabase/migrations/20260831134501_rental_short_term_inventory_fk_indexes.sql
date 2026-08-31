-- Phase 2 performance repair: cover foreign keys used by branch/property scope
-- checks and by parent-record deletion handling.
create index rental_unit_operating_modes_branch_id_idx
  on public.rental_unit_operating_modes (branch_id);

create index rental_unit_operating_modes_property_id_idx
  on public.rental_unit_operating_modes (property_id);

create index rental_unit_operating_modes_created_by_idx
  on public.rental_unit_operating_modes (created_by);

create index rental_unit_occupancy_blocks_branch_id_idx
  on public.rental_unit_occupancy_blocks (branch_id);

create index rental_unit_occupancy_blocks_property_id_idx
  on public.rental_unit_occupancy_blocks (property_id);

create index rental_unit_occupancy_blocks_created_by_idx
  on public.rental_unit_occupancy_blocks (created_by);
