create index if not exists invites_pending_client_transaction_role_email_idx
  on public.invites (target_transaction_id, target_transaction_role, lower(email), created_at desc)
  where invite_type = 'client_invite'
    and status = 'pending';

create index if not exists invites_pending_seller_listing_email_idx
  on public.invites ((metadata ->> 'listing_id'), lower(email), created_at desc)
  where invite_type = 'client_invite'
    and status = 'pending'
    and metadata ? 'listing_id';
