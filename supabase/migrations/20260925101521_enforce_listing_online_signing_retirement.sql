-- Defence in depth for the retired seller-mandate online-signing workflow.
-- Historical sessions remain available as audit evidence, but no future code
-- path (including a privileged server-side caller) may create or reactivate a
-- session that could be used as an online signing link.
create or replace function public.bridge_block_retired_listing_online_signing_session()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    raise exception 'Online document signing has been retired. Create a physical-signature document workflow instead.' using errcode = 'P0001';
  end if;

  if new.status = 'active' then
    raise exception 'Online document signing has been retired. Signing sessions cannot be activated.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_block_retired_listing_online_signing_session
  on public.private_listing_mandate_signing_sessions;

create trigger trg_block_retired_listing_online_signing_session
before insert or update of status
on public.private_listing_mandate_signing_sessions
for each row
execute function public.bridge_block_retired_listing_online_signing_session();

comment on function public.bridge_block_retired_listing_online_signing_session() is
  'Blocks new or reactivated online seller-mandate signing sessions after online signing retirement; historical records are retained for audit.';
