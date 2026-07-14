begin;

-- Public seller-portal entry points.
revoke all on function public.bridge_private_listing_seller_portal_access_state(text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_set_private_listing_seller_portal_password(text, text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_verify_private_listing_seller_portal_password(text, text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_private_listing_seller_portal_payload(text, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.bridge_upload_private_listing_seller_document(text, text, text, text, text, text, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_complete_private_listing_seller_portal_recovery(text, text) from public, anon, authenticated, service_role;

grant execute on function public.bridge_private_listing_seller_portal_access_state(text) to anon, authenticated;
grant execute on function public.bridge_set_private_listing_seller_portal_password(text, text) to anon, authenticated;
grant execute on function public.bridge_verify_private_listing_seller_portal_password(text, text) to anon, authenticated;
grant execute on function public.bridge_private_listing_seller_portal_payload(text, text, boolean) to anon, authenticated;
grant execute on function public.bridge_upload_private_listing_seller_document(text, text, text, text, text, text, uuid, text, text) to anon, authenticated;
grant execute on function public.bridge_complete_private_listing_seller_portal_recovery(text, text) to anon, authenticated;

-- Signed-in operational entry points.
revoke all on function public.bridge_issue_private_listing_seller_portal_invite(text, integer) from public, anon, authenticated, service_role;
revoke all on function public.bridge_reset_private_listing_seller_portal_password(text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_manage_private_listing_seller_portal(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_private_listing_seller_portal_diagnostics(text) from public, anon, authenticated, service_role;

grant execute on function public.bridge_issue_private_listing_seller_portal_invite(text, integer) to authenticated;
grant execute on function public.bridge_reset_private_listing_seller_portal_password(text) to authenticated;
grant execute on function public.bridge_manage_private_listing_seller_portal(text, text, text) to authenticated;
grant execute on function public.bridge_private_listing_seller_portal_diagnostics(text) to authenticated;

-- Service-only maintenance and recovery issuance.
revoke all on function public.bridge_log_client_portal_access_event(text, text, text, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_request_private_listing_seller_portal_recovery(text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_prune_client_portal_security_history(integer) from public, anon, authenticated, service_role;

grant execute on function public.bridge_log_client_portal_access_event(text, text, text, uuid, text) to service_role;
grant execute on function public.bridge_request_private_listing_seller_portal_recovery(text) to service_role;
grant execute on function public.bridge_prune_client_portal_security_history(integer) to service_role;

-- Internal compatibility layers and helpers are owner-only.
revoke all on function public.bridge_private_listing_seller_portal_link_is_active(jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.bridge_resolve_private_listing_seller_portal_token(text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_resolve_private_listing_seller_portal_token_phase4(text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_private_listing_seller_portal_access_state_phase1(text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_private_listing_seller_portal_access_state_phase2(text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_set_private_listing_seller_portal_password_phase1(text, text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_verify_private_listing_seller_portal_password_phase1(text, text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_verify_private_listing_seller_portal_password_phase2(text, text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_verify_private_listing_seller_portal_password_phase3(text, text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_reset_private_listing_seller_portal_password_phase1(text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_reset_private_listing_seller_portal_password_phase2(text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_private_listing_seller_portal_payload_phase1(text, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.bridge_upload_private_listing_seller_document_phase1(text, text, text, text, text, text, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.bridge_private_listing_seller_portal_diagnostics_phase4(text) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
