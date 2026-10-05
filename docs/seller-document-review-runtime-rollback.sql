-- Scoped rollback for the seller review runtime. Retains all user data and added columns.
-- Use only with frontend and signing-bundle rollback to their captured versions.
begin;
drop function if exists public.bridge_upload_private_listing_seller_signed_copy(text,text,text,text,text,text,uuid,text,text,uuid,text);
drop view if exists public.seller_document_review_queue_v1;
drop trigger if exists trg_validate_private_listing_document_link_p0_4 on public.private_listing_documents;
drop trigger if exists trg_sync_private_listing_requirement_assurance_p0_4 on public.private_listing_documents;
drop trigger if exists trg_prevent_false_requirement_completion_p0_4 on public.private_listing_document_requirements;
drop function if exists public.bridge_review_private_listing_seller_document_p1_8(uuid,text,text,integer);
drop function if exists public.bridge_send_seller_document_manual_reminder_p1_8(uuid,text);
drop function if exists public.bridge_validate_private_listing_document_link_p0_4();
drop function if exists public.bridge_sync_private_listing_requirement_assurance_p0_4();
drop function if exists public.bridge_prevent_false_requirement_completion_p0_4();
drop function if exists public.bridge_add_seller_request_business_days(date,integer);
-- Keep seller_document_review_events, RLS, automation definitions and columns for recovery.
commit;
