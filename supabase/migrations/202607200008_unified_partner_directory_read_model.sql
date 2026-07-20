begin;

create or replace function public.bridge_list_organisation_partner_directory(
  p_organisation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_partners jsonb := '[]'::jsonb;
  v_can_manage boolean := false;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'success', false,
      'code', 'not_authenticated',
      'partners', '[]'::jsonb
    );
  end if;

  if p_organisation_id is null then
    return jsonb_build_object(
      'success', false,
      'code', 'organisation_required',
      'partners', '[]'::jsonb
    );
  end if;

  if not exists (
    select 1
    from public.organisation_users membership
    where membership.organisation_id = p_organisation_id
      and membership.user_id = v_user_id
      and lower(coalesce(membership.membership_status, membership.status, '')) = 'active'
  ) then
    return jsonb_build_object(
      'success', false,
      'code', 'not_authorized',
      'partners', '[]'::jsonb
    );
  end if;

  v_can_manage := public.bridge_phase3_can_manage_organization(p_organisation_id);

  with relationship_sources as (
    select
      'organisation:' || counterpart.id::text as directory_id,
      counterpart.id as partner_organisation_id,
      relationship.id as relationship_id,
      null::uuid as external_partner_id,
      null::uuid as invitation_id,
      coalesce(
        nullif(trim(counterpart.display_name), ''),
        nullif(trim(counterpart.name), ''),
        'Partner organisation'
      ) as display_name,
      null::text as contact_person,
      null::text as email_address,
      null::text as phone_number,
      nullif(trim(counterpart.website), '') as website,
      null::text as province,
      relationship.notes,
      case lower(coalesce(
        case
          when relationship.organisation_id = p_organisation_id
            then nullif(trim(relationship.partner_type), '')
          else null::text
        end,
        nullif(trim(counterpart.organization_type), ''),
        nullif(trim(counterpart.type), ''),
        'other'
      ))
        when 'attorney_firm' then 'transfer_attorney'
        when 'attorney' then 'transfer_attorney'
        when 'agency' then 'referral_agency'
        when 'agency_network' then 'referral_agency'
        when 'developer_company' then 'developer'
        else lower(coalesce(
          case
            when relationship.organisation_id = p_organisation_id
              then nullif(trim(relationship.partner_type), '')
            else null::text
          end,
          nullif(trim(counterpart.organization_type), ''),
          nullif(trim(counterpart.type), ''),
          'other'
        ))
      end as role_type,
      case lower(coalesce(relationship.status, relationship.relationship_status, 'pending'))
        when 'accepted' then 'connected'
        when 'connected' then 'connected'
        when 'blocked' then 'blocked'
        when 'declined' then 'declined'
        else 'pending'
      end as connection_status,
      null::text as invitation_status,
      null::text as invitation_direction,
      coalesce(relationship.preferred, false) as is_preferred,
      lower(coalesce(relationship.status, relationship.relationship_status, 'pending')) not in ('blocked', 'declined') as is_active,
      'organisation_relationship'::text as source,
      1 as source_priority,
      relationship.created_at,
      relationship.updated_at
    from public.organisation_partners relationship
    join public.organisations counterpart
      on counterpart.id = case
        when relationship.organisation_id = p_organisation_id then relationship.partner_organisation_id
        else relationship.organisation_id
      end
    where relationship.organisation_id = p_organisation_id
       or relationship.partner_organisation_id = p_organisation_id
  ),
  preferred_sources as (
    select
      case
        when preferred.partner_organisation_id is not null
          then 'organisation:' || preferred.partner_organisation_id::text
        else 'external:' || preferred.id::text
      end as directory_id,
      preferred.partner_organisation_id,
      null::uuid as relationship_id,
      preferred.id as external_partner_id,
      null::uuid as invitation_id,
      coalesce(
        nullif(trim(preferred.company_name), ''),
        nullif(trim(linked_organisation.display_name), ''),
        nullif(trim(linked_organisation.name), ''),
        'External partner'
      ) as display_name,
      nullif(trim(preferred.contact_person), '') as contact_person,
      nullif(lower(trim(preferred.email_address)), '') as email_address,
      nullif(trim(preferred.phone_number), '') as phone_number,
      coalesce(
        nullif(trim(preferred.website), ''),
        nullif(trim(linked_organisation.website), '')
      ) as website,
      nullif(trim(preferred.province), '') as province,
      preferred.notes,
      case lower(coalesce(nullif(trim(preferred.partner_type), ''), 'other'))
        when 'agency' then 'referral_agency'
        when 'attorney_firm' then 'transfer_attorney'
        else lower(coalesce(nullif(trim(preferred.partner_type), ''), 'other'))
      end as role_type,
      null::text as connection_status,
      null::text as invitation_status,
      null::text as invitation_direction,
      preferred.is_preferred_default as is_preferred,
      preferred.is_active,
      case
        when preferred.partner_organisation_id is null then 'external_partner'
        else 'partner_role_default'
      end::text as source,
      2 as source_priority,
      preferred.created_at,
      preferred.updated_at
    from public.organisation_preferred_partners preferred
    left join public.organisations linked_organisation
      on linked_organisation.id = preferred.partner_organisation_id
    where preferred.organisation_id = p_organisation_id
  ),
  invitation_base as (
    select
      invitation.*,
      case
        when invitation.sender_organisation_id = p_organisation_id then 'outgoing'
        else 'incoming'
      end as invitation_direction,
      case
        when invitation.sender_organisation_id = p_organisation_id then invitation.recipient_organisation_id
        else invitation.sender_organisation_id
      end as counterpart_organisation_id
    from public.partner_invitations invitation
    where invitation.sender_organisation_id = p_organisation_id
       or invitation.recipient_organisation_id = p_organisation_id
  ),
  invitation_sources as (
    select
      case
        when invitation.counterpart_organisation_id is not null
          then 'organisation:' || invitation.counterpart_organisation_id::text
        when matched_external.id is not null
          then 'external:' || matched_external.id::text
        else 'invitation:' || invitation.id::text
      end as directory_id,
      invitation.counterpart_organisation_id as partner_organisation_id,
      null::uuid as relationship_id,
      matched_external.id as external_partner_id,
      invitation.id as invitation_id,
      coalesce(
        nullif(trim(counterpart.display_name), ''),
        nullif(trim(counterpart.name), ''),
        case
          when invitation.invitation_direction = 'outgoing' then nullif(trim(invitation.to_organisation_name), '')
          else nullif(trim(invitation.from_organisation_name), '')
        end,
        nullif(trim(matched_external.company_name), ''),
        'Invited partner'
      ) as display_name,
      nullif(trim(matched_external.contact_person), '') as contact_person,
      case
        when invitation.invitation_direction = 'outgoing'
          then nullif(lower(trim(coalesce(invitation.invited_email, invitation.recipient_email))), '')
        else null::text
      end as email_address,
      nullif(trim(matched_external.phone_number), '') as phone_number,
      coalesce(
        nullif(trim(matched_external.website), ''),
        nullif(trim(counterpart.website), '')
      ) as website,
      nullif(trim(matched_external.province), '') as province,
      null::text as notes,
      case lower(coalesce(
        case
          when invitation.invitation_direction = 'outgoing'
            then nullif(trim(invitation.partner_type), '')
          else null::text
        end,
        case
          when invitation.invitation_direction = 'outgoing'
            then nullif(trim(invitation.to_workspace_type), '')
          else null::text
        end,
        nullif(trim(counterpart.organization_type), ''),
        nullif(trim(counterpart.type), ''),
        'other'
      ))
        when 'attorney_firm' then 'transfer_attorney'
        when 'attorney' then 'transfer_attorney'
        when 'agency' then 'referral_agency'
        when 'agency_network' then 'referral_agency'
        when 'developer_company' then 'developer'
        else lower(coalesce(
          case
            when invitation.invitation_direction = 'outgoing'
              then nullif(trim(invitation.partner_type), '')
            else null::text
          end,
          case
            when invitation.invitation_direction = 'outgoing'
              then nullif(trim(invitation.to_workspace_type), '')
            else null::text
          end,
          nullif(trim(counterpart.organization_type), ''),
          nullif(trim(counterpart.type), ''),
          'other'
        ))
      end as role_type,
      null::text as connection_status,
      lower(coalesce(invitation.status, 'pending')) as invitation_status,
      invitation.invitation_direction,
      coalesce(invitation.preferred, false) as is_preferred,
      lower(coalesce(invitation.status, 'pending')) not in ('revoked', 'expired') as is_active,
      'partner_invitation'::text as source,
      3 as source_priority,
      invitation.created_at,
      coalesce(invitation.responded_at, invitation.created_at) as updated_at
    from invitation_base invitation
    left join public.organisations counterpart
      on counterpart.id = invitation.counterpart_organisation_id
    left join lateral (
      select preferred.*
      from public.organisation_preferred_partners preferred
      where preferred.organisation_id = p_organisation_id
        and invitation.invitation_direction = 'outgoing'
        and invitation.counterpart_organisation_id is null
        and nullif(lower(trim(preferred.email_address)), '')
            = nullif(lower(trim(coalesce(invitation.invited_email, invitation.recipient_email))), '')
      order by preferred.is_active desc, preferred.updated_at desc, preferred.id
      limit 1
    ) matched_external on true
  ),
  all_sources as (
    select * from relationship_sources
    union all
    select * from preferred_sources
    union all
    select * from invitation_sources
  ),
  grouped as (
    select
      directory_id,
      (array_agg(partner_organisation_id order by source_priority, updated_at desc)
        filter (where partner_organisation_id is not null))[1] as partner_organisation_id,
      (array_agg(relationship_id order by source_priority, updated_at desc)
        filter (where relationship_id is not null))[1] as relationship_id,
      (array_agg(external_partner_id order by source_priority, updated_at desc)
        filter (where external_partner_id is not null))[1] as external_partner_id,
      (array_agg(invitation_id order by updated_at desc)
        filter (where invitation_id is not null))[1] as invitation_id,
      (array_agg(display_name order by source_priority, updated_at desc)
        filter (where nullif(trim(display_name), '') is not null))[1] as display_name,
      (array_agg(contact_person order by source_priority, updated_at desc)
        filter (where nullif(trim(contact_person), '') is not null))[1] as contact_person,
      (array_agg(email_address order by source_priority, updated_at desc)
        filter (where nullif(trim(email_address), '') is not null))[1] as email_address,
      (array_agg(phone_number order by source_priority, updated_at desc)
        filter (where nullif(trim(phone_number), '') is not null))[1] as phone_number,
      (array_agg(website order by source_priority, updated_at desc)
        filter (where nullif(trim(website), '') is not null))[1] as website,
      (array_agg(province order by source_priority, updated_at desc)
        filter (where nullif(trim(province), '') is not null))[1] as province,
      (array_agg(notes order by source_priority, updated_at desc)
        filter (where nullif(trim(notes), '') is not null))[1] as notes,
      array_agg(distinct role_type order by role_type)
        filter (where nullif(trim(role_type), '') is not null and role_type <> 'other') as roles,
      (array_agg(connection_status order by source_priority, updated_at desc)
        filter (where connection_status is not null))[1] as connection_status,
      (array_agg(invitation_status order by updated_at desc)
        filter (where invitation_status is not null))[1] as invitation_status,
      (array_agg(invitation_direction order by updated_at desc)
        filter (where invitation_direction is not null))[1] as invitation_direction,
      bool_or(is_preferred) as is_preferred,
      bool_or(is_active) as is_active,
      array_agg(distinct source order by source) as sources,
      min(created_at) as created_at,
      max(updated_at) as updated_at
    from all_sources
    group by directory_id
  ),
  normalized as (
    select
      grouped.*,
      case
        when connection_status = 'connected' then 'connected'
        when connection_status = 'blocked' then 'inactive'
        when connection_status = 'pending' or invitation_status = 'pending' then 'invite_pending'
        when not is_active then 'inactive'
        else 'external'
      end as directory_status
    from grouped
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'directoryId', directory_id,
        'ownerOrganisationId', p_organisation_id,
        'partnerOrganisationId', partner_organisation_id,
        'relationshipId', relationship_id,
        'externalPartnerId', external_partner_id,
        'invitationId', invitation_id,
        'displayName', display_name,
        'primaryContact', jsonb_strip_nulls(jsonb_build_object(
          'name', contact_person,
          'email', email_address,
          'phone', phone_number
        )),
        'website', website,
        'province', province,
        'notes', notes,
        'roles', coalesce(to_jsonb(roles), '[]'::jsonb),
        'status', directory_status,
        'connectionStatus', connection_status,
        'invitationStatus', invitation_status,
        'invitationDirection', invitation_direction,
        'isPreferred', is_preferred,
        'isActive', is_active,
        'sources', to_jsonb(sources),
        'createdAt', created_at,
        'updatedAt', updated_at
      )
      order by is_preferred desc, display_name, directory_id
    ),
    '[]'::jsonb
  )
  into v_partners
  from normalized;

  return jsonb_build_object(
    'success', true,
    'organisationId', p_organisation_id,
    'canManage', v_can_manage,
    'count', jsonb_array_length(v_partners),
    'partners', v_partners
  );
end;
$$;

revoke all on function public.bridge_list_organisation_partner_directory(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.bridge_list_organisation_partner_directory(uuid)
  to authenticated;

comment on function public.bridge_list_organisation_partner_directory(uuid) is
  'Returns one organisation-scoped partner directory by safely merging canonical relationships, external/default partner records, and invitations without mutating source records.';

commit;
