begin;

-- Content is structured text/runs. No arbitrary HTML, styling or executable
-- markup is persisted. Rendering always escapes text and checks URL schemes.
create function private.shared_inbox_signature_valid(value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare item record; run jsonb;
begin
  if value is null or jsonb_typeof(value) <> 'object' or octet_length(value::text) > 24000 then return false; end if;
  for item in select * from jsonb_each(value) loop
    if item.key = 'body' then
      if jsonb_typeof(item.value) <> 'array' or jsonb_array_length(item.value) > 100 then return false; end if;
      for run in select * from jsonb_array_elements(item.value) loop
        if jsonb_typeof(run) <> 'object' or jsonb_typeof(run->'text') is distinct from 'string'
          or length(run->>'text') > 2000 then return false; end if;
        if exists (select 1 from jsonb_object_keys(run) key where key not in ('text','bold','italic','href')) then return false; end if;
        if (run ? 'bold' and jsonb_typeof(run->'bold') <> 'boolean') or (run ? 'italic' and jsonb_typeof(run->'italic') <> 'boolean') then return false; end if;
        if run ? 'href' and (jsonb_typeof(run->'href') <> 'string' or length(run->>'href') > 2048
          or (run->>'href') !~* '^(https://[^[:space:]<>"'']+|mailto:[^[:space:]<>"'']+@[^[:space:]<>"'']+|tel:[+0-9().-]+)$') then return false; end if;
      end loop;
    elsif item.key in ('name','title','company','phone','email','website','logoUrl') then
      if jsonb_typeof(item.value) <> 'string' or length(item.value #>> '{}') > (case when item.key in ('website','logoUrl') then 2048 else 500 end) then return false; end if;
      if item.key in ('website','logoUrl') and (item.value #>> '{}') <> '' and (item.value #>> '{}') !~* '^https://[^[:space:]<>"'']+$' then return false; end if;
    else return false;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function private.shared_inbox_signature_valid(jsonb) from public,anon;
grant execute on function private.shared_inbox_signature_valid(jsonb) to authenticated,service_role;

create table public.shared_inbox_mailbox_signatures (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  channel_id uuid primary key,
  signature_json jsonb not null default '{}'::jsonb check (private.shared_inbox_signature_valid(signature_json)),
  use_for_new boolean not null default true,
  use_for_replies boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (channel_id,organisation_id) references public.revo_inbox_channels(id,organisation_id) on delete cascade
);
create index shared_inbox_mailbox_signatures_org_idx on public.shared_inbox_mailbox_signatures(organisation_id,channel_id);
alter table public.shared_inbox_mailbox_signatures enable row level security;
revoke all on public.shared_inbox_mailbox_signatures from public,anon,authenticated;
grant select,insert,update on public.shared_inbox_mailbox_signatures to authenticated;
grant all on public.shared_inbox_mailbox_signatures to service_role;
create policy shared_inbox_signature_read on public.shared_inbox_mailbox_signatures for select to authenticated
using (private.shared_inbox_can_access(organisation_id,channel_id,'read'));
create policy shared_inbox_signature_create on public.shared_inbox_mailbox_signatures for insert to authenticated
with check (private.shared_inbox_can_access(organisation_id,channel_id,'manage') and updated_by = auth.uid());
create policy shared_inbox_signature_update on public.shared_inbox_mailbox_signatures for update to authenticated
using (private.shared_inbox_can_access(organisation_id,channel_id,'manage'))
with check (private.shared_inbox_can_access(organisation_id,channel_id,'manage') and updated_by = auth.uid());
create function private.shared_inbox_signature_stamp() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.channel_id is distinct from old.channel_id or new.organisation_id is distinct from old.organisation_id) then
    raise exception 'A signature cannot move between mailboxes';
  end if;
  if not exists (select 1 from public.revo_inbox_channels where id = new.channel_id and organisation_id = new.organisation_id and channel = 'email') then
    raise exception 'Choose an email mailbox for this signature';
  end if;
  new.revision := case when tg_op = 'INSERT' then 1 else old.revision + 1 end;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.shared_inbox_signature_stamp() from public,anon,authenticated;
create trigger shared_inbox_signature_stamp before insert or update on public.shared_inbox_mailbox_signatures
for each row execute function private.shared_inbox_signature_stamp();

create function public.shared_inbox_save_mailbox_signature(
  p_organisation_id uuid,p_channel_id uuid,p_signature jsonb,p_use_for_new boolean,p_use_for_replies boolean,p_revision integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare existing public.shared_inbox_mailbox_signatures%rowtype; saved public.shared_inbox_mailbox_signatures%rowtype;
begin
  if not private.shared_inbox_can_access(p_organisation_id,p_channel_id,'manage') then raise exception 'Mailbox management access is required'; end if;
  perform pg_advisory_xact_lock(hashtext('inbox-signature:' || p_channel_id::text));
  select * into existing from public.shared_inbox_mailbox_signatures where channel_id = p_channel_id and organisation_id = p_organisation_id;
  if p_revision is null or p_revision <> coalesce(existing.revision,0) then raise exception 'The signature changed. Reload it before saving'; end if;
  insert into public.shared_inbox_mailbox_signatures(organisation_id,channel_id,signature_json,use_for_new,use_for_replies,updated_by)
    values (p_organisation_id,p_channel_id,p_signature,p_use_for_new,p_use_for_replies,auth.uid())
    on conflict (channel_id) do update set signature_json = excluded.signature_json,use_for_new = excluded.use_for_new,
      use_for_replies = excluded.use_for_replies,updated_by = auth.uid() returning * into saved;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.shared_inbox_save_mailbox_signature(uuid,uuid,jsonb,boolean,boolean,integer) from public,anon;
grant execute on function public.shared_inbox_save_mailbox_signature(uuid,uuid,jsonb,boolean,boolean,integer) to authenticated;

-- One scoped read supplies the settings list, permission flags and public
-- connection health. Credentials and server checkpoints never leave the server.
create function public.shared_inbox_email_settings(p_organisation_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('canCreatePrivate',public.bridge_is_active_member(p_organisation_id),
    'canCreateShared',public.bridge_is_active_member(p_organisation_id) and public.bridge_is_org_admin(p_organisation_id),
    'mailboxes',coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object(
      'permissions',public.shared_inbox_mailbox_permissions(c.organisation_id,c.id),
      'connection',case when p.id is null then null else jsonb_build_object('id',p.id,'status',p.status,
        'connectionKind',p.connection_kind,'lastSyncAt',p.last_sync_at,'lastVerifiedAt',p.last_verified_at,'lastErrorCode',p.last_error_code) end)
      order by c.created_at,c.id)
      from public.revo_inbox_channels c left join public.revo_inbox_provider_connections p
        on p.channel_id = c.id and p.organisation_id = c.organisation_id
      where c.organisation_id = p_organisation_id and c.channel = 'email'),'[]'::jsonb));
$$;
revoke all on function public.shared_inbox_email_settings(uuid) from public,anon;
grant execute on function public.shared_inbox_email_settings(uuid) to authenticated;

-- Only a mailbox manager may request the active roster for sharing. Private
-- implementation, explicit caller authorisation and a narrow public wrapper.
create function private.shared_inbox_mailbox_people(p_org uuid,p_channel uuid)
returns table(user_id uuid,label text,access_role text) language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.shared_inbox_can_access(p_org,p_channel,'manage') then raise exception 'Mailbox management access is required'; end if;
  return query select distinct u.user_id,coalesce(nullif(to_jsonb(p)->>'full_name',''),nullif(to_jsonb(p)->>'display_name',''),
    nullif(trim(concat(to_jsonb(p)->>'first_name',' ',to_jsonb(p)->>'last_name')),''),nullif(to_jsonb(u)->>'email',''),u.user_id::text),m.access_role
    from public.organisation_users u join public.profiles p on p.id = u.user_id
    left join public.shared_inbox_mailbox_members m on m.channel_id = p_channel and m.organisation_id = p_org and m.user_id = u.user_id
    where u.organisation_id = p_org and lower(trim(coalesce(to_jsonb(u)->>'membership_status',to_jsonb(u)->>'status',''))) in ('active','accepted')
    order by 2;
end;
$$;
revoke all on function private.shared_inbox_mailbox_people(uuid,uuid) from public,anon;
grant execute on function private.shared_inbox_mailbox_people(uuid,uuid) to authenticated;
create function public.shared_inbox_mailbox_people(p_organisation_id uuid,p_channel_id uuid)
returns table(user_id uuid,label text,access_role text) language sql stable security invoker set search_path = '' as $$
  select * from private.shared_inbox_mailbox_people(p_organisation_id,p_channel_id);
$$;
revoke all on function public.shared_inbox_mailbox_people(uuid,uuid) from public,anon;
grant execute on function public.shared_inbox_mailbox_people(uuid,uuid) to authenticated;

comment on table public.shared_inbox_mailbox_signatures is 'One structured signature per email mailbox, with independent new-message and reply defaults. No delivery is enabled.';
commit;
