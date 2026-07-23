begin;

create or replace function public.bridge_canonical_document_lifecycle_state_a3(p_status text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(trim(p_status), ''))
    when 'draft' then 'draft'
    when 'ready_for_generation' then 'draft'
    when 'generated' then 'pdf_generated'
    when 'signing_prep' then 'ready_to_send'
    when 'sent' then 'sent'
    when 'partially_signed' then 'partially_signed'
    when 'completed' then 'completed'
    when 'voided' then 'archived'
    when 'archived' then 'archived'
    else null
  end
$$;

create or replace function public.bridge_sync_canonical_document_lifecycle_a3()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_state text;
  v_next_state text;
  v_allowed boolean := false;
begin
  if new.packet_type not in ('mandate', 'otp') then return new; end if;

  v_next_state := public.bridge_canonical_document_lifecycle_state_a3(new.status);
  if v_next_state is null then
    raise exception 'A3 unsupported Mandate/OTP packet status: %', new.status using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' then
    v_previous_state := public.bridge_canonical_document_lifecycle_state_a3(old.status);
    v_allowed := v_previous_state = v_next_state
      or (v_previous_state = 'draft' and v_next_state in ('pdf_generated', 'archived'))
      or (v_previous_state = 'pdf_generated' and v_next_state in ('draft', 'ready_to_send', 'archived'))
      or (v_previous_state = 'ready_to_send' and v_next_state in ('draft', 'pdf_generated', 'sent', 'archived'))
      or (v_previous_state = 'sent' and v_next_state in ('partially_signed', 'completed', 'archived'))
      or (v_previous_state = 'partially_signed' and v_next_state in ('completed', 'archived'))
      or (v_previous_state = 'completed' and v_next_state = 'archived');
    if not v_allowed then
      raise exception 'A3 invalid document lifecycle transition from % to %', v_previous_state, v_next_state using errcode = 'P0001';
    end if;
  end if;

  new.source_context_json := coalesce(new.source_context_json, '{}'::jsonb)
    || jsonb_build_object(
      'lifecycle_state', v_next_state,
      'lifecycle_previous_state', case when tg_op = 'UPDATE' then v_previous_state else null end,
      'lifecycle_updated_at', case
        when tg_op = 'INSERT' or new.status is distinct from old.status then now()
        else coalesce(new.source_context_json->'lifecycle_updated_at', to_jsonb(now()))
      end
    );
  return new;
end;
$$;

drop trigger if exists trg_sync_canonical_document_lifecycle_a3 on public.document_packets;
create trigger trg_sync_canonical_document_lifecycle_a3
before insert or update of status, source_context_json on public.document_packets
for each row execute function public.bridge_sync_canonical_document_lifecycle_a3();

update public.document_packets
set source_context_json = coalesce(source_context_json, '{}'::jsonb)
  || jsonb_build_object(
    'lifecycle_state', public.bridge_canonical_document_lifecycle_state_a3(status),
    'lifecycle_previous_state', coalesce(source_context_json->'lifecycle_previous_state', 'null'::jsonb),
    'lifecycle_updated_at', coalesce(source_context_json->'lifecycle_updated_at', to_jsonb(updated_at), to_jsonb(created_at), to_jsonb(now()))
  )
where packet_type in ('mandate', 'otp')
  and public.bridge_canonical_document_lifecycle_state_a3(status) is not null
  and coalesce(source_context_json->>'lifecycle_state', '') is distinct from public.bridge_canonical_document_lifecycle_state_a3(status);

comment on function public.bridge_sync_canonical_document_lifecycle_a3() is
  'A3 enforces canonical Mandate/OTP lifecycle transitions and synchronizes canonical lifecycle metadata for every persistence path.';

commit;
