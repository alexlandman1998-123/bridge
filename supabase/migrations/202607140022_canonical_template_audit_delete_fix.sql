begin;
-- Correct delete-path audit foreign keys while retaining deleted identifiers in event_payload_json.
create or replace function public.bridge_document_packet_template_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template_id uuid;
  v_version_id uuid;
  v_organisation_id uuid;
  v_module_type text;
  v_packet_type text;
  v_event_type text;
  v_change_summary text;
  v_payload jsonb;
  v_actor_auth_user_id uuid := auth.uid();
  v_actor_profile_id uuid;
begin
  select profile.id into v_actor_profile_id
  from public.profiles profile
  where profile.id = v_actor_auth_user_id;

  if TG_TABLE_NAME = 'document_packet_template_versions' then
    v_template_id := coalesce(new.template_id, old.template_id);
    v_version_id := coalesce(new.id, old.id);
    v_organisation_id := coalesce(new.organisation_id, old.organisation_id);
    v_module_type := coalesce(new.module_type, old.module_type);
    v_packet_type := coalesce(new.packet_type, old.packet_type);
    v_change_summary := coalesce(new.change_summary, old.change_summary);

    if TG_OP = 'INSERT' then
      v_event_type := 'template_version_created';
      v_payload := jsonb_build_object('new', to_jsonb(new));
    elsif TG_OP = 'DELETE' then
      v_event_type := 'template_version_deleted';
      v_payload := jsonb_build_object('old', to_jsonb(old));
      v_version_id := null;
      if not exists (
        select 1 from public.document_packet_templates template where template.id = v_template_id
      ) then
        v_template_id := null;
      end if;
    else
      v_event_type := case
        when old.status is distinct from new.status and new.status = 'published' then 'template_version_published'
        when old.status is distinct from new.status and new.status = 'archived' then 'template_version_archived'
        else 'template_version_updated'
      end;
      v_payload := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
    end if;
  else
    v_template_id := coalesce(new.id, old.id);
    v_version_id := null;
    v_organisation_id := coalesce(new.organisation_id, old.organisation_id);
    v_module_type := coalesce(new.module_type, old.module_type);
    v_packet_type := coalesce(new.packet_type, old.packet_type);
    v_change_summary := coalesce(new.change_summary, old.change_summary);

    if TG_OP = 'INSERT' then
      v_event_type := 'template_created';
      v_payload := jsonb_build_object('new', to_jsonb(new));
    elsif TG_OP = 'DELETE' then
      v_event_type := 'template_deleted';
      v_payload := jsonb_build_object('old', to_jsonb(old));
      v_template_id := null;
    else
      v_event_type := case
        when old.status is distinct from new.status and new.status = 'published' then 'template_published'
        when old.status is distinct from new.status and new.status = 'archived' then 'template_archived'
        when old.is_default is distinct from new.is_default then 'template_default_changed'
        else 'template_updated'
      end;
      v_payload := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
    end if;
  end if;

  insert into public.document_packet_template_audit (
    template_id,
    template_version_id,
    organisation_id,
    module_type,
    packet_type,
    event_type,
    actor_user_id,
    actor_role,
    change_summary,
    event_payload_json
  )
  values (
    v_template_id,
    v_version_id,
    v_organisation_id,
    v_module_type,
    v_packet_type,
    v_event_type,
    v_actor_profile_id,
    case
      when v_organisation_id is not null then public.bridge_membership_role(v_organisation_id)
      else null
    end,
    v_change_summary,
    v_payload || jsonb_build_object('actor_auth_user_id', v_actor_auth_user_id)
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;
revoke all on function public.bridge_document_packet_template_audit() from public, anon, authenticated, service_role;
notify pgrst, 'reload schema';
commit;
