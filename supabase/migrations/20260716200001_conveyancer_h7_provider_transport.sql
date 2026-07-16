begin;

create or replace function public.bridge_review_conveyancer_provider_inbound_h7(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_envelope uuid; v_existing public.conveyancer_provider_transport_receipts%rowtype;
  v_row public.conveyancer_provider_inbound_envelopes%rowtype; v_result jsonb; v_key text;
begin
  if v_user is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  begin v_envelope := (payload ->> 'envelopeId')::uuid;
  exception when invalid_text_representation then raise exception 'H7 inbound review identity is invalid.' using errcode = '22023'; end;
  v_key := 'h7:review:' || trim(coalesce(payload ->> 'decisionId', ''));
  if coalesce(payload ->> 'version', '') <> 'conveyancer_provider_transport_h7_v1'
    or trim(coalesce(payload ->> 'decisionId', '')) = '' or length(payload ->> 'decisionId') > 200
    or length(trim(coalesce(payload ->> 'fingerprint', ''))) < 8 then
    raise exception 'H7 inbound review contract is invalid.' using errcode = '22023';
  end if;
  select * into v_existing from public.conveyancer_provider_transport_receipts
  where attorney_firm_id = (payload ->> 'attorneyFirmId')::uuid and idempotency_key = v_key;
  if found then
    if v_existing.record_id <> v_envelope or coalesce(v_existing.detail ->> 'decision', '') <> lower(payload ->> 'decision')
      or coalesce(v_existing.detail ->> 'requestFingerprint', '') <> payload ->> 'fingerprint' then
      raise exception 'H7 review idempotency conflict.' using errcode = '23505';
    end if;
    return jsonb_build_object('ok', true, 'duplicate', true, 'envelopeId', v_envelope, 'status', v_existing.detail ->> 'status');
  end if;
  v_result := public.bridge_review_conveyancer_provider_inbound(jsonb_build_object(
    'version', 'conveyancer_provider_transport_p7_v1', 'envelopeId', payload ->> 'envelopeId',
    'organisationId', payload ->> 'organisationId', 'attorneyFirmId', payload ->> 'attorneyFirmId',
    'transactionId', payload ->> 'transactionId', 'decision', payload ->> 'decision',
    'reason', payload ->> 'reason', 'reviewedBy', payload ->> 'reviewedBy',
    'reviewedAt', payload ->> 'reviewedAt', 'fingerprint', payload ->> 'fingerprint'
  ));
  select * into v_row from public.conveyancer_provider_inbound_envelopes where id = v_envelope;
  insert into public.conveyancer_provider_transport_receipts(
    organisation_id, attorney_firm_id, transaction_id, direction, record_id, event_type, idempotency_key, detail, created_by
  ) values (
    v_row.organisation_id, v_row.attorney_firm_id, v_row.transaction_id, 'inbound', v_row.id,
    'application_review_committed', v_key,
    jsonb_build_object('decision', lower(payload ->> 'decision'), 'status', v_result ->> 'status', 'requestFingerprint', payload ->> 'fingerprint', 'legalTruthCreated', false), v_user
  );
  return v_result || jsonb_build_object('duplicate', false, 'decisionId', payload ->> 'decisionId');
end $$;

create or replace function public.bridge_retry_conveyancer_provider_command_h7(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_command uuid; v_existing public.conveyancer_provider_transport_receipts%rowtype;
  v_row public.conveyancer_provider_outbound_commands%rowtype; v_result jsonb; v_key text;
begin
  if v_user is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  begin v_command := (payload ->> 'commandId')::uuid;
  exception when invalid_text_representation then raise exception 'H7 retry identity is invalid.' using errcode = '22023'; end;
  v_key := 'h7:retry:' || trim(coalesce(payload ->> 'requestId', ''));
  if coalesce(payload ->> 'version', '') <> 'conveyancer_provider_transport_h7_v1'
    or trim(coalesce(payload ->> 'requestId', '')) = '' or length(payload ->> 'requestId') > 200
    or trim(coalesce(payload ->> 'reason', '')) = '' then
    raise exception 'H7 retry contract is invalid.' using errcode = '22023';
  end if;
  select * into v_row from public.conveyancer_provider_outbound_commands where id = v_command;
  if not found then raise exception 'H7 provider command was not found.' using errcode = '22023'; end if;
  select * into v_existing from public.conveyancer_provider_transport_receipts
  where attorney_firm_id = v_row.attorney_firm_id and idempotency_key = v_key;
  if found then
    if v_existing.record_id <> v_command or coalesce(v_existing.detail ->> 'reason', '') <> left(trim(payload ->> 'reason'), 500) then raise exception 'H7 retry idempotency conflict.' using errcode = '23505'; end if;
    return jsonb_build_object('ok', true, 'duplicate', true, 'commandId', v_command, 'status', 'queued');
  end if;
  v_result := public.bridge_retry_conveyancer_provider_command(v_command, payload ->> 'reason');
  insert into public.conveyancer_provider_transport_receipts(
    organisation_id, attorney_firm_id, transaction_id, direction, record_id, event_type, idempotency_key, detail, created_by
  ) values (
    v_row.organisation_id, v_row.attorney_firm_id, v_row.transaction_id, 'outbound', v_row.id,
    'application_retry_committed', v_key, jsonb_build_object('reason', left(trim(payload ->> 'reason'), 500), 'status', 'queued'), v_user
  );
  return v_result || jsonb_build_object('duplicate', false, 'requestId', payload ->> 'requestId');
end $$;

revoke all on function public.bridge_review_conveyancer_provider_inbound_h7(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.bridge_retry_conveyancer_provider_command_h7(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.bridge_review_conveyancer_provider_inbound_h7(jsonb) to authenticated;
grant execute on function public.bridge_retry_conveyancer_provider_command_h7(jsonb) to authenticated;

comment on function public.bridge_review_conveyancer_provider_inbound_h7(jsonb) is 'H7 idempotent application wrapper around the P7 human inbound-review transaction.';
comment on function public.bridge_retry_conveyancer_provider_command_h7(jsonb) is 'H7 idempotent, reasoned operator recovery wrapper around the P7 durable outbox.';

notify pgrst, 'reload schema';
commit;
