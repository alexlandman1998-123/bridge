begin;

-- Atomically changes the default channel within a Revo channel type. This
-- avoids a browser client needing to briefly leave a channel type without a
-- default, or racing the partial unique index in the foundation migration.
create or replace function public.revo_set_default_inbox_channel(p_channel_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_channel public.revo_inbox_channels%rowtype;
begin
  select * into target_channel
  from public.revo_inbox_channels
  where id = p_channel_id;

  if not found then
    raise exception 'Revo inbox channel not found';
  end if;

  if target_channel.organisation_id <> '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
    or not public.bridge_is_org_admin(target_channel.organisation_id) then
    raise exception 'Only a Revo organisation administrator can change the default inbox channel';
  end if;

  perform pg_advisory_xact_lock(hashtext(target_channel.organisation_id::text || ':' || target_channel.channel));

  update public.revo_inbox_channels
  set is_default = false
  where organisation_id = target_channel.organisation_id
    and channel = target_channel.channel
    and is_default;

  update public.revo_inbox_channels
  set is_default = true
  where id = target_channel.id;

  return target_channel.id;
end;
$$;

revoke all on function public.revo_set_default_inbox_channel(uuid) from public;
grant execute on function public.revo_set_default_inbox_channel(uuid) to authenticated;

comment on function public.revo_set_default_inbox_channel(uuid) is
  'Revo-only admin RPC to atomically choose an inbox default channel.';

commit;
