begin;

create or replace function public.bridge_client_portal_matter_financial_accounts(
  p_workspace text default 'buyer'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_token text := public.bridge_client_portal_request_token();
  v_link public.client_portal_links%rowtype;
  v_party_role text := case
    when lower(coalesce(p_workspace, 'buyer')) in ('seller', 'selling') then 'seller'
    else 'buyer'
  end;
  v_accounts jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  if coalesce(v_token, '') = '' then
    return jsonb_build_object(
      'accounts', '[]'::jsonb,
      'summary', jsonb_build_object(
        'balanceDue', 0,
        'totalCharged', 0,
        'totalCredited', 0,
        'documentCount', 0,
        'postedEntries', 0,
        'eventCount', 0
      ),
      'workspace', v_party_role,
      'unavailable', false
    );
  end if;

  select *
  into v_link
  from public.client_portal_links link
  where link.token = v_token
    and link.is_active = true
  order by link.updated_at desc nulls last, link.created_at desc nulls last
  limit 1;

  if not found then
    raise exception 'Client portal link is invalid or inactive.';
  end if;

  with scoped_accounts as (
    select
      account.id,
      account.transaction_id,
      account.party_role,
      account.party_ref,
      account.party_label,
      account.party_email,
      account.currency_code,
      account.status,
      account.portal_enabled,
      account.opening_balance,
      account.updated_at
    from public.matter_financial_accounts account
    where account.transaction_id = v_link.transaction_id
      and account.party_role = v_party_role
      and account.portal_enabled = true
      and account.status = 'active'
  ),
  visible_entries as (
    select entry.*
    from public.matter_financial_entries entry
    join scoped_accounts account on account.id = entry.financial_account_id
    where entry.entry_status = 'posted'
      and entry.entry_visibility = 'client_visible'
  ),
  visible_documents as (
    select document.*
    from public.matter_financial_documents document
    join scoped_accounts account on account.id = document.financial_account_id
    where document.document_status = 'published'
      and document.audience_role <> 'internal'
      and (
        document.audience_role = account.party_role
        or document.audience_role in ('client', 'shared')
      )
  ),
  visible_events as (
    select event.*
    from public.matter_financial_account_events event
    join scoped_accounts account on account.id = event.financial_account_id
    where event.event_visibility = 'client_visible'
  ),
  account_payloads as (
    select
      account.id,
      jsonb_build_object(
        'id', account.id,
        'transactionId', account.transaction_id,
        'partyRole', account.party_role,
        'partyRef', account.party_ref,
        'partyLabel', account.party_label,
        'partyEmail', account.party_email,
        'currencyCode', account.currency_code,
        'status', account.status,
        'portalEnabled', account.portal_enabled,
        'updatedAt', account.updated_at,
        'balance', jsonb_build_object(
          'openingBalance', account.opening_balance,
          'postedEntryTotal', coalesce(sum(entry.amount), 0)::numeric(14, 2),
          'balanceDue', (account.opening_balance + coalesce(sum(entry.amount), 0))::numeric(14, 2),
          'totalCharged', coalesce(sum(entry.amount) filter (
            where entry.entry_type in ('opening_balance', 'charge', 'debit')
              and entry.amount > 0
          ), 0)::numeric(14, 2),
          'totalCredited', abs(coalesce(sum(entry.amount) filter (
            where entry.entry_type in ('payment', 'credit', 'write_off')
              and entry.amount < 0
          ), 0))::numeric(14, 2),
          'lastPostedAt', max(entry.posted_at)
        ),
        'documents', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', document.id,
              'documentType', document.document_type,
              'documentStatus', document.document_status,
              'audienceRole', document.audience_role,
              'externalReference', document.external_reference,
              'title', document.title,
              'storageBucket', document.storage_bucket,
              'storagePath', document.storage_path,
              'fileName', document.file_name,
              'mimeType', document.mime_type,
              'fileSizeBytes', document.file_size_bytes,
              'currencyCode', document.currency_code,
              'amountTotal', document.amount_total,
              'amountDue', document.amount_due,
              'issuedOn', document.issued_on,
              'dueOn', document.due_on,
              'publishedAt', document.published_at,
              'notes', document.notes
            )
            order by document.issued_on desc nulls last, document.published_at desc nulls last, document.created_at desc
          )
          from visible_documents document
          where document.financial_account_id = account.id
        ), '[]'::jsonb),
        'entries', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', entry.id,
              'financialDocumentId', entry.financial_document_id,
              'entryType', entry.entry_type,
              'entryStatus', entry.entry_status,
              'entryVisibility', entry.entry_visibility,
              'amount', entry.amount,
              'currencyCode', entry.currency_code,
              'description', entry.description,
              'occurredOn', entry.occurred_on,
              'postedAt', entry.posted_at
            )
            order by entry.occurred_on desc, entry.created_at desc
          )
          from visible_entries entry
          where entry.financial_account_id = account.id
        ), '[]'::jsonb),
        'events', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', event.id,
              'eventType', event.event_type,
              'eventVisibility', event.event_visibility,
              'actorRole', event.actor_role,
              'payload', event.payload_json,
              'createdAt', event.created_at
            )
            order by event.created_at desc
          )
          from visible_events event
          where event.financial_account_id = account.id
        ), '[]'::jsonb)
      ) as account_json,
      (account.opening_balance + coalesce(sum(entry.amount), 0))::numeric(14, 2) as balance_due,
      coalesce(sum(entry.amount) filter (
        where entry.entry_type in ('opening_balance', 'charge', 'debit')
          and entry.amount > 0
      ), 0)::numeric(14, 2) as total_charged,
      abs(coalesce(sum(entry.amount) filter (
        where entry.entry_type in ('payment', 'credit', 'write_off')
          and entry.amount < 0
      ), 0))::numeric(14, 2) as total_credited,
      (
        select count(*)
        from visible_documents document
        where document.financial_account_id = account.id
      ) as document_count,
      (
        select count(*)
        from visible_entries posted_entry
        where posted_entry.financial_account_id = account.id
      ) as posted_entry_count,
      (
        select count(*)
        from visible_events event
        where event.financial_account_id = account.id
      ) as event_count
    from scoped_accounts account
    left join visible_entries entry on entry.financial_account_id = account.id
    group by account.id, account.transaction_id, account.party_role, account.party_ref, account.party_label,
      account.party_email, account.currency_code, account.status, account.portal_enabled, account.opening_balance,
      account.updated_at
  )
  select
    coalesce(jsonb_agg(account_json order by account_json ->> 'partyRole', account_json ->> 'partyLabel'), '[]'::jsonb),
    jsonb_build_object(
      'balanceDue', coalesce(sum(balance_due), 0)::numeric(14, 2),
      'totalCharged', coalesce(sum(total_charged), 0)::numeric(14, 2),
      'totalCredited', coalesce(sum(total_credited), 0)::numeric(14, 2),
      'documentCount', coalesce(sum(document_count), 0),
      'postedEntries', coalesce(sum(posted_entry_count), 0),
      'eventCount', coalesce(sum(event_count), 0)
    )
  into v_accounts, v_summary
  from account_payloads;

  return jsonb_build_object(
    'accounts', coalesce(v_accounts, '[]'::jsonb),
    'summary', coalesce(v_summary, '{}'::jsonb),
    'workspace', v_party_role,
    'unavailable', false
  );
end;
$$;

revoke all on function public.bridge_client_portal_matter_financial_accounts(text) from public;
grant execute on function public.bridge_client_portal_matter_financial_accounts(text) to anon, authenticated;

comment on function public.bridge_client_portal_matter_financial_accounts(text) is
  'Token-scoped read model for buyer/seller portal account details. Only portal-enabled accounts, published documents, client-visible posted entries, and client-visible account events are returned.';

notify pgrst, 'reload schema';

commit;
