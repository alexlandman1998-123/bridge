drop function if exists public.canonical_document_verification_snapshot(text);
drop function if exists public.canonical_document_verification_snapshot(text, uuid, text, integer);

create or replace function public.canonical_document_verification_snapshot(
  p_purpose text default 'canonical_staging_verification',
  p_transaction_id uuid default null,
  p_fixture text default null,
  p_max_rows integer default 5000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_max_rows, 5000), 50000));
  v_requirement_ids uuid[] := array[]::uuid[];
  v_packet_ids uuid[] := array[]::uuid[];
begin
  if p_purpose is distinct from 'canonical_staging_verification' then
    raise exception 'invalid verification purpose' using errcode = '42501';
  end if;

  select coalesce(array_agg(scoped_requirements.id), array[]::uuid[])
  into v_requirement_ids
  from (
    select requirement.id
    from public.document_requirement_instances requirement
    where p_transaction_id is null
      or requirement.transaction_id = p_transaction_id
      or (
        requirement.context_type = 'transaction'
        and requirement.context_id = p_transaction_id
      )
    order by requirement.created_at, requirement.id
    limit v_limit
  ) scoped_requirements;

  select coalesce(array_agg(scoped_packets.id), array[]::uuid[])
  into v_packet_ids
  from (
    select packet.id
    from public.document_packets packet
    where (p_transaction_id is null or packet.transaction_id = p_transaction_id)
      and (p_fixture is null or packet.source_context_json ->> 'fixture' = p_fixture)
    order by packet.created_at, packet.id
    limit v_limit
  ) scoped_packets;

  return jsonb_build_object(
    'transactions', coalesce((
      select jsonb_agg(to_jsonb(t))
      from (
        select *
        from public.transactions
        where p_transaction_id is null or id = p_transaction_id
        order by created_at, id
        limit v_limit
      ) t
    ), '[]'::jsonb),
    'document_definitions', coalesce((
      select jsonb_agg(to_jsonb(t))
      from (
        select *
        from public.document_definitions
        order by key
        limit v_limit
      ) t
    ), '[]'::jsonb),
    'document_requirement_rules', coalesce((
      select jsonb_agg(to_jsonb(t))
      from (
        select *
        from public.document_requirement_rules
        order by created_at, id
        limit v_limit
      ) t
    ), '[]'::jsonb),
    'document_requirement_instances', coalesce((
      select jsonb_agg(to_jsonb(t))
      from (
        select *
        from public.document_requirement_instances
        where p_transaction_id is null or id = any(v_requirement_ids)
        order by created_at, id
        limit v_limit
      ) t
    ), '[]'::jsonb),
    'private_listing_document_requirements', coalesce((
      select jsonb_agg(to_jsonb(t))
      from (
        select *
        from public.private_listing_document_requirements
        where p_transaction_id is null
          or canonical_requirement_instance_id = any(v_requirement_ids)
        order by created_at, id
        limit v_limit
      ) t
    ), '[]'::jsonb),
    'private_listing_documents', coalesce((
      select jsonb_agg(to_jsonb(t))
      from (
        select *
        from public.private_listing_documents
        where p_transaction_id is null
          or canonical_requirement_instance_id = any(v_requirement_ids)
        order by created_at, id
        limit v_limit
      ) t
    ), '[]'::jsonb),
    'transaction_required_documents', coalesce((
      select jsonb_agg(to_jsonb(t))
      from (
        select *
        from public.transaction_required_documents
        where p_transaction_id is null
          or transaction_id = p_transaction_id
          or canonical_requirement_instance_id = any(v_requirement_ids)
        order by created_at, id
        limit v_limit
      ) t
    ), '[]'::jsonb),
    'document_requests', coalesce((
      select jsonb_agg(to_jsonb(t))
      from (
        select *
        from public.document_requests
        where p_transaction_id is null
          or transaction_id = p_transaction_id
          or canonical_requirement_instance_id = any(v_requirement_ids)
        order by created_at, id
        limit v_limit
      ) t
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(to_jsonb(t))
      from (
        select *
        from public.documents
        where p_transaction_id is null
          or transaction_id = p_transaction_id
          or canonical_requirement_instance_id = any(v_requirement_ids)
        order by created_at, id
        limit v_limit
      ) t
    ), '[]'::jsonb),
    'document_packets', coalesce((
      select jsonb_agg(to_jsonb(t))
      from (
        select *
        from public.document_packets
        where (
          p_transaction_id is null
          and p_fixture is null
        ) or id = any(v_packet_ids)
        order by created_at, id
        limit v_limit
      ) t
    ), '[]'::jsonb),
    'document_packet_versions', coalesce((
      select jsonb_agg(to_jsonb(t))
      from (
        select *
        from public.document_packet_versions
        where (
          p_transaction_id is null
          and p_fixture is null
        ) or packet_id = any(v_packet_ids)
        order by created_at, id
        limit v_limit
      ) t
    ), '[]'::jsonb),
    'document_requirement_reminders', coalesce((
      select jsonb_agg(to_jsonb(t))
      from (
        select *
        from public.document_requirement_reminders
        where p_transaction_id is null
          or requirement_instance_id = any(v_requirement_ids)
          or (
            context_type = 'transaction'
            and context_id = p_transaction_id
          )
        order by created_at, id
        limit v_limit
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.canonical_document_verification_snapshot(text, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.canonical_document_verification_snapshot(text, uuid, text, integer) to anon, authenticated, service_role;

comment on function public.canonical_document_verification_snapshot(text, uuid, text, integer) is
  'Returns a bounded canonical document verification snapshot. Pass p_transaction_id and optional p_fixture for operational fixture checks.';

notify pgrst, 'reload schema';
