begin;

-- Mandate evidence is now an operational/readiness signal, not a hard database
-- prerequisite for activating, publishing, or externally linking a listing.
drop trigger if exists trg_private_listing_mandate_completion_phase0 on public.private_listings;
drop trigger if exists trg_listing_publication_mandate_completion_phase0 on public.listing_publication_data;
drop trigger if exists trg_listing_external_publication_mandate_completion_phase0 on public.listing_external_links;
drop trigger if exists trg_active_listing_mandate_integrity_phase0 on public.document_packets;

drop function if exists public.bridge_enforce_private_listing_mandate_completion_phase0();
drop function if exists public.bridge_enforce_listing_publication_mandate_completion_phase0();
drop function if exists public.bridge_enforce_listing_external_publication_mandate_completion_phase0();
drop function if exists public.bridge_enforce_active_listing_mandate_integrity_phase0();
drop function if exists public.bridge_require_listing_canonical_mandate_phase0(uuid);
drop function if exists public.bridge_require_completed_or_manual_mandate_phase0(uuid, uuid, uuid, text, boolean);
drop function if exists public.bridge_require_canonical_completed_mandate_phase0(uuid, uuid);
drop function if exists public.bridge_listing_has_manual_mandate_evidence_phase0(uuid);
drop function if exists public.bridge_private_listing_is_current_import_activation_phase0(public.private_listings);

commit;
