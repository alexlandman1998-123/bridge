alter table if exists public.client_portal_links
  add column if not exists canonical_invite_id uuid references public.invites(id) on delete set null,
  add column if not exists accepted_user_id uuid references auth.users(id) on delete set null,
  add column if not exists accepted_at timestamptz,
  add column if not exists auth_model text;

alter table if exists public.client_portal_contexts
  add column if not exists canonical_invite_id uuid references public.invites(id) on delete set null,
  add column if not exists accepted_user_id uuid references auth.users(id) on delete set null,
  add column if not exists accepted_at timestamptz,
  add column if not exists auth_model text;

alter table if exists public.private_listing_seller_onboarding
  add column if not exists seller_portal_user_id uuid references auth.users(id) on delete set null,
  add column if not exists seller_portal_invite_id uuid references public.invites(id) on delete set null,
  add column if not exists seller_portal_invite_accepted_at timestamptz;

create index if not exists client_portal_links_canonical_invite_idx
  on public.client_portal_links (canonical_invite_id)
  where canonical_invite_id is not null;

do $$
begin
  if to_regclass('public.client_portal_contexts') is not null then
    create index if not exists client_portal_contexts_canonical_invite_idx
      on public.client_portal_contexts (canonical_invite_id)
      where canonical_invite_id is not null;
  end if;
end $$;

create or replace function public.bridge_sync_client_portal_from_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_role text;
  v_client_portal_link_id uuid;
  v_client_portal_token text;
  v_seller_workspace_token text;
  v_listing_id text;
begin
  if new.invite_type <> 'client_invite' or new.status <> 'accepted' then
    return new;
  end if;

  v_client_role := lower(nullif(trim(coalesce(
    new.metadata ->> 'client_role',
    new.target_transaction_role,
    ''
  )), ''));

  if v_client_role in ('buyer', 'client') and to_regclass('public.client_portal_links') is not null then
    begin
      v_client_portal_link_id := nullif(trim(coalesce(new.metadata ->> 'client_portal_link_id', '')), '')::uuid;
    exception
      when invalid_text_representation then
        v_client_portal_link_id := null;
    end;

    v_client_portal_token := nullif(trim(coalesce(new.metadata ->> 'client_portal_token', '')), '');

    update public.client_portal_links
       set canonical_invite_id = new.id,
           accepted_user_id = coalesce(new.accepted_by_user_id, new.invitee_user_id),
           accepted_at = coalesce(new.accepted_at, now()),
           auth_model = 'canonical_client_invite',
           updated_at = now()
     where (v_client_portal_link_id is not null and id = v_client_portal_link_id)
        or (v_client_portal_link_id is null and v_client_portal_token is not null and token = v_client_portal_token)
        or (
          v_client_portal_link_id is null
          and v_client_portal_token is null
          and new.target_transaction_id is not null
          and transaction_id = new.target_transaction_id
          and is_active is true
        );
  elsif v_client_role = 'seller' then
    v_seller_workspace_token := nullif(trim(coalesce(
      new.metadata ->> 'seller_workspace_token',
      new.metadata ->> 'client_portal_token',
      ''
    )), '');
    v_listing_id := nullif(trim(coalesce(
      new.metadata ->> 'listing_id',
      new.metadata ->> 'listingId',
      ''
    )), '');

    if v_seller_workspace_token is not null and to_regclass('public.private_listing_seller_onboarding') is not null then
      update public.private_listing_seller_onboarding
         set seller_portal_user_id = coalesce(new.accepted_by_user_id, new.invitee_user_id),
             seller_portal_invite_id = new.id,
             seller_portal_invite_accepted_at = coalesce(new.accepted_at, now()),
             seller_portal_last_login_at = coalesce(seller_portal_last_login_at, coalesce(new.accepted_at, now())),
             updated_at = now()
       where token = v_seller_workspace_token;
    end if;

    if to_regclass('public.client_portal_contexts') is not null then
      begin
        update public.client_portal_contexts
           set canonical_invite_id = new.id,
               accepted_user_id = coalesce(new.accepted_by_user_id, new.invitee_user_id),
               accepted_at = coalesce(new.accepted_at, now()),
               auth_model = 'canonical_client_invite',
               updated_at = now()
         where (v_seller_workspace_token is not null and seller_workspace_token = v_seller_workspace_token)
            or (v_listing_id is not null and listing_id = v_listing_id);
      exception
        when undefined_table or undefined_column then
          null;
      end;
    end if;
  end if;

  perform public.bridge_record_invite_event(
    new.id,
    'client_portal_activation_synced',
    coalesce(new.accepted_by_user_id, new.invitee_user_id),
    jsonb_build_object(
      'clientRole', v_client_role,
      'targetTransactionId', new.target_transaction_id,
      'listingId', v_listing_id,
      'sellerWorkspaceTokenPresent', v_seller_workspace_token is not null
    )
  );

  return new;
end;
$$;

drop trigger if exists invites_sync_client_portal_activation on public.invites;
create trigger invites_sync_client_portal_activation
after update of status, accepted_at, accepted_by_user_id, invitee_user_id on public.invites
for each row
when (new.invite_type = 'client_invite' and new.status = 'accepted')
execute function public.bridge_sync_client_portal_from_invite();

update public.client_portal_links cpl
   set canonical_invite_id = inv.id,
       accepted_user_id = coalesce(inv.accepted_by_user_id, inv.invitee_user_id),
       accepted_at = coalesce(inv.accepted_at, cpl.accepted_at),
       auth_model = coalesce(cpl.auth_model, 'canonical_client_invite'),
       updated_at = now()
  from public.invites inv
 where inv.invite_type = 'client_invite'
   and inv.status = 'accepted'
   and coalesce(inv.metadata ->> 'client_role', inv.target_transaction_role) in ('buyer', 'client')
   and (
     (inv.metadata ->> 'client_portal_link_id') = cpl.id::text
     or (inv.metadata ->> 'client_portal_token') = cpl.token
     or (inv.target_transaction_id is not null and inv.target_transaction_id = cpl.transaction_id and cpl.is_active is true)
   )
   and cpl.canonical_invite_id is null;
