-- The recipient signer matrix must be checked when a link is first issued as
-- well as when an existing recipient is updated.
drop trigger if exists trg_guard_seller_portal_signing_recipient
  on public.private_listing_seller_portal_signing_recipients;

create trigger trg_guard_seller_portal_signing_recipient
before insert or update on public.private_listing_seller_portal_signing_recipients
for each row execute function public.bridge_guard_seller_portal_signing_recipient();
