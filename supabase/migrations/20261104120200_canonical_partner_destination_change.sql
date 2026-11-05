-- An explicit destination change cannot be silently replaced by the previous canonical role configuration.
CREATE OR REPLACE FUNCTION public.bridge_validate_transaction_partner_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_owner_organisation_id uuid;
  v_role_config public.organisation_partner_roles%rowtype;
begin
  select transaction.organisation_id into v_owner_organisation_id
  from public.transactions transaction
  where transaction.id = new.transaction_id;

  if v_owner_organisation_id is null then
    if new.partner_role_configuration_id is not null
       or new.preferred_partner_id is not null
       or new.partner_relationship_id is not null then
      raise exception 'A transaction organisation is required for a partner assignment.' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_op='UPDATE' and new.partner_organisation_id is distinct from old.partner_organisation_id
    and new.partner_role_configuration_id is not distinct from old.partner_role_configuration_id then
    new.partner_role_configuration_id:=null;
    new.preferred_partner_id:=null;
    new.partner_relationship_id:=null;
    if new.organisation_id is not distinct from old.partner_organisation_id then new.organisation_id:=new.partner_organisation_id;end if;
    if new.assigned_organisation_id is not distinct from old.partner_organisation_id then new.assigned_organisation_id:=new.partner_organisation_id;end if;
    new.snapshot_json:=coalesce(new.snapshot_json,'{}'::jsonb)-'partnerRoleConfigurationId'-'canonicalPartnerAssignment';
  end if;

  if new.partner_role_configuration_id is null
     and (new.preferred_partner_id is not null or new.partner_relationship_id is not null) then
    new.partner_role_configuration_id := public.bridge_resolve_partner_role_configuration(
      v_owner_organisation_id,
      new.role_type,
      new.preferred_partner_id,
      new.partner_relationship_id,
      new.partner_organisation_id
    );
  end if;

  if new.partner_role_configuration_id is null then return new; end if;

  select * into v_role_config
  from public.organisation_partner_roles
  where id = new.partner_role_configuration_id;

  if v_role_config.id is null
     or v_role_config.organisation_id <> v_owner_organisation_id then
    raise exception 'Partner role configuration does not belong to the transaction organisation.' using errcode = '23514';
  end if;
  if v_role_config.role_type <> public.bridge_normalize_partner_assignment_role(new.role_type) then
    raise exception 'Partner role configuration does not match the transaction role.' using errcode = '23514';
  end if;

  new.preferred_partner_id := v_role_config.external_partner_id;
  new.partner_relationship_id := v_role_config.relationship_id;
  new.partner_organisation_id := coalesce(v_role_config.partner_organisation_id, new.partner_organisation_id);
  new.organisation_id := coalesce(v_role_config.partner_organisation_id, new.organisation_id);
  new.snapshot_json := coalesce(new.snapshot_json, '{}'::jsonb) || jsonb_build_object(
    'partnerRoleConfigurationId', v_role_config.id,
    'canonicalPartnerAssignment', true
  );
  return new;
end;
$function$
;
