update public.transactions
set
  sale_route = 'private_property_sale',
  sale_channel = null,
  seller_party_type = 'private_seller',
  lead_owner = null,
  ownership_model = null,
  source_agency_org_id = null
where sale_route = 'developer_assigned_sale'
  and development_id is null
  and lower(trim(coalesce(transaction_type, ''))) not in (
    'development',
    'developer_sale',
    'development_sale',
    'bond_application'
  )
  and source_agency_org_id is null
  and coalesce(lead_owner, '') <> 'agency'
  and coalesce(ownership_model, '') <> 'agency_introduced';
