create or replace function public.bridge_developer_document_portal_transaction_is_eligible(
  p_transaction public.transactions
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_transaction.id is not null
    and p_transaction.development_id is not null
    and (
      lower(coalesce(to_jsonb(p_transaction) ->> 'transaction_type', '')) in (
        'developer_sale', 'development_sale', 'development'
      )
      or lower(coalesce(to_jsonb(p_transaction) ->> 'sale_route', '')) in (
        'developer_sale', 'development_sale', 'internal_developer_sale',
        'developer_direct_sale', 'developer_direct', 'developer_assigned_sale',
        'developer_assigned', 'external_agency_sale', 'agency_introduced_sale',
        'agency_introduced'
      )
      or lower(coalesce(to_jsonb(p_transaction) ->> 'seller_party_type', '')) = 'developer'
    );
$$;
revoke all on function public.bridge_developer_document_portal_transaction_is_eligible(public.transactions) from public;
grant execute on function public.bridge_developer_document_portal_transaction_is_eligible(public.transactions) to service_role;;
