import { SELLER_DATA_FIELDS } from '../../src/lib/sellerDataOwnershipContract.js'

const legacyFields = [
  'company', 'trust', 'spouse', 'primary_contact_name', 'first_name', 'surname', 'last_name',
  'company_name', 'company_registered_address', 'company_directors', 'company_beneficial_owners',
  'trust_name', 'trust_registered_address', 'trust_trustees', 'trust_founders', 'trust_beneficiaries',
  'marital_status', 'marital_regime', 'vat_registered', 'vat_number', 'alternativePhone',
  'alternateContact', 'secondaryPhone', 'contactPreference', 'spouseFullName',
  'authorised_signatory_name', 'authorised_signatory_id_number', 'authorised_signatory_email',
  'authorised_signatory_phone', 'authorised_signatory_capacity', 'authorised_signatory_address',
  'authorised_signatory_nationality', 'authorised_trustee_name', 'authorised_trustee_id_number',
  'authorised_trustee_email', 'authorised_trustee_phone', 'authorised_trustee_capacity',
  'authorised_trustee_address', 'authorised_trustee_nationality', 'deceasedEstateReferenceNumber',
  'power_of_attorney_principal_name', 'power_of_attorney_principal_id_number',
  'power_of_attorney_name', 'power_of_attorney_email', 'trust_beneficiary_class',
]

export const sellerAuditCaptureFields = [...new Set([
  ...SELLER_DATA_FIELDS.filter(field => field.authority === 'private_listing_seller_onboarding')
    .flatMap(field => field.formFields.map(path => path.split(/[.[]/)[0])),
  ...legacyFields,
])]

const sqlLiteral = value => `'${value.replaceAll("'", "''")}'`

const protectedSeller = column => `md5(jsonb_build_object(
  'seller',coalesce(${column}->'seller','{}')-'email'-'phone'-'contact'-'primary_contact',
  'contact',coalesce(${column}#>'{seller,contact}','{}')-'email'-'phone',
  'primary_contact',coalesce(${column}#>'{seller,primary_contact}','{}')-'email'-'phone'
)::text)`

// This is an administrative snapshot query, not a new RPC or a browser client.
// No signing HTML, portal credentials, invitation tokens or signature pixels
// are exported. Optional identity-index tables must be supplied separately when
// present; their absence is represented as missing coverage, never empty data.
export function buildSellerAlignmentSnapshotQuery({ projectRef, environmentLabel } = {}) {
  if (!/^[a-z]{20}$/.test(projectRef || '') || !environmentLabel?.trim()) {
    throw new Error('An explicit Supabase project reference and environment label are required.')
  }
  const captureKeys = sellerAuditCaptureFields.map(sqlLiteral).join(',')
  return `begin transaction isolation level repeatable read read only;
set local statement_timeout='30s';
with listing_scope as (
  select l.id from public.private_listings l
  where not coalesce(l.is_demo_data,false)
    and lower(coalesce(l.listing_status,'')) not in ('withdrawn','deleted','archived','sold')
    and lower(coalesce(l.listing_visibility,'')) not in ('archived','deleted')
    and not (coalesce(l.seller_canonical_facts_json,'{}'::jsonb)?'rentalInfo')
    and lower(coalesce(l.seller_canonical_facts_json->>'listingType','')) not in ('rental','rent','to_rent','to_let','letting','lease')
    and not exists(select 1 from public.private_listing_seller_onboarding o where o.private_listing_id=l.id
      and lower(coalesce(o.form_data->>'listingType',o.form_data->>'listing_type','')) in ('rental','rent','to_rent','to_let','letting','lease'))
), evidence as (
  select l.id listing_id,
    exists(select 1 from public.private_listing_seller_portal_signing_documents d where d.private_listing_id=l.id
      and (d.signed_at is not null or d.status in ('sent','prepared','partially_signed','signed','reviewed')))
      or exists(select 1 from public.private_listing_documents d where d.private_listing_id=l.id and lower(coalesce(d.status,'')) in ('signed','completed','approved','reviewed'))
      or exists(select 1 from public.private_listing_seller_portal_signature_evidence e join public.private_listing_seller_portal_signing_documents d on d.id=e.signing_document_id where d.private_listing_id=l.id)
      or exists(select 1 from public.private_listing_seller_onboarding o where o.private_listing_id=l.id and
        (o.form_data ?| array['sellerOnboardingManualSigningPack','seller_onboarding_manual_signing_pack','sellerOnboardingFormalPackApproval','seller_onboarding_formal_pack_approval'])) as preserve_copies,
    md5(jsonb_build_object(
      'uploads',(select coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]') from public.private_listing_documents d where d.private_listing_id=l.id),
      'signing',(select coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]') from public.private_listing_seller_portal_signing_documents d where d.private_listing_id=l.id),
      'signatures',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from public.private_listing_seller_portal_signature_evidence e join public.private_listing_seller_portal_signing_documents d on d.id=e.signing_document_id where d.private_listing_id=l.id),
      'copies',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'pack',coalesce(o.form_data->'sellerOnboardingManualSigningPack',o.form_data->'seller_onboarding_manual_signing_pack'),'approval',coalesce(o.form_data->'sellerOnboardingFormalPackApproval',o.form_data->'seller_onboarding_formal_pack_approval')) order by o.id),'[]') from public.private_listing_seller_onboarding o where o.private_listing_id=l.id)
    )::text) fingerprint
  from listing_scope l
), capture_rows as (
  select o.id,o.private_listing_id,o.status,o.updated_at,o.is_demo_data,
    case when s.id is not null then (select coalesce(jsonb_object_agg(f.key,f.value),'{}') from jsonb_each(case when jsonb_typeof(o.form_data)='object' then o.form_data else '{}' end) f where f.key=any(array[${captureKeys}])) else '{}'::jsonb end form_data,
    case when s.id is not null then jsonb_build_object('seller',o.canonical_facts_json->'seller','finance',o.canonical_facts_json->'finance','property',o.canonical_facts_json->'property') else '{}'::jsonb end canonical_facts_json,
    jsonb_typeof(o.form_data) form_shape,jsonb_typeof(o.canonical_facts_json) canonical_shape,
    case when s.id is not null then ${protectedSeller('o.canonical_facts_json')} end protected_seller_fingerprint,
    case when s.id is not null then md5(coalesce(o.canonical_facts_json,'{}')::text) end canonical_fingerprint
  from public.private_listing_seller_onboarding o left join listing_scope s on s.id=o.private_listing_id
)
select jsonb_build_object(
  'environment',jsonb_build_object('projectRef',${sqlLiteral(projectRef)},'label',${sqlLiteral(environmentLabel)}),
  'capturedAt',now(),'readOnly',current_setting('transaction_read_only'),'scope',jsonb_build_object(
    'listingIds',(select coalesce(jsonb_agg(id order by id),'[]') from listing_scope),
    'description','Non-demo open sale listings; rental markers, archived/sold records and demonstration listings excluded',
    'metadataOnlyOutsideScope',true),
  'completeTables',jsonb_build_array('private_listings','private_listing_seller_onboarding','leads','contacts','transactions','transaction_participants','onboarding_form_data','client_portal_contexts','profiles'),
  'schema',jsonb_build_object(
    'availableTables',(select jsonb_agg(tablename order by tablename) from pg_tables where schemaname='public' and tablename in ('agency_client_profiles','agency_client_links')),
    'functions',(select coalesce(jsonb_agg(p.proname order by p.proname),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.proname in ('save_private_listing_seller_onboarding_profile','save_private_listing_seller_canonical_update','bridge_get_transaction_seller_edit_context','bridge_save_transaction_seller_details','bridge_get_transaction_seller_profile')),
    'participantSourceColumns',(select coalesce(jsonb_agg(column_name order by column_name),'[]') from information_schema.columns where table_schema='public' and table_name='transaction_participants' and column_name like 'seller_source_%'),
    'guardMigrations',(select coalesce(jsonb_agg(version order by version),'[]') from supabase_migrations.schema_migrations where version in ('20261010215549','20261010225607','20261011065947','20261011073408'))),
  'tables',jsonb_build_object(
    'private_listings',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'organisation_id',l.organisation_id,'seller_lead_id',l.seller_lead_id,'originating_crm_lead_id',l.originating_crm_lead_id,'seller_profile_id',l.seller_profile_id,'updated_at',l.updated_at,'is_demo_data',l.is_demo_data,'listing_status',l.listing_status,'listing_visibility',l.listing_visibility,
      'seller_canonical_facts_json',case when s.id is not null then jsonb_build_object('seller',l.seller_canonical_facts_json->'seller','finance',l.seller_canonical_facts_json->'finance','property',l.seller_canonical_facts_json->'property') else '{}'::jsonb end,
      'canonical_shape',jsonb_typeof(l.seller_canonical_facts_json),
      'protected_seller_fingerprint',case when s.id is not null then ${protectedSeller('l.seller_canonical_facts_json')} end,
      'canonical_fingerprint',case when s.id is not null then md5(coalesce(l.seller_canonical_facts_json,'{}')::text) end) order by l.id),'[]') from public.private_listings l left join listing_scope s on s.id=l.id),
    'private_listing_seller_onboarding',(select coalesce(jsonb_agg(to_jsonb(o) order by o.id),'[]') from capture_rows o),
    'leads',(select coalesce(jsonb_agg(jsonb_build_object('lead_id',l.lead_id,'organisation_id',l.organisation_id,'listing_id',l.listing_id,'contact_id',l.contact_id,'converted_transaction_id',l.converted_transaction_id,'lead_category',l.lead_category,'is_demo_data',l.is_demo_data,'updated_at',l.updated_at,
      'hasLegacySellerCapture',coalesce(l.raw_enquiry_payload,'{}') ?| array['sellerOnboarding','seller_onboarding']) order by l.lead_id),'[]') from public.leads l),
    'contacts',(select coalesce(jsonb_agg(jsonb_build_object('contact_id',c.contact_id,'organisation_id',c.organisation_id,'updated_at',c.updated_at,
      'email',case when exists(select 1 from public.leads d join listing_scope s on s.id::text=d.listing_id::text where d.contact_id=c.contact_id)
        or exists(select 1 from public.private_listings l join listing_scope s on s.id=l.id where l.seller_profile_id::text=c.contact_id::text
          or exists(select 1 from public.leads d where d.lead_id::text in (l.seller_lead_id,l.originating_crm_lead_id) and d.contact_id=c.contact_id)) then c.email end,
      'phone',case when exists(select 1 from public.leads d join listing_scope s on s.id::text=d.listing_id::text where d.contact_id=c.contact_id)
        or exists(select 1 from public.private_listings l join listing_scope s on s.id=l.id where l.seller_profile_id::text=c.contact_id::text
          or exists(select 1 from public.leads d where d.lead_id::text in (l.seller_lead_id,l.originating_crm_lead_id) and d.contact_id=c.contact_id)) then c.phone end) order by c.contact_id),'[]') from public.contacts c),
    'transactions',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'organisation_id',t.organisation_id,'listing_id',t.listing_id,'seller_contact_id',t.seller_contact_id,'is_demo_data',t.is_demo_data,'deleted_at',t.deleted_at,'updated_at',t.updated_at,
      'seller_name',case when s.id is not null then t.seller_name end,'seller_email',case when s.id is not null then t.seller_email end,'seller_phone',case when s.id is not null then t.seller_phone end) order by t.id),'[]') from public.transactions t left join listing_scope s on s.id=t.listing_id),
    'onboarding_form_data',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'transaction_id',f.transaction_id,'updated_at',f.updated_at,'hasSellerPartySnapshot',f.form_data#>'{__bridge_transaction_parties,seller}' is not null,
      'form_data',case when s.id is not null then jsonb_build_object('seller_name',f.form_data->'seller_name','seller_email',f.form_data->'seller_email','seller_phone',f.form_data->'seller_phone','__bridge_transaction_parties',jsonb_build_object('seller',f.form_data#>'{__bridge_transaction_parties,seller}')) else '{}'::jsonb end) order by f.id),'[]') from public.onboarding_form_data f left join public.transactions t on t.id=f.transaction_id left join listing_scope s on s.id=t.listing_id),
    'transaction_participants',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'transaction_id',p.transaction_id,'role_type',p.role_type,'removed_at',p.removed_at,'updated_at',p.updated_at,
      'seller_source_onboarding_id',to_jsonb(p)->'seller_source_onboarding_id','seller_source_contact_key',to_jsonb(p)->'seller_source_contact_key',
      'participant_name',case when s.id is not null then p.participant_name end,'participant_email',case when s.id is not null then p.participant_email end,'participant_phone',case when s.id is not null then p.participant_phone end) order by p.id),'[]') from public.transaction_participants p left join public.transactions t on t.id=p.transaction_id left join listing_scope s on s.id=t.listing_id),
    'client_portal_contexts',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'organisation_id',c.organisation_id,'listing_id',c.listing_id,'seller_lead_id',c.seller_lead_id,'transaction_id',c.transaction_id,'context_type',c.context_type,'status',c.status,'updated_at',c.updated_at) order by c.id),'[]') from public.client_portal_contexts c),
    'profiles',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'organisation_id',to_jsonb(p)->'organisation_id') order by p.id),'[]') from public.profiles p)
  ),
  'evidence',(select coalesce(jsonb_agg(jsonb_build_object('listingId',listing_id,'preserveCopies',preserve_copies,'fingerprint',fingerprint) order by listing_id),'[]') from evidence)
) snapshot;
commit;`
}
