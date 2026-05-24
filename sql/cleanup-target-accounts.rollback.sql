begin;

do $$
declare
  v_target_emails text[] := array[
    'alex.samlin.construction@gmail.com',
    'akstackco@gmail.com',
    'yakstackco@gmail.com',
    'swervemarketingco@gmail.com'
  ];
  v_target_user_ids uuid[] := array[]::uuid[];
  v_target_org_ids uuid[] := array[]::uuid[];
  v_target_transaction_ids uuid[] := array[]::uuid[];
  v_target_packet_ids uuid[] := array[]::uuid[];
  v_target_listing_ids uuid[] := array[]::uuid[];
  v_target_lead_ids uuid[] := array[]::uuid[];
  v_target_contact_ids uuid[] := array[]::uuid[];
  v_count integer;
begin
  select coalesce(array_agg(id), array[]::uuid[])
    into v_target_user_ids
  from auth.users
  where lower(email) = any(select lower(unnest(v_target_emails)));

  select coalesce(array_agg(distinct ou.organisation_id), array[]::uuid[])
    into v_target_org_ids
  from public.organisation_users ou
  where ou.organisation_id is not null
    and (
      ou.user_id = any(v_target_user_ids)
      or lower(ou.email) = any(select lower(unnest(v_target_emails)))
    )
    and not exists (
      select 1
      from public.organisation_users other
      where other.organisation_id = ou.organisation_id
        and not (
          other.user_id = any(v_target_user_ids)
          or lower(other.email) = any(select lower(unnest(v_target_emails)))
        )
    );

  select coalesce(array_agg(distinct t.id), array[]::uuid[])
    into v_target_transaction_ids
  from public.transactions t
  where t.organisation_id = any(v_target_org_ids)
     or t.assigned_agent_id = any(v_target_user_ids)
     or t.owner_user_id = any(v_target_user_ids)
     or lower(t.assigned_agent_email) = any(select lower(unnest(v_target_emails)))
     or lower(t.assigned_attorney_email) = any(select lower(unnest(v_target_emails)))
     or lower(t.assigned_bond_originator_email) = any(select lower(unnest(v_target_emails)))
     or lower(t.seller_email) = any(select lower(unnest(v_target_emails)));

  select coalesce(array_agg(distinct p.id), array[]::uuid[])
    into v_target_packet_ids
  from public.document_packets p
  where p.organisation_id = any(v_target_org_ids)
     or p.transaction_id = any(v_target_transaction_ids)
     or p.assigned_agent_id = any(v_target_user_ids)
     or p.created_by = any(v_target_user_ids);

  select coalesce(array_agg(distinct l.lead_id), array[]::uuid[])
    into v_target_listing_ids
  from public.private_listings l
  where l.organisation_id = any(v_target_org_ids)
     or l.assigned_agent_id = any(v_target_user_ids)
     or l.created_by = any(v_target_user_ids);

  select coalesce(array_agg(distinct l.id), array[]::uuid[])
    into v_target_lead_ids
  from public.leads l
  where l.organisation_id = any(v_target_org_ids)
     or l.assigned_agent_id = any(v_target_user_ids);

  select coalesce(array_agg(distinct c.contact_id), array[]::uuid[])
    into v_target_contact_ids
  from public.contacts c
  where c.organisation_id = any(v_target_org_ids)
     or c.assigned_agent_id = any(v_target_user_ids)
     or lower(c.email) = any(select lower(unnest(v_target_emails)));

  raise notice 'cleanup targets: users %, orgs %, transactions %, packets %, listings %, leads %, contacts %',
    coalesce(array_length(v_target_user_ids, 1), 0),
    coalesce(array_length(v_target_org_ids, 1), 0),
    coalesce(array_length(v_target_transaction_ids, 1), 0),
    coalesce(array_length(v_target_packet_ids, 1), 0),
    coalesce(array_length(v_target_listing_ids, 1), 0),
    coalesce(array_length(v_target_lead_ids, 1), 0),
    coalesce(array_length(v_target_contact_ids, 1), 0);

  delete from storage.objects
  where bucket_id = 'documents'
    and exists (
      select 1
      from unnest(v_target_org_ids) org_id
      where name like 'organisations/' || org_id::text || '/%'
    );
  get diagnostics v_count = row_count;
  raise notice 'deleted storage.objects: %', v_count;

  delete from public.document_signing_fields
  where packet_id = any(v_target_packet_ids)
     or packet_version_id in (select id from public.document_packet_versions where packet_id = any(v_target_packet_ids));
  get diagnostics v_count = row_count;
  raise notice 'deleted document_signing_fields: %', v_count;

  delete from public.document_packet_signers where packet_id = any(v_target_packet_ids);
  get diagnostics v_count = row_count;
  raise notice 'deleted document_packet_signers: %', v_count;

  delete from public.document_packet_events where packet_id = any(v_target_packet_ids);
  get diagnostics v_count = row_count;
  raise notice 'deleted document_packet_events: %', v_count;

  delete from public.document_packet_versions where packet_id = any(v_target_packet_ids);
  get diagnostics v_count = row_count;
  raise notice 'deleted document_packet_versions: %', v_count;

  update public.leads
  set mandate_packet_id = null
  where mandate_packet_id = any(v_target_packet_ids);

  delete from public.document_packets where id = any(v_target_packet_ids);
  get diagnostics v_count = row_count;
  raise notice 'deleted document_packets: %', v_count;

  delete from public.appointment_participants
  where organisation_id = any(v_target_org_ids)
     or user_id = any(v_target_user_ids)
     or lower(email) = any(select lower(unnest(v_target_emails)))
     or appointment_id in (select appointment_id from public.appointments where organisation_id = any(v_target_org_ids) or created_by = any(v_target_user_ids));
  get diagnostics v_count = row_count;
  raise notice 'deleted appointment_participants: %', v_count;

  delete from public.appointments
  where organisation_id = any(v_target_org_ids)
     or created_by = any(v_target_user_ids)
     or cancelled_by = any(v_target_user_ids);
  get diagnostics v_count = row_count;
  raise notice 'deleted appointments: %', v_count;

  delete from public.private_listing_activity where private_listing_id = any(v_target_listing_ids);
  delete from public.private_listing_document_requirements where private_listing_id = any(v_target_listing_ids);
  delete from public.private_listing_documents where private_listing_id = any(v_target_listing_ids);
  delete from public.private_listing_seller_onboarding where private_listing_id = any(v_target_listing_ids);
  delete from public.private_listings where id = any(v_target_listing_ids);
  get diagnostics v_count = row_count;
  raise notice 'deleted private_listings: %', v_count;

  delete from public.transactions where id = any(v_target_transaction_ids);
  get diagnostics v_count = row_count;
  raise notice 'deleted transactions: %', v_count;

  delete from public.leads where lead_id = any(v_target_lead_ids);
  get diagnostics v_count = row_count;
  raise notice 'deleted leads: %', v_count;

  delete from public.contacts where contact_id = any(v_target_contact_ids);
  get diagnostics v_count = row_count;
  raise notice 'deleted contacts: %', v_count;

  delete from public.organisation_branding where organisation_id = any(v_target_org_ids);
  delete from public.organisation_settings where organisation_id = any(v_target_org_ids);
  delete from public.organisation_branches where organisation_id = any(v_target_org_ids);
  delete from public.organisation_users
  where organisation_id = any(v_target_org_ids)
     or user_id = any(v_target_user_ids)
     or lower(email) = any(select lower(unnest(v_target_emails)));
  get diagnostics v_count = row_count;
  raise notice 'deleted organisation_users: %', v_count;

  update public.attorney_firms
  set organisation_id = null
  where organisation_id = any(v_target_org_ids);

  delete from public.organisations where id = any(v_target_org_ids);
  get diagnostics v_count = row_count;
  raise notice 'deleted organisations: %', v_count;

  delete from auth.sessions where user_id = any(v_target_user_ids);
  delete from auth.refresh_tokens where user_id = any(select id::text from unnest(v_target_user_ids) id);
  delete from auth.identities where user_id = any(v_target_user_ids) or lower(email) = any(select lower(unnest(v_target_emails)));
  delete from public.profiles
  where id = any(v_target_user_ids)
     or lower(email) = any(select lower(unnest(v_target_emails)));
  get diagnostics v_count = row_count;
  raise notice 'deleted profiles: %', v_count;

  delete from auth.users
  where id = any(v_target_user_ids)
     or lower(email) = any(select lower(unnest(v_target_emails)));
  get diagnostics v_count = row_count;
  raise notice 'deleted auth.users: %', v_count;
end $$;

rollback;
